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

function slotCountForRoom(roomId) {
  return Number(psql(`
    select count(*)
    from public.player_active_room_slots
    where room_id = ${sqlString(roomId)}::uuid;
  `));
}

function roomParticipantCount(roomId) {
  return Number(psql(`
    select count(*)
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid;
  `));
}

function activeSlotRoomForPlayer(playerId) {
  return psql(`
    select coalesce(room_id::text, '')
    from public.player_active_room_slots
    where player_id = ${sqlString(playerId)}::uuid;
  `);
}

function lastSeenAt(roomId, playerId) {
  return psql(`
    select extract(epoch from last_seen_at)::bigint
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid
      and player_id = ${sqlString(playerId)}::uuid;
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

async function expectRpcDenied(operation, expectedCode) {
  const { error } = await operation();

  assert(error, `Expected RPC to be denied with ${expectedCode}.`);
  assertEqual(error.code, expectedCode, `Unexpected RPC error code.`);
}

async function main() {
  const adminA = await signInAnonymously("admin A");
  const playerB = await signInAnonymously("player B");
  const playerC = await signInAnonymously("player C");
  const adminD = await signInAnonymously("admin D");

  const groupA = await createGroup(adminA.client, "Familia 6.2 A", "Admin A");
  await createGroup(adminD.client, "Familia 6.2 D", "Admin D");
  await joinGroup(playerB.client, groupA.invitation_code, "Player B");
  await joinGroup(playerC.client, groupA.invitation_code, "Player C");

  const roomRowsA = await createRoom(adminA.client);
  const roomAId = roomRowsA[0].room_id;
  const roomACode = roomRowsA[0].room_join_code;
  const adminAPlayerId = groupA.player_id;
  const playerBId = playerIdForAuthUser(playerB.userId);
  const playerCId = playerIdForAuthUser(playerC.userId);

  await joinRoomByCode(playerB.client, roomACode);
  assertEqual(slotCountForRoom(roomAId), 2, "Lobby Room should have two slots.");

  const roomsStatusCheck = constraintDefinition("rooms", "rooms_status_check");
  assert(roomsStatusCheck.includes("'lobby'"), "rooms_status_check should include lobby.");
  assert(roomsStatusCheck.includes("'playing'"), "rooms_status_check should include playing.");
  assert(roomsStatusCheck.includes("'closed'"), "rooms_status_check should include closed.");
  assert(!roomsStatusCheck.includes("'finished'"), "rooms_status_check should not include finished.");

  psql(`
    update public.rooms
    set status = 'playing'
    where id = ${sqlString(roomAId)}::uuid;
  `);
  assertEqual(roomStatus(roomAId), "playing", "Room should accept playing status.");
  psqlShouldFail(`
    update public.rooms
    set status = 'not-a-status'
    where id = ${sqlString(roomAId)}::uuid;
  `);
  assertEqual(slotCountForRoom(roomAId), 2, "lobby -> playing should preserve slots.");

  const createAgainRows = await createRoom(adminA.client);
  assertEqual(createAgainRows[0].room_id, roomAId, "create_room should return existing playing Room.");
  assertEqual(createAgainRows[0].room_status, "playing", "create_room should return playing status.");
  assertEqual(
    Number(psql(`
      select count(*)
      from public.rooms
      where host_player_id = ${sqlString(adminAPlayerId)}::uuid
        and status in ('lobby', 'playing');
    `)),
    1,
    "create_room must not create a second active Room for a Player in playing."
  );

  await expectRpcDenied(
    () => playerC.client.rpc("join_room_by_code", { room_code: roomACode }),
    "P0011"
  );
  assertEqual(roomParticipantCount(roomAId), 2, "join to playing must not add membership.");

  const activeRowsA = await adminA.client.rpc("get_my_active_room");
  assert(!activeRowsA.error, "get_my_active_room should reconstruct playing Room.");
  assertEqual(activeRowsA.data[0].room_id, roomAId, "Reconstructed Room id mismatch.");
  assertEqual(activeRowsA.data[0].room_status, "playing", "Reconstructed Room status mismatch.");
  assertEqual(activeRowsA.data.length, 2, "Reconstructed playing Room should include memberships.");
  assert(activeRowsA.data.some((row) => row.participant_is_host), "Reconstruction should include host.");

  const { data: authorizedMembership, error: authorizedMembershipError } =
    await adminA.client
      .from("room_participants")
      .select("room_id, player_id")
      .eq("room_id", roomAId);
  assert(!authorizedMembershipError, "Room participant should read playing membership.");
  assertEqual(authorizedMembership.length, 2, "Authorized participant should see playing roster.");

  const { data: sameGroupNonParticipantRows, error: sameGroupNonParticipantError } =
    await playerC.client
      .from("room_participants")
      .select("room_id, player_id")
      .eq("room_id", roomAId);
  assert(!sameGroupNonParticipantError, "Same-group nonparticipant select should not error.");
  assertEqual(
    sameGroupNonParticipantRows.length,
    0,
    "Same-group nonparticipant must not see playing Room membership."
  );

  const { data: otherGroupRows, error: otherGroupError } = await adminD.client
    .from("room_participants")
    .select("room_id, player_id")
    .eq("room_id", roomAId);
  assert(!otherGroupError, "Other-group select should not error.");
  assertEqual(otherGroupRows.length, 0, "Other Group must not see playing Room membership.");

  const presenceTopic = `impostor-room-presence:${roomAId}`;
  const { data: presenceAllowed, error: presenceAllowedError } = await adminA.client.rpc(
    "is_current_player_room_presence_participant",
    { target_topic: presenceTopic }
  );
  assert(!presenceAllowedError, "Presence helper should run for participant.");
  assertEqual(presenceAllowed, true, "Presence helper should authorize playing participant.");
  const { data: presenceDenied, error: presenceDeniedError } = await playerC.client.rpc(
    "is_current_player_room_presence_participant",
    { target_topic: presenceTopic }
  );
  assert(!presenceDeniedError, "Presence helper should run for same-group nonparticipant.");
  assertEqual(presenceDenied, false, "Presence helper should deny nonparticipant.");

  psql(`
    update public.room_participants
    set last_seen_at = now() - interval '20 seconds'
    where room_id = ${sqlString(roomAId)}::uuid
      and player_id = ${sqlString(playerBId)}::uuid;
  `);
  const staleSeenAt = Number(lastSeenAt(roomAId, playerBId));
  const { error: refreshError } = await playerB.client.rpc("refresh_my_room_liveness");
  assert(!refreshError, "refresh_my_room_liveness should work in playing.");
  const refreshedSeenAt = Number(lastSeenAt(roomAId, playerBId));
  assert(refreshedSeenAt > staleSeenAt, "Liveness refresh should update last_seen_at in playing.");

  const { error: leaveError } = await playerB.client.rpc("leave_room");
  assert(!leaveError, "leave_room should no-op in playing.");
  assertEqual(roomStatus(roomAId), "playing", "leave_room in playing must not close Room.");
  assertEqual(roomParticipantCount(roomAId), 2, "leave_room in playing must not delete membership.");
  assertEqual(slotCountForRoom(roomAId), 2, "leave_room in playing must not release slots.");

  await expectRpcDenied(
    () => adminA.client.rpc("close_room"),
    "P0015"
  );
  assertEqual(roomStatus(roomAId), "playing", "close_room in playing must not close Room.");
  assertEqual(slotCountForRoom(roomAId), 2, "close_room in playing must not release slots.");

  psql(`
    with created_game_session as (
      insert into public.game_sessions (room_id, group_id, state)
      values (
        ${sqlString(roomAId)}::uuid,
        ${sqlString(groupA.group_id)}::uuid,
        'role_reveal'
      )
      returning id, group_id
    )
    insert into public.session_players (game_session_id, group_id, player_id)
    select
      created_game_session.id,
      created_game_session.group_id,
      roster.player_id
    from created_game_session
    cross join (
      values
        (${sqlString(adminAPlayerId)}::uuid),
        (${sqlString(playerBId)}::uuid)
    ) as roster(player_id);

    update public.room_participants
    set last_seen_at = now() - interval '120 seconds'
    where room_id = ${sqlString(roomAId)}::uuid
      and player_id = ${sqlString(adminAPlayerId)}::uuid;

    update public.room_participants
    set last_seen_at = now()
    where room_id = ${sqlString(roomAId)}::uuid
      and player_id = ${sqlString(playerBId)}::uuid;
  `);
  const { data: successionRows, error: successionError } =
    await playerB.client.rpc("reassign_room_host_if_stale");
  assert(!successionError, "Host succession should run in playing.");
  const succession = singleRow(successionRows, "Host succession returned no row.");
  assertEqual(succession.host_changed, true, "Host succession should change stale host in playing.");
  assertEqual(
    succession.current_host_player_id,
    playerBId,
    "Host succession should select active participant in playing."
  );
  assertEqual(roomHostPlayerId(roomAId), playerBId, "rooms.host_player_id should persist new host.");

  const roomRowsC = await createRoom(playerC.client);
  const roomCId = roomRowsC[0].room_id;
  const roomCCode = roomRowsC[0].room_join_code;
  await expectRpcDenied(
    () => playerB.client.rpc("join_room_by_code", { room_code: roomCCode }),
    "P0012"
  );
  assertEqual(
    activeSlotRoomForPlayer(playerBId),
    roomAId,
    "Player in playing Room should keep the original active slot."
  );

  psql(`
    update public.rooms
    set status = 'closed'
    where id = ${sqlString(roomAId)}::uuid;
  `);
  assertEqual(slotCountForRoom(roomAId), 0, "playing -> closed should release slots.");

  assertEqual(slotCountForRoom(roomCId), 1, "Lobby Room should have one slot before close.");
  psql(`
    update public.rooms
    set status = 'closed'
    where id = ${sqlString(roomCId)}::uuid;
  `);
  assertEqual(slotCountForRoom(roomCId), 0, "lobby -> closed should keep releasing slots.");

  for (const tableName of ["game_sessions", "session_players"]) {
    assertEqual(countPolicies(tableName), 0, `${tableName} should not have policies in 6.2.`);
    assert(!isRealtimePublished(tableName), `${tableName} should not be published for Realtime.`);

    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(!hasPrivilege("anon", tableName, privilege), `anon should not have ${privilege} on ${tableName}.`);
      assert(
        !hasPrivilege("authenticated", tableName, privilege),
        `authenticated should not have ${privilege} on ${tableName}.`
      );
    }
  }

  console.log("validate-6-2 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
