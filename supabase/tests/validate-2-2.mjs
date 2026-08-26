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

function psqlShouldFail(sql) {
  try {
    psql(sql);
  } catch {
    return;
  }

  throw new Error("Expected SQL statement to fail.");
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

async function createGroup(client, groupName, playerNickname) {
  await markClientAsPlatformAdmin(client, psql, sqlString);

  const { data, error } = await client.rpc("create_group_with_admin_player", {
    group_name: groupName,
    player_nickname: playerNickname
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error("RPC returned no created group row.");
  }

  return row;
}

async function expectRpcFailure(client, groupName, playerNickname) {
  const { data, error } = await client.rpc("create_group_with_admin_player", {
    group_name: groupName,
    player_nickname: playerNickname
  });

  assert(error, "Expected RPC to fail.");
  assert(!data || (Array.isArray(data) && data.length === 0), "Failed RPC should not return created rows.");
}

async function expectDirectWriteDenied(operation) {
  const { error } = await operation();

  assert(error, "Expected direct table write to be denied.");
}

function countRows(table) {
  return Number(psql(`select count(*) from public.${table};`));
}

function countGroupsForAuthUser(authUserId) {
  return Number(psql(`
    select count(*)
    from public.groups
    join public.players
      on players.group_id = groups.id
    where players.auth_user_id = ${sqlString(authUserId)}::uuid;
  `));
}

function countPlayersForAuthUser(authUserId) {
  return Number(psql(`
    select count(*)
    from public.players
    where auth_user_id = ${sqlString(authUserId)}::uuid;
  `));
}

async function readAllGroups(client) {
  const { data, error } = await client.from("groups").select("*").order("created_at");

  if (error) {
    throw error;
  }

  return data;
}

async function readAllPlayers(client) {
  const { data, error } = await client.from("players").select("*").order("created_at");

  if (error) {
    throw error;
  }

  return data;
}

async function validate() {
  const results = [];

  assertEqual(countRows("groups"), 0, "Database should start with no groups.");
  assertEqual(countRows("players"), 0, "Database should start with no players.");

  const authA = await signInAnonymously("Auth A");
  const createdA = await createGroup(authA.client, " Familia A ", " Ramiro ");
  const groupAId = createdA.group_id;
  const playerAId = createdA.player_id;

  assertEqual(countRows("groups"), 1, "Case A group count mismatch.");
  assertEqual(countRows("players"), 1, "Case A player count mismatch.");
  assertEqual(countPlayersForAuthUser(authA.userId), 1, "Case A auth user player count mismatch.");

  const dbA = psql(`
    select
      groups.name,
      players.nickname,
      players.auth_user_id,
      players.group_id,
      groups.admin_player_id,
      players.id
    from public.groups
    join public.players
      on players.group_id = groups.id
     and players.id = groups.admin_player_id
    where groups.id = ${sqlString(groupAId)}::uuid;
  `).split("|");

  assertEqual(dbA[0], "Familia A", "Case A group name was not trimmed.");
  assertEqual(dbA[1], "Ramiro", "Case A nickname was not trimmed.");
  assertEqual(dbA[2], authA.userId, "Case A auth.uid was not stored as auth_user_id.");
  assertEqual(dbA[3], groupAId, "Case A player group mismatch.");
  assertEqual(dbA[4], playerAId, "Case A admin player mismatch.");
  assertEqual(dbA[5], playerAId, "Case A admin/player join mismatch.");
  results.push(["A primera identidad", "PASS", "Auth A created exactly one coherent Group + Player + admin."]);

  const ownGroupsA = await readAllGroups(authA.client);
  const ownPlayersA = await readAllPlayers(authA.client);
  assertEqual(ownGroupsA.length, 1, "Case B should read exactly own group.");
  assertEqual(ownGroupsA[0].id, groupAId, "Case B own group id mismatch.");
  assertEqual(ownPlayersA.length, 1, "Case B should read exactly own group players.");
  assertEqual(ownPlayersA[0].id, playerAId, "Case B own player id mismatch.");
  results.push(["B lectura propia", "PASS", "Auth A reads Group A and Player A through normal client selects."]);

  const authB = await signInAnonymously("Auth B");
  const createdB = await createGroup(authB.client, "Familia B", "Camila");
  const groupBId = createdB.group_id;
  const playerBId = createdB.player_id;

  assert(groupBId !== groupAId, "Case C group ids should differ.");
  assert(playerBId !== playerAId, "Case C player ids should differ.");
  assertEqual(countRows("groups"), 2, "Case C group count mismatch.");
  assertEqual(countRows("players"), 2, "Case C player count mismatch.");
  assertEqual(countGroupsForAuthUser(authA.userId), 1, "Case C Auth A group count mismatch.");
  assertEqual(countGroupsForAuthUser(authB.userId), 1, "Case C Auth B group count mismatch.");
  results.push(["C segunda identidad", "PASS", "Auth B created independent Group B + Player B."]);

  const groupsVisibleToA = await readAllGroups(authA.client);
  const groupsVisibleToB = await readAllGroups(authB.client);
  const playersVisibleToA = await readAllPlayers(authA.client);
  const playersVisibleToB = await readAllPlayers(authB.client);

  assertEqual(groupsVisibleToA.length, 1, "Case D Auth A should see one group.");
  assertEqual(groupsVisibleToA[0].id, groupAId, "Case D Auth A saw wrong group.");
  assertEqual(groupsVisibleToB.length, 1, "Case D Auth B should see one group.");
  assertEqual(groupsVisibleToB[0].id, groupBId, "Case D Auth B saw wrong group.");
  assertEqual(playersVisibleToA.length, 1, "Case D Auth A should see one player.");
  assertEqual(playersVisibleToA[0].id, playerAId, "Case D Auth A saw wrong player.");
  assertEqual(playersVisibleToB.length, 1, "Case D Auth B should see one player.");
  assertEqual(playersVisibleToB[0].id, playerBId, "Case D Auth B saw wrong player.");
  results.push(["D aislamiento RLS", "PASS", "Each authenticated client sees only its own group and players."]);

  const beforeDirectWrites = [countRows("groups"), countRows("players")];

  await expectDirectWriteDenied(() => authA.client.from("groups").insert({
    id: randomUUID(),
    name: "Direct group",
    admin_player_id: randomUUID()
  }));
  await expectDirectWriteDenied(() => authA.client.from("players").insert({
    id: randomUUID(),
    group_id: groupAId,
    auth_user_id: authA.userId,
    nickname: "Direct player"
  }));
  await expectDirectWriteDenied(() => authA.client.from("groups").update({ name: "Changed" }).eq("id", groupAId));
  await expectDirectWriteDenied(() => authA.client.from("players").update({ nickname: "Changed" }).eq("id", playerAId));
  await expectDirectWriteDenied(() => authA.client.from("groups").delete().eq("id", groupAId));
  await expectDirectWriteDenied(() => authA.client.from("players").delete().eq("id", playerAId));

  assertEqual(countRows("groups"), beforeDirectWrites[0], "Case E group count changed.");
  assertEqual(countRows("players"), beforeDirectWrites[1], "Case E player count changed.");
  results.push(["E writes directos", "PASS", "Client insert/update/delete on groups and players are denied and counts remain unchanged."]);

  const beforeSecondPlayer = [countRows("groups"), countRows("players")];
  await expectRpcFailure(authA.client, "Familia A bis", "Ramiro bis");
  assertEqual(countRows("groups"), beforeSecondPlayer[0], "Case F group count changed.");
  assertEqual(countRows("players"), beforeSecondPlayer[1], "Case F player count changed.");
  assertEqual(countPlayersForAuthUser(authA.userId), 1, "Case F Auth A got another player.");
  results.push(["F segundo Player", "PASS", "Second RPC for Auth A fails without partial rows."]);

  const invalidInputs = [
    ["", "Jugador"],
    ["   ", "Jugador"],
    ["G".repeat(81), "Jugador"],
    ["Grupo", ""],
    ["Grupo", "   "],
    ["Grupo", "J".repeat(33)]
  ];

  const beforeInvalidInputs = [countRows("groups"), countRows("players")];

  for (const [groupName, playerNickname] of invalidInputs) {
    const invalidAuth = await signInAnonymously("Invalid input auth");
    await markClientAsPlatformAdmin(invalidAuth.client, psql, sqlString);
    await expectRpcFailure(invalidAuth.client, groupName, playerNickname);
  }

  assertEqual(countRows("groups"), beforeInvalidInputs[0], "Case G group count changed.");
  assertEqual(countRows("players"), beforeInvalidInputs[1], "Case G player count changed.");
  results.push(["G inputs inválidos", "PASS", "Empty and over-limit inputs fail without persisted Group/Player rows."]);

  const noAuthClient = createAnonymousClient();
  const beforeNoAuth = [countRows("groups"), countRows("players")];
  await expectRpcFailure(noAuthClient, "Grupo sin auth", "Nadie");
  assertEqual(countRows("groups"), beforeNoAuth[0], "Case H group count changed.");
  assertEqual(countRows("players"), beforeNoAuth[1], "Case H player count changed.");
  results.push(["H sin Auth", "PASS", "RPC without AuthIdentity is rejected without persisted rows."]);

  psqlShouldFail(`
    begin;
    update public.groups
       set admin_player_id = ${sqlString(playerBId)}::uuid
     where id = ${sqlString(groupAId)}::uuid;
    commit;
  `);
  assertEqual(
    psql(`select admin_player_id from public.groups where id = ${sqlString(groupAId)}::uuid;`),
    playerAId,
    "Case I admin changed."
  );
  results.push(["I admin mismo Group", "PASS", "Composite FK rejects Group A admin pointing to Player B."]);

  const authC = await signInAnonymously("Auth C");
  const beforeConcurrent = [countRows("groups"), countRows("players")];
  const concurrentResults = await Promise.allSettled([
    createGroup(authC.client, "Familia C", "Pedro"),
    createGroup(authC.client, "Familia C duplicada", "Pedro bis")
  ]);
  const fulfilled = concurrentResults.filter((result) => result.status === "fulfilled");
  const rejected = concurrentResults.filter((result) => result.status === "rejected");

  assertEqual(fulfilled.length, 1, "Case J expected one concurrent creation to succeed.");
  assertEqual(rejected.length, 1, "Case J expected one concurrent creation to fail.");
  assertEqual(countRows("groups"), beforeConcurrent[0] + 1, "Case J group count mismatch.");
  assertEqual(countRows("players"), beforeConcurrent[1] + 1, "Case J player count mismatch.");
  assertEqual(countGroupsForAuthUser(authC.userId), 1, "Case J Auth C group count mismatch.");
  assertEqual(countPlayersForAuthUser(authC.userId), 1, "Case J Auth C player count mismatch.");
  results.push(["J rollback", "PASS", "Concurrent duplicate RPC leaves exactly one Group + Player and no partial duplicate."]);

  const grantChecks = psql(`
    select
      has_function_privilege('anon', 'public.create_group_with_admin_player(text,text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.create_group_with_admin_player(text,text)', 'EXECUTE'),
      has_function_privilege('anon', 'public.is_group_player(uuid)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.is_group_player(uuid)', 'EXECUTE'),
      has_table_privilege('authenticated', 'public.groups', 'SELECT'),
      has_table_privilege('authenticated', 'public.groups', 'INSERT'),
      has_table_privilege('authenticated', 'public.players', 'SELECT'),
      has_table_privilege('authenticated', 'public.players', 'INSERT');
  `).split("|");

  assertEqual(grantChecks[0], "f", "Anon should not execute create RPC.");
  assertEqual(grantChecks[1], "t", "Authenticated should execute create RPC.");
  assertEqual(grantChecks[2], "f", "Anon should not execute helper.");
  assertEqual(grantChecks[3], "t", "Authenticated should execute helper.");
  assertEqual(grantChecks[4], "t", "Authenticated should select groups.");
  assertEqual(grantChecks[5], "f", "Authenticated should not insert groups.");
  assertEqual(grantChecks[6], "t", "Authenticated should select players.");
  assertEqual(grantChecks[7], "f", "Authenticated should not insert players.");

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
