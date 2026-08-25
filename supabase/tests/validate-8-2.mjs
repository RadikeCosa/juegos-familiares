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

function roomStatus(roomId) {
  return psql(`
    select status
    from public.rooms
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

function roundVoteCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = 1;
  `));
}

function voteTargetFor(gameSessionId, voterPlayerId) {
  return psql(`
    select target_player_id
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = 1
      and voter_player_id = ${sqlString(voterPlayerId)}::uuid;
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

function hasPrivilege(roleName, tableName, privilege) {
  return psql(`
    select has_table_privilege(
      ${sqlString(roleName)},
      'public.${tableName}',
      ${sqlString(privilege)}
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

async function expectDirectAccessDenied(client, tableName) {
  const selectResult = await client.from(tableName).select("*").limit(1);
  assert(selectResult.error, `Expected direct SELECT denied for ${tableName}.`);
  assertEqual(selectResult.error.code, "42501", `Unexpected direct SELECT error for ${tableName}.`);

  const insertResult = await client.from(tableName).insert({});
  assert(insertResult.error, `Expected direct INSERT denied for ${tableName}.`);
  assertEqual(insertResult.error.code, "42501", `Unexpected direct INSERT error for ${tableName}.`);
}

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 8.2 ${label}`, "Host");
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

async function startVotingFixture(label, playerNames = ["B", "C"]) {
  const fixture = await buildRoomWithPlayers(label, playerNames);
  await addGroupWord(fixture.host.client, `Palabra ${label}`);
  const { error: startError } = await startSession(fixture.host.client);
  assert(!startError, `start_session should succeed for ${label}: ${startError?.message ?? ""}`);
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  const { error: discussionError } = await startRoundDiscussion(fixture.host.client);
  assert(!discussionError, `start_round_discussion should succeed for ${label}: ${discussionError?.message ?? ""}`);
  const { error: votingError } = await startRoundVoting(fixture.host.client);
  assert(!votingError, `start_round_voting should succeed for ${label}: ${votingError?.message ?? ""}`);
  assertEqual(gameSessionState(gameSessionId), "voting_first", `${label} should be in voting_first.`);

  return {
    ...fixture,
    gameSessionId,
    roundId: roundIdForGameSession(gameSessionId)
  };
}

async function submitAndExpect(client, targetPlayerId, expectedState, expectedAlreadyRecorded = false) {
  const { data, error } = await submitRoundVote(client, targetPlayerId);
  assert(!error, `submit_round_vote should succeed: ${error?.message ?? ""}`);
  const row = singleRow(data, "submit_round_vote returned no row.");
  assertEqual(row.accepted, true, "Vote should be accepted.");
  assertEqual(row.already_recorded, expectedAlreadyRecorded, "already_recorded mismatch.");
  assertEqual(row.state, expectedState, "Returned state mismatch.");
  assertEqual(row.round_number, 1, "Returned round mismatch.");
  assert(!("secret_word" in row), "submit_round_vote must not return secret_word.");
  assert(!("normalized_secret_word" in row), "submit_round_vote must not return normalized_secret_word.");
  assert(!("impostor_player_id" in row), "submit_round_vote must not return impostor_player_id.");
  assert(!("target_player_id" in row), "submit_round_vote must not return target_player_id.");
  assert(!("vote_count" in row), "submit_round_vote must not return vote_count.");
  return row;
}

async function main() {
  const stateCheck = constraintDefinition("game_sessions", "game_sessions_state_check");
  for (const allowedState of ["role_reveal", "discussion", "voting_first", "tie_discussion", "impostor_guess", "round_result"]) {
    assert(stateCheck.includes(allowedState), `game_sessions.state should allow ${allowedState}.`);
  }
  assert(!stateCheck.includes("voting_second"), "8.2 must not add voting_second.");
  assert(!stateCheck.includes("scoreboard"), "8.2 must not add scoreboard.");
  assert(!hasColumn("rounds", "status"), "rounds must not include status.");

  assertEqual(functionArgs("submit_round_vote"), "target_player_id uuid", "submit_round_vote must have one target arg.");
  assert(!hasFunctionExecute("anon", "submit_round_vote(uuid)"), "anon must not execute submit_round_vote.");
  assert(hasFunctionExecute("authenticated", "submit_round_vote(uuid)"), "authenticated must execute submit_round_vote.");
  assert(!hasFunctionExecute("public", "submit_round_vote(uuid)"), "public must not execute submit_round_vote.");

  assertEqual(countPolicies("round_votes"), 0, "round_votes should not have direct policies.");
  assert(!isRealtimePublished("round_votes"), "round_votes should not be in Realtime publication.");
  for (const roleName of ["anon", "authenticated", "public"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(!hasPrivilege(roleName, "round_votes", privilege), `${roleName} should not have ${privilege} on round_votes.`);
    }
  }

  const anon = createAnonymousClient();
  await expectRpcFailure(() => submitRoundVote(anon, "00000000-0000-4000-8000-000000000000"), "42501");

  const roleReveal = await buildRoomWithPlayers("role reveal", ["B", "C"]);
  await addGroupWord(roleReveal.host.client, "Palabra Role Reveal");
  const { error: roleRevealStartError } = await startSession(roleReveal.host.client);
  assert(!roleRevealStartError, "Role reveal fixture should start.");
  await expectRpcFailure(() => submitRoundVote(roleReveal.host.client, roleReveal.players[0].playerId), "P0018");

  const happy = await startVotingFixture("happy", ["B", "C"]);
  await submitAndExpect(happy.host.client, happy.players[0].playerId, "voting_first");
  assertEqual(roundVoteCount(happy.gameSessionId), 1, "Valid vote should insert one row.");
  assertEqual(voteTargetFor(happy.gameSessionId, happy.host.playerId), happy.players[0].playerId, "Stored target mismatch.");
  assertEqual(roomStatus(happy.roomId), "playing", "Room should remain playing.");
  assertEqual(gameSessionState(happy.gameSessionId), "voting_first", "State should remain voting_first while votes are missing.");

  await submitAndExpect(happy.host.client, happy.players[0].playerId, "voting_first", true);
  assertEqual(roundVoteCount(happy.gameSessionId), 1, "Idempotent retry must not insert another vote.");
  await expectRpcFailure(() => submitRoundVote(happy.host.client, happy.players[1].playerId), "P0025");
  assertEqual(voteTargetFor(happy.gameSessionId, happy.host.playerId), happy.players[0].playerId, "Rejected change must not alter target.");

  await expectRpcFailure(() => submitRoundVote(happy.players[0].client, happy.players[0].playerId), "P0024");

  const outsider = await startVotingFixture("outsider", ["B", "C"]);
  await expectRpcFailure(() => submitRoundVote(happy.players[0].client, outsider.host.playerId), "P0024");

  const excluded = await buildRoomWithPlayers("excluded", ["B", "C", "D"]);
  const excludedD = excluded.players[2];
  await addGroupWord(excluded.host.client, "Palabra Excluido");
  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(excluded.roomId)}::uuid
      and player_id = ${sqlString(excludedD.playerId)}::uuid;
  `);
  const { error: excludedStartError } = await startSession(excluded.host.client);
  assert(!excludedStartError, "Excluded fixture should start.");
  const excludedGameSessionId = gameSessionIdForRoom(excluded.roomId);
  const { error: excludedDiscussionError } = await startRoundDiscussion(excluded.host.client);
  assert(!excludedDiscussionError, "Excluded fixture should enter discussion.");
  const { error: excludedVotingError } = await startRoundVoting(excluded.host.client);
  assert(!excludedVotingError, "Excluded fixture should enter voting.");
  psql(`
    update public.room_participants
    set last_seen_at = now()
    where room_id = ${sqlString(excluded.roomId)}::uuid
      and player_id = ${sqlString(excludedD.playerId)}::uuid;
  `);
  await expectRpcFailure(() => submitRoundVote(excludedD.client, excluded.host.playerId), "P0023");
  assertEqual(gameSessionState(excludedGameSessionId), "voting_first", "Excluded caller must not change state.");

  const impostorWin = await startVotingFixture("impostor unique", ["B", "C"]);
  const impostorPlayer = impostorWin.players[1];
  setRoundOneImpostor(impostorWin.gameSessionId, impostorPlayer.playerId);
  await submitAndExpect(impostorWin.host.client, impostorPlayer.playerId, "voting_first");
  await submitAndExpect(impostorWin.players[0].client, impostorPlayer.playerId, "voting_first");
  await submitAndExpect(impostorPlayer.client, impostorWin.host.playerId, "impostor_guess");
  assertEqual(gameSessionState(impostorWin.gameSessionId), "impostor_guess", "Impostor unique top vote should go to impostor_guess.");
  assertEqual(roundVoteCount(impostorWin.gameSessionId), 3, "All three SessionPlayers should have voted.");
  await submitAndExpect(impostorPlayer.client, impostorWin.host.playerId, "impostor_guess", true);
  assertEqual(roundVoteCount(impostorWin.gameSessionId), 3, "Final-state retry must not insert another vote.");

  const wrongAccused = await startVotingFixture("wrong accused", ["B", "C"]);
  const realImpostor = wrongAccused.players[1];
  const wrongTarget = wrongAccused.players[0];
  setRoundOneImpostor(wrongAccused.gameSessionId, realImpostor.playerId);
  await submitAndExpect(wrongAccused.host.client, wrongTarget.playerId, "voting_first");
  await submitAndExpect(wrongTarget.client, wrongAccused.host.playerId, "voting_first");
  await submitAndExpect(realImpostor.client, wrongTarget.playerId, "round_result");
  assertEqual(gameSessionState(wrongAccused.gameSessionId), "round_result", "Wrong unique top vote should go to round_result.");

  const tied = await startVotingFixture("tie", ["B", "C", "D"]);
  await submitAndExpect(tied.host.client, tied.players[0].playerId, "voting_first");
  await submitAndExpect(tied.players[0].client, tied.host.playerId, "voting_first");
  await submitAndExpect(tied.players[1].client, tied.players[2].playerId, "voting_first");
  await submitAndExpect(tied.players[2].client, tied.players[1].playerId, "tie_discussion");
  assertEqual(gameSessionState(tied.gameSessionId), "tie_discussion", "Tie maximum should go to tie_discussion.");
  assertEqual(roundVoteCount(tied.gameSessionId), 4, "All four SessionPlayers should have voted.");

  const noHostPrivilege = await startVotingFixture("non host voting", ["B", "C"]);
  await submitAndExpect(noHostPrivilege.players[0].client, noHostPrivilege.host.playerId, "voting_first");
  assertEqual(roundVoteCount(noHostPrivilege.gameSessionId), 1, "No-host SessionPlayer should be able to vote.");

  const concurrent = await startVotingFixture("concurrent same voter", ["B", "C"]);
  const concurrentResults = await Promise.all([
    submitRoundVote(concurrent.host.client, concurrent.players[0].playerId),
    submitRoundVote(concurrent.host.client, concurrent.players[0].playerId)
  ]);
  assert(concurrentResults.every((result) => !result.error), "Concurrent same-vote retries should succeed.");
  assertEqual(roundVoteCount(concurrent.gameSessionId), 1, "Concurrent same-vote retries should create one vote.");

  await expectDirectAccessDenied(happy.host.client, "round_votes");

  console.log("validate-8-2 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
