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
  return singleRow(await rpcOk(client, "create_room", undefined, "create_room should succeed"), "create_room returned no rows.");
}

async function joinRoomByCode(client, roomCode) {
  return singleRow(await rpcOk(client, "join_room_by_code", {
    room_code: roomCode
  }, "join_room_by_code should succeed"), "join_room_by_code returned no rows.");
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

async function getMyGameState(client) {
  return singleRow(await rpcOk(client, "get_my_game_state", undefined, "get_my_game_state should succeed"), "get_my_game_state returned no row.");
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

function setRoundOneImpostor(gameSessionId, playerId) {
  psql(`
    update public.rounds
    set impostor_player_id = ${sqlString(playerId)}::uuid
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = 1;
  `);
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

function tableExists(tableName) {
  return psql(`
    select to_regclass(${sqlString(`public.${tableName}`)}) is not null;
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

function assertReadModelIsPrivate(row, context) {
  const serialized = JSON.stringify(row);

  for (const forbidden of [
    "normalized_secret_word",
    "normalized_impostor_guess",
    "impostor_player_id",
    "round_id",
    "game_session_id",
    "round_votes",
    "voter_player_id"
  ]) {
    assert(!serialized.includes(forbidden), `${context}: read model leaked ${forbidden}.`);
  }
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
  const group = await createGroup(host.client, `Familia 10.2 ${label}`, "Host");
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

async function startVotingFixture(label, secretWord) {
  const fixture = await buildRoomWithPlayers(label);
  await addGroupWord(fixture.host.client, secretWord);
  await rpcOk(fixture.host.client, "start_session", undefined, `${label}: start_session should succeed`);
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  await rpcOk(fixture.host.client, "start_round_discussion", undefined, `${label}: start_round_discussion should succeed`);
  await rpcOk(fixture.host.client, "start_round_voting", undefined, `${label}: start_round_voting should succeed`);

  return {
    ...fixture,
    gameSessionId,
    secretWord
  };
}

async function createImpostorGuessFixture(label, secretWord) {
  const fixture = await startVotingFixture(label, secretWord);
  const [playerB, playerC, playerD] = fixture.players;
  setRoundOneImpostor(fixture.gameSessionId, playerB.playerId);

  await submitVoteAndExpect(fixture.host.client, playerB.playerId, "voting_first", `${label}: host vote`);
  await submitVoteAndExpect(playerB.client, fixture.host.playerId, "voting_first", `${label}: impostor vote`);
  await submitVoteAndExpect(playerC.client, playerB.playerId, "voting_first", `${label}: C vote`);
  await submitVoteAndExpect(playerD.client, playerB.playerId, "impostor_guess", `${label}: D vote`);

  return {
    ...fixture,
    impostor: playerB,
    nonImpostor: playerC
  };
}

async function validateImpostorGuessReadModelPrivacy() {
  const fixture = await createImpostorGuessFixture("guess privacy", "Milanesa");
  const impostorState = await getMyGameState(fixture.impostor.client);
  const playerState = await getMyGameState(fixture.nonImpostor.client);

  assertEqual(impostorState.state, "impostor_guess", "Impostor should see impostor_guess.");
  assertEqual(impostorState.role, "impostor", "Impostor role should be private.");
  assertEqual(impostorState.word, null, "Impostor must not receive secret_word before guess.");
  assertEqual(impostorState.can_submit_impostor_guess, true, "Impostor should be allowed to submit guess.");
  assertEqual(impostorState.winner, null, "impostor_guess must not expose winner yet.");
  assertEqual(impostorState.impostor_guess_text, null, "impostor_guess must not expose guess text yet.");
  assertEqual(impostorState.impostor_guess_correct, null, "impostor_guess must not expose guess result yet.");
  assert(Array.isArray(impostorState.vote_results), "impostor_guess should keep aggregate vote results.");
  assertReadModelIsPrivate(impostorState, "impostor_guess impostor");

  assertEqual(playerState.state, "impostor_guess", "Player should see impostor_guess.");
  assertEqual(playerState.role, "player", "Non-impostor should keep player role.");
  assertEqual(playerState.word, null, "Non-impostor must not receive secret_word during impostor_guess.");
  assertEqual(playerState.can_submit_impostor_guess, false, "Non-impostor should not be allowed to submit guess.");
  assertReadModelIsPrivate(playerState, "impostor_guess player");

  await expectRpcFailure(
    () => submitImpostorGuess(fixture.nonImpostor.client, "Milanesa"),
    "P0023",
    "Non-impostor still cannot submit guess"
  );
}

async function validateCorrectGuessRoundResult() {
  const fixture = await createImpostorGuessFixture("correct read model", "Tarta");
  await rpcOk(fixture.impostor.client, "submit_impostor_guess", {
    guess_text: " tarta "
  }, "correct guess should succeed");

  const impostorState = await getMyGameState(fixture.impostor.client);
  const playerState = await getMyGameState(fixture.nonImpostor.client);

  for (const state of [impostorState, playerState]) {
    assertEqual(state.state, "round_result", "Correct guess should lead to round_result.");
    assertEqual(state.word, "Tarta", "round_result should reveal secret_word.");
    assertEqual(state.winner, "impostor", "Correct guess should expose impostor winner.");
    assertEqual(state.impostor_guess_text, "tarta", "round_result should expose visible guess text.");
    assertEqual(state.impostor_guess_correct, true, "round_result should expose correct guess.");
    assertEqual(state.can_submit_impostor_guess, false, "round_result should not allow guess submit.");
    assert(Array.isArray(state.vote_results), "round_result should keep aggregate vote results.");
    assertReadModelIsPrivate(state, "round_result correct guess");
  }
}

async function validateIncorrectGuessRoundResult() {
  const fixture = await createImpostorGuessFixture("incorrect read model", "Flan");
  await rpcOk(fixture.impostor.client, "submit_impostor_guess", {
    guess_text: "Gelatina"
  }, "incorrect guess should succeed");

  const state = await getMyGameState(fixture.nonImpostor.client);

  assertEqual(state.state, "round_result", "Incorrect guess should lead to round_result.");
  assertEqual(state.word, "Flan", "round_result should reveal secret_word.");
  assertEqual(state.winner, "group", "Incorrect guess should expose group winner.");
  assertEqual(state.impostor_guess_text, "Gelatina", "round_result should expose visible guess text.");
  assertEqual(state.impostor_guess_correct, false, "round_result should expose incorrect guess.");
  assertReadModelIsPrivate(state, "round_result incorrect guess");
}

async function validateRoundResultWithoutGuess() {
  const fixture = await startVotingFixture("wrong accusation result", "Asado");
  const [playerB, playerC, playerD] = fixture.players;
  setRoundOneImpostor(fixture.gameSessionId, playerD.playerId);

  await submitVoteAndExpect(fixture.host.client, playerB.playerId, "voting_first", "wrong host vote");
  await submitVoteAndExpect(playerB.client, fixture.host.playerId, "voting_first", "wrong B vote");
  await submitVoteAndExpect(playerC.client, playerB.playerId, "voting_first", "wrong C vote");
  await submitVoteAndExpect(playerD.client, playerB.playerId, "round_result", "wrong D vote");

  const state = await getMyGameState(fixture.host.client);

  assertEqual(state.state, "round_result", "Wrong accusation should be round_result.");
  assertEqual(state.word, "Asado", "round_result without guess should reveal secret_word.");
  assertEqual(state.winner, "impostor", "Wrong accusation should expose impostor winner.");
  assertEqual(state.impostor_guess_text, null, "Wrong accusation should not expose guess text.");
  assertEqual(state.impostor_guess_correct, null, "Wrong accusation should not expose guess result.");
  assert(Array.isArray(state.vote_results), "Wrong accusation should expose aggregate vote results.");
  assertReadModelIsPrivate(state, "round_result without guess");
}

async function validateNoOutOfScopeSurfaces() {
  assert(hasFunctionExecute("authenticated", "get_my_game_state()"), "authenticated must execute get_my_game_state.");
  assert(!hasFunctionExecute("anon", "get_my_game_state()"), "anon must not execute get_my_game_state.");
  assert(!hasFunctionExecute("public", "get_my_game_state()"), "public must not execute get_my_game_state.");
  assert(!tableExists("scoreboard"), "10.2 must not create scoreboard.");
  assert(!isRealtimePublished("rounds"), "10.2 must not publish rounds through Realtime.");
  assert(!isRealtimePublished("game_sessions"), "10.2 must not publish gameplay state through Realtime.");
}

async function main() {
  await validateNoOutOfScopeSurfaces();
  await validateImpostorGuessReadModelPrivacy();
  await validateCorrectGuessRoundResult();
  await validateIncorrectGuessRoundResult();
  await validateRoundResultWithoutGuess();

  console.log("validate-10-2 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
