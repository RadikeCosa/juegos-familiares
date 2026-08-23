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
  return client.rpc("refresh_my_room_liveness");
}

function playerIdForAuthUser(authUserId) {
  return psql(`
    select id from public.players where auth_user_id = ${sqlString(authUserId)}::uuid;
  `);
}

function lastSeenAt(roomId, playerId) {
  return psql(`
    select coalesce(last_seen_at::text, 'NULL')
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid
      and player_id = ${sqlString(playerId)}::uuid;
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

function isLivenessActive(expression) {
  return psql(`
    select public.is_room_participant_liveness_active(${expression})::text;
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

async function validate() {
  const results = [];

  const authA = await signInAnonymously("A host");
  const createdA = await createGroup(authA.client, "Familia 5.2", "Ramiro");
  const playerAId = createdA.player_id;
  const roomRowsA = await createRoom(authA.client);
  const roomAId = roomRowsA[0].room_id;
  const roomACode = roomRowsA[0].room_join_code;

  assert(lastSeenAt(roomAId, playerAId) !== "NULL", "Host must receive last_seen_at.");
  results.push(["host last_seen_at", "PASS", "create_room inicializa liveness del host."]);

  const authB = await joinSameGroup(createdA.invitation_code, "Pedro");
  await joinRoomByCode(authB.client, roomACode);

  assert(lastSeenAt(roomAId, authB.playerId) !== "NULL", "Joined participant must receive last_seen_at.");
  results.push(["join last_seen_at", "PASS", "join_room_by_code inicializa liveness del participante."]);

  setLastSeenAt(roomAId, playerAId, "now() - interval '5 minutes'");
  const beforeRefreshA = lastSeenAt(roomAId, playerAId);
  const { error: refreshAError } = await refreshLiveness(authA.client);

  if (refreshAError) {
    throw refreshAError;
  }

  const afterRefreshA = lastSeenAt(roomAId, playerAId);
  assert(afterRefreshA > beforeRefreshA, "Refresh must advance own server-side timestamp.");
  results.push(["own refresh", "PASS", "refresh_my_room_liveness actualiza solo el participante autenticado."]);

  const beforeThrottleA = lastSeenAt(roomAId, playerAId);
  const { error: throttleError } = await refreshLiveness(authA.client);

  if (throttleError) {
    throw throttleError;
  }

  assertEqual(lastSeenAt(roomAId, playerAId), beforeThrottleA, "Throttle must avoid short-window writes.");
  results.push(["throttle", "PASS", "La ventana corta no reescribe last_seen_at."]);

  setLastSeenAt(roomAId, playerAId, "now() - interval '5 minutes'");
  setLastSeenAt(roomAId, authB.playerId, "now() - interval '5 minutes'");
  const beforeOtherA = lastSeenAt(roomAId, playerAId);
  const beforeOtherB = lastSeenAt(roomAId, authB.playerId);
  const { error: refreshBError } = await refreshLiveness(authB.client);

  if (refreshBError) {
    throw refreshBError;
  }

  assertEqual(lastSeenAt(roomAId, playerAId), beforeOtherA, "B must not refresh A.");
  assert(lastSeenAt(roomAId, authB.playerId) > beforeOtherB, "B must refresh only B.");
  results.push(["participant isolation", "PASS", "Otro Player no puede mantener activo a A."]);

  setLastSeenAt(roomAId, playerAId, "now() - interval '5 minutes'");
  const beforeClosedA = lastSeenAt(roomAId, playerAId);
  await closeRoom(authA.client);
  const { error: closedRefreshError } = await refreshLiveness(authA.client);

  if (closedRefreshError) {
    throw closedRefreshError;
  }

  assertEqual(lastSeenAt(roomAId, playerAId), beforeClosedA, "Closed Room must not refresh liveness.");
  results.push(["closed room", "PASS", "Room cerrada no actualiza liveness."]);

  const noAuthClient = createAnonymousClient();
  await expectRpcFailure(
    () => refreshLiveness(noAuthClient),
    "42501"
  );
  results.push(["no auth", "PASS", "Sin Auth no ejecuta la RPC."]);

  const authWithoutPlayer = await signInAnonymously("No player");
  await expectRpcFailure(
    () => refreshLiveness(authWithoutPlayer.client),
    "P0002"
  );
  results.push(["auth without player", "PASS", "Auth sin Player no actualiza."]);

  const authWithoutRoom = await signInAnonymously("No room");
  await createGroup(authWithoutRoom.client, "Familia sin room 5.2", "Victoria");
  const { error: noRoomError } = await refreshLiveness(authWithoutRoom.client);

  if (noRoomError) {
    throw noRoomError;
  }

  results.push(["player without room", "PASS", "Player sin Room activa no produce escritura ni error de producto."]);

  assertEqual(isLivenessActive("null"), "false", "NULL must be stale.");
  assertEqual(isLivenessActive("now() - interval '90 seconds'"), "true", "<= 90s must be active.");
  assertEqual(isLivenessActive("now() - interval '91 seconds'"), "false", "> 90s must be stale.");
  results.push(["active stale helper", "PASS", "active/stale usa NULL y threshold de 90s sin esperas reales."]);

  for (const [name, status, detail] of results) {
    console.log(`${status} ${name}: ${detail}`);
  }
}

validate().catch((error) => {
  console.error(error);
  process.exit(1);
});
