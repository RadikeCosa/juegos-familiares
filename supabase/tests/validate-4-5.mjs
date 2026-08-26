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
  try {
    await operation();
  } catch (error) {
    assertEqual(error.code, expectedCode, `Expected Postgres error ${expectedCode}.`);
    return;
  }

  throw new Error(`Expected RPC to fail with ${expectedCode}.`);
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

async function leaveRoom(client) {
  const { error } = await client.rpc("leave_room");

  if (error) {
    throw error;
  }
}

async function closeRoom(client) {
  const { error } = await client.rpc("close_room");

  if (error) {
    throw error;
  }
}

async function getMyActiveRoomRows(client) {
  const { data, error } = await client.rpc("get_my_active_room");

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
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

function countParticipant(roomId, playerId) {
  return Number(psql(`
    select count(*)
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid
      and player_id = ${sqlString(playerId)}::uuid;
  `));
}

function countParticipants(roomId) {
  return Number(psql(`
    select count(*)
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid;
  `));
}

function countActiveSlotsForPlayer(playerId) {
  return Number(psql(`
    select count(*)
    from public.player_active_room_slots
    where player_id = ${sqlString(playerId)}::uuid;
  `));
}

function countActiveSlotsForRoom(roomId) {
  return Number(psql(`
    select count(*)
    from public.player_active_room_slots
    where room_id = ${sqlString(roomId)}::uuid;
  `));
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
  const createdA = await createGroup(authA.client, "Familia 4.5", "Ramiro");
  const playerAId = createdA.player_id;
  const roomRowsA = await createRoom(authA.client);
  const roomAId = roomRowsA[0].room_id;
  const roomACode = roomRowsA[0].room_join_code;

  const authB = await joinSameGroup(createdA.invitation_code, "Pedro");
  await joinRoomByCode(authB.client, roomACode);
  await leaveRoom(authB.client);

  assertEqual(roomStatus(roomAId), "lobby", "No-host leave must keep Room lobby.");
  assertEqual(countParticipant(roomAId, authB.playerId), 0, "No-host leave must delete B membership.");
  assertEqual(countActiveSlotsForPlayer(authB.playerId), 0, "No-host leave must release B active slot.");
  assertEqual(countParticipant(roomAId, playerAId), 1, "No-host leave must keep host membership.");
  assertEqual(roomHostPlayerId(roomAId), playerAId, "No-host leave must preserve host.");
  results.push(["no-host leave", "PASS", "B sale, su membership y slot desaparecen; A sigue host y Room lobby."]);

  const roomRowsBNew = await createRoom(authB.client);
  assert(roomRowsBNew[0].room_id !== roomAId, "B must be able to create a new Room after leaving.");
  await closeRoom(authB.client);
  results.push(["crear despues de leave", "PASS", "B crea otra Room luego de liberar su slot."]);

  const authC = await joinSameGroup(createdA.invitation_code, "Julia");
  const roomRowsC = await createRoom(authC.client);
  const roomCId = roomRowsC[0].room_id;
  const roomCCode = roomRowsC[0].room_join_code;
  const authD = await joinSameGroup(createdA.invitation_code, "Laura");
  await joinRoomByCode(authD.client, roomCCode);

  await expectRpcFailure(() => closeRoom(authD.client), "P0016");
  assertEqual(roomStatus(roomCId), "lobby", "Non-host close must not change Room status.");
  assertEqual(countActiveSlotsForRoom(roomCId), 2, "Non-host close rejection must preserve slots.");
  results.push(["no-host close rechazado", "PASS", "D no puede cerrar una Room donde no es host."]);

  await closeRoom(authC.client);
  assertEqual(roomStatus(roomCId), "closed", "Host close must mark Room closed.");
  assertEqual(countActiveSlotsForRoom(roomCId), 0, "Host close must release all slots.");
  assertEqual(countParticipants(roomCId), 2, "Host close must preserve historical participants.");
  assertEqual((await getMyActiveRoomRows(authC.client)).length, 0, "Closed Room must not be active for host.");
  assertEqual((await getMyActiveRoomRows(authD.client)).length, 0, "Closed Room must not be active for participant.");
  results.push(["host close", "PASS", "Room closed, slots liberados, participants historicos preservados, get_my_active_room null."]);

  await expectRpcFailure(() => joinRoomByCode(authA.client, roomCCode), "P0011");
  results.push(["join closed", "PASS", "Una Room closed rechaza join_room_by_code()."]);

  const roomRowsAfterCloseC = await createRoom(authC.client);
  assert(roomRowsAfterCloseC[0].room_id !== roomCId, "Host must be able to create a new Room after close.");
  await closeRoom(authC.client);
  const roomRowsAfterCloseD = await createRoom(authD.client);
  assert(roomRowsAfterCloseD[0].room_id !== roomCId, "Former participant must be able to create a new Room after close.");
  await closeRoom(authD.client);
  results.push(["crear despues de close", "PASS", "Host y participantes anteriores vuelven a crear tras cierre."]);

  const authE = await joinSameGroup(createdA.invitation_code, "Sofia");
  const roomRowsE = await createRoom(authE.client);
  const roomEId = roomRowsE[0].room_id;
  const roomECode = roomRowsE[0].room_join_code;
  const authF = await joinSameGroup(createdA.invitation_code, "Nicolas");
  await joinRoomByCode(authF.client, roomECode);
  await leaveRoom(authE.client);

  assertEqual(roomStatus(roomEId), "closed", "Host leave must close Room.");
  assertEqual(countActiveSlotsForRoom(roomEId), 0, "Host leave must release every slot.");
  assertEqual(countParticipants(roomEId), 2, "Host leave must preserve historical participants.");
  results.push(["host leave", "PASS", "El host usando leave_room() cierra la Room sin sucesion."]);

  const authNoRoom = await joinSameGroup(createdA.invitation_code, "Martina");
  await leaveRoom(authNoRoom.client);
  await expectRpcFailure(() => closeRoom(authNoRoom.client), "P0015");
  results.push(["sin Room", "PASS", "leave_room() sin Room es estable; close_room() sin Room rechaza con producto claro."]);

  const authG = await joinSameGroup(createdA.invitation_code, "Tomas");
  const roomRowsG = await createRoom(authG.client);
  const roomGCode = roomRowsG[0].room_join_code;
  await leaveRoom(authNoRoom.client);
  await joinRoomByCode(authNoRoom.client, roomGCode);
  assertEqual(countActiveSlotsForPlayer(authNoRoom.playerId), 1, "Player must be able to join after a previous no-room leave.");
  await leaveRoom(authNoRoom.client);
  await closeRoom(authG.client);
  results.push(["join despues de leave", "PASS", "Un Player libre puede unirse a otra Room despues de leave."]);

  const authH = await joinSameGroup(createdA.invitation_code, "Camila");
  const roomRowsH = await createRoom(authH.client);
  const roomHId = roomRowsH[0].room_id;
  const roomHCode = roomRowsH[0].room_join_code;
  const authI = await joinSameGroup(createdA.invitation_code, "Victoria");
  await Promise.allSettled([
    closeRoom(authH.client),
    joinRoomByCode(authI.client, roomHCode)
  ]);
  assertEqual(roomStatus(roomHId), "closed", "close vs join must end closed.");
  assertEqual(countActiveSlotsForRoom(roomHId), 0, "close vs join must not leave slots in a closed Room.");
  results.push(["close vs join concurrente", "PASS", "El cierre gana o limpia slots; nunca queda slot en Room closed."]);

  const authJ = await joinSameGroup(createdA.invitation_code, "Valeria");
  const roomRowsJ = await createRoom(authJ.client);
  const roomJId = roomRowsJ[0].room_id;
  const roomJCode = roomRowsJ[0].room_join_code;
  const authK = await joinSameGroup(createdA.invitation_code, "Andres");
  await joinRoomByCode(authK.client, roomJCode);
  await Promise.allSettled([
    closeRoom(authJ.client),
    leaveRoom(authK.client)
  ]);
  assertEqual(roomStatus(roomJId), "closed", "leave vs close must end closed.");
  assertEqual(countActiveSlotsForRoom(roomJId), 0, "leave vs close must release all slots.");
  results.push(["leave vs close concurrente", "PASS", "La carrera converge a Room closed sin slots huerfanos."]);

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
