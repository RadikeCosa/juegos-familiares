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

function roomStatus(roomId) {
  return psql(`
    select status from public.rooms where id = ${sqlString(roomId)}::uuid;
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

function gameSessionCountForRoom(roomId) {
  return Number(psql(`
    select count(*)
    from public.game_sessions
    where room_id = ${sqlString(roomId)}::uuid;
  `));
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

function isSessionPlayer(gameSessionId, playerId) {
  return psql(`
    select exists (
      select 1
      from public.session_players
      where game_session_id = ${sqlString(gameSessionId)}::uuid
        and player_id = ${sqlString(playerId)}::uuid
    );
  `) === "t";
}

function lastSeenAt(roomId, playerId) {
  return Number(psql(`
    select extract(epoch from last_seen_at)::bigint
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid
      and player_id = ${sqlString(playerId)}::uuid;
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

function roundOne(gameSessionId) {
  const row = psql(`
    select
      number || '|' ||
      secret_word || '|' ||
      normalized_secret_word || '|' ||
      impostor_player_id::text
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = 1;
  `);

  const [number, secretWord, normalizedSecretWord, impostorPlayerId] = row.split("|");

  return {
    number: Number(number),
    secretWord,
    normalizedSecretWord,
    impostorPlayerId
  };
}

function assertNoGameplayRows(roomId) {
  assertEqual(gameSessionCountForRoom(roomId), 0, "Room should have no GameSession.");
  assertEqual(
    Number(psql(`
      select count(*)
      from public.session_players
      join public.game_sessions
        on game_sessions.id = session_players.game_session_id
      where game_sessions.room_id = ${sqlString(roomId)}::uuid;
    `)),
    0,
    "Room should have no SessionPlayers."
  );
  assertEqual(
    Number(psql(`
      select count(*)
      from public.rounds
      join public.game_sessions
        on game_sessions.id = rounds.game_session_id
      where game_sessions.room_id = ${sqlString(roomId)}::uuid;
    `)),
    0,
    "Room should have no Rounds."
  );
}

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 6.3 ${label}`, "Host");
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

async function main() {
  assert(hasColumn("game_sessions", "state"), "game_sessions.state should exist.");
  assertEqual(
    constraintDefinition("game_sessions", "game_sessions_state_check"),
    "CHECK ((state = 'role_reveal'::text))",
    "game_sessions.state check mismatch."
  );
  assert(hasTable("rounds"), "rounds table should exist.");
  assertEqual(constraintDefinition("rounds", "rounds_pkey"), "PRIMARY KEY (id)", "rounds PK mismatch.");
  assertEqual(
    constraintDefinition("rounds", "rounds_number_check"),
    "CHECK ((number >= 1))",
    "rounds number check mismatch."
  );
  assert(
    constraintDefinition("rounds", "rounds_secret_word_canonical_check")
      .includes("secret_word = canonicalize_group_word_text(secret_word)"),
    "rounds canonical word check mismatch."
  );
  assert(
    constraintDefinition("rounds", "rounds_normalized_secret_word_check")
      .includes("normalized_secret_word = lower(secret_word)"),
    "rounds normalized word check mismatch."
  );
  assertEqual(
    constraintDefinition("rounds", "rounds_game_session_number_key"),
    "UNIQUE (game_session_id, number)",
    "rounds number uniqueness mismatch."
  );
  assertEqual(
    constraintDefinition("rounds", "rounds_game_session_normalized_secret_word_key"),
    "UNIQUE (game_session_id, normalized_secret_word)",
    "rounds normalized word uniqueness mismatch."
  );
  assert(
    constraintDefinition("rounds", "rounds_game_session_group_fkey")
      .includes("FOREIGN KEY (game_session_id, group_id) REFERENCES game_sessions(id, group_id) ON DELETE CASCADE"),
    "rounds GameSession FK mismatch."
  );
  assert(
    constraintDefinition("rounds", "rounds_impostor_session_player_fkey")
      .includes("FOREIGN KEY (game_session_id, impostor_player_id) REFERENCES session_players(game_session_id, player_id)"),
    "rounds impostor FK mismatch."
  );
  assert(!hasColumn("rounds", "group_word_id"), "rounds must not include group_word_id.");
  assert(!hasColumn("rounds", "status"), "rounds must not include status.");

  for (const tableName of ["game_sessions", "session_players", "rounds"]) {
    assert(hasRls(tableName), `${tableName} RLS should be enabled.`);
    assertEqual(countPolicies(tableName), 0, `${tableName} should not have policies.`);
    assert(!isRealtimePublished(tableName), `${tableName} should not be published for Realtime.`);

    for (const roleName of ["anon", "authenticated", "public"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert(!hasPrivilege(roleName, tableName, privilege), `${roleName} should not have ${privilege} on ${tableName}.`);
      }
    }
  }

  const tooFew = await buildRoomWithPlayers("too few", ["B"]);
  await addGroupWord(tooFew.host.client, "Casa Azul");
  await expectRpcFailure(() => startSession(tooFew.host.client), "P0020");
  assertEqual(roomStatus(tooFew.roomId), "lobby", "Too-few failure should keep Room lobby.");
  assertNoGameplayRows(tooFew.roomId);

  const noWords = await buildRoomWithPlayers("no words", ["B", "C"]);
  await expectRpcFailure(() => startSession(noWords.host.client), "P0021");
  assertEqual(roomStatus(noWords.roomId), "lobby", "No-word failure should keep Room lobby.");
  assertNoGameplayRows(noWords.roomId);

  const notHost = await buildRoomWithPlayers("not host", ["B", "C"]);
  await addGroupWord(notHost.host.client, "Rio Claro");
  await expectRpcFailure(() => startSession(notHost.players[0].client), "P0019");
  assertEqual(roomStatus(notHost.roomId), "lobby", "Not-host failure should keep Room lobby.");
  assertNoGameplayRows(notHost.roomId);

  const startedFixture = await buildRoomWithPlayers("happy", ["B", "C", "D"]);
  const playerB = startedFixture.players[0];
  const playerC = startedFixture.players[1];
  const playerD = startedFixture.players[2];
  await addGroupWord(startedFixture.host.client, "  Tesoro   Azul  ");
  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(startedFixture.roomId)}::uuid
      and player_id = ${sqlString(playerD.playerId)}::uuid;
  `);
  const staleHostBefore = lastSeenAt(startedFixture.roomId, startedFixture.host.playerId);
  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(startedFixture.roomId)}::uuid
      and player_id = ${sqlString(startedFixture.host.playerId)}::uuid;
  `);
  const staleHostAfterSet = lastSeenAt(startedFixture.roomId, startedFixture.host.playerId);
  assert(staleHostAfterSet <= staleHostBefore, "Host fixture should become stale before START.");

  const { data: startRows, error: startError } = await startSession(startedFixture.host.client);
  assert(!startError, `start_session should succeed: ${startError?.message ?? ""}`);
  const startResult = singleRow(startRows, "start_session returned no row.");
  assertEqual(startResult.started, true, "start_session should report started.");
  assertEqual(startResult.already_started, false, "start_session should not report already_started on first call.");
  assertEqual(startResult.room_status, "playing", "start_session room_status mismatch.");
  assertEqual(startResult.game_session_state, "role_reveal", "start_session state mismatch.");
  assertEqual(startResult.round_number, 1, "start_session round number mismatch.");
  assertEqual(startResult.participant_count, 3, "start_session participant count mismatch.");
  assert(!("secret_word" in startResult), "start_session must not return secret_word.");
  assert(!("normalized_secret_word" in startResult), "start_session must not return normalized_secret_word.");
  assert(!("impostor_player_id" in startResult), "start_session must not return impostor_player_id.");

  assertEqual(roomStatus(startedFixture.roomId), "playing", "Room should be playing after START.");
  const gameSessionId = gameSessionIdForRoom(startedFixture.roomId);
  assert(gameSessionId, "GameSession should exist after START.");
  assertEqual(
    psql(`select state from public.game_sessions where id = ${sqlString(gameSessionId)}::uuid;`),
    "role_reveal",
    "GameSession state mismatch."
  );
  assertEqual(sessionPlayerCount(gameSessionId), 3, "SessionPlayer count mismatch.");
  assert(isSessionPlayer(gameSessionId, startedFixture.host.playerId), "Host should be SessionPlayer after own liveness refresh.");
  assert(isSessionPlayer(gameSessionId, playerB.playerId), "B should be SessionPlayer.");
  assert(isSessionPlayer(gameSessionId, playerC.playerId), "C should be SessionPlayer.");
  assert(!isSessionPlayer(gameSessionId, playerD.playerId), "Stale D should be excluded from SessionPlayers.");
  assertEqual(roundCount(gameSessionId), 1, "Exactly one Round should exist.");
  const round = roundOne(gameSessionId);
  assertEqual(round.number, 1, "Round number mismatch.");
  assertEqual(round.secretWord, "Tesoro Azul", "Round secret snapshot mismatch.");
  assertEqual(round.normalizedSecretWord, "tesoro azul", "Round normalized snapshot mismatch.");
  assert(isSessionPlayer(gameSessionId, round.impostorPlayerId), "Impostor must be a SessionPlayer.");
  assertEqual(
    Number(psql(`
      select count(*)
      from public.rounds
      where game_session_id = ${sqlString(gameSessionId)}::uuid
        and impostor_player_id is not null;
    `)),
    1,
    "Round should have exactly one impostor."
  );
  assert(lastSeenAt(startedFixture.roomId, startedFixture.host.playerId) > staleHostAfterSet, "START should refresh stale host liveness.");

  psql(`
    delete from public.group_words
    where group_id = ${sqlString(startedFixture.group.group_id)}::uuid;
  `);
  assertEqual(roundOne(gameSessionId).secretWord, "Tesoro Azul", "Round snapshot should survive GroupWord deletion.");

  psqlShouldFail(`
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
      ${sqlString(startedFixture.group.group_id)}::uuid,
      2,
      'Tesoro Azul',
      'tesoro azul',
      ${sqlString(startedFixture.host.playerId)}::uuid
    );
  `);
  psqlShouldFail(`
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
      ${sqlString(startedFixture.group.group_id)}::uuid,
      2,
      'Otra Palabra',
      'otra palabra',
      ${sqlString(playerD.playerId)}::uuid
    );
  `);

  const another = await buildRoomWithPlayers("same word other session", ["B", "C"]);
  await addGroupWord(another.host.client, "Tesoro Azul");
  const { error: anotherStartError } = await startSession(another.host.client);
  assert(!anotherStartError, "Same normalized word should be allowed in another GameSession.");

  const { data: retryRows, error: retryError } = await startSession(startedFixture.host.client);
  assert(!retryError, "Host retry should be idempotent.");
  const retry = singleRow(retryRows, "Host retry returned no row.");
  assertEqual(retry.started, false, "Host retry should not start again.");
  assertEqual(retry.already_started, true, "Host retry should report already_started.");
  assertEqual(gameSessionCountForRoom(startedFixture.roomId), 1, "Host retry must not create a second GameSession.");
  assertEqual(roundCount(gameSessionId), 1, "Host retry must not create another Round.");

  const { data: sessionPlayerRetryRows, error: sessionPlayerRetryError } = await startSession(playerB.client);
  assert(!sessionPlayerRetryError, "SessionPlayer retry should be idempotent.");
  assertEqual(singleRow(sessionPlayerRetryRows, "SessionPlayer retry returned no row.").already_started, true, "SessionPlayer retry mismatch.");
  await expectRpcFailure(() => startSession(playerD.client), "P0018");

  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(startedFixture.roomId)}::uuid
      and player_id in (
        ${sqlString(startedFixture.host.playerId)}::uuid,
        ${sqlString(playerB.playerId)}::uuid,
        ${sqlString(playerC.playerId)}::uuid
      );

    update public.room_participants
    set last_seen_at = now()
    where room_id = ${sqlString(startedFixture.roomId)}::uuid
      and player_id = ${sqlString(playerD.playerId)}::uuid;
  `);
  const { data: excludedSuccessionRows, error: excludedSuccessionError } =
    await playerD.client.rpc("reassign_room_host_if_stale");
  assert(!excludedSuccessionError, "Excluded D succession request should not error.");
  const excludedSuccession = singleRow(excludedSuccessionRows, "Excluded D succession returned no row.");
  assertEqual(excludedSuccession.host_changed, false, "Excluded non-SessionPlayer must not become host.");
  assertEqual(roomHostPlayerId(startedFixture.roomId), startedFixture.host.playerId, "Host should remain unchanged when only D is active.");

  psql(`
    update public.room_participants
    set last_seen_at = now()
    where room_id = ${sqlString(startedFixture.roomId)}::uuid
      and player_id = ${sqlString(playerB.playerId)}::uuid;
  `);
  const { data: includedSuccessionRows, error: includedSuccessionError } =
    await playerB.client.rpc("reassign_room_host_if_stale");
  assert(!includedSuccessionError, "Included B succession request should not error.");
  const includedSuccession = singleRow(includedSuccessionRows, "Included B succession returned no row.");
  assertEqual(includedSuccession.host_changed, true, "Included SessionPlayer should become host.");
  assertEqual(roomHostPlayerId(startedFixture.roomId), playerB.playerId, "Host should become B.");

  const inconsistent = await buildRoomWithPlayers("inconsistent playing", ["B", "C"]);
  psql(`
    update public.rooms
    set status = 'playing'
    where id = ${sqlString(inconsistent.roomId)}::uuid;

    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(inconsistent.roomId)}::uuid
      and player_id = ${sqlString(inconsistent.host.playerId)}::uuid;
  `);
  const { data: inconsistentRows, error: inconsistentError } =
    await inconsistent.players[0].client.rpc("reassign_room_host_if_stale");
  assert(!inconsistentError, "Inconsistent playing succession should not error.");
  assertEqual(singleRow(inconsistentRows, "Inconsistent succession returned no row.").host_changed, false, "Inconsistent playing Room should not reassign.");
  assertEqual(roomHostPlayerId(inconsistent.roomId), inconsistent.host.playerId, "Inconsistent playing Room host should remain unchanged.");

  const lobbySuccession = await buildRoomWithPlayers("lobby succession", ["B", "C"]);
  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(lobbySuccession.roomId)}::uuid
      and player_id = ${sqlString(lobbySuccession.host.playerId)}::uuid;
  `);
  const { data: lobbySuccessionRows, error: lobbySuccessionError } =
    await lobbySuccession.players[0].client.rpc("reassign_room_host_if_stale");
  assert(!lobbySuccessionError, "Lobby succession should still work.");
  assertEqual(singleRow(lobbySuccessionRows, "Lobby succession returned no row.").host_changed, true, "Lobby succession should change host.");

  const doubleStart = await buildRoomWithPlayers("double start", ["B", "C"]);
  await addGroupWord(doubleStart.host.client, "Bosque Verde");
  const [firstStart, secondStart] = await Promise.all([
    startSession(doubleStart.host.client),
    startSession(doubleStart.host.client)
  ]);
  assert(!firstStart.error, "First double start call should not error.");
  assert(!secondStart.error, "Second double start call should not error.");
  assertEqual(gameSessionCountForRoom(doubleStart.roomId), 1, "Double start should leave one GameSession.");
  assertEqual(roundCount(gameSessionIdForRoom(doubleStart.roomId)), 1, "Double start should leave one Round.");
  assert(
    [singleRow(firstStart.data, "First double start row missing.").already_started, singleRow(secondStart.data, "Second double start row missing.").already_started]
      .includes(true),
    "One double start call should take the idempotent path."
  );

  const balanced = await buildRoomWithPlayers("balanced impostor", ["B", "C"]);
  await addGroupWord(balanced.host.client, "Luna Clara");
  const { error: balancedStartError } = await startSession(balanced.host.client);
  assert(!balancedStartError, "Balanced fixture START should succeed.");
  const balancedGameSessionId = gameSessionIdForRoom(balanced.roomId);
  const balancedHostId = balanced.host.playerId;
  const balancedBId = balanced.players[0].playerId;
  const balancedCId = balanced.players[1].playerId;
  psql(`
    insert into public.rounds (
      game_session_id,
      group_id,
      number,
      secret_word,
      normalized_secret_word,
      impostor_player_id
    )
    values
      (
        ${sqlString(balancedGameSessionId)}::uuid,
        ${sqlString(balanced.group.group_id)}::uuid,
        2,
        'Sol Rojo',
        'sol rojo',
        ${sqlString(balancedHostId)}::uuid
      ),
      (
        ${sqlString(balancedGameSessionId)}::uuid,
        ${sqlString(balanced.group.group_id)}::uuid,
        3,
        'Mar Azul',
        'mar azul',
        ${sqlString(balancedHostId)}::uuid
      ),
      (
        ${sqlString(balancedGameSessionId)}::uuid,
        ${sqlString(balanced.group.group_id)}::uuid,
        4,
        'Rio Verde',
        'rio verde',
        ${sqlString(balancedBId)}::uuid
      ),
      (
        ${sqlString(balancedGameSessionId)}::uuid,
        ${sqlString(balanced.group.group_id)}::uuid,
        5,
        'Nube Blanca',
        'nube blanca',
        ${sqlString(balancedCId)}::uuid
      );
  `);
  const balancedCandidate = psql(`
    select session_players.player_id
    from public.session_players
    left join public.rounds
      on rounds.game_session_id = session_players.game_session_id
     and rounds.impostor_player_id = session_players.player_id
    where session_players.game_session_id = ${sqlString(balancedGameSessionId)}::uuid
      and session_players.group_id = ${sqlString(balanced.group.group_id)}::uuid
    group by session_players.player_id
    order by count(rounds.id) asc, random()
    limit 1;
  `);
  assert(
    [balancedBId, balancedCId].includes(balancedCandidate),
    "Balanced impostor query should choose only among minimum-count SessionPlayers."
  );
  assert(
    balancedCandidate !== balancedHostId,
    "Balanced impostor query must exclude higher-count SessionPlayer."
  );

  console.log("validate-6-3 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
