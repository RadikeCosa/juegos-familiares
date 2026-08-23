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

function roomRowForHost(hostPlayerId) {
  return psql(`
    select id, group_id, join_code, status
    from public.rooms
    where host_player_id = ${sqlString(hostPlayerId)}::uuid;
  `).split("|");
}

async function selectRoomParticipants(client, roomId) {
  const { data, error } = await client
    .from("room_participants")
    .select("room_id, player_id, group_id, joined_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function selectRooms(client, roomId) {
  const { data, error } = await client
    .from("rooms")
    .select("id, group_id, join_code, status")
    .eq("id", roomId);

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function publicationContains(tableName) {
  return psql(`
    select exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = ${sqlString(tableName)}
    );
  `);
}

async function validate() {
  const results = [];

  const authA = await signInAnonymously("Auth A host");
  const createdA = await createGroup(authA.client, "Familia 4.4 A", "Ramiro");
  const roomRowsA = await createRoom(authA.client);
  const roomCodeA = roomRowsA[0].room_join_code;
  const roomIdA = roomRowsA[0].room_id ?? roomRowForHost(createdA.player_id)[0];

  assert(roomIdA, "create_room must return or persist a Room id.");
  assertEqual(roomRowsA[0].room_id, roomIdA, "create_room must expose room_id for scoped Realtime filters.");
  results.push(["room_id tecnico", "PASS", "Las RPCs devuelven room_id solo para filtrar el channel de la Room activa."]);

  const authSameGroupNoRoom = await signInAnonymously("Auth same Group without Room");
  await joinGroup(authSameGroupNoRoom.client, createdA.invitation_code, "Julia");

  const authOtherGroup = await signInAnonymously("Auth other Group");
  await createGroup(authOtherGroup.client, "Familia 4.4 Other", "Ajena");

  const hostParticipantsBefore = await selectRoomParticipants(authA.client, roomIdA);
  assertEqual(hostParticipantsBefore.length, 1, "Host must read own RoomParticipant rows for Realtime authorization.");
  const hostRoomsBefore = await selectRooms(authA.client, roomIdA);
  assertEqual(hostRoomsBefore.length, 1, "Host must read own Room row for Realtime authorization.");
  results.push(["participante autorizado", "PASS", "Un participante lee solo la Room y membresías de su lobby."]);

  const sameGroupNoRoomRows = await selectRoomParticipants(authSameGroupNoRoom.client, roomIdA);
  assertEqual(sameGroupNoRoomRows.length, 0, "Same Group non-participant must not read RoomParticipant rows.");
  const sameGroupNoRoomRoomRows = await selectRooms(authSameGroupNoRoom.client, roomIdA);
  assertEqual(sameGroupNoRoomRoomRows.length, 0, "Same Group non-participant must not read the Room row.");
  results.push(["mismo Group sin membresia", "PASS", "Un Player del mismo Group pero fuera de la Room no observa el lobby ajeno."]);

  const otherGroupRows = await selectRoomParticipants(authOtherGroup.client, roomIdA);
  assertEqual(otherGroupRows.length, 0, "Other Group must not read RoomParticipant rows.");
  const otherGroupRoomRows = await selectRooms(authOtherGroup.client, roomIdA);
  assertEqual(otherGroupRoomRows.length, 0, "Other Group must not read the Room row.");
  results.push(["otro Group aislado", "PASS", "Otro Group no recibe filas utiles aunque conozca el room_id."]);

  const authB = await signInAnonymously("Auth B participant");
  await joinGroup(authB.client, createdA.invitation_code, "Pedro");
  const roomRowsB = await joinRoomByCode(authB.client, roomCodeA);
  assertEqual(roomRowsB[0].room_id, roomIdA, "join_room_by_code must return the joined room_id.");

  const hostParticipantsAfter = await selectRoomParticipants(authA.client, roomIdA);
  assertEqual(hostParticipantsAfter.length, 2, "Host must see new RoomParticipant row after B joins.");
  const participantRows = await selectRoomParticipants(authB.client, roomIdA);
  assertEqual(participantRows.length, 2, "Joined participant must see the same lobby rows.");
  results.push(["insert observable", "PASS", "El INSERT de B queda autorizado para A/B y dispara refetch via Realtime."]);

  assertEqual(publicationContains("room_participants"), "t", "room_participants must be in supabase_realtime.");
  assertEqual(publicationContains("rooms"), "t", "rooms must be in supabase_realtime.");
  results.push(["publication", "PASS", "room_participants y rooms estan publicados para Postgres Changes."]);

  console.table(results.map(([caseName, result, evidence]) => ({
    "Caso": caseName,
    "Resultado": result,
    "Evidencia": evidence
  })));
}

validate().catch((error) => {
  console.error(error);
  process.exit(1);
});
