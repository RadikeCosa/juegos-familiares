import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

    return error;
  }
}

async function expectDirectWriteDenied(operation) {
  const { error } = await operation();

  assert(error, "Expected direct table write to be denied.");
}

async function expectDirectSelectDenied(operation) {
  const { data, error } = await operation();

  assert(error || !data || data.length === 0, "Expected direct select to expose no group words.");
}

function countGroupWords(groupId, normalizedText) {
  return Number(psql(`
    select count(*)
    from public.group_words
    where group_id = ${sqlString(groupId)}::uuid
      and normalized_text = ${sqlString(normalizedText)};
  `));
}

function groupWordRows(groupId) {
  const output = psql(`
    select text || ':' || normalized_text
    from public.group_words
    where group_id = ${sqlString(groupId)}::uuid
    order by text;
  `);

  return output ? output.split("\n") : [];
}

async function validate() {
  const results = [];

  const authA = await signInAnonymously("Auth A");
  const createdA = await createGroup(authA.client, "Familia 3.1 A", "Ramiro");
  const groupAId = createdA.group_id;
  const playerAId = createdA.player_id;
  const invitationCodeA = createdA.invitation_code;

  const addedElefante = await addGroupWord(authA.client, "Elefante");
  assertEqual(addedElefante.group_id, groupAId, "Case A word group mismatch.");
  assertEqual(addedElefante.author_player_id, playerAId, "Case A author mismatch.");
  assertEqual(addedElefante.text, "Elefante", "Case A text mismatch.");
  assertEqual(addedElefante.normalized_text, "elefante", "Case A normalized mismatch.");
  assertEqual(countGroupWords(groupAId, "elefante"), 1, "Case A word count mismatch.");
  results.push(["A alta normal", "PASS", "Auth A inserted one GroupWord derived from its Player and Group."]);

  const addedHarry = await addGroupWord(authA.client, "  Harry   Potter  ");
  assertEqual(addedHarry.text, "Harry Potter", "Case B canonical text mismatch.");
  assertEqual(addedHarry.normalized_text, "harry potter", "Case B normalized mismatch.");
  results.push(["B canonicalización", "PASS", "Whitespace is trimmed and collapsed before persistence."]);

  await expectRpcFailure(() => addGroupWord(authA.client, "elefante"), "23505");
  await expectRpcFailure(() => addGroupWord(authA.client, "ELEFANTE"), "23505");
  assertEqual(countGroupWords(groupAId, "elefante"), 1, "Case C duplicate count mismatch.");
  results.push(["C duplicado case-insensitive", "PASS", "Case-only duplicates fail inside the same Group."]);

  await addGroupWord(authA.client, "Camion");
  await addGroupWord(authA.client, "Camión");
  await addGroupWord(authA.client, "Papa");
  await addGroupWord(authA.client, "Papá");
  assertEqual(countGroupWords(groupAId, "camion"), 1, "Case D Camion missing.");
  assertEqual(countGroupWords(groupAId, "camión"), 1, "Case D Camión missing.");
  assertEqual(countGroupWords(groupAId, "papa"), 1, "Case D Papa missing.");
  assertEqual(countGroupWords(groupAId, "papá"), 1, "Case D Papá missing.");
  results.push(["D acentos", "PASS", "Accent differences remain distinct."]);

  await addGroupWord(authA.client, "Spider-Man");
  await expectRpcFailure(() => addGroupWord(authA.client, "spider-man"), "23505");
  await addGroupWord(authA.client, "Spider Man");
  assert(groupWordRows(groupAId).includes("Spider-Man:spider-man"), "Case E Spider-Man missing.");
  assert(groupWordRows(groupAId).includes("Spider Man:spider man"), "Case E Spider Man missing.");
  results.push(["E puntuación", "PASS", "Punctuation is preserved while case-only duplicates fail."]);

  for (const invalidWord of ["", "   ", "A", `${"a".repeat(41)}`, ` ${"a".repeat(41)} `]) {
    await expectRpcFailure(() => addGroupWord(authA.client, invalidWord), "22023");
  }

  await addGroupWord(authA.client, "AB");
  await addGroupWord(authA.client, "b".repeat(40));
  results.push(["F longitud", "PASS", "Invalid lengths fail and exact 2/40 character limits pass."]);

  await expectRpcFailure(() => addGroupWord(authA.client, "Casa 😀"), "22023");
  await expectRpcFailure(() => addGroupWord(authA.client, "Fiesta 🎉"), "22023");
  await addGroupWord(authA.client, "Ñandú 2026");
  await addGroupWord(authA.client, "Pingüino");
  results.push(["G emoji y español", "PASS", "Representative emoji fail while Spanish text remains valid."]);

  const noAuthClient = createAnonymousClient();
  await expectRpcFailure(() => addGroupWord(noAuthClient, "Sin auth"), "42501");
  results.push(["H Auth ausente", "PASS", "Unauthenticated clients cannot execute add_group_word."]);

  const authWithoutPlayer = await signInAnonymously("Auth without Player");
  await expectRpcFailure(() => addGroupWord(authWithoutPlayer.client, "Sin jugador"), "P0002");
  results.push(["I Auth sin Player", "PASS", "Authenticated users without Player cannot add words."]);

  const authOtherGroup = await signInAnonymously("Auth other group");
  const createdOtherGroup = await createGroup(authOtherGroup.client, "Familia 3.1 B", "Pedro");
  const groupBId = createdOtherGroup.group_id;
  await addGroupWord(authOtherGroup.client, "Elefante");
  assertEqual(countGroupWords(groupAId, "elefante"), 1, "Case J Group A Elefante count mismatch.");
  assertEqual(countGroupWords(groupBId, "elefante"), 1, "Case J Group B Elefante count mismatch.");
  results.push(["J mismo texto otro Group", "PASS", "Uniqueness is scoped by Group."]);

  const rpcSignatureChecks = psql(`
    select
      to_regprocedure('public.add_group_word(text)') is not null,
      to_regprocedure('public.add_group_word(text,uuid)') is null,
      to_regprocedure('public.add_group_word(text,uuid,uuid)') is null,
      has_function_privilege('anon', 'public.add_group_word(text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.add_group_word(text)', 'EXECUTE');
  `).split("|");
  assertEqual(rpcSignatureChecks[0], "t", "Case K expected add_group_word(text).");
  assertEqual(rpcSignatureChecks[1], "t", "Case K should not expose uuid overload.");
  assertEqual(rpcSignatureChecks[2], "t", "Case K should not expose ownership overload.");
  assertEqual(rpcSignatureChecks[3], "f", "Case K anon should not execute add_group_word.");
  assertEqual(rpcSignatureChecks[4], "t", "Case K authenticated should execute add_group_word.");
  results.push(["K firma RPC", "PASS", "add_group_word exposes only word_text to authenticated clients."]);

  await expectDirectWriteDenied(() => authA.client.from("group_words").insert({
    id: randomUUID(),
    group_id: groupAId,
    text: "Forzada",
    author_player_id: playerAId
  }));
  await expectDirectSelectDenied(() => authA.client.from("group_words").select("*"));
  results.push(["L acceso directo", "PASS", "Authenticated clients cannot select or insert group_words directly."]);

  const authB = await signInAnonymously("Auth B");
  await joinGroup(authB.client, invitationCodeA, "Camila");
  const beforeConcurrent = countGroupWords(groupAId, "concurrente");
  const concurrentResults = await Promise.allSettled([
    addGroupWord(authA.client, "Concurrente"),
    addGroupWord(authB.client, "concurrente")
  ]);
  assertEqual(concurrentResults.filter((result) => result.status === "fulfilled").length, 1, "Case M expected one concurrent insert to succeed.");
  assertEqual(concurrentResults.filter((result) => result.status === "rejected").length, 1, "Case M expected one concurrent insert to fail.");
  assertEqual(countGroupWords(groupAId, "concurrente"), beforeConcurrent + 1, "Case M concurrent count mismatch.");
  const rejected = concurrentResults.find((result) => result.status === "rejected");
  assert(rejected?.status === "rejected" && rejected.reason.code === "23505", "Case M expected duplicate error.");
  results.push(["M concurrencia", "PASS", "Concurrent normalized duplicates leave exactly one GroupWord."]);

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
