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

function assertZeroRows(data, message) {
  assert(Array.isArray(data) && data.length === 0, message);
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

function roundOne(gameSessionId) {
  const row = psql(`
    select number || '|' || secret_word || '|' || impostor_player_id::text
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = 1;
  `);
  const [number, secretWord, impostorPlayerId] = row.split("|");

  return { number: Number(number), secretWord, impostorPlayerId };
}

function setRoundOneImpostor(gameSessionId, playerId) {
  psql(`
    update public.rounds
    set impostor_player_id = ${sqlString(playerId)}::uuid
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = 1;
  `);
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

function countPolicies(tableName) {
  return Number(psql(`
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = ${sqlString(tableName)};
  `));
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

async function expectDirectSelectDenied(client, tableName) {
  const { error } = await client.from(tableName).select("*").limit(1);

  assert(error, `Expected direct SELECT denied for ${tableName}.`);
  assertEqual(error.code, "42501", `Unexpected direct SELECT error for ${tableName}.`);
}

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 6.4 ${label}`, "Host");
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

function assertNoSecretInternals(row, context) {
  assert(!("normalized_secret_word" in row), `${context} leaked normalized_secret_word.`);
  assert(!("impostor_player_id" in row), `${context} leaked impostor_player_id.`);
  assert(!("game_session_id" in row), `${context} leaked game_session_id.`);
  assert(!("round_id" in row), `${context} leaked round_id.`);
  assert(!("host_player_id" in row), `${context} leaked host_player_id.`);
}

async function main() {
  assertEqual(functionArgs("get_my_game_state"), "", "get_my_game_state must have no args.");
  assert(!hasFunctionExecute("anon", "get_my_game_state"), "anon must not execute get_my_game_state.");
  assert(hasFunctionExecute("authenticated", "get_my_game_state"), "authenticated must execute get_my_game_state.");
  assert(!hasFunctionExecute("public", "get_my_game_state"), "public must not execute get_my_game_state.");

  for (const tableName of ["game_sessions", "session_players", "rounds"]) {
    assertEqual(countPolicies(tableName), 0, `${tableName} should not have direct read policies.`);
    assert(!isRealtimePublished(tableName), `${tableName} should not be in Realtime publication.`);

    for (const roleName of ["anon", "authenticated", "public"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert(!hasPrivilege(roleName, tableName, privilege), `${roleName} should not have ${privilege} on ${tableName}.`);
      }
    }
  }

  assert(isRealtimePublished("rooms"), "rooms should remain in Realtime publication.");
  assert(isRealtimePublished("room_participants"), "room_participants should remain in Realtime publication.");

  const anon = createAnonymousClient();
  await expectRpcFailure(() => getMyGameState(anon), "42501");

  const noRoom = await signInAnonymously("no room");
  await createGroup(noRoom.client, "Familia 6.4 no room", "Sin Sala");
  const { data: noRoomRows, error: noRoomError } = await getMyGameState(noRoom.client);
  assert(!noRoomError, "No active Room should not error.");
  assertZeroRows(noRoomRows, "No active Room should return zero rows.");

  const lobby = await buildRoomWithPlayers("lobby", ["B", "C"]);
  const { data: lobbyRows, error: lobbyError } = await getMyGameState(lobby.host.client);
  assert(!lobbyError, "Lobby Room should not error.");
  assertZeroRows(lobbyRows, "Lobby Room should return zero rows.");

  const adminOutside = await signInAnonymously("admin outside");
  const adminOutsideGroup = await createGroup(adminOutside.client, "Familia 6.4 admin outside", "Admin");
  const adminOutsideB = await signInAnonymously("admin outside B");
  const adminOutsideC = await signInAnonymously("admin outside C");
  const adminOutsideD = await signInAnonymously("admin outside D");
  await joinGroup(adminOutsideB.client, adminOutsideGroup.invitation_code, "B");
  await joinGroup(adminOutsideC.client, adminOutsideGroup.invitation_code, "C");
  await joinGroup(adminOutsideD.client, adminOutsideGroup.invitation_code, "D");
  const adminOutsideBPlayerId = playerIdForAuthUser(adminOutsideB.userId);
  const adminOutsideRoomRows = await createRoom(adminOutsideB.client);
  const adminOutsideRoomCode = adminOutsideRoomRows[0].room_join_code;
  await joinRoomByCode(adminOutsideC.client, adminOutsideRoomCode);
  await joinRoomByCode(adminOutsideD.client, adminOutsideRoomCode);
  await addGroupWord(adminOutside.client, "Puente Alto");
  const { error: adminOutsideStartError } = await startSession(adminOutsideB.client);
  assert(!adminOutsideStartError, "Non-admin SessionPlayer should start admin-outside fixture.");
  const { data: adminOutsideRows, error: adminOutsideError } = await getMyGameState(adminOutside.client);
  assert(!adminOutsideError, "Group admin outside Room should not error.");
  assertZeroRows(adminOutsideRows, "Group admin outside Room should not receive gameplay.");
  assert(
    adminOutsideBPlayerId !== adminOutsideGroup.player_id,
    "Admin outside fixture should be started by a non-admin player."
  );

  const foreignStarted = await buildRoomWithPlayers("foreign started", ["B", "C"]);
  await addGroupWord(foreignStarted.host.client, "Cerro Azul");
  const { error: foreignStartError } = await startSession(foreignStarted.host.client);
  assert(!foreignStartError, "Foreign fixture should start.");
  const otherGroup = await signInAnonymously("other group outsider");
  await createGroup(otherGroup.client, "Familia 6.4 other group", "Other");
  const { data: otherGroupRows, error: otherGroupError } = await getMyGameState(otherGroup.client);
  assert(!otherGroupError, "Other Group outsider should not error.");
  assertZeroRows(otherGroupRows, "Other Group outsider should not receive gameplay.");

  const started = await buildRoomWithPlayers("started", ["B", "C"]);
  const playerB = started.players[0];
  const playerC = started.players[1];
  await addGroupWord(started.host.client, "Tesoro Azul");
  const { data: startRows, error: startError } = await startSession(started.host.client);
  assert(!startError, `start_session should succeed: ${startError?.message ?? ""}`);
  const startResult = singleRow(startRows, "start_session returned no row.");
  assert(!("secret_word" in startResult), "start_session must not return secret_word.");
  assert(!("normalized_secret_word" in startResult), "start_session must not return normalized_secret_word.");
  assert(!("impostor_player_id" in startResult), "start_session must not return impostor_player_id.");

  const gameSessionId = gameSessionIdForRoom(started.roomId);
  setRoundOneImpostor(gameSessionId, playerC.playerId);

  const { data: hostRows, error: hostError } = await getMyGameState(started.host.client);
  assert(!hostError, "Host normal game-state read should succeed.");
  const hostState = singleRow(hostRows, "Host game-state returned no row.");
  assertEqual(hostState.state, "role_reveal", "Host state mismatch.");
  assertEqual(hostState.round_number, 1, "Host round mismatch.");
  assertEqual(hostState.role, "player", "Host normal role mismatch.");
  assertEqual(hostState.word, "Tesoro Azul", "Host normal word mismatch.");
  assertNoSecretInternals(hostState, "Host normal");

  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(started.roomId)}::uuid
      and player_id = ${sqlString(playerB.playerId)}::uuid;
  `);
  const { data: staleRows, error: staleError } = await getMyGameState(playerB.client);
  assert(!staleError, "Stale SessionPlayer should still read private view.");
  const staleState = singleRow(staleRows, "Stale SessionPlayer returned no row.");
  assertEqual(staleState.role, "player", "Stale SessionPlayer role mismatch.");
  assertEqual(staleState.word, "Tesoro Azul", "Stale SessionPlayer word mismatch.");

  const { data: impostorRows, error: impostorError } = await getMyGameState(playerC.client);
  assert(!impostorError, "Impostor game-state read should succeed.");
  const impostorState = singleRow(impostorRows, "Impostor game-state returned no row.");
  assertEqual(impostorState.role, "impostor", "Impostor role mismatch.");
  assertEqual(impostorState.word, null, "Impostor must not receive word.");
  assertNoSecretInternals(impostorState, "Impostor");

  psql(`
    insert into public.rounds (
      game_session_id,
      group_id,
      number,
      secret_word,
      normalized_secret_word,
      impostor_player_id
    )
    values (
      ${sqlString(gameSessionId)}::uuid,
      ${sqlString(started.group.group_id)}::uuid,
      2,
      'Mapa Rojo',
      'mapa rojo',
      ${sqlString(playerB.playerId)}::uuid
    );
  `);
  const { data: latestRows, error: latestError } = await getMyGameState(started.host.client);
  assert(!latestError, "Latest round read should succeed.");
  const latestState = singleRow(latestRows, "Latest round returned no row.");
  assertEqual(latestState.round_number, 2, "get_my_game_state should read latest Round.");
  assertEqual(latestState.role, "player", "Latest round host role mismatch.");
  assertEqual(latestState.word, "Mapa Rojo", "Latest round word mismatch.");

  const hostImpostor = await buildRoomWithPlayers("host impostor", ["B", "C"]);
  await addGroupWord(hostImpostor.host.client, "Luna Clara");
  const { error: hostImpostorStartError } = await startSession(hostImpostor.host.client);
  assert(!hostImpostorStartError, "Host impostor fixture should start.");
  const hostImpostorGameSessionId = gameSessionIdForRoom(hostImpostor.roomId);
  setRoundOneImpostor(hostImpostorGameSessionId, hostImpostor.host.playerId);
  const { data: hostImpostorRows, error: hostImpostorError } = await getMyGameState(hostImpostor.host.client);
  assert(!hostImpostorError, "Host impostor read should succeed.");
  const hostImpostorState = singleRow(hostImpostorRows, "Host impostor returned no row.");
  assertEqual(hostImpostorState.role, "impostor", "Host impostor role mismatch.");
  assertEqual(hostImpostorState.word, null, "Host impostor must not receive word.");

  const excluded = await buildRoomWithPlayers("excluded", ["B", "C", "D"]);
  const excludedD = excluded.players[2];
  await addGroupWord(excluded.host.client, "Bosque Verde");
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
  await expectRpcFailure(() => getMyGameState(excludedD.client), "P0023");

  const inconsistentNoSession = await buildRoomWithPlayers("inconsistent no session", ["B", "C"]);
  psql(`
    update public.rooms
    set status = 'playing'
    where id = ${sqlString(inconsistentNoSession.roomId)}::uuid;
  `);
  await expectRpcFailure(() => getMyGameState(inconsistentNoSession.host.client), "P0022");

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
  await expectRpcFailure(() => getMyGameState(inconsistentNoRound.host.client), "P0022");

  for (const tableName of ["game_sessions", "session_players", "rounds"]) {
    await expectDirectSelectDenied(started.host.client, tableName);
  }

  const { data: activeRoomRows, error: activeRoomError } =
    await started.host.client.rpc("get_my_active_room");
  assert(!activeRoomError, "get_my_active_room should still work during playing.");
  const activeRoom = singleRow(activeRoomRows, "get_my_active_room returned no row.");
  assertEqual(activeRoom.room_status, "playing", "get_my_active_room playing status mismatch.");
  assert(!("state" in activeRoom), "get_my_active_room must not return game state.");
  assert(!("role" in activeRoom), "get_my_active_room must not return private role.");
  assert(!("word" in activeRoom), "get_my_active_room must not return private word.");
  assert(!("secret_word" in activeRoom), "get_my_active_room must not return secret_word.");
  assert(!("impostor_player_id" in activeRoom), "get_my_active_room must not return impostor_player_id.");

  assertEqual(roundOne(gameSessionId).secretWord, "Tesoro Azul", "Original Round 1 snapshot should remain unchanged.");

  console.log("validate-6-4 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
