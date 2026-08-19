import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function readSupabaseEnv() {
  const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const env = {};

  for (const match of output.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)) {
    env[match[1]] = match[2];
  }

  for (const key of ["API_URL", "PUBLISHABLE_KEY", "DB_URL"]) {
    if (!env[key]) {
      throw new Error(`Missing ${key} from local Supabase status.`);
    }
  }

  return env;
}

const supabaseEnv = readSupabaseEnv();

function createAnonymousClient() {
  return createClient(supabaseEnv.API_URL, supabaseEnv.PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

function psql(sql) {
  return execFileSync("psql", [
    supabaseEnv.DB_URL,
    "--quiet",
    "--tuples-only",
    "--no-align",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    sql
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}.`);
  }
}

async function signInAnonymously(label) {
  const client = createAnonymousClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(`${label}: anonymous sign-in failed.`);
  }

  return { client, userId: data.user.id };
}

function singleRow(data, message) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function createGroup(client, groupName, playerNickname) {
  const { data, error } = await client.rpc("create_group_with_admin_player", {
    group_name: groupName,
    player_nickname: playerNickname
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Create group RPC returned no row.");
}

async function joinGroup(client, invitationCode, playerNickname) {
  const { data, error } = await client.rpc("join_group_with_invitation", {
    invitation_code: invitationCode,
    player_nickname: playerNickname
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Join group RPC returned no row.");
}

async function addGroupWord(client, wordText) {
  const { data, error } = await client.rpc("add_group_word", {
    word_text: wordText
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Add group word RPC returned no row.");
}

async function getMyGroupWordCount(client) {
  const { data, error } = await client.rpc("get_my_group_word_count");

  if (error) {
    throw error;
  }

  return Number(singleRow(data, "Count RPC returned no row.").total_count);
}

async function listMyGroupWords(client) {
  const { data, error } = await client.rpc("list_my_group_words");

  if (error) {
    throw error;
  }

  return data;
}

async function deleteMyGroupWord(client, wordId) {
  const { data, error } = await client.rpc("delete_my_group_word", {
    word_id: wordId
  });

  if (error) {
    throw error;
  }

  return data;
}

async function expectRpcFailure(operation, expectedCode) {
  try {
    const row = await operation();

    throw new Error(`Expected RPC to fail, got ${JSON.stringify(row)}.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected RPC")) {
      throw error;
    }

    if (expectedCode) {
      assertEqual(error.code, expectedCode, `Expected Postgres error ${expectedCode}.`);
    }
  }
}

async function expectDirectDeleteDenied(client, wordId) {
  const { error } = await client.from("group_words").delete().eq("id", wordId);

  assert(error, "Expected direct DELETE on group_words to be rejected.");
}

function wordTexts(rows) {
  return rows.map((row) => row.text).join(",");
}

function includesWord(rows, text) {
  return rows.some((row) => row.text === text);
}

async function validate() {
  const results = [];

  const authA1 = await signInAnonymously("Auth A1");
  const createdA = await createGroup(authA1.client, "Familia 3.3 A", "Ramiro");
  const invitationCodeA = createdA.invitation_code;

  const authA2 = await signInAnonymously("Auth A2");
  await joinGroup(authA2.client, invitationCodeA, "Pedro");

  const authB1 = await signInAnonymously("Auth B1");
  await createGroup(authB1.client, "Familia 3.3 B", "Camila");

  const a1Chocotorta = await addGroupWord(authA1.client, "Chocotorta");
  const a1Torre = await addGroupWord(authA1.client, "Torre Eiffel");
  const a2Harry = await addGroupWord(authA2.client, "Harry Potter");
  const b1Elefante = await addGroupWord(authB1.client, "Elefante");

  assertEqual(await getMyGroupWordCount(authA1.client), 3, "Initial Group A count mismatch.");
  assertEqual(wordTexts(await listMyGroupWords(authA1.client)), "Torre Eiffel,Chocotorta", "Initial A1 list mismatch.");
  assertEqual(wordTexts(await listMyGroupWords(authA2.client)), "Harry Potter", "Initial A2 list mismatch.");
  assertEqual(wordTexts(await listMyGroupWords(authB1.client)), "Elefante", "Initial B1 list mismatch.");
  results.push(["Setup A1/A2/B1", "PASS", "Fixture created with Group A and isolated Group B words."]);

  assertEqual(await deleteMyGroupWord(authA1.client, a1Chocotorta.id), true, "A1 own delete should return true.");
  assertEqual(await getMyGroupWordCount(authA1.client), 2, "A1 count after own delete mismatch.");
  assertEqual(await getMyGroupWordCount(authA2.client), 2, "A2 count after A1 own delete mismatch.");
  assert(!includesWord(await listMyGroupWords(authA1.client), "Chocotorta"), "Deleted own word remained in A1 list.");
  assert(includesWord(await listMyGroupWords(authA1.client), "Torre Eiffel"), "Other A1 word disappeared.");
  results.push(["Borrado propio", "PASS", "Author can delete own word and Group A count decreases."]);

  assertEqual(await deleteMyGroupWord(authA2.client, a1Torre.id), false, "A2 deleting A1 word should return false.");
  assert(includesWord(await listMyGroupWords(authA1.client), "Torre Eiffel"), "A2 deleted A1 word.");
  assertEqual(await getMyGroupWordCount(authA1.client), 2, "Group A count changed after same-group non-author delete.");
  results.push(["No autor mismo grupo", "PASS", "Same-group non-author receives false and cannot delete."]);

  assertEqual(await deleteMyGroupWord(authA1.client, a2Harry.id), false, "Admin A1 deleting A2 word should return false.");
  assert(includesWord(await listMyGroupWords(authA2.client), "Harry Potter"), "Admin deleted another player's word.");
  assertEqual(await getMyGroupWordCount(authA1.client), 2, "Group A count changed after admin tried deleting another author.");
  results.push(["Admin sin privilegio", "PASS", "Admin cannot delete another author's contribution."]);

  assertEqual(await deleteMyGroupWord(authB1.client, a1Torre.id), false, "B1 deleting Group A word should return false.");
  assert(includesWord(await listMyGroupWords(authA1.client), "Torre Eiffel"), "Cross-group delete removed Group A word.");
  assertEqual(await getMyGroupWordCount(authB1.client), 1, "Group B count changed after cross-group delete.");
  results.push(["Otro grupo", "PASS", "Foreign-group caller receives false and cannot delete."]);

  assertEqual(await deleteMyGroupWord(authA1.client, randomUUID()), false, "Nonexistent UUID should return false.");
  results.push(["UUID inexistente", "PASS", "Nonexistent word id returns false, not an internal error."]);

  const falseForSameGroupOtherAuthor = await deleteMyGroupWord(authA2.client, a1Torre.id);
  const falseForForeignGroup = await deleteMyGroupWord(authA1.client, b1Elefante.id);
  const falseForNonexistent = await deleteMyGroupWord(authA1.client, randomUUID());
  assertEqual(falseForSameGroupOtherAuthor, false, "Same-group other author should stay indistinguishable.");
  assertEqual(falseForForeignGroup, false, "Foreign-group word should stay indistinguishable.");
  assertEqual(falseForNonexistent, false, "Nonexistent word should stay indistinguishable.");
  results.push(["Sin exposición indirecta", "PASS", "Unauthorized, foreign and nonexistent ids all return the same false."]);

  const noAuthClient = createAnonymousClient();
  await expectRpcFailure(() => deleteMyGroupWord(noAuthClient, a1Torre.id), "42501");
  results.push(["Auth ausente", "PASS", "Unauthenticated delete is rejected, not false."]);

  const authWithoutPlayer = await signInAnonymously("Auth without Player");
  await expectRpcFailure(() => deleteMyGroupWord(authWithoutPlayer.client, a1Torre.id), "P0002");
  results.push(["Auth sin Player", "PASS", "Authenticated user without Player is rejected, not false."]);

  const rpcSignatureChecks = psql(`
    select
      to_regprocedure('public.delete_my_group_word(uuid)') is not null,
      to_regprocedure('public.delete_my_group_word(uuid,uuid)') is null,
      to_regprocedure('public.delete_my_group_word(uuid,uuid,uuid)') is null,
      has_function_privilege('anon', 'public.delete_my_group_word(uuid)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.delete_my_group_word(uuid)', 'EXECUTE'),
      has_table_privilege('authenticated', 'public.group_words', 'DELETE');
  `).split("|");
  assertEqual(rpcSignatureChecks[0], "t", "Expected delete function.");
  assertEqual(rpcSignatureChecks[1], "t", "Delete should not accept two uuid args.");
  assertEqual(rpcSignatureChecks[2], "t", "Delete should not accept three uuid args.");
  assertEqual(rpcSignatureChecks[3], "f", "Anon should not execute delete.");
  assertEqual(rpcSignatureChecks[4], "t", "Authenticated should execute delete.");
  assertEqual(rpcSignatureChecks[5], "f", "Authenticated should not have direct DELETE.");
  results.push(["Firma y grants", "PASS", "Delete RPC accepts only word_id and table DELETE remains closed."]);

  await expectDirectDeleteDenied(authA1.client, a1Torre.id);
  assert(includesWord(await listMyGroupWords(authA1.client), "Torre Eiffel"), "Direct DELETE removed a word.");
  results.push(["DELETE directo bloqueado", "PASS", "Direct table DELETE is denied and the row remains."]);

  console.table(results.map(([caseName, result, evidence]) => ({
    "Caso": caseName,
    "Resultado": result,
    "Evidencia": evidence
  })));
}

validate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
