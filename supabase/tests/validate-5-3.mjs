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

async function expectRpcFailure(operation, expectedCode) {
  const { error } = await operation();

  if (!error) {
    throw new Error(`Expected RPC to fail with ${expectedCode}.`);
  }

  assertEqual(error.code, expectedCode, `Expected Postgres error ${expectedCode}.`);
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

  assert(Array.isArray(data) && data.length > 0, "Create room RPC returned no rows.");

  return data;
}

async function joinRoomByCode(client, roomCode) {
  const { data, error } = await client.rpc("join_room_by_code", {
    room_code: roomCode
  });

  if (error) {
    throw error;
  }

  assert(Array.isArray(data) && data.length > 0, "Join room RPC returned no rows.");

  return data;
}

async function closeRoom(client) {
  const { error } = await client.rpc("close_room");

  if (error) {
    throw error;
  }
}

async function refreshLiveness(client) {
  const { error } = await client.rpc("refresh_my_room_liveness");

  if (error) {
    throw error;
  }
}

async function reassignHostIfStale(client) {
  const { data, error } = await client.rpc("reassign_room_host_if_stale");

  if (error) {
    throw error;
  }

  return singleRow(data, "Host succession RPC returned no row.");
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

function setLastSeenAt(roomId, playerId, expression) {
  psql(`
    update public.room_participants
    set last_seen_at = ${expression}
    where room_id = ${sqlString(roomId)}::uuid
      and player_id = ${sqlString(playerId)}::uuid;
  `);
}

function setJoinedAt(roomId, playerId, expression) {
  psql(`
    update public.room_participants
    set joined_at = ${expression}
    where room_id = ${sqlString(roomId)}::uuid
      and player_id = ${sqlString(playerId)}::uuid;
  `);
}

function isActive(roomId, playerId) {
  return psql(`
    select public.is_room_participant_liveness_active(last_seen_at)::text
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid
      and player_id = ${sqlString(playerId)}::uuid;
  `) === "true";
}

function countHosts(roomId) {
  return Number(psql(`
    select count(*)
    from public.room_participants
    join public.rooms
      on rooms.id = room_participants.room_id
     and rooms.group_id = room_participants.group_id
    where room_participants.room_id = ${sqlString(roomId)}::uuid
      and room_participants.player_id = rooms.host_player_id;
  `));
}

function firstEligibleSuccessor(roomId, hostPlayerId) {
  return psql(`
    select player_id
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid
      and player_id <> ${sqlString(hostPlayerId)}::uuid
      and public.is_room_participant_liveness_active(last_seen_at)
    order by joined_at asc, player_id asc
    limit 1;
  `);
}

async function joinSameGroup(invitationCode, nickname) {
  const auth = await signInAnonymously(nickname);
  await joinGroup(auth.client, invitationCode, nickname);

  return {
    ...auth,
    playerId: playerIdForAuthUser(auth.userId)
  };
}

async function makeRoom(label, participantNames = ["B", "C"]) {
  const authA = await signInAnonymously(`${label} host`);
  const createdA = await createGroup(authA.client, `Familia 5.3 ${label}`, "A");
  const playerAId = createdA.player_id;
  const roomRowsA = await createRoom(authA.client);
  const roomId = roomRowsA[0].room_id;
  const roomCode = roomRowsA[0].room_join_code;
  const participants = [];

  for (const name of participantNames) {
    const auth = await joinSameGroup(createdA.invitation_code, `${label} ${name}`);
    await joinRoomByCode(auth.client, roomCode);
    participants.push(auth);
  }

  return {
    authA: { ...authA, playerId: playerAId },
    createdA,
    roomId,
    roomCode,
    participants
  };
}

async function validate() {
  const results = [];

  {
    const room = await makeRoom("active", ["B"]);
    const beforeHost = roomHostPlayerId(room.roomId);
    const result = await reassignHostIfStale(room.participants[0].client);

    assertEqual(result.host_changed, false, "Active host must not be reassigned.");
    assertEqual(result.current_host_player_id, beforeHost, "Active host result must return current host.");
    assertEqual(roomHostPlayerId(room.roomId), beforeHost, "Active host must remain host.");
    results.push(["host active", "PASS", "Host active produce no-op."]);
  }

  {
    const room = await makeRoom("single-candidate", ["B"]);
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    const result = await reassignHostIfStale(room.participants[0].client);

    assertEqual(result.host_changed, true, "Stale host with active candidate must change.");
    assertEqual(result.current_host_player_id, room.participants[0].playerId, "B must become host.");
    assertEqual(roomHostPlayerId(room.roomId), room.participants[0].playerId, "Room host must be B.");

    await refreshLiveness(room.authA.client);
    const afterReturn = await reassignHostIfStale(room.authA.client);
    assertEqual(afterReturn.host_changed, false, "Returning original host must not recover role.");
    assertEqual(roomHostPlayerId(room.roomId), room.participants[0].playerId, "Original host stays participant.");
    results.push(["stale host", "PASS", "Stale host reassigns once; original host does not auto-recover."]);
  }

  {
    const room = await makeRoom("order", ["B", "C"]);
    const [authB, authC] = room.participants;
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    setJoinedAt(room.roomId, authB.playerId, "now() - interval '1 minute'");
    setJoinedAt(room.roomId, authC.playerId, "now() - interval '2 minutes'");

    const result = await reassignHostIfStale(authB.client);
    assertEqual(result.current_host_player_id, authC.playerId, "Oldest joined_at must win.");
    results.push(["joined_at order", "PASS", "Among active candidates, older joined_at wins."]);
  }

  {
    const room = await makeRoom("tie", ["B", "C"]);
    const [authB, authC] = room.participants;
    const expected = [authB.playerId, authC.playerId].sort()[0];
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    setJoinedAt(room.roomId, authB.playerId, "'2026-08-23 12:00:00+00'::timestamptz");
    setJoinedAt(room.roomId, authC.playerId, "'2026-08-23 12:00:00+00'::timestamptz");

    const result = await reassignHostIfStale(authC.client);
    assertEqual(result.current_host_player_id, expected, "player_id ASC must break joined_at ties.");
    results.push(["tie break", "PASS", "player_id ASC provides deterministic tie-break."]);
  }

  {
    const room = await makeRoom("stale-candidate", ["B", "C"]);
    const [authB, authC] = room.participants;
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    setLastSeenAt(room.roomId, authB.playerId, "now() - interval '5 minutes'");
    setJoinedAt(room.roomId, authB.playerId, "now() - interval '2 minutes'");
    setJoinedAt(room.roomId, authC.playerId, "now() - interval '1 minute'");

    const result = await reassignHostIfStale(authC.client);
    assertEqual(result.current_host_player_id, authC.playerId, "Stale candidate must be ignored.");
    results.push(["candidate stale", "PASS", "Stale non-host is not eligible."]);
  }

  {
    const room = await makeRoom("no-candidate", ["B"]);
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    setLastSeenAt(room.roomId, room.participants[0].playerId, "now() - interval '5 minutes'");
    const beforeHost = roomHostPlayerId(room.roomId);
    const result = await reassignHostIfStale(room.participants[0].client);

    assertEqual(result.host_changed, false, "No active candidate must be no-op.");
    assertEqual(result.current_host_player_id, beforeHost, "Host result must remain original.");
    assertEqual(roomHostPlayerId(room.roomId), beforeHost, "Room host must remain unchanged.");
    assertEqual(roomStatus(room.roomId), "lobby", "Room must not close when no candidate exists.");
    results.push(["no candidate", "PASS", "Stale host plus no active candidate does not mutate Room."]);
  }

  {
    const room = await makeRoom("presence-concept", ["B"]);
    const beforeHost = roomHostPlayerId(room.roomId);
    const result = await reassignHostIfStale(room.participants[0].client);

    assertEqual(result.host_changed, false, "Presence absence alone is not modeled as authority.");
    assertEqual(roomHostPlayerId(room.roomId), beforeHost, "Active liveness prevents succession.");
    results.push(["presence not authority", "PASS", "With active liveness, disconnected Presence would not reassign."]);
  }

  {
    const room = await makeRoom("idempotent", ["B"]);
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    const first = await reassignHostIfStale(room.participants[0].client);
    const second = await reassignHostIfStale(room.participants[0].client);

    assertEqual(first.host_changed, true, "First stale call must change host.");
    assertEqual(second.host_changed, false, "Second call after reassignment must be no-op.");
    assertEqual(first.current_host_player_id, second.current_host_player_id, "Host must remain stable.");
    results.push(["idempotent", "PASS", "Repeated calls converge to the same host."]);
  }

  {
    const room = await makeRoom("concurrent", ["B", "C"]);
    const [authB, authC] = room.participants;
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    const settled = await Promise.allSettled([
      reassignHostIfStale(authB.client),
      reassignHostIfStale(authC.client)
    ]);

    const fulfilled = settled.map((entry) => {
      if (entry.status === "rejected") {
        throw entry.reason;
      }

      return entry.value;
    });

    assertEqual(fulfilled.filter((row) => row.host_changed).length, 1, "Only one concurrent call may change host.");
    assertEqual(new Set(fulfilled.map((row) => row.current_host_player_id)).size, 1, "Concurrent calls must agree on final host.");
    assertEqual(countHosts(room.roomId), 1, "Room must have exactly one persisted host participant.");
    results.push(["concurrent callers", "PASS", "Two simultaneous callers produce one effective transition."]);
  }

  {
    const room = await makeRoom("multi-concurrent", ["B", "C", "D"]);
    const [authB, authC, authD] = room.participants;
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    setJoinedAt(room.roomId, authB.playerId, "'2026-08-23 12:00:00+00'::timestamptz");
    setJoinedAt(room.roomId, authC.playerId, "'2026-08-23 12:00:00+00'::timestamptz");
    setJoinedAt(room.roomId, authD.playerId, "'2026-08-23 12:00:00+00'::timestamptz");
    const orderedWinner = firstEligibleSuccessor(room.roomId, room.authA.playerId);

    const settled = await Promise.allSettled([
      reassignHostIfStale(authB.client),
      reassignHostIfStale(authC.client),
      reassignHostIfStale(authD.client)
    ]);

    const fulfilled = settled.map((entry) => {
      if (entry.status === "rejected") {
        throw entry.reason;
      }

      return entry.value;
    });

    assertEqual(fulfilled.filter((row) => row.host_changed).length, 1, "Only one multi-caller request may change host.");
    assertEqual(new Set(fulfilled.map((row) => row.current_host_player_id)).size, 1, "All multi-caller requests must agree.");
    assertEqual(roomHostPlayerId(room.roomId), orderedWinner, "Caller identity must not influence deterministic successor.");
    results.push(["multi-candidate concurrency", "PASS", "B/C/D simultaneous calls converge to joined_at/player_id winner."]);
  }

  {
    const room = await makeRoom("revival", ["B"]);
    setLastSeenAt(room.roomId, room.authA.playerId, "now() - interval '5 minutes'");
    const settled = await Promise.allSettled([
      refreshLiveness(room.authA.client),
      reassignHostIfStale(room.participants[0].client)
    ]);

    for (const entry of settled) {
      if (entry.status === "rejected") {
        throw entry.reason;
      }
    }

    const finalHost = roomHostPlayerId(room.roomId);
    assert(
      finalHost === room.authA.playerId || finalHost === room.participants[0].playerId,
      "Revival race must end with current or successor host."
    );
    assertEqual(countHosts(room.roomId), 1, "Revival race must leave exactly one host.");
    assert(isActive(room.roomId, room.authA.playerId), "Original host refresh must make A active eventually.");
    results.push(["revival race", "PASS", "Refresh vs succession converges without split host or role recovery."]);
  }

  {
    const noAuthClient = createAnonymousClient();
    await expectRpcFailure(
      () => noAuthClient.rpc("reassign_room_host_if_stale"),
      "42501"
    );
    results.push(["no auth", "PASS", "Unauthenticated caller cannot execute the RPC."]);

    const authWithoutPlayer = await signInAnonymously("No player 5.3");
    await expectRpcFailure(
      () => authWithoutPlayer.client.rpc("reassign_room_host_if_stale"),
      "P0002"
    );
    results.push(["auth without player", "PASS", "Auth without Player cannot mutate."]);

    const room = await makeRoom("security", ["B"]);
    const beforeHost = roomHostPlayerId(room.roomId);

    const sameGroupOutside = await joinSameGroup(room.createdA.invitation_code, "Security outside");
    const outsideResult = await reassignHostIfStale(sameGroupOutside.client);
    assertEqual(outsideResult.host_changed, false, "Same-Group nonparticipant must not mutate.");
    assertEqual(outsideResult.current_host_player_id, null, "Same-Group nonparticipant has no active Room.");
    assertEqual(roomHostPlayerId(room.roomId), beforeHost, "Same-Group nonparticipant must not affect target Room.");

    const otherGroupAuth = await signInAnonymously("Other group 5.3");
    await createGroup(otherGroupAuth.client, "Otra familia 5.3", "Other");
    const otherResult = await reassignHostIfStale(otherGroupAuth.client);
    assertEqual(otherResult.host_changed, false, "Other Group without Room must not mutate.");
    assertEqual(roomHostPlayerId(room.roomId), beforeHost, "Other Group must not affect target Room.");

    await closeRoom(room.authA.client);
    const closedResult = await reassignHostIfStale(room.authA.client);
    assertEqual(closedResult.host_changed, false, "Closed Room must not mutate.");
    assertEqual(roomStatus(room.roomId), "closed", "Closed Room must remain closed.");
    results.push(["authorization", "PASS", "Negative callers do not mutate, and non-host participant is allowed to request."]);
  }

  for (const [name, status, detail] of results) {
    console.log(`${status} ${name}: ${detail}`);
  }
}

validate().catch((error) => {
  console.error(error);
  process.exit(1);
});
