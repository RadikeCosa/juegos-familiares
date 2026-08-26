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

function roomHostPlayerId(roomId) {
  return psql(`
    select host_player_id from public.rooms where id = ${sqlString(roomId)}::uuid;
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

function setRoundOneImpostor(gameSessionId, playerId) {
  psql(`
    update public.rounds
    set impostor_player_id = ${sqlString(playerId)}::uuid
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = 1;
  `);
}

async function expectDirectSelectDenied(client, tableName) {
  const { error } = await client.from(tableName).select("*").limit(1);

  assert(error, `Expected direct SELECT denied for ${tableName}.`);
  assertEqual(error.code, "42501", `Unexpected direct SELECT error for ${tableName}.`);
}

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 7.1 ${label}`, "Host");
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

async function startValidFixture(label, playerNames = ["B", "C"]) {
  const fixture = await buildRoomWithPlayers(label, playerNames);
  await addGroupWord(fixture.host.client, `Palabra ${label}`);
  const { error } = await startSession(fixture.host.client);
  assert(!error, `start_session should succeed for ${label}: ${error?.message ?? ""}`);
  return {
    ...fixture,
    gameSessionId: gameSessionIdForRoom(fixture.roomId)
  };
}

async function main() {
  assertEqual(functionArgs("start_round_discussion"), "", "start_round_discussion must have no args.");
  assert(!hasFunctionExecute("anon", "start_round_discussion"), "anon must not execute start_round_discussion.");
  assert(hasFunctionExecute("authenticated", "start_round_discussion"), "authenticated must execute start_round_discussion.");
  assert(!hasFunctionExecute("public", "start_round_discussion"), "public must not execute start_round_discussion.");
  assertEqual(
    constraintDefinition("game_sessions", "game_sessions_state_check"),
    "CHECK ((state = ANY (ARRAY['role_reveal'::text, 'discussion'::text])))",
    "game_sessions.state check mismatch."
  );
  assert(!hasColumn("session_players", "role_acknowledged_at"), "session_players must not include role_acknowledged_at.");
  assert(!hasColumn("rounds", "status"), "rounds must not include status.");

  for (const tableName of ["game_sessions", "session_players", "rounds"]) {
    assert(hasRls(tableName), `${tableName} RLS should be enabled.`);
    assertEqual(countPolicies(tableName), 0, `${tableName} should not have direct policies.`);
    assert(!isRealtimePublished(tableName), `${tableName} should not be in Realtime publication.`);

    for (const roleName of ["anon", "authenticated", "public"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert(!hasPrivilege(roleName, tableName, privilege), `${roleName} should not have ${privilege} on ${tableName}.`);
      }
    }
  }

  const anon = createAnonymousClient();
  await expectRpcFailure(() => startRoundDiscussion(anon), "42501");

  const noRoom = await signInAnonymously("no room");
  await createGroup(noRoom.client, "Familia 7.1 no room", "Sin Sala");
  await expectRpcFailure(() => startRoundDiscussion(noRoom.client), "P0017");

  const lobby = await buildRoomWithPlayers("lobby", ["B", "C"]);
  await expectRpcFailure(() => startRoundDiscussion(lobby.host.client), "P0018");

  const happy = await startValidFixture("happy", ["B", "C"]);
  assertEqual(gameSessionState(happy.gameSessionId), "role_reveal", "Happy fixture should start in role_reveal.");
  const { data: advanceRows, error: advanceError } = await startRoundDiscussion(happy.host.client);
  assert(!advanceError, `start_round_discussion should succeed: ${advanceError?.message ?? ""}`);
  const advance = singleRow(advanceRows, "start_round_discussion returned no row.");
  assertEqual(advance.advanced, true, "First call should advance.");
  assertEqual(advance.already_in_phase, false, "First call should not be idempotent.");
  assertEqual(advance.state, "discussion", "First call state mismatch.");
  assertEqual(advance.round_number, 1, "First call round mismatch.");
  assert(!("secret_word" in advance), "start_round_discussion must not return secret_word.");
  assert(!("normalized_secret_word" in advance), "start_round_discussion must not return normalized_secret_word.");
  assert(!("impostor_player_id" in advance), "start_round_discussion must not return impostor_player_id.");
  assertEqual(gameSessionState(happy.gameSessionId), "discussion", "GameSession should be discussion after transition.");
  assertEqual(roundCount(happy.gameSessionId), 1, "Transition must not create rounds.");
  assertEqual(sessionPlayerCount(happy.gameSessionId), 3, "Transition must not alter SessionPlayers.");

  const { data: retryRows, error: retryError } = await startRoundDiscussion(happy.host.client);
  assert(!retryError, "Host retry should be idempotent.");
  const retry = singleRow(retryRows, "Retry returned no row.");
  assertEqual(retry.advanced, false, "Retry should not advance again.");
  assertEqual(retry.already_in_phase, true, "Retry should report already_in_phase.");
  assertEqual(retry.state, "discussion", "Retry state mismatch.");
  assertEqual(roundCount(happy.gameSessionId), 1, "Retry must not create rounds.");

  const nonHost = await startValidFixture("non host", ["B", "C"]);
  await expectRpcFailure(() => startRoundDiscussion(nonHost.players[0].client), "P0019");
  assertEqual(gameSessionState(nonHost.gameSessionId), "role_reveal", "Non-host failure must not change state.");

  const { error: nonHostAdvanceError } = await startRoundDiscussion(nonHost.host.client);
  assert(!nonHostAdvanceError, "Host should advance non-host fixture.");
  const { data: nonHostRetryRows, error: nonHostRetryError } =
    await startRoundDiscussion(nonHost.players[0].client);
  assert(!nonHostRetryError, "Non-host SessionPlayer retry in discussion should succeed.");
  assertEqual(singleRow(nonHostRetryRows, "Non-host retry returned no row.").already_in_phase, true, "Non-host retry should be idempotent.");

  const groupAdmin = await signInAnonymously("group admin");
  const adminGroup = await createGroup(groupAdmin.client, "Familia 7.1 admin", "Admin");
  const adminB = await signInAnonymously("admin B");
  const adminC = await signInAnonymously("admin C");
  await joinGroup(adminB.client, adminGroup.invitation_code, "B");
  await joinGroup(adminC.client, adminGroup.invitation_code, "C");
  const adminBPlayerId = playerIdForAuthUser(adminB.userId);
  const adminRoomRows = await createRoom(adminB.client);
  const adminRoomCode = adminRoomRows[0].room_join_code;
  await joinRoomByCode(groupAdmin.client, adminRoomCode);
  await joinRoomByCode(adminC.client, adminRoomCode);
  await addGroupWord(groupAdmin.client, "Palabra Admin");
  const { error: adminStartError } = await startSession(adminB.client);
  assert(!adminStartError, "Admin fixture should start by non-admin host.");
  await expectRpcFailure(() => startRoundDiscussion(groupAdmin.client), "P0019");
  assert(adminBPlayerId !== adminGroup.player_id, "Admin fixture should be hosted by non-admin.");

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
  psql(`
    update public.room_participants
    set last_seen_at = now()
    where room_id = ${sqlString(excluded.roomId)}::uuid
      and player_id = ${sqlString(excludedD.playerId)}::uuid;
  `);
  await expectRpcFailure(() => startRoundDiscussion(excludedD.client), "P0023");

  const successor = await startValidFixture("successor", ["B", "C"]);
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
  await expectRpcFailure(() => startRoundDiscussion(successor.host.client), "P0019");
  const { error: successorDiscussionError } = await startRoundDiscussion(successorB.client);
  assert(!successorDiscussionError, "Current successor host should start discussion.");

  const retryAfterSuccession = await startValidFixture("retry after succession", ["B", "C"]);
  const retryB = retryAfterSuccession.players[0];
  const { error: retryAdvanceError } = await startRoundDiscussion(retryAfterSuccession.host.client);
  assert(!retryAdvanceError, "Original host should advance before succession.");
  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(retryAfterSuccession.roomId)}::uuid
      and player_id = ${sqlString(retryAfterSuccession.host.playerId)}::uuid;

    update public.room_participants
    set last_seen_at = now()
    where room_id = ${sqlString(retryAfterSuccession.roomId)}::uuid
      and player_id = ${sqlString(retryB.playerId)}::uuid;
  `);
  const { error: retrySuccessionError } = await retryB.client.rpc("reassign_room_host_if_stale");
  assert(!retrySuccessionError, "Retry succession should succeed.");
  const { data: retryAfterSuccessionRows, error: retryAfterSuccessionError } =
    await startRoundDiscussion(retryAfterSuccession.host.client);
  assert(!retryAfterSuccessionError, "Original host retry after succession should be idempotent.");
  assertEqual(singleRow(retryAfterSuccessionRows, "Retry after succession returned no row.").already_in_phase, true, "Retry after succession should already be in phase.");

  const inconsistentNoSession = await buildRoomWithPlayers("inconsistent no session", ["B", "C"]);
  psql(`
    update public.rooms
    set status = 'playing'
    where id = ${sqlString(inconsistentNoSession.roomId)}::uuid;
  `);
  await expectRpcFailure(() => startRoundDiscussion(inconsistentNoSession.host.client), "P0022");

  const inconsistentNoRound = await buildRoomWithPlayers("inconsistent no round", ["B", "C"]);
  const noRoundSessionId = psql(`
    insert into public.game_sessions (room_id, group_id, state)
    values (
      ${sqlString(inconsistentNoRound.roomId)}::uuid,
      ${sqlString(inconsistentNoRound.group.group_id)}::uuid,
      'role_reveal'
    )
    returning id;
  `);
  psql(`
    insert into public.session_players (game_session_id, group_id, player_id)
    values (
      ${sqlString(noRoundSessionId)}::uuid,
      ${sqlString(inconsistentNoRound.group.group_id)}::uuid,
      ${sqlString(inconsistentNoRound.host.playerId)}::uuid
    );

    update public.rooms
    set status = 'playing'
    where id = ${sqlString(inconsistentNoRound.roomId)}::uuid;
  `);
  await expectRpcFailure(() => startRoundDiscussion(inconsistentNoRound.host.client), "P0022");

  psqlShouldFail(`
    update public.game_sessions
    set state = 'voting_first'
    where id = ${sqlString(happy.gameSessionId)}::uuid;
  `);

  const readModel = await startValidFixture("read model", ["B", "C"]);
  const readModelB = readModel.players[0];
  const readModelC = readModel.players[1];
  setRoundOneImpostor(readModel.gameSessionId, readModelC.playerId);
  const { error: readModelTransitionError } = await startRoundDiscussion(readModel.host.client);
  assert(!readModelTransitionError, "Read model fixture should transition.");

  const { data: normalRows, error: normalError } = await getMyGameState(readModel.host.client);
  assert(!normalError, "Normal discussion read should succeed.");
  const normal = singleRow(normalRows, "Normal discussion returned no row.");
  assertEqual(normal.state, "discussion", "Normal discussion state mismatch.");
  assertEqual(normal.round_number, 1, "Normal discussion round mismatch.");
  assertEqual(normal.role, "player", "Normal discussion role mismatch.");
  assertEqual(normal.word, "Palabra read model", "Normal discussion word mismatch.");
  assert(!("impostor_player_id" in normal), "Normal discussion must not leak impostor_player_id.");

  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(readModel.roomId)}::uuid
      and player_id = ${sqlString(readModelB.playerId)}::uuid;
  `);
  const { data: staleRows, error: staleError } = await getMyGameState(readModelB.client);
  assert(!staleError, "Stale SessionPlayer should read discussion state.");
  assertEqual(singleRow(staleRows, "Stale discussion returned no row.").state, "discussion", "Stale discussion state mismatch.");

  const { data: impostorRows, error: impostorError } = await getMyGameState(readModelC.client);
  assert(!impostorError, "Impostor discussion read should succeed.");
  const impostor = singleRow(impostorRows, "Impostor discussion returned no row.");
  assertEqual(impostor.state, "discussion", "Impostor discussion state mismatch.");
  assertEqual(impostor.role, "impostor", "Impostor discussion role mismatch.");
  assertEqual(impostor.word, null, "Impostor discussion must not receive word.");

  for (const tableName of ["game_sessions", "session_players", "rounds"]) {
    await expectDirectSelectDenied(readModel.host.client, tableName);
  }

  console.log("validate-7-1 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
