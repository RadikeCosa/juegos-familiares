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

async function expectDirectSelectDenied(operation) {
  const { data, error } = await operation();

  assert(error || !data || data.length === 0, "Expected direct select to expose no rows.");
}

async function expectDirectWriteDenied(operation) {
  const { error } = await operation();

  assert(error, "Expected direct write to be denied for the client.");
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

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Create room RPC returned no rows.");
  }

  return data;
}

async function joinRoomByCode(client, roomCode) {
  const { data, error } = await client.rpc("join_room_by_code", {
    room_code: roomCode
  });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Join room RPC returned no rows.");
  }

  return data;
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

function roomRowForHost(hostPlayerId) {
  return psql(`
    select id, group_id, join_code, status
    from public.rooms
    where host_player_id = ${sqlString(hostPlayerId)}::uuid;
  `).split("|");
}

function countParticipants(roomId) {
  return Number(psql(`
    select count(*)
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid;
  `));
}

function countParticipant(roomId, playerId) {
  return Number(psql(`
    select count(*)
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid
      and player_id = ${sqlString(playerId)}::uuid;
  `));
}

function countActiveRoomsForPlayer(playerId) {
  return Number(psql(`
    select count(*)
    from public.rooms
    join public.room_participants
      on room_participants.room_id = rooms.id
    where room_participants.player_id = ${sqlString(playerId)}::uuid
      and rooms.status = 'lobby';
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

function activeSlotRoomForPlayer(playerId) {
  return psql(`
    select room_id
    from public.player_active_room_slots
    where player_id = ${sqlString(playerId)}::uuid;
  `);
}

function roomHostPlayerId(roomId) {
  return psql(`
    select host_player_id from public.rooms where id = ${sqlString(roomId)}::uuid;
  `);
}

function closeRoom(roomId) {
  psql(`update public.rooms set status = 'closed' where id = ${sqlString(roomId)}::uuid;`);
}

// join_group_with_invitation() does not return player_id, so tests that need
// the joined Player's id look it up directly by the AuthIdentity that joined.
function playerIdForAuthUser(authUserId) {
  return psql(`
    select id from public.players where auth_user_id = ${sqlString(authUserId)}::uuid;
  `);
}

async function validate() {
  const results = [];

  // --- Setup: Group A with host Player A1 and Room A ---
  const authA1 = await signInAnonymously("Auth A1");
  const createdA = await createGroup(authA1.client, "Familia 4.2 A", "Ramiro");
  const invitationCodeA = createdA.invitation_code;
  const playerA1Id = createdA.player_id;

  const roomRowsA = await createRoom(authA1.client);
  const roomAJoinCode = roomRowsA[0].room_join_code;
  const roomAId = roomRowForHost(playerA1Id)[0];

  // --- Setup: Player B, same Group A, via invitation ---
  const authB = await signInAnonymously("Auth B");
  await joinGroup(authB.client, invitationCodeA, "Pedro");
  const playerBId = playerIdForAuthUser(authB.userId);

  // --- Case: join válido mismo Group ---
  const joinRowsB = await joinRoomByCode(authB.client, roomAJoinCode);
  assertEqual(joinRowsB[0].room_status, "lobby", "Joined Room should remain lobby.");
  assertEqual(joinRowsB.length, 2, "Join response should list both participants.");
  results.push(["join mismo Group", "PASS", "B, del mismo Group que A, entra a la Room de A por código."]);

  await expectDirectSelectDenied(() => authB.client.from("player_active_room_slots").select("*"));
  await expectDirectWriteDenied(() => authB.client.from("player_active_room_slots").insert({
    player_id: playerBId,
    room_id: roomAId,
    group_id: createdA.group_id
  }));
  await expectDirectWriteDenied(() => authB.client.from("player_active_room_slots").update({
    room_id: roomAId
  }).eq("player_id", playerBId));
  await expectDirectWriteDenied(() => authB.client.from("player_active_room_slots").delete().eq("player_id", playerBId));

  const anonSlotClient = createAnonymousClient();
  await expectDirectSelectDenied(() => anonSlotClient.from("player_active_room_slots").select("*"));
  results.push(["slot sin acceso directo", "PASS", "authenticated y anon no pueden leer ni escribir ownership de slots desde el cliente."]);

  // --- Case: B queda participante (una sola fila) ---
  assertEqual(countParticipants(roomAId), 2, "Room A should have exactly host + B as participants.");
  results.push(["participante creado", "PASS", "B aparece exactamente una vez como RoomParticipant."]);

  const createFromParticipantRows = await createRoom(authB.client);
  assertEqual(createFromParticipantRows[0].room_join_code, roomAJoinCode, "A joined participant must recover the existing Room.");
  assertEqual(createFromParticipantRows.length, 2, "Recovering a Room must return its complete lobby.");
  assertEqual(createFromParticipantRows.find((row) => row.participant_nickname === "Pedro").participant_is_host, false, "Recovering a Room must not promote B to host.");
  assertEqual(roomHostPlayerId(roomAId), playerA1Id, "Recovering a Room must preserve A as host.");
  results.push(["create como participante", "PASS", "B, ya unido como no-host, recupera la misma Room sin cambiar el host."]);

  // --- Case: host no cambia ---
  assertEqual(roomHostPlayerId(roomAId), playerA1Id, "Host must remain Player A1 after B joins.");
  results.push(["host preservado", "PASS", "Room.host_player_id sigue siendo A luego del join de B."]);

  // --- Case: join repetido (idempotente) ---
  const repeatJoinRowsB = await joinRoomByCode(authB.client, roomAJoinCode);
  assertEqual(repeatJoinRowsB.length, 2, "Repeated join should not duplicate participants.");
  assertEqual(countParticipants(roomAId), 2, "Repeated join must not create a duplicate row.");
  results.push(["join repetido", "PASS", "Repetir join_room_by_code() devuelve éxito sin duplicar la participación."]);

  // --- Case: join concurrente misma Room (dos llamadas simultáneas de B) ---
  await Promise.all([
    joinRoomByCode(authB.client, roomAJoinCode),
    joinRoomByCode(authB.client, roomAJoinCode)
  ]);
  assertEqual(countParticipants(roomAId), 2, "Concurrent repeated joins must not duplicate the participant.");
  results.push(["join concurrente misma Room", "PASS", "Dos llamadas simultáneas de B a la misma Room convergen en una sola participación."]);


  // --- Case: join simultáneo a dos Rooms (Player fresco E, Room A y Room C) ---
  const authA2 = await signInAnonymously("Auth A2 (host de Room C)");
  await joinGroup(authA2.client, invitationCodeA, "Camila");
  const playerA2Id = playerIdForAuthUser(authA2.userId);
  const roomRowsC = await createRoom(authA2.client);
  const roomCJoinCode = roomRowsC[0].room_join_code;
  const roomCId = roomRowForHost(playerA2Id)[0];

  const authE = await signInAnonymously("Auth E (join concurrente a dos Rooms)");
  await joinGroup(authE.client, invitationCodeA, "Victoria");
  const playerEId = playerIdForAuthUser(authE.userId);

  const concurrentTwoRoomAttempts = await Promise.allSettled([
    joinRoomByCode(authE.client, roomAJoinCode),
    joinRoomByCode(authE.client, roomCJoinCode)
  ]);
  const concurrentTwoRoomSuccesses = concurrentTwoRoomAttempts.filter(
    (attempt) => attempt.status === "fulfilled"
  );
  assertEqual(concurrentTwoRoomSuccesses.length, 1, "Exactly one of the two concurrent joins should succeed.");
  assertEqual(countActiveRoomsForPlayer(playerEId), 1, "Player E must end up in exactly one active Room.");
  assertEqual(countActiveSlotsForPlayer(playerEId), 1, "Player E must hold exactly one active Room slot.");
  results.push(["join simultáneo dos Rooms", "PASS", "E, sin Room previa, intenta unirse a A y a C a la vez; termina en exactamente una."]);

  // --- Case: create vs join concurrente (Player fresco F) ---
  const authF = await signInAnonymously("Auth F (create vs join concurrente)");
  await joinGroup(authF.client, invitationCodeA, "Franco");
  const playerFId = playerIdForAuthUser(authF.userId);

  await Promise.allSettled([
    createRoom(authF.client),
    joinRoomByCode(authF.client, roomAJoinCode)
  ]);
  assertEqual(countActiveRoomsForPlayer(playerFId), 1, "Player F must end up in exactly one active Room after create vs join race.");
  assertEqual(countActiveSlotsForPlayer(playerFId), 1, "Player F must hold exactly one active Room slot after the race.");
  results.push(["create vs join concurrente", "PASS", "create_room() y join_room_by_code() concurrentes para F convergen en una sola Room activa."]);

  // --- Case: otro Group ---
  const authOther = await signInAnonymously("Auth Other Group");
  const createdOther = await createGroup(authOther.client, "Familia 4.2 Other", "Ajena");

  const participantsBeforeCrossGroupJoin = countParticipants(roomAId);
  await expectRpcFailure(() => joinRoomByCode(authOther.client, roomAJoinCode), "P0010");
  assertEqual(
    countParticipants(roomAId),
    participantsBeforeCrossGroupJoin,
    "A rejected cross-Group join must not create a participant."
  );
  results.push(["otro Group", "PASS", "Un Player de otro Group no puede unirse ni ver la Room de Group A."]);

  // --- Case: código inválido ---
  await expectRpcFailure(() => joinRoomByCode(authB.client, "ZZZZZZZZ"), "P0010");
  results.push(["código inválido", "PASS", "Un código inexistente es rechazado sin efectos."]);

  // --- Case: Room closed ---
  const authH = await signInAnonymously("Auth H (host de Room a cerrar)");
  await joinGroup(authH.client, invitationCodeA, "Hernán");
  const roomRowsH = await createRoom(authH.client);
  const roomHJoinCode = roomRowsH[0].room_join_code;
  const roomHId = roomRowForHost(playerIdForAuthUser(authH.userId))[0];
  const authHParticipant = await signInAnonymously("Auth H participant");
  await joinGroup(authHParticipant.client, invitationCodeA, "Irene");
  await joinRoomByCode(authHParticipant.client, roomHJoinCode);
  assertEqual(countActiveSlotsForRoom(roomHId), 2, "Room H should have one slot per participant before closing.");
  closeRoom(roomHId);
  assertEqual(countActiveSlotsForRoom(roomHId), 0, "Closing Room H must release every participant slot.");
  assertEqual(countParticipants(roomHId), 2, "Closing Room H must not delete its participants.");
  closeRoom(roomHId);
  assertEqual(countActiveSlotsForRoom(roomHId), 0, "Closing an already closed Room must remain idempotent.");

  psqlShouldFail(`
    update public.rooms
    set status = 'lobby'
    where id = ${sqlString(roomHId)}::uuid;
  `);
  results.push(["release y no reapertura", "PASS", "Cerrar libera todos los slots, es idempotente y una Room closed no puede reabrirse sin reconstrucción autoritativa."]);

  const authG = await signInAnonymously("Auth G (Room closed)");
  await joinGroup(authG.client, invitationCodeA, "Gabriel");
  await expectRpcFailure(() => joinRoomByCode(authG.client, roomHJoinCode), "P0011");
  results.push(["Room closed", "PASS", "Una Room con status = closed rechaza el join."]);

  const authDirectLobby = await signInAnonymously("Auth direct lobby participant");
  await joinGroup(authDirectLobby.client, invitationCodeA, "Laura");
  const playerDirectLobbyId = playerIdForAuthUser(authDirectLobby.userId);
  psql(`
    insert into public.room_participants (room_id, player_id, group_id)
    values (
      ${sqlString(roomCId)}::uuid,
      ${sqlString(playerDirectLobbyId)}::uuid,
      ${sqlString(createdA.group_id)}::uuid
    );
  `);
  assertEqual(countParticipant(roomCId, playerDirectLobbyId), 1, "A direct insert into a lobby Room must create one RoomParticipant.");
  assertEqual(countActiveSlotsForPlayer(playerDirectLobbyId), 1, "A direct insert into a lobby Room must claim one active slot.");
  assertEqual(activeSlotRoomForPlayer(playerDirectLobbyId), roomCId, "A direct lobby insert slot must point to that Room.");
  results.push(["insert directo lobby", "PASS", "Un INSERT interno valido en Room lobby crea RoomParticipant y slot."]);

  const authClosedInsert = await signInAnonymously("Auth direct closed Room insert");
  await joinGroup(authClosedInsert.client, invitationCodeA, "Martina");
  const playerClosedInsertId = playerIdForAuthUser(authClosedInsert.userId);
  psqlShouldFail(`
    insert into public.room_participants (room_id, player_id, group_id)
    values (
      ${sqlString(roomHId)}::uuid,
      ${sqlString(playerClosedInsertId)}::uuid,
      ${sqlString(createdA.group_id)}::uuid
    );
  `);
  assertEqual(countParticipant(roomHId, playerClosedInsertId), 0, "A rejected closed Room insert must not leave a RoomParticipant.");
  assertEqual(countActiveSlotsForPlayer(playerClosedInsertId), 0, "A rejected closed Room insert must not leave an active slot.");
  results.push(["insert directo Room closed", "PASS", "Room closed -> INSERT RoomParticipant es rechazado sin participant ni slot."]);

  const authNoRoom = await signInAnonymously("Auth same Group without Room");
  await joinGroup(authNoRoom.client, invitationCodeA, "Julia");
  const playerNoRoomId = playerIdForAuthUser(authNoRoom.userId);
  psqlShouldFail(`
    insert into public.player_active_room_slots (player_id, room_id, group_id)
    values (
      ${sqlString(playerNoRoomId)}::uuid,
      ${sqlString(roomAId)}::uuid,
      ${sqlString(createdA.group_id)}::uuid
    );
  `);
  assertEqual(countActiveSlotsForPlayer(playerNoRoomId), 0, "A slot without a matching RoomParticipant must not persist.");
  results.push(["slot sin participación", "PASS", "La FK del slot a RoomParticipant rechaza un slot válido por Group pero sin participación."]);


  // --- Case: sin Auth ---
  const noAuthClient = createAnonymousClient();
  await expectRpcFailure(() => joinRoomByCode(noAuthClient, roomAJoinCode), "42501");
  results.push(["sin Auth", "PASS", "Un cliente sin sesión no puede unirse a una Room."]);

  // --- Case: Auth sin Player ---
  const authWithoutPlayer = await signInAnonymously("Auth without Player");
  await expectRpcFailure(() => joinRoomByCode(authWithoutPlayer.client, roomAJoinCode), "P0002");
  results.push(["Auth sin Player", "PASS", "Una AuthIdentity sin Player asociado no puede unirse a una Room."]);

  // --- Case: RoomParticipant duplicado (estructural) ---
  psqlShouldFail(`
    insert into public.room_participants (room_id, player_id, group_id)
    values (${sqlString(roomAId)}::uuid, ${sqlString(playerBId)}::uuid, ${sqlString(createdA.group_id)}::uuid);
  `);
  results.push(["participante duplicado", "PASS", "Un (room_id, player_id) duplicado es rechazado por la primary key."]);

  // --- Case: integridad de Group (no se puede forzar participante de otro Group) ---
  psqlShouldFail(`
    insert into public.room_participants (room_id, player_id, group_id)
    values (
      ${sqlString(roomAId)}::uuid,
      (select id from public.players where auth_user_id = ${sqlString(authOther.userId)}::uuid),
      ${sqlString(createdOther.group_id)}::uuid
    );
  `);
  results.push(["integridad de Group", "PASS", "No puede forzarse un RoomParticipant cuyo Group no coincide con el de la Room."]);

  // --- Case: múltiples Players comparten la misma Room ---
  assertEqual(countParticipants(roomAId) >= 2, true, "Room A should hold both A (host) and B as distinct Players.");
  results.push(["múltiples Players", "PASS", "Distintos Players del mismo Group comparten la misma Room."]);

  // --- Case: varias Rooms del mismo Group siguen permitidas ---
  const activeRoomsForGroupA = Number(psql(`
    select count(*)
    from public.rooms
    where group_id = ${sqlString(createdA.group_id)}::uuid
      and status = 'lobby';
  `));
  assert(activeRoomsForGroupA >= 2, "Group A should keep multiple independent active Rooms (A and F's own Room, if created).");
  results.push(["varias Rooms por Group", "PASS", "El Group sigue teniendo varias Rooms activas simultáneas."]);

  // --- Case: una Room activa por Player (estructural, cubre host y participante) ---
  assertEqual(countActiveSlotsForPlayer(playerBId), 1, "Player B must hold exactly one active Room slot.");
  assertEqual(activeSlotRoomForPlayer(playerBId), roomAId, "Player B's active Room slot must point at Room A.");
  results.push(["una Room activa por Player", "PASS", "player_active_room_slots garantiza estructuralmente una única Room activa, para host y participantes."]);

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
