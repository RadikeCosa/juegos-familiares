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

function roundIdForSession(gameSessionId) {
  return psql(`
    select id
    from public.rounds
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

function countRows(tableName, whereSql) {
  return Number(psql(`
    select count(*)
    from public.${tableName}
    ${whereSql};
  `));
}

function hasFunctionExecute(roleName, signature) {
  return psql(`
    select has_function_privilege(
      ${sqlString(roleName)},
      'public.${signature}',
      'EXECUTE'
    );
  `) === "t";
}

function hasColumn(tableName, columnName) {
  return psql(`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${sqlString(tableName)}
        and column_name = ${sqlString(columnName)}
    );
  `) === "t";
}

function hasPrivilege(roleName, tableName, privilege) {
  return psql(`
    select has_table_privilege(
      ${sqlString(roleName)},
      'public.${tableName}',
      ${sqlString(privilege)}
    );
  `) === "t";
}

function isRealtimePublished(tableName) {
  return psql(`
    select exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = ${sqlString(tableName)}
    );
  `) === "t";
}

function tableExists(tableName) {
  return psql(`
    select to_regclass(${sqlString(`public.${tableName}`)}) is not null;
  `) === "t";
}

function assertGuessResponseIsPrivate(row, context) {
  for (const forbidden of [
    "secret_word",
    "normalized_secret_word",
    "impostor_player_id",
    "player_id",
    "round_id",
    "game_session_id",
    "vote_results",
    "target_player_id",
    "voter_player_id"
  ]) {
    assert(!(forbidden in row), `${context}: submit_impostor_guess must not expose ${forbidden}.`);
  }
}

async function submitVoteAndExpect(client, targetPlayerId, expectedState, label) {
  const { data, error } = await submitRoundVote(client, targetPlayerId);
  assert(!error, `${label}: submit_round_vote should succeed: ${error?.code ?? ""} ${error?.message ?? ""}`);
  const row = singleRow(data, `${label}: submit_round_vote returned no row.`);
  assertEqual(row.accepted, true, `${label}: vote should be accepted.`);
  assertEqual(row.state, expectedState, `${label}: returned state mismatch.`);
  return row;
}

async function buildRoomWithPlayers(label, playerNames = ["B", "C", "D"]) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 10.1 ${label}`, "Host");
  const players = [];

  for (const playerName of playerNames) {
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

async function startVotingFixture(label, secretWord = `Milanesa ${label}`) {
  const fixture = await buildRoomWithPlayers(label);
  await addGroupWord(fixture.host.client, secretWord);
  await rpcOk(fixture.host.client, "start_session", undefined, `${label}: start_session should succeed`);
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  await rpcOk(fixture.host.client, "start_round_discussion", undefined, `${label}: start_round_discussion should succeed`);
  await rpcOk(fixture.host.client, "start_round_voting", undefined, `${label}: start_round_voting should succeed`);

  return {
    ...fixture,
    gameSessionId,
    roundId: roundIdForSession(gameSessionId),
    secretWord
  };
}

async function createImpostorGuessFixture(label, secretWord = `Milanesa ${label}`) {
  const fixture = await startVotingFixture(label, secretWord);
  const [playerB, playerC, playerD] = fixture.players;

  setRoundOneImpostor(fixture.gameSessionId, playerB.playerId);

  await submitVoteAndExpect(fixture.host.client, playerB.playerId, "voting_first", `${label}: host vote`);
  await submitVoteAndExpect(playerB.client, fixture.host.playerId, "voting_first", `${label}: impostor vote`);
  await submitVoteAndExpect(playerC.client, playerB.playerId, "voting_first", `${label}: C vote`);
  await submitVoteAndExpect(playerD.client, playerB.playerId, "impostor_guess", `${label}: D vote`);
  assertEqual(gameSessionState(fixture.gameSessionId), "impostor_guess", `${label}: fixture should enter impostor_guess.`);

  return {
    ...fixture,
    impostor: playerB,
    nonImpostor: playerC
  };
}

async function submitGuessAndExpect(client, guessText, expected, label) {
  const { data, error } = await submitImpostorGuess(client, guessText);
  assert(!error, `${label}: submit_impostor_guess should succeed: ${error?.code ?? ""} ${error?.message ?? ""}`);
  const row = singleRow(data, `${label}: submit_impostor_guess returned no row.`);

  assertEqual(row.accepted, true, `${label}: guess should be accepted.`);
  assertEqual(row.already_recorded, expected.alreadyRecorded, `${label}: already_recorded mismatch.`);
  assertEqual(row.state, "round_result", `${label}: returned state mismatch.`);
  assertEqual(row.round_number, 1, `${label}: round number mismatch.`);
  assertEqual(row.is_correct, expected.isCorrect, `${label}: correctness mismatch.`);
  assertEqual(row.winner, expected.winner, `${label}: winner mismatch.`);
  assertGuessResponseIsPrivate(row, label);

  return row;
}

async function validateSchemaAndPrivileges() {
  for (const columnName of [
    "impostor_guess_text",
    "normalized_impostor_guess",
    "impostor_guess_correct",
    "impostor_guess_submitted_at",
    "round_winner"
  ]) {
    assert(hasColumn("rounds", columnName), `rounds.${columnName} should exist.`);
  }

  assert(hasFunctionExecute("authenticated", "submit_impostor_guess(text)"), "authenticated must execute submit_impostor_guess.");
  assert(!hasFunctionExecute("anon", "submit_impostor_guess(text)"), "anon must not execute submit_impostor_guess.");
  assert(!hasFunctionExecute("public", "submit_impostor_guess(text)"), "public must not execute submit_impostor_guess.");

  for (const roleName of ["anon", "authenticated", "public"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(!hasPrivilege(roleName, "rounds", privilege), `${roleName} should not have ${privilege} on rounds.`);
    }
  }

  assert(!isRealtimePublished("rounds"), "rounds must not be published through Realtime.");
  assert(!isRealtimePublished("game_sessions"), "game_sessions must not be published through gameplay Realtime.");
  assert(!tableExists("scoreboard"), "10.1 must not create scoreboard.");
  assert(!tableExists("round_history"), "10.1 must not create round_history.");
}

async function validateOnlyImpostorCanSubmit() {
  const fixture = await createImpostorGuessFixture("only impostor");

  await expectRpcFailure(
    () => submitImpostorGuess(fixture.nonImpostor.client, fixture.secretWord),
    "P0023",
    "Non-impostor should not submit final guess"
  );

  assertEqual(gameSessionState(fixture.gameSessionId), "impostor_guess", "Non-impostor failure must not resolve the round.");
  assertEqual(roundField(fixture.gameSessionId, "impostor_guess_text"), "", "Non-impostor failure must not persist guess text.");
  assertEqual(roundField(fixture.gameSessionId, "round_winner"), "", "Non-impostor failure must not persist winner.");
}

async function validateInvalidStateAndEmptyGuess() {
  const invalidState = await startVotingFixture("invalid state", "Empanada");
  const [playerB] = invalidState.players;
  setRoundOneImpostor(invalidState.gameSessionId, playerB.playerId);

  await expectRpcFailure(
    () => submitImpostorGuess(playerB.client, "Empanada"),
    "P0018",
    "submit_impostor_guess should reject states other than impostor_guess or idempotent round_result"
  );

  const empty = await createImpostorGuessFixture("empty guess", "Tortilla");
  await expectRpcFailure(
    () => submitImpostorGuess(empty.impostor.client, "     \n\t   "),
    "22023",
    "Empty normalized guess should fail"
  );

  assertEqual(gameSessionState(empty.gameSessionId), "impostor_guess", "Empty guess must not resolve the round.");
  assertEqual(roundField(empty.gameSessionId, "impostor_guess_text"), "", "Empty guess must not persist text.");
}

async function validateCorrectGuessAndRetry() {
  const fixture = await createImpostorGuessFixture("correct guess", "Milanesa Especial");

  await submitGuessAndExpect(fixture.impostor.client, "  milanesa   especial  ", {
    alreadyRecorded: false,
    isCorrect: true,
    winner: "impostor"
  }, "Correct guess");

  assertEqual(gameSessionState(fixture.gameSessionId), "round_result", "Correct guess should resolve the game session.");
  assertEqual(roundField(fixture.gameSessionId, "impostor_guess_text"), "milanesa especial", "Guess text should be canonicalized for display.");
  assertEqual(roundField(fixture.gameSessionId, "normalized_impostor_guess"), "milanesa especial", "Normalized guess should be lower-case canonical text.");
  assertEqual(roundField(fixture.gameSessionId, "impostor_guess_correct"), "true", "Correct guess should persist true.");
  assertEqual(roundField(fixture.gameSessionId, "round_winner"), "impostor", "Correct guess should persist impostor winner.");
  assertEqual(roundField(fixture.gameSessionId, "secret_word"), "Milanesa Especial", "Secret word snapshot should remain intact.");
  assertEqual(roundField(fixture.gameSessionId, "normalized_secret_word"), "milanesa especial", "Normalized secret word should remain server-side.");

  await submitGuessAndExpect(fixture.impostor.client, "MILANESA ESPECIAL", {
    alreadyRecorded: true,
    isCorrect: true,
    winner: "impostor"
  }, "Same normalized guess retry");

  await expectRpcFailure(
    () => submitImpostorGuess(fixture.impostor.client, "Ravioles"),
    "P0025",
    "Different retry after correct guess should fail"
  );
}

async function validateIncorrectGuess() {
  const fixture = await createImpostorGuessFixture("incorrect guess", "Ñoquis");

  await submitGuessAndExpect(fixture.impostor.client, "Ravioles", {
    alreadyRecorded: false,
    isCorrect: false,
    winner: "group"
  }, "Incorrect guess");

  assertEqual(gameSessionState(fixture.gameSessionId), "round_result", "Incorrect guess should resolve the game session.");
  assertEqual(roundField(fixture.gameSessionId, "impostor_guess_text"), "Ravioles", "Incorrect guess text should persist.");
  assertEqual(roundField(fixture.gameSessionId, "normalized_impostor_guess"), "ravioles", "Incorrect normalized guess should persist.");
  assertEqual(roundField(fixture.gameSessionId, "impostor_guess_correct"), "false", "Incorrect guess should persist false.");
  assertEqual(roundField(fixture.gameSessionId, "round_winner"), "group", "Incorrect guess should persist group winner.");
}

async function validateVotingWinnersPersistAndRegressions() {
  const wrongFirst = await startVotingFixture("wrong first winner", "Asado");
  const [playerB, playerC, playerD] = wrongFirst.players;
  setRoundOneImpostor(wrongFirst.gameSessionId, playerD.playerId);

  await submitVoteAndExpect(wrongFirst.host.client, playerB.playerId, "voting_first", "wrong first host vote");
  await submitVoteAndExpect(playerB.client, wrongFirst.host.playerId, "voting_first", "wrong first B vote");
  await submitVoteAndExpect(playerC.client, playerB.playerId, "voting_first", "wrong first C vote");
  await submitVoteAndExpect(playerD.client, playerB.playerId, "round_result", "wrong first D vote");
  assertEqual(roundField(wrongFirst.gameSessionId, "round_winner"), "impostor", "Wrong first accusation should persist impostor winner.");

  const secondTie = await startVotingFixture("second tie winner", "Flan");
  const [secondB, secondC, secondD] = secondTie.players;
  setRoundOneImpostor(secondTie.gameSessionId, secondD.playerId);

  await submitVoteAndExpect(secondTie.host.client, secondB.playerId, "voting_first", "second tie host first vote");
  await submitVoteAndExpect(secondB.client, secondC.playerId, "voting_first", "second tie B first vote");
  await submitVoteAndExpect(secondC.client, secondB.playerId, "voting_first", "second tie C first vote");
  await submitVoteAndExpect(secondD.client, secondC.playerId, "tie_discussion", "second tie D first vote");
  await rpcOk(secondTie.host.client, "start_second_round_voting", undefined, "second tie start second voting");
  await submitVoteAndExpect(secondTie.host.client, secondB.playerId, "voting_second", "second tie host second vote");
  await submitVoteAndExpect(secondB.client, secondC.playerId, "voting_second", "second tie B second vote");
  await submitVoteAndExpect(secondC.client, secondB.playerId, "voting_second", "second tie C second vote");
  await submitVoteAndExpect(secondD.client, secondC.playerId, "round_result", "second tie D second vote");
  assertEqual(roundField(secondTie.gameSessionId, "round_winner"), "impostor", "Second-vote tie should persist impostor winner.");

  assertEqual(countRows("round_votes", `where game_session_id = ${sqlString(secondTie.gameSessionId)}::uuid and voting_round = 1`), 4, "First-round votes should remain intact.");
  assertEqual(countRows("round_votes", `where game_session_id = ${sqlString(secondTie.gameSessionId)}::uuid and voting_round = 2`), 4, "Second-round votes should remain intact.");

  await expectRpcFailure(
    () => submitImpostorGuess(secondD.client, "Flan"),
    "P0018",
    "A round_result without prior impostor_guess should not accept a guess"
  );
}

async function main() {
  await validateSchemaAndPrivileges();
  await validateOnlyImpostorCanSubmit();
  await validateInvalidStateAndEmptyGuess();
  await validateCorrectGuessAndRetry();
  await validateIncorrectGuess();
  await validateVotingWinnersPersistAndRegressions();

  console.log("validate-10-1 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
