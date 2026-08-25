import { execFileSync } from "node:child_process";
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

  return singleRow(data, "Add word RPC returned no row.");
}

async function createRoom(client) {
  const { data, error } = await client.rpc("create_room");

  if (error) {
    throw error;
  }

  assert(Array.isArray(data) && data.length > 0, "create_room returned no rows.");
  return data;
}

async function joinRoomByCode(client, roomCode) {
  const { data, error } = await client.rpc("join_room_by_code", {
    room_code: roomCode
  });

  if (error) {
    throw error;
  }

  assert(Array.isArray(data) && data.length > 0, "join_room_by_code returned no rows.");
  return data;
}

async function rpcOk(client, fn, params, message) {
  const { data, error } = await client.rpc(fn, params);

  assert(!error, `${message}: ${error?.message ?? ""}`);
  return data;
}

async function getMyGameState(client) {
  const { data, error } = await client.rpc("get_my_game_state");

  if (error) {
    throw error;
  }

  return singleRow(data, "get_my_game_state returned no row.");
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

function hasFunctionExecute(roleName, functionSignature) {
  return psql(`
    select has_function_privilege(
      ${sqlString(roleName)},
      ${sqlString(`public.${functionSignature}`)},
      'execute'
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

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 8.3 ${label}`, "Host");
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

  const roomRows = await createRoom(host.client);
  const roomId = roomRows[0].room_id;
  const roomCode = roomRows[0].room_join_code;

  for (const player of players) {
    await joinRoomByCode(player.client, roomCode);
  }

  return {
    host: {
      ...host,
      playerId: group.player_id,
      nickname: "Host"
    },
    players,
    roomId
  };
}

async function startVotingFixture(label, playerNames = ["B", "C"]) {
  const fixture = await buildRoomWithPlayers(label, playerNames);
  await addGroupWord(fixture.host.client, `Palabra ${label}`);
  await rpcOk(fixture.host.client, "start_session", undefined, "start_session should succeed");
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  await rpcOk(fixture.host.client, "start_round_discussion", undefined, "start_round_discussion should succeed");
  await rpcOk(fixture.host.client, "start_round_voting", undefined, "start_round_voting should succeed");

  return {
    ...fixture,
    gameSessionId
  };
}

function assertNoForbiddenReadModelFields(row, context) {
  for (const forbidden of [
    "normalized_secret_word",
    "secret_word",
    "impostor_player_id",
    "voter_player_id",
    "target_player_id",
    "score",
    "winner"
  ]) {
    assert(!(forbidden in row), `${context}: must not expose ${forbidden}.`);
  }
}

function candidateIds(row) {
  return (row.candidates ?? []).map((candidate) => candidate.player_id);
}

async function main() {
  assert(hasFunctionExecute("authenticated", "get_my_game_state()"), "authenticated must execute get_my_game_state.");
  assert(!hasFunctionExecute("anon", "get_my_game_state()"), "anon must not execute get_my_game_state.");
  assert(!isRealtimePublished("round_votes"), "round_votes should not be in Realtime publication.");
  assert(!hasColumn("rounds", "status"), "rounds must not include status.");
  assert(!hasColumn("rounds", "score"), "8.3 must not add scoring columns.");

  const voting = await startVotingFixture("voting read", ["B", "C"]);
  const hostVotingState = await getMyGameState(voting.host.client);

  assertEqual(hostVotingState.state, "voting_first", "Read model should show voting_first.");
  assertEqual(hostVotingState.round_number, 1, "Round number mismatch.");
  assert(Array.isArray(hostVotingState.candidates), "voting_first must include candidates.");
  assertEqual(hostVotingState.candidates.length, 2, "Host should see the two other SessionPlayers as candidates.");
  assert(!candidateIds(hostVotingState).includes(voting.host.playerId), "Caller must not be a votable candidate.");
  assertEqual(hostVotingState.my_vote_target_player_id, null, "Initial caller vote should be null.");
  assertEqual(hostVotingState.has_voted, false, "Initial caller has_voted should be false.");
  assertEqual(hostVotingState.vote_results, null, "voting_first must not expose partial vote results.");
  assertNoForbiddenReadModelFields(hostVotingState, "voting_first");

  await rpcOk(voting.host.client, "submit_round_vote", {
    target_player_id: voting.players[0].playerId
  }, "submit_round_vote should succeed");
  const hostAfterVoteState = await getMyGameState(voting.host.client);
  assertEqual(hostAfterVoteState.my_vote_target_player_id, voting.players[0].playerId, "Caller vote target mismatch.");
  assertEqual(hostAfterVoteState.has_voted, true, "Caller has_voted should become true.");
  assertEqual(hostAfterVoteState.vote_results, null, "Own vote must not create partial results.");

  const impostorView = await startVotingFixture("impostor privacy", ["B", "C"]);
  setRoundOneImpostor(impostorView.gameSessionId, impostorView.host.playerId);
  const impostorVotingState = await getMyGameState(impostorView.host.client);
  assertEqual(impostorVotingState.role, "impostor", "Fixture host should be impostor.");
  assertEqual(impostorVotingState.word, null, "Impostor must not receive the secret word.");
  assertNoForbiddenReadModelFields(impostorVotingState, "impostor voting_first");

  const tied = await startVotingFixture("tie result", ["B", "C", "D"]);
  await rpcOk(tied.host.client, "submit_round_vote", { target_player_id: tied.players[0].playerId }, "tie host vote");
  await rpcOk(tied.players[0].client, "submit_round_vote", { target_player_id: tied.host.playerId }, "tie B vote");
  await rpcOk(tied.players[1].client, "submit_round_vote", { target_player_id: tied.players[2].playerId }, "tie C vote");
  await rpcOk(tied.players[2].client, "submit_round_vote", { target_player_id: tied.players[1].playerId }, "tie D vote");
  const tieState = await getMyGameState(tied.host.client);
  assertEqual(tieState.state, "tie_discussion", "Tie should resolve to tie_discussion.");
  assert(Array.isArray(tieState.vote_results), "tie_discussion should include aggregate results.");
  assert(tieState.vote_results.every((result) => typeof result.vote_count === "number"), "Aggregates must include vote_count.");
  assertEqual(tieState.candidates, null, "post-resolution states should not return voting candidates.");
  assertNoForbiddenReadModelFields(tieState, "tie_discussion");

  const guessed = await startVotingFixture("guess result", ["B", "C"]);
  const guessedImpostor = guessed.players[1];
  setRoundOneImpostor(guessed.gameSessionId, guessedImpostor.playerId);
  await rpcOk(guessed.host.client, "submit_round_vote", { target_player_id: guessedImpostor.playerId }, "guess host vote");
  await rpcOk(guessed.players[0].client, "submit_round_vote", { target_player_id: guessedImpostor.playerId }, "guess B vote");
  await rpcOk(guessedImpostor.client, "submit_round_vote", { target_player_id: guessed.host.playerId }, "guess impostor vote");
  const guessState = await getMyGameState(guessedImpostor.client);
  assertEqual(guessState.state, "impostor_guess", "Impostor identified should resolve to impostor_guess.");
  assertEqual(guessState.word, null, "impostor_guess must not reveal secret_word to impostor.");
  assert(Array.isArray(guessState.vote_results), "impostor_guess should include aggregate results.");
  assertNoForbiddenReadModelFields(guessState, "impostor_guess");

  const wrong = await startVotingFixture("wrong result", ["B", "C"]);
  const realImpostor = wrong.players[1];
  const wrongTarget = wrong.players[0];
  setRoundOneImpostor(wrong.gameSessionId, realImpostor.playerId);
  await rpcOk(wrong.host.client, "submit_round_vote", { target_player_id: wrongTarget.playerId }, "wrong host vote");
  await rpcOk(wrongTarget.client, "submit_round_vote", { target_player_id: wrong.host.playerId }, "wrong B vote");
  await rpcOk(realImpostor.client, "submit_round_vote", { target_player_id: wrongTarget.playerId }, "wrong impostor vote");
  const wrongState = await getMyGameState(wrong.host.client);
  assertEqual(wrongState.state, "round_result", "Wrong accusation should resolve to round_result.");
  assert(Array.isArray(wrongState.vote_results), "round_result should include aggregate results.");
  assert(!("scoreboard" in wrongState), "round_result must not include scoreboard.");
  assertNoForbiddenReadModelFields(wrongState, "round_result");

  console.log("validate-8-3 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
