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

async function getMyActiveRoom(client) {
  const { data, error } = await client.rpc("get_my_active_room");

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function expectRpcFailure(operation, expectedCode) {
  try {
    const row = await operation();

    throw new Error(`Expected RPC to fail, got ${JSON.stringify(row)}.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected RPC")) {
      throw error;
    }

    if (expectedCode) {
      assertEqual(error.code, expectedCode, `Expected Postgres error ${expectedCode}.`);
    }
  }
}

function playerIdForAuthUser(authUserId) {
  return psql(`
    select id from public.players where auth_user_id = ${sqlString(authUserId)}::uuid;
  `);
}

function roomRowForHost(hostPlayerId) {
  return psql(`
    select id, group_id, join_code, status
    from public.rooms
    where host_player_id = ${sqlString(hostPlayerId)}::uuid;
  `).split("|");
}

async function validate() {
  const results = [];

  const authA = await signInAnonymously("Auth A host");
  const createdA = await createGroup(authA.client, "Familia 4.3 A", "Ramiro");
  const roomRowsA = await createRoom(authA.client);
  const roomCodeA = roomRowsA[0].room_join_code;
  const roomIdA = roomRowForHost(createdA.player_id)[0];

  const authB = await signInAnonymously("Auth B participant");
  await joinGroup(authB.client, createdA.invitation_code, "Pedro");
  await joinRoomByCode(authB.client, roomCodeA);

  const activeRowsForHost = await getMyActiveRoom(authA.client);
  assertEqual(activeRowsForHost.length, 2, "Host active Room lobby must include host and participant.");
  assertEqual(activeRowsForHost[0].room_join_code, roomCodeA, "Host active Room code must match created Room.");
  assertEqual(
    activeRowsForHost.find((row) => row.participant_nickname === "Ramiro").participant_is_host,
    true,
    "Host row must be marked as host."
  );
  results.push(["host reconstruye lobby", "PASS", "A recupera Room y participantes desde get_my_active_room()."]);

  const activeRowsForParticipant = await getMyActiveRoom(authB.client);
  assertEqual(activeRowsForParticipant.length, 2, "Participant active Room lobby must include both participants.");
  assertEqual(activeRowsForParticipant[0].room_join_code, roomCodeA, "Participant active Room code must match joined Room.");
  assertEqual(
    activeRowsForParticipant.find((row) => row.participant_nickname === "Pedro").participant_is_host,
    false,
    "Participant row must not be marked as host."
  );
  results.push(["participante reconstruye lobby", "PASS", "B refresca conceptualmente y recupera la misma Room sin pasar código."]);

  const authNoRoom = await signInAnonymously("Auth same Group without Room");
  await joinGroup(authNoRoom.client, createdA.invitation_code, "Julia");
  const noRoomRows = await getMyActiveRoom(authNoRoom.client);
  assertEqual(noRoomRows.length, 0, "A recognized Player without active Room must get an empty result.");
  results.push(["sin Room activa", "PASS", "La ausencia normal devuelve 0 filas, no error técnico."]);

  const authOther = await signInAnonymously("Auth other Group");
  await createGroup(authOther.client, "Familia 4.3 Other", "Ajena");
  const otherRows = await getMyActiveRoom(authOther.client);
  assertEqual(otherRows.length, 0, "A Player from another Group without active Room must not inspect Room A.");
  results.push(["aislamiento entre Groups", "PASS", "La lectura no acepta código y no revela Rooms conocidas de otro Group."]);

  const closedRoomRowsBefore = await getMyActiveRoom(authB.client);
  assertEqual(closedRoomRowsBefore[0].room_join_code, roomCodeA, "B should have active Room before closing.");
  psql(`update public.rooms set status = 'closed' where id = ${sqlString(roomIdA)}::uuid;`);
  const closedRoomRowsAfter = await getMyActiveRoom(authB.client);
  assertEqual(closedRoomRowsAfter.length, 0, "Closing a Room must release active slots, so reconstruction returns absence.");
  results.push(["Room cerrada", "PASS", "Al cerrar la Room, el slot se libera y get_my_active_room() ya no devuelve lobby."]);

  const noAuthClient = createAnonymousClient();
  await expectRpcFailure(() => getMyActiveRoom(noAuthClient), "42501");
  results.push(["sin Auth", "PASS", "Un cliente sin sesión no puede ejecutar la RPC."]);

  const authWithoutPlayer = await signInAnonymously("Auth without Player");
  await expectRpcFailure(() => getMyActiveRoom(authWithoutPlayer.client), "P0002");
  results.push(["Auth sin Player", "PASS", "Una AuthIdentity sin Player no crea contexto ni Room automáticamente."]);

  const playerBId = playerIdForAuthUser(authB.userId);
  assert(playerBId, "B Player id must still exist.");
  results.push(["sin ids de producto", "PASS", "La validación usa ids sólo por inspección DB; la RPC no recibe parámetros."]);

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
