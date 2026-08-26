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

function singleRow(data, message) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function signInAnonymously(label) {
  const client = createAnonymousClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(`${label}: anonymous sign-in failed.`);
  }

  return { client, userId: data.user.id };
}

async function rpcOk(client, fn, params, message) {
  const { data, error } = await client.rpc(fn, params);

  assert(!error, `${message}: ${error?.code ?? ""} ${error?.message ?? ""}`);
  return data;
}

async function expectRpcFailure(operation, expectedCode, message) {
  const { error } = await operation();

  assert(error, `${message}: expected RPC failure ${expectedCode}.`);
  assertEqual(error.code, expectedCode, `${message}: unexpected RPC error code.`);
}

async function createGroup(client, groupName, playerNickname) {
  await markClientAsPlatformAdmin(client, psql, sqlString);

  return singleRow(await rpcOk(client, "create_group_with_admin_player", {
    group_name: groupName,
    player_nickname: playerNickname
  }, "create_group_with_admin_player should succeed"), "Create group RPC returned no row.");
}

async function joinGroup(client, invitationCode, playerNickname) {
  return singleRow(await rpcOk(client, "join_group_with_invitation", {
    invitation_code: invitationCode,
    player_nickname: playerNickname
  }, "join_group_with_invitation should succeed"), "Join group RPC returned no row.");
}

async function addGroupWord(client, wordText) {
  return singleRow(await rpcOk(client, "add_group_word", {
    word_text: wordText
  }, "add_group_word should succeed"), "Add word RPC returned no row.");
}

async function createRoom(client) {
  const data = await rpcOk(client, "create_room", undefined, "create_room should succeed");
  assert(Array.isArray(data) && data.length > 0, "create_room returned no rows.");
  return data[0];
}

async function joinRoomByCode(client, roomCode) {
  const data = await rpcOk(client, "join_room_by_code", {
    room_code: roomCode
  }, "join_room_by_code should succeed");
  assert(Array.isArray(data) && data.length > 0, "join_room_by_code returned no rows.");
  return data[0];
}

async function submitRoundVote(client, targetPlayerId) {
  return client.rpc("submit_round_vote", {
    target_player_id: targetPlayerId
  });
}

async function submitImpostorGuess(client, guessText) {
  return client.rpc("submit_impostor_guess", {
    guess_text: guessText
  });
}

function playerIdForAuthUser(authUserId) {
  return psql(`
    select id from public.players where auth_user_id = ${sqlString(authUserId)}::uuid;
  `);
}

function gameSessionIdForRoom(roomId) {
  return psql(`
    select coalesce(id::text, '')
    from public.game_sessions
    where room_id = ${sqlString(roomId)}::uuid;
  `);
}

function gameSessionState(gameSessionId) {
  return psql(`
    select state
    from public.game_sessions
    where id = ${sqlString(gameSessionId)}::uuid;
  `);
}

function setRoundOneImpostor(gameSessionId, playerId) {
  psql(`
    update public.rounds
    set impostor_player_id = ${sqlString(playerId)}::uuid
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = 1;
  `);
}

function roundField(gameSessionId, fieldName) {
  return psql(`
    select coalesce(${fieldName}::text, '')
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = 1;
  `);
}

async function submitVoteAndExpect(client, targetPlayerId, expectedState, label) {
  const { data, error } = await submitRoundVote(client, targetPlayerId);
  assert(!error, `${label}: submit_round_vote should succeed: ${error?.code ?? ""} ${error?.message ?? ""}`);
  const row = singleRow(data, `${label}: submit_round_vote returned no row.`);
  assertEqual(row.state, expectedState, `${label}: returned state mismatch.`);
  return row;
}

async function buildRoomWithPlayers(label) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 10.3 ${label}`, "Host");
  const players = [];

  for (const playerName of ["B", "C", "D"]) {
    const auth = await signInAnonymously(`${label} ${playerName}`);
    await joinGroup(auth.client, group.invitation_code, playerName);
    players.push({
      ...auth,
      playerId: playerIdForAuthUser(auth.userId),
      nickname: playerName
    });
  }

  const room = await createRoom(host.client);

  for (const player of players) {
    await joinRoomByCode(player.client, room.room_join_code);
  }

  return {
    host: {
      ...host,
      playerId: group.player_id,
      nickname: "Host"
    },
    players,
    roomId: room.room_id
  };
}

async function createImpostorGuessFixture(label) {
  const fixture = await buildRoomWithPlayers(label);
  const [playerB, playerC, playerD] = fixture.players;

  await addGroupWord(fixture.host.client, "Tarta");
  await rpcOk(fixture.host.client, "start_session", undefined, `${label}: start_session should succeed`);
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  await rpcOk(fixture.host.client, "start_round_discussion", undefined, `${label}: start_round_discussion should succeed`);
  await rpcOk(fixture.host.client, "start_round_voting", undefined, `${label}: start_round_voting should succeed`);
  setRoundOneImpostor(gameSessionId, playerB.playerId);

  await submitVoteAndExpect(fixture.host.client, playerB.playerId, "voting_first", `${label}: host vote`);
  await submitVoteAndExpect(playerB.client, fixture.host.playerId, "voting_first", `${label}: impostor vote`);
  await submitVoteAndExpect(playerC.client, playerB.playerId, "voting_first", `${label}: C vote`);
  await submitVoteAndExpect(playerD.client, playerB.playerId, "impostor_guess", `${label}: D vote`);

  return {
    ...fixture,
    gameSessionId,
    impostor: playerB
  };
}

async function validateNullGuessHasNoEffects() {
  const fixture = await createImpostorGuessFixture("null guess");

  await expectRpcFailure(
    () => submitImpostorGuess(fixture.impostor.client, null),
    "22023",
    "Null impostor guess should fail with invalid input"
  );

  assertEqual(gameSessionState(fixture.gameSessionId), "impostor_guess", "Null guess must not resolve the game session.");
  assertEqual(roundField(fixture.gameSessionId, "impostor_guess_text"), "", "Null guess must not persist text.");
  assertEqual(roundField(fixture.gameSessionId, "normalized_impostor_guess"), "", "Null guess must not persist normalized text.");
  assertEqual(roundField(fixture.gameSessionId, "impostor_guess_correct"), "", "Null guess must not persist correctness.");
  assertEqual(roundField(fixture.gameSessionId, "round_winner"), "", "Null guess must not persist winner.");
}

async function main() {
  await validateNullGuessHasNoEffects();

  console.log("validate-10-3 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
