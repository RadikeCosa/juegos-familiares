import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

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

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
  await markClientAsPlatformAdmin(client, psql, sqlString);

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

async function expectDirectSelectDenied(operation) {
  const { data, error } = await operation();

  assert(error || !data || data.length === 0, "Expected direct select to expose no group words.");
}

function wordTexts(rows) {
  return rows.map((row) => row.text).join(",");
}

async function validate() {
  const results = [];

  const authA1 = await signInAnonymously("Auth A1");
  const createdA = await createGroup(authA1.client, "Familia 3.2 A", "Ramiro");
  const invitationCodeA = createdA.invitation_code;

  const authA2 = await signInAnonymously("Auth A2");
  await joinGroup(authA2.client, invitationCodeA, "Pedro");

  const authB1 = await signInAnonymously("Auth B1");
  await createGroup(authB1.client, "Familia 3.2 B", "Camila");

  await addGroupWord(authA1.client, "Chocotorta");
  await addGroupWord(authA1.client, "Torre Eiffel");
  await addGroupWord(authA2.client, "Harry Potter");
  await addGroupWord(authB1.client, "Elefante");
  await addGroupWord(authB1.client, "Milanesa");

  assertEqual(await getMyGroupWordCount(authA1.client), 3, "Case A A1 count mismatch.");
  assertEqual(await getMyGroupWordCount(authA2.client), 3, "Case A A2 count mismatch.");
  assertEqual(await getMyGroupWordCount(authB1.client), 2, "Case A B1 count mismatch.");
  results.push(["A count por Group", "PASS", "Count includes all GroupWords in the Player group only."]);

  const ownA1 = await listMyGroupWords(authA1.client);
  const ownA2 = await listMyGroupWords(authA2.client);
  const ownB1 = await listMyGroupWords(authB1.client);
  assertEqual(wordTexts(ownA1), "Torre Eiffel,Chocotorta", "Case B A1 own list mismatch.");
  assertEqual(wordTexts(ownA2), "Harry Potter", "Case B A2 own list mismatch.");
  assertEqual(wordTexts(ownB1), "Milanesa,Elefante", "Case B B1 own list mismatch.");
  assert(ownA1.every((row) => Object.keys(row).sort().join(",") === "created_at,id,text"), "Case B A1 exposed unexpected columns.");
  results.push(["B listado propio", "PASS", "Own list returns only id, text, created_at for the current author."]);

  assert(!wordTexts(ownA1).includes("Harry Potter"), "Case C A1 saw A2 word.");
  assert(!wordTexts(ownA2).includes("Chocotorta"), "Case C A2 saw A1 word.");
  assert(!wordTexts(ownB1).includes("Torre Eiffel"), "Case C B1 saw Group A word.");
  results.push(["C no aportes ajenos", "PASS", "No player receives words contributed by another author."]);

  const authEmpty = await signInAnonymously("Auth empty group");
  await createGroup(authEmpty.client, "Familia 3.2 vacía", "Victoria");
  assertEqual(await getMyGroupWordCount(authEmpty.client), 0, "Case D empty group count mismatch.");
  assertEqual((await listMyGroupWords(authEmpty.client)).length, 0, "Case D empty group list mismatch.");
  results.push(["D grupo vacío", "PASS", "Valid Player with no words gets count 0 and empty own list."]);

  const noAuthClient = createAnonymousClient();
  await expectRpcFailure(() => getMyGroupWordCount(noAuthClient), "42501");
  await expectRpcFailure(() => listMyGroupWords(noAuthClient), "42501");
  results.push(["E Auth ausente", "PASS", "Unauthenticated clients cannot execute read RPCs."]);

  const authWithoutPlayer = await signInAnonymously("Auth without Player");
  await expectRpcFailure(() => getMyGroupWordCount(authWithoutPlayer.client), "P0002");
  await expectRpcFailure(() => listMyGroupWords(authWithoutPlayer.client), "P0002");
  results.push(["F Auth sin Player", "PASS", "Authenticated users without Player get errors, not 0 or []."]);

  const rpcSignatureChecks = psql(`
    select
      to_regprocedure('public.get_my_group_word_count()') is not null,
      to_regprocedure('public.get_my_group_word_count(uuid)') is null,
      to_regprocedure('public.list_my_group_words()') is not null,
      to_regprocedure('public.list_my_group_words(uuid)') is null,
      has_function_privilege('anon', 'public.get_my_group_word_count()', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.get_my_group_word_count()', 'EXECUTE'),
      has_function_privilege('anon', 'public.list_my_group_words()', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.list_my_group_words()', 'EXECUTE'),
      has_table_privilege('authenticated', 'public.group_words', 'SELECT');
  `).split("|");
  assertEqual(rpcSignatureChecks[0], "t", "Case G expected count function.");
  assertEqual(rpcSignatureChecks[1], "t", "Case G count should not accept uuid.");
  assertEqual(rpcSignatureChecks[2], "t", "Case G expected list function.");
  assertEqual(rpcSignatureChecks[3], "t", "Case G list should not accept uuid.");
  assertEqual(rpcSignatureChecks[4], "f", "Case G anon should not execute count.");
  assertEqual(rpcSignatureChecks[5], "t", "Case G authenticated should execute count.");
  assertEqual(rpcSignatureChecks[6], "f", "Case G anon should not execute list.");
  assertEqual(rpcSignatureChecks[7], "t", "Case G authenticated should execute list.");
  assertEqual(rpcSignatureChecks[8], "f", "Case G authenticated should not SELECT group_words.");
  results.push(["G firma y grants", "PASS", "Read RPCs expose no ownership args and table SELECT remains closed."]);

  await expectDirectSelectDenied(() => authA1.client.from("group_words").select("*"));
  await expectDirectSelectDenied(() => authA1.client.from("group_words").select("text").eq("text", "Harry Potter"));
  results.push(["H lectura directa", "PASS", "Direct SELECT cannot enumerate the bank or another player's word."]);

  assertEqual(wordTexts(await listMyGroupWords(authA1.client)), "Torre Eiffel,Chocotorta", "Case I admin own list mismatch.");
  results.push(["I admin sin acceso especial", "PASS", "Group admin sees own contributions, not the whole Group bank."]);

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
