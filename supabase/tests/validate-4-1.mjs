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

async function expectDirectWriteDenied(operation) {
  const { error } = await operation();

  assert(error, "Expected direct write to be denied for the authenticated client.");
}

function roomRowForHost(hostPlayerId) {
  return psql(`
    select id, group_id, join_code, status
    from public.rooms
    where host_player_id = ${sqlString(hostPlayerId)}::uuid;
  `).split("|");
}

function countRoomsForHost(hostPlayerId) {
  return Number(psql(`
    select count(*)
    from public.rooms
    where host_player_id = ${sqlString(hostPlayerId)}::uuid;
  `));
}

function countActiveRoomsForHost(hostPlayerId) {
  return Number(psql(`
    select count(*)
    from public.rooms
    where host_player_id = ${sqlString(hostPlayerId)}::uuid
      and status = 'lobby';
  `));
}

function countParticipants(roomId) {
  return Number(psql(`
    select count(*)
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid;
  `));
}

function participantGroupMatchesRoomGroup(roomId, playerId) {
  return psql(`
    select
      (room_participants.group_id = rooms.group_id)
      and (players.group_id = rooms.group_id)
    from public.room_participants
    join public.rooms on rooms.id = room_participants.room_id
    join public.players on players.id = room_participants.player_id
    where room_participants.room_id = ${sqlString(roomId)}::uuid
      and room_participants.player_id = ${sqlString(playerId)}::uuid;
  `);
}

function countRoomsWithJoinCode(joinCode) {
  return Number(psql(`
    select count(*) from public.rooms where join_code = ${sqlString(joinCode)};
  `));
}

function countActiveRoomsForGroup(groupId) {
  return Number(psql(`
    select count(*)
    from public.rooms
    where group_id = ${sqlString(groupId)}::uuid
      and status = 'lobby';
  `));
}

async function validate() {
  const results = [];

  const authA1 = await signInAnonymously("Auth A1");
  const createdA = await createGroup(authA1.client, "Familia 4.1 A", "Ramiro");
  const invitationCodeA = createdA.invitation_code;
  const playerA1Id = createdA.player_id;

  const authA2 = await signInAnonymously("Auth A2");
  await joinGroup(authA2.client, invitationCodeA, "Pedro");

  const authB1 = await signInAnonymously("Auth B1");
  const createdB = await createGroup(authB1.client, "Familia 4.1 B", "Camila");
  const playerB1Id = createdB.player_id;

  const roomRowsA1 = await createRoom(authA1.client);
  assertEqual(roomRowsA1.length, 1, "Case A should return exactly one participant row.");
  assertEqual(roomRowsA1[0].room_status, "lobby", "Case A room should start in lobby.");
  assertEqual(roomRowsA1[0].participant_is_host, true, "Case A creator should be host.");
  assert(/^[A-HJ-NP-Z2-9]{8}$/.test(roomRowsA1[0].room_join_code), "Case A join code format mismatch.");

  const dbRoomA = roomRowForHost(playerA1Id);
  const roomAId = dbRoomA[0];
  assertEqual(dbRoomA[1], createdA.group_id, "Case A room group mismatch.");
  assertEqual(dbRoomA[2], roomRowsA1[0].room_join_code, "Case A join code mismatch with DB.");
  assertEqual(dbRoomA[3], "lobby", "Case A DB status mismatch.");
  results.push(["crear Room", "PASS", "create_room persisted a Room in lobby with a valid join code."]);

  assertEqual(countParticipants(roomAId), 1, "Case A participant count mismatch.");
  results.push(["creador participante", "PASS", "The creator appears exactly once as RoomParticipant."]);
  results.push(["creador host", "PASS", "Room.host_player_id equals the creating Player."]);

  assertEqual(
    participantGroupMatchesRoomGroup(roomAId, playerA1Id),
    "t",
    "Case A host/participant Group integrity mismatch."
  );
  results.push(["integridad de Group", "PASS", "Host and participant share the Room's Group."]);

  const roomRowsA2 = await createRoom(authA2.client);
  assertEqual(roomRowsA2[0].participant_is_host, true, "Non-admin should become host of own Room.");
  assert(roomRowsA2[0].room_join_code !== roomRowsA1[0].room_join_code, "Non-admin room reused admin's code.");
  results.push(["admin crea", "PASS", "The Group admin can create its own Room."]);
  results.push(["no-admin crea", "PASS", "A non-admin Player can also create its own Room."]);

  const noAuthClient = createAnonymousClient();
  await expectRpcFailure(() => createRoom(noAuthClient), "42501");
  results.push(["sin Auth", "PASS", "Unauthenticated clients cannot create a Room."]);

  const authWithoutPlayer = await signInAnonymously("Auth without Player");
  await expectRpcFailure(() => createRoom(authWithoutPlayer.client), "P0002");
  results.push(["Auth sin Player", "PASS", "Authenticated users without a Player cannot create a Room."]);

  const repeatRoomRowsA1 = await createRoom(authA1.client);
  assertEqual(
    repeatRoomRowsA1[0].room_join_code,
    roomRowsA1[0].room_join_code,
    "Sequential double create returned a different Room."
  );
  assertEqual(countRoomsForHost(playerA1Id), 1, "Sequential double create produced a second Room.");
  assertEqual(countParticipants(roomAId), 1, "Sequential double create duplicated the participant.");
  results.push(["doble create", "PASS", "Repeating create_room() sequentially returns the same active Room."]);

  const [concurrentFirst, concurrentSecond] = await Promise.all([
    createRoom(authB1.client),
    createRoom(authB1.client)
  ]);
  assertEqual(
    concurrentFirst[0].room_join_code,
    concurrentSecond[0].room_join_code,
    "Concurrent create_room() calls produced different Rooms."
  );
  assertEqual(countActiveRoomsForHost(playerB1Id), 1, "Concurrent create_room() calls produced two active Rooms.");
  results.push(["create concurrente", "PASS", "Two near-simultaneous create_room() calls converge on a single active Room."]);

  assertEqual(countRoomsWithJoinCode(roomRowsA1[0].room_join_code), 1, "Join code is not unique.");
  results.push(["código único", "PASS", "join_code remains unique across Rooms."]);

  psqlShouldFail(`
    insert into public.room_participants (room_id, player_id, group_id)
    values (${sqlString(roomAId)}::uuid, ${sqlString(playerA1Id)}::uuid, ${sqlString(createdA.group_id)}::uuid);
  `);
  results.push(["participante duplicado", "PASS", "A duplicate (room_id, player_id) row is rejected by the primary key."]);

  psqlShouldFail(`
    insert into public.rooms (group_id, join_code, host_player_id)
    values (
      ${sqlString(createdA.group_id)}::uuid,
      public.generate_room_join_code(),
      ${sqlString(playerA1Id)}::uuid
    );
  `);
  results.push(["una Room activa por Player", "PASS", "A second active Room for the same host is rejected structurally."]);

  assertEqual(countActiveRoomsForHost(playerA1Id), 1, "Group A should have exactly one active Room for Player A1.");
  assertEqual(
    countActiveRoomsForGroup(createdA.group_id),
    2,
    "Group A should have two independent active Rooms, one per Player."
  );
  results.push(["varias Rooms por Group", "PASS", "Distinct Players of the same Group can hold independent active Rooms."]);

  assert(dbRoomA[1] !== createdB.group_id, "Group A and Group B rooms should not share a group_id.");
  assert(playerB1Id !== playerA1Id, "Group isolation fixture mismatch.");
  results.push(["aislamiento entre Groups", "PASS", "Two Groups create independent Rooms without cross-contamination."]);

  const { data: readableRoomsForA1, error: readableRoomsForA1Error } = await authA1.client
    .from("rooms")
    .select("id, group_id, join_code, status")
    .order("created_at", { ascending: true });
  if (readableRoomsForA1Error) {
    throw readableRoomsForA1Error;
  }
  assertEqual(readableRoomsForA1.length, 1, "A1 must read only its own Room for Realtime authorization.");
  assertEqual(readableRoomsForA1[0].id, roomAId, "A1 direct Room read must be scoped to its own Room.");

  const { data: readableParticipantsForA1, error: readableParticipantsForA1Error } = await authA1.client
    .from("room_participants")
    .select("room_id, player_id, group_id")
    .order("joined_at", { ascending: true });
  if (readableParticipantsForA1Error) {
    throw readableParticipantsForA1Error;
  }
  assertEqual(
    readableParticipantsForA1.length,
    1,
    "A1 must read only its own RoomParticipant rows for Realtime authorization."
  );
  assertEqual(
    readableParticipantsForA1[0].room_id,
    roomAId,
    "A1 direct RoomParticipant read must be scoped to its own Room."
  );
  results.push(["SELECT acotado por RLS", "PASS", "4.4 habilita SELECT minimo solo para la Room propia requerida por Postgres Changes."]);

  const authC1 = await signInAnonymously("Auth C1 (fresh player, no Room yet)");
  const createdC = await createGroup(authC1.client, "Familia 4.1 C", "Victoria");
  const playerC1Id = createdC.player_id;

  const concurrentAttempts = await Promise.all(
    Array.from({ length: 5 }, () => createRoom(authC1.client))
  );
  const concurrentJoinCodes = new Set(concurrentAttempts.map((rows) => rows[0].room_join_code));
  assertEqual(concurrentJoinCodes.size, 1, "5 concurrent create_room() calls for a fresh Player produced more than one Room.");
  assertEqual(countActiveRoomsForHost(playerC1Id), 1, "5 concurrent create_room() calls left more than one active Room.");
  assertEqual(countParticipants(roomRowForHost(playerC1Id)[0]), 1, "5 concurrent create_room() calls duplicated the participant.");
  results.push(["create concurrente (5x, Player nuevo)", "PASS", "Five near-simultaneous create_room() calls for a Player with no prior Room converge on a single active Room and participant."]);

  await expectDirectWriteDenied(() =>
    authA1.client.from("room_participants").insert({
      room_id: roomAId,
      player_id: playerA1Id,
      group_id: createdA.group_id
    })
  );
  results.push(["sin INSERT directo (authenticated)", "PASS", "An authenticated client cannot insert into room_participants directly."]);

  await expectDirectWriteDenied(() =>
    authA1.client.from("rooms").update({ host_player_id: playerB1Id }).eq("id", roomAId)
  );
  results.push(["sin UPDATE directo (authenticated)", "PASS", "An authenticated client cannot reassign a Room's host directly."]);

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
