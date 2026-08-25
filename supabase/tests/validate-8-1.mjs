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

function roomHostPlayerId(roomId) {
  return psql(`
    select host_player_id from public.rooms where id = ${sqlString(roomId)}::uuid;
  `);
}

function roomStatus(roomId) {
  return psql(`
    select status from public.rooms where id = ${sqlString(roomId)}::uuid;
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

function sessionPlayerCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.session_players
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `));
}

function roundCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `));
}

function roundVoteCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `));
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

function hasRls(tableName) {
  return psql(`
    select relrowsecurity
    from pg_class
    join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = ${sqlString(tableName)};
  `) === "t";
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

function hasFunctionExecute(roleName, functionName) {
  return psql(`
    select has_function_privilege(
      ${sqlString(roleName)},
      'public.${functionName}()',
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
  const group = await createGroup(host.client, `Familia 8.1 ${label}`, "Host");
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
  assertEqual(gameSessionState(gameSessionId), "discussion", `${label} should be in discussion.`);

  return {
    ...fixture,
    gameSessionId
  };
}

function insertRoundVote({ roundId, gameSessionId, groupId, votingRound = 1, voterPlayerId, targetPlayerId }) {
  psql(`
    insert into public.round_votes (
      round_id,
      game_session_id,
      group_id,
      voting_round,
      voter_player_id,
      target_player_id
    )
    values (
      ${sqlString(roundId)}::uuid,
      ${sqlString(gameSessionId)}::uuid,
      ${sqlString(groupId)}::uuid,
      ${votingRound},
      ${sqlString(voterPlayerId)}::uuid,
      ${sqlString(targetPlayerId)}::uuid
    );
  `);
}

async function main() {
  assert(hasTable("round_votes"), "round_votes table should exist.");
  assert(!hasColumn("rounds", "status"), "rounds must not include status.");
  const gameSessionStateCheck = constraintDefinition("game_sessions", "game_sessions_state_check");
  for (const expectedState of ["role_reveal", "discussion", "voting_first"]) {
    assert(
      gameSessionStateCheck.includes(expectedState),
      `game_sessions.state should allow ${expectedState}.`
    );
  }
  assertEqual(
    constraintDefinition("round_votes", "round_votes_pkey"),
    "PRIMARY KEY (round_id, voting_round, voter_player_id)",
    "round_votes primary key mismatch."
  );
  const votingRoundCheck = constraintDefinition("round_votes", "round_votes_voting_round_check");
  assert(votingRoundCheck.includes("voting_round = ANY"), "round_votes voting_round check should use a bounded list.");
  assert(votingRoundCheck.includes("1"), "round_votes voting_round check should allow 1.");
  assert(votingRoundCheck.includes("2"), "round_votes voting_round check should allow 2.");
  assert(
    constraintDefinition("round_votes", "round_votes_no_self_vote_check").includes("voter_player_id <> target_player_id"),
    "round_votes self-vote check mismatch."
  );
  assert(constraintDefinition("round_votes", "round_votes_round_fkey").includes("FOREIGN KEY (round_id, game_session_id, group_id)"), "round_votes should bind Round to GameSession and Group.");
  assert(constraintDefinition("round_votes", "round_votes_voter_session_player_fkey").includes("FOREIGN KEY (game_session_id, voter_player_id)"), "round_votes voter should reference SessionPlayer.");
  assert(constraintDefinition("round_votes", "round_votes_target_session_player_fkey").includes("FOREIGN KEY (game_session_id, target_player_id)"), "round_votes target should reference SessionPlayer.");

  assertEqual(functionArgs("start_round_voting"), "", "start_round_voting must have no args.");
  assert(!hasFunctionExecute("anon", "start_round_voting"), "anon must not execute start_round_voting.");
  assert(hasFunctionExecute("authenticated", "start_round_voting"), "authenticated must execute start_round_voting.");
  assert(!hasFunctionExecute("public", "start_round_voting"), "public must not execute start_round_voting.");

  assert(hasRls("round_votes"), "round_votes RLS should be enabled.");
  assertEqual(countPolicies("round_votes"), 0, "round_votes should not have direct policies.");
  assert(!isRealtimePublished("round_votes"), "round_votes should not be in Realtime publication.");

  for (const roleName of ["anon", "authenticated", "public"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(!hasPrivilege(roleName, "round_votes", privilege), `${roleName} should not have ${privilege} on round_votes.`);
    }
  }

  const anon = createAnonymousClient();
  await expectRpcFailure(() => startRoundVoting(anon), "42501");

  const noRoom = await signInAnonymously("no room");
  await createGroup(noRoom.client, "Familia 8.1 no room", "Sin Sala");
  await expectRpcFailure(() => startRoundVoting(noRoom.client), "P0017");

  const roleReveal = await buildRoomWithPlayers("role reveal", ["B", "C"]);
  await addGroupWord(roleReveal.host.client, "Palabra Role Reveal");
  const { error: roleRevealStartError } = await startSession(roleReveal.host.client);
  assert(!roleRevealStartError, "Role reveal fixture should start.");
  const roleRevealGameSessionId = gameSessionIdForRoom(roleReveal.roomId);
  await expectRpcFailure(() => startRoundVoting(roleReveal.host.client), "P0018");
  assertEqual(gameSessionState(roleRevealGameSessionId), "role_reveal", "Invalid phase must not change state.");

  const happy = await startDiscussionFixture("happy", ["B", "C"]);
  const beforeRoundSnapshot = roundSnapshot(happy.gameSessionId);
  const beforeSessionPlayerCount = sessionPlayerCount(happy.gameSessionId);
  assertEqual(roundVoteCount(happy.gameSessionId), 0, "Voting fixture should start without votes.");
  const { data: advanceRows, error: advanceError } = await startRoundVoting(happy.host.client);
  assert(!advanceError, `start_round_voting should succeed: ${advanceError?.message ?? ""}`);
  const advance = singleRow(advanceRows, "start_round_voting returned no row.");
  assertEqual(advance.advanced, true, "First call should advance.");
  assertEqual(advance.already_in_phase, false, "First call should not be idempotent.");
  assertEqual(advance.state, "voting_first", "First call state mismatch.");
  assertEqual(advance.round_number, 1, "First call round mismatch.");
  assert(!("secret_word" in advance), "start_round_voting must not return secret_word.");
  assert(!("normalized_secret_word" in advance), "start_round_voting must not return normalized_secret_word.");
  assert(!("impostor_player_id" in advance), "start_round_voting must not return impostor_player_id.");
  assert(!("round_votes" in advance), "start_round_voting must not return round_votes.");
  assertEqual(gameSessionState(happy.gameSessionId), "voting_first", "GameSession should be voting_first after transition.");
  assertEqual(roomStatus(happy.roomId), "playing", "Room should remain playing.");
  assertEqual(roundCount(happy.gameSessionId), 1, "Transition must not create rounds.");
  assertEqual(roundSnapshot(happy.gameSessionId), beforeRoundSnapshot, "Transition must not alter Round secrets or impostor.");
  assertEqual(sessionPlayerCount(happy.gameSessionId), beforeSessionPlayerCount, "Transition must not alter SessionPlayers.");
  assertEqual(roundVoteCount(happy.gameSessionId), 0, "Transition must not create votes.");

  const { data: retryRows, error: retryError } = await startRoundVoting(happy.host.client);
  assert(!retryError, "Host retry should be idempotent.");
  const retry = singleRow(retryRows, "Retry returned no row.");
  assertEqual(retry.advanced, false, "Retry should not advance again.");
  assertEqual(retry.already_in_phase, true, "Retry should report already_in_phase.");
  assertEqual(retry.state, "voting_first", "Retry state mismatch.");
  assertEqual(roundVoteCount(happy.gameSessionId), 0, "Retry must not create votes.");

  const nonHost = await startDiscussionFixture("non host", ["B", "C"]);
  await expectRpcFailure(() => startRoundVoting(nonHost.players[0].client), "P0019");
  assertEqual(gameSessionState(nonHost.gameSessionId), "discussion", "Non-host failure must not change state.");

  const groupAdmin = await signInAnonymously("group admin");
  const adminGroup = await createGroup(groupAdmin.client, "Familia 8.1 admin", "Admin");
  const adminB = await signInAnonymously("admin B");
  const adminC = await signInAnonymously("admin C");
  await joinGroup(adminB.client, adminGroup.invitation_code, "B");
  await joinGroup(adminC.client, adminGroup.invitation_code, "C");
  const adminBPlayerId = playerIdForAuthUser(adminB.userId);
  const adminRoomRows = await createRoom(adminB.client);
  const adminRoomCode = adminRoomRows[0].room_join_code;
  const adminRoomId = adminRoomRows[0].room_id;
  await joinRoomByCode(groupAdmin.client, adminRoomCode);
  await joinRoomByCode(adminC.client, adminRoomCode);
  await addGroupWord(groupAdmin.client, "Palabra Admin");
  const { error: adminStartError } = await startSession(adminB.client);
  assert(!adminStartError, "Admin fixture should start by non-admin host.");
  const adminGameSessionId = gameSessionIdForRoom(adminRoomId);
  const { error: adminDiscussionError } = await startRoundDiscussion(adminB.client);
  assert(!adminDiscussionError, "Admin fixture should enter discussion.");
  await expectRpcFailure(() => startRoundVoting(groupAdmin.client), "P0019");
  assert(adminBPlayerId !== adminGroup.player_id, "Admin fixture should be hosted by non-admin.");
  assertEqual(gameSessionState(adminGameSessionId), "discussion", "Group admin failure must not change state.");

  const successor = await startDiscussionFixture("successor", ["B", "C"]);
  const successorB = successor.players[0];
  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(successor.roomId)}::uuid
      and player_id = ${sqlString(successor.host.playerId)}::uuid;

    update public.room_participants
    set last_seen_at = now()
    where room_id = ${sqlString(successor.roomId)}::uuid
      and player_id = ${sqlString(successorB.playerId)}::uuid;
  `);
  const { error: successionError } = await successorB.client.rpc("reassign_room_host_if_stale");
  assert(!successionError, "Host succession should succeed.");
  assertEqual(roomHostPlayerId(successor.roomId), successorB.playerId, "B should be current host.");
  await expectRpcFailure(() => startRoundVoting(successor.host.client), "P0019");
  const { error: successorVotingError } = await startRoundVoting(successorB.client);
  assert(!successorVotingError, "Current successor host should start voting.");
  assertEqual(gameSessionState(successor.gameSessionId), "voting_first", "Successor should advance to voting_first.");

  const concurrent = await startDiscussionFixture("concurrent", ["B", "C"]);
  const concurrentResults = await Promise.all([
    startRoundVoting(concurrent.host.client),
    startRoundVoting(concurrent.host.client)
  ]);
  assertEqual(gameSessionState(concurrent.gameSessionId), "voting_first", "Concurrent calls should leave voting_first.");
  assertEqual(
    concurrentResults.filter((result) => !result.error && singleRow(result.data, "Concurrent row missing.").advanced === true).length,
    1,
    "Concurrent calls should have one advancing response."
  );
  assertEqual(roundVoteCount(concurrent.gameSessionId), 0, "Concurrent start voting must not create votes.");

  const validVote = await startDiscussionFixture("valid vote", ["B", "C"]);
  const validRoundId = roundIdForGameSession(validVote.gameSessionId);
  const validVoter = validVote.host.playerId;
  const validTarget = validVote.players[0].playerId;
  insertRoundVote({
    roundId: validRoundId,
    gameSessionId: validVote.gameSessionId,
    groupId: validVote.group.group_id,
    voterPlayerId: validVoter,
    targetPlayerId: validTarget
  });
  psqlShouldFail(`
    insert into public.round_votes (round_id, game_session_id, group_id, voting_round, voter_player_id, target_player_id)
    values (
      ${sqlString(validRoundId)}::uuid,
      ${sqlString(validVote.gameSessionId)}::uuid,
      ${sqlString(validVote.group.group_id)}::uuid,
      1,
      ${sqlString(validVoter)}::uuid,
      ${sqlString(validVote.players[1].playerId)}::uuid
    );
  `);
  psqlShouldFail(`
    insert into public.round_votes (round_id, game_session_id, group_id, voting_round, voter_player_id, target_player_id)
    values (
      ${sqlString(validRoundId)}::uuid,
      ${sqlString(validVote.gameSessionId)}::uuid,
      ${sqlString(validVote.group.group_id)}::uuid,
      3,
      ${sqlString(validVote.players[0].playerId)}::uuid,
      ${sqlString(validVoter)}::uuid
    );
  `);
  psqlShouldFail(`
    insert into public.round_votes (round_id, game_session_id, group_id, voting_round, voter_player_id, target_player_id)
    values (
      ${sqlString(validRoundId)}::uuid,
      ${sqlString(validVote.gameSessionId)}::uuid,
      ${sqlString(validVote.group.group_id)}::uuid,
      2,
      ${sqlString(validVoter)}::uuid,
      ${sqlString(validVoter)}::uuid
    );
  `);

  const other = await startDiscussionFixture("other session", ["B", "C"]);
  psqlShouldFail(`
    insert into public.round_votes (round_id, game_session_id, group_id, voting_round, voter_player_id, target_player_id)
    values (
      ${sqlString(validRoundId)}::uuid,
      ${sqlString(validVote.gameSessionId)}::uuid,
      ${sqlString(validVote.group.group_id)}::uuid,
      2,
      ${sqlString(other.host.playerId)}::uuid,
      ${sqlString(validTarget)}::uuid
    );
  `);
  psqlShouldFail(`
    insert into public.round_votes (round_id, game_session_id, group_id, voting_round, voter_player_id, target_player_id)
    values (
      ${sqlString(validRoundId)}::uuid,
      ${sqlString(validVote.gameSessionId)}::uuid,
      ${sqlString(validVote.group.group_id)}::uuid,
      2,
      ${sqlString(validTarget)}::uuid,
      ${sqlString(other.host.playerId)}::uuid
    );
  `);
  psqlShouldFail(`
    insert into public.round_votes (round_id, game_session_id, group_id, voting_round, voter_player_id, target_player_id)
    values (
      ${sqlString(validRoundId)}::uuid,
      ${sqlString(other.gameSessionId)}::uuid,
      ${sqlString(other.group.group_id)}::uuid,
      2,
      ${sqlString(other.host.playerId)}::uuid,
      ${sqlString(other.players[0].playerId)}::uuid
    );
  `);

  await expectDirectAccessDenied(validVote.host.client, "round_votes");

  console.log("validate-8-1 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
