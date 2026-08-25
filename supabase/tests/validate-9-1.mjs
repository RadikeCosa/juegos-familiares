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

async function startSession(client) {
  return client.rpc("start_session");
}

async function startRoundDiscussion(client) {
  return client.rpc("start_round_discussion");
}

async function startRoundVoting(client) {
  return client.rpc("start_round_voting");
}

async function submitRoundVote(client, targetPlayerId) {
  return client.rpc("submit_round_vote", {
    target_player_id: targetPlayerId
  });
}

async function startSecondRoundVoting(client) {
  return client.rpc("start_second_round_voting");
}

async function getMyGameState(client) {
  return client.rpc("get_my_game_state");
}

async function expectRpcFailure(operation, expectedCode) {
  const { error } = await operation();

  assert(error, `Expected RPC failure ${expectedCode}.`);
  assertEqual(error.code, expectedCode, "Unexpected RPC error code.");
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

function setGameSessionState(gameSessionId, state) {
  psql(`
    update public.game_sessions
    set state = ${sqlString(state)}
    where id = ${sqlString(gameSessionId)}::uuid;
  `);
}

function setRoomHost(roomId, playerId) {
  psql(`
    update public.rooms
    set host_player_id = ${sqlString(playerId)}::uuid
    where id = ${sqlString(roomId)}::uuid;
  `);
}

function roundIdForGameSession(gameSessionId) {
  return psql(`
    select id
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
    order by number desc
    limit 1;
  `);
}

function roundSnapshot(gameSessionId) {
  return psql(`
    select concat_ws('|', id, game_session_id, group_id, number, secret_word, normalized_secret_word, impostor_player_id)
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
    order by number desc
    limit 1;
  `);
}

function roundVoteCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `));
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

function hasTable(tableName) {
  return psql(`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${sqlString(tableName)}
    );
  `) === "t";
}

function constraintDefinition(tableName, constraintName) {
  return psql(`
    select pg_get_constraintdef(pg_constraint.oid)
    from pg_constraint
    join pg_class
      on pg_class.oid = pg_constraint.conrelid
    join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = ${sqlString(tableName)}
      and pg_constraint.conname = ${sqlString(constraintName)};
  `);
}

function countPolicies(tableName) {
  return Number(psql(`
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = ${sqlString(tableName)};
  `));
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

function functionArgs(functionName) {
  return psql(`
    select pg_get_function_arguments(pg_proc.oid)
    from pg_proc
    join pg_namespace
      on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = ${sqlString(functionName)};
  `);
}

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 9.1 ${label}`, "Host");
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
    group,
    players,
    roomId,
    roomCode
  };
}

async function startDiscussionFixture(label, playerNames = ["B", "C"]) {
  const fixture = await buildRoomWithPlayers(label, playerNames);
  await addGroupWord(fixture.host.client, `Palabra ${label}`);
  const { error: startError } = await startSession(fixture.host.client);
  assert(!startError, `start_session should succeed for ${label}: ${startError?.message ?? ""}`);
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  const { error: discussionError } = await startRoundDiscussion(fixture.host.client);
  assert(!discussionError, `start_round_discussion should succeed for ${label}: ${discussionError?.message ?? ""}`);

  return {
    ...fixture,
    gameSessionId,
    roundId: roundIdForGameSession(gameSessionId)
  };
}

async function startTieDiscussionFixture(label, playerNames = ["B", "C", "D"]) {
  const fixture = await startDiscussionFixture(label, playerNames);
  const { error: votingError } = await startRoundVoting(fixture.host.client);
  assert(!votingError, `start_round_voting should succeed for ${label}: ${votingError?.message ?? ""}`);

  await submitRoundVote(fixture.host.client, fixture.players[0].playerId);
  await submitRoundVote(fixture.players[0].client, fixture.host.playerId);
  await submitRoundVote(fixture.players[1].client, fixture.players[2].playerId);
  const { error: finalVoteError } = await submitRoundVote(fixture.players[2].client, fixture.players[1].playerId);
  assert(!finalVoteError, `final tie vote should succeed for ${label}: ${finalVoteError?.message ?? ""}`);
  assertEqual(gameSessionState(fixture.gameSessionId), "tie_discussion", `${label} should be tied.`);

  return fixture;
}

async function startSecondAndExpect(client, expectedAdvanced, expectedAlreadyInPhase) {
  const { data, error } = await startSecondRoundVoting(client);
  assert(!error, `start_second_round_voting should succeed: ${error?.message ?? ""}`);
  const row = singleRow(data, "start_second_round_voting returned no row.");

  assertEqual(row.advanced, expectedAdvanced, "advanced mismatch.");
  assertEqual(row.already_in_phase, expectedAlreadyInPhase, "already_in_phase mismatch.");
  assertEqual(row.state, "voting_second", "Returned state mismatch.");
  assertEqual(row.round_number, 1, "Returned round mismatch.");
  assert(!("secret_word" in row), "start_second_round_voting must not return secret_word.");
  assert(!("normalized_secret_word" in row), "start_second_round_voting must not return normalized_secret_word.");
  assert(!("impostor_player_id" in row), "start_second_round_voting must not return impostor_player_id.");
  assert(!("round_votes" in row), "start_second_round_voting must not return votes.");
  assert(!("candidates" in row), "start_second_round_voting must not return candidates.");

  return row;
}

async function main() {
  const stateCheck = constraintDefinition("game_sessions", "game_sessions_state_check");
  for (const allowedState of ["role_reveal", "discussion", "voting_first", "tie_discussion", "voting_second", "impostor_guess", "round_result"]) {
    assert(stateCheck.includes(allowedState), `game_sessions.state should allow ${allowedState}.`);
  }
  assert(!stateCheck.includes("scoreboard"), "9.1 must not add scoreboard.");
  assert(!stateCheck.includes("finished"), "9.1 must not add finished.");
  assert(!stateCheck.includes("preparing_round"), "9.1 must not add preparing_round.");
  assert(!hasColumn("rounds", "status"), "rounds must not include status.");
  assert(!hasColumn("rounds", "score"), "rounds must not include score.");
  assert(!hasColumn("game_sessions", "tie_candidates"), "game_sessions must not include tie_candidates.");
  assert(!hasTable("tie_candidates"), "9.1 must not create tie_candidates table.");
  psqlShouldFail(`
    insert into public.game_sessions (room_id, group_id, state)
    values (
      '00000000-0000-4000-8000-000000000000'::uuid,
      '00000000-0000-4000-8000-000000000000'::uuid,
      'totally_invalid'
    );
  `);

  assertEqual(functionArgs("start_second_round_voting"), "", "start_second_round_voting must have no args.");
  assert(!hasFunctionExecute("anon", "start_second_round_voting()"), "anon must not execute start_second_round_voting.");
  assert(hasFunctionExecute("authenticated", "start_second_round_voting()"), "authenticated must execute start_second_round_voting.");
  assert(!hasFunctionExecute("public", "start_second_round_voting()"), "public must not execute start_second_round_voting.");
  assertEqual(countPolicies("round_votes"), 0, "round_votes should not gain direct policies.");

  const anon = createAnonymousClient();
  await expectRpcFailure(() => startSecondRoundVoting(anon), "42501");

  const happy = await startTieDiscussionFixture("happy");
  const beforeRoundSnapshot = roundSnapshot(happy.gameSessionId);
  const beforeVoteCount = roundVoteCount(happy.gameSessionId);
  await startSecondAndExpect(happy.host.client, true, false);
  assertEqual(gameSessionState(happy.gameSessionId), "voting_second", "Host should advance to voting_second.");
  assertEqual(roundVoteCount(happy.gameSessionId), beforeVoteCount, "Transition must not create votes.");
  assertEqual(roundSnapshot(happy.gameSessionId), beforeRoundSnapshot, "Transition must not mutate Round secrets.");

  const readModel = singleRow((await getMyGameState(happy.host.client)).data, "get_my_game_state returned no row.");
  assertEqual(readModel.state, "voting_second", "Read model should recognize voting_second.");
  assert(readModel.candidates === null || Array.isArray(readModel.candidates), "Read model candidates should stay structured across later increments.");
  assertEqual(readModel.my_vote_target_player_id, null, "9.1 read model should not expose round 1 vote as second vote.");
  assertEqual(readModel.has_voted, false, "9.1 read model should not mark round 2 as voted.");
  assertEqual(readModel.vote_results, null, "9.1 read model should not expose second voting results.");

  await startSecondAndExpect(happy.host.client, false, true);
  assertEqual(roundVoteCount(happy.gameSessionId), beforeVoteCount, "Idempotent retry must not create votes.");

  const nonHost = await startTieDiscussionFixture("non host");
  await expectRpcFailure(() => startSecondRoundVoting(nonHost.players[0].client), "P0019");
  assertEqual(gameSessionState(nonHost.gameSessionId), "tie_discussion", "Non-host must not change state.");

  const otherContext = await startTieDiscussionFixture("other context");
  await expectRpcFailure(() => startSecondRoundVoting(happy.players[0].client), "P0019");
  await expectRpcFailure(() => startSecondRoundVoting(otherContext.players[0].client), "P0019");

  const statesToReject = ["role_reveal", "discussion", "voting_first", "impostor_guess", "round_result"];
  for (const invalidState of statesToReject) {
    const fixture = await startTieDiscussionFixture(`invalid ${invalidState}`);
    setGameSessionState(fixture.gameSessionId, invalidState);
    await expectRpcFailure(() => startSecondRoundVoting(fixture.host.client), "P0018");
    assertEqual(gameSessionState(fixture.gameSessionId), invalidState, `${invalidState} must not transition.`);
  }

  const reassigned = await startTieDiscussionFixture("reassigned");
  const newHost = reassigned.players[0];
  setRoomHost(reassigned.roomId, newHost.playerId);
  await expectRpcFailure(() => startSecondRoundVoting(reassigned.host.client), "P0019");
  assertEqual(gameSessionState(reassigned.gameSessionId), "tie_discussion", "Original host must not change state after reassignment.");
  await startSecondAndExpect(newHost.client, true, false);
  assertEqual(gameSessionState(reassigned.gameSessionId), "voting_second", "Reassigned host should advance.");

  const concurrent = await startTieDiscussionFixture("concurrent");
  const concurrentResults = await Promise.all([
    startSecondRoundVoting(concurrent.host.client),
    startSecondRoundVoting(concurrent.host.client)
  ]);
  assert(concurrentResults.every((result) => !result.error), "Concurrent host retries should succeed.");
  const concurrentRows = concurrentResults.map((result) => singleRow(result.data, "Concurrent result missing row."));
  assertEqual(
    concurrentRows.filter((row) => row.advanced === true).length,
    1,
    "Exactly one concurrent call should perform the transition."
  );
  assertEqual(
    concurrentRows.filter((row) => row.already_in_phase === true).length,
    1,
    "Exactly one concurrent call should observe idempotent phase."
  );
  assertEqual(gameSessionState(concurrent.gameSessionId), "voting_second", "Concurrent calls should converge to voting_second.");
  assertEqual(roundVoteCount(concurrent.gameSessionId), 4, "Concurrent calls must not create votes.");

  console.log("validate-9-1 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
