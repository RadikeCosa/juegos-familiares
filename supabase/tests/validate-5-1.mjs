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

function singleRow(data, message) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function signInAnonymously(label) {
  const client = createAnonymousClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(`${label}: anonymous sign-in failed.`);
  }

  return { client, userId: data.user.id };
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

async function canUseRoomPresence(client, topic) {
  const { data, error } = await client.rpc("is_current_player_room_presence_participant", {
    target_topic: topic
  });

  if (error) {
    throw error;
  }

  return data;
}

function waitUntil(predicate, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      try {
        if (predicate()) {
          clearInterval(interval);
          resolve();
          return;
        }
      } catch (error) {
        clearInterval(interval);
        reject(error);
        return;
      }

      if (Date.now() - startedAt > 10000) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for ${label}.`));
      }
    }, 100);
  });
}

function connectedPlayerIdsFromPresenceState(state) {
  const playerIds = new Set();

  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (typeof presence.playerId === "string") {
        playerIds.add(presence.playerId);
      }
    }
  }

  return playerIds;
}

function subscribePresence(client, topic, playerId, label) {
  const current = {
    state: {}
  };
  const channel = client
    .channel(topic, {
      config: {
        private: true,
        presence: {
          enabled: true,
          key: `${playerId}:${label}`
        }
      }
    })
    .on("presence", { event: "sync" }, () => {
      current.state = channel.presenceState();
    })
    .on("presence", { event: "join" }, () => {
      current.state = channel.presenceState();
    })
    .on("presence", { event: "leave" }, () => {
      current.state = channel.presenceState();
    });

  const subscribed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label}: Presence subscription timed out.`));
    }, 10000);

    channel.subscribe(async (status, error) => {
      if (status === "SUBSCRIBED") {
        const trackStatus = await channel.track({ playerId });
        clearTimeout(timeout);

        if (trackStatus !== "ok") {
          reject(new Error(`${label}: Presence track failed with ${trackStatus}.`));
          return;
        }

        resolve();
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(error ?? new Error(`${label}: Presence subscription failed with ${status}.`));
      }
    });
  });

  return { channel, current, subscribed };
}

async function removePresence(client, channel) {
  try {
    await channel.untrack();
  } finally {
    await client.removeChannel(channel);
  }
}

async function validate() {
  const results = [];

  const authA = await signInAnonymously("A host");
  const createdA = await createGroup(authA.client, "Familia 5.1", "Ramiro");
  const roomRowsA = await createRoom(authA.client);
  const roomId = roomRowsA[0].room_id;
  const roomCode = roomRowsA[0].room_join_code;
  const roomTopic = `impostor-room-presence:${roomId}`;

  assert(
    roomRowsA.every((row) => row.participant_player_id),
    "Lobby rows must include participant_player_id."
  );

  const authB = await signInAnonymously("B participant");
  await joinGroup(authB.client, createdA.invitation_code, "Pedro");
  const roomRowsB = await joinRoomByCode(authB.client, roomCode);
  const playerBId = roomRowsB.find((row) => row.participant_is_self)?.participant_player_id;

  assert(
    roomRowsB.every((row) => row.participant_player_id),
    "Joined lobby rows must include participant_player_id."
  );
  assert(playerBId, "B lobby rows must identify B as self.");
  results.push(["participant_player_id", "PASS", "Lobby RPCs return technical Player ids for Presence correlation."]);

  const authC = await signInAnonymously("C participant");
  await joinGroup(authC.client, createdA.invitation_code, "Camila");
  const roomRowsC = await joinRoomByCode(authC.client, roomCode);
  const playerCId = roomRowsC.find((row) => row.participant_is_self)?.participant_player_id;

  assert(playerCId, "C lobby rows must identify C as self.");

  const authD = await signInAnonymously("D same group nonparticipant");
  await joinGroup(authD.client, createdA.invitation_code, "Victoria");

  const authE = await signInAnonymously("E other group");
  await createGroup(authE.client, "Otra familia 5.1", "Alex");

  assertEqual(
    await canUseRoomPresence(authA.client, roomTopic),
    true,
    "Host participant must be authorized for room Presence."
  );
  assertEqual(
    await canUseRoomPresence(authB.client, roomTopic),
    true,
    "Joined RoomParticipant must be authorized for room Presence."
  );
  assertEqual(
    await canUseRoomPresence(authC.client, roomTopic),
    true,
    "Third RoomParticipant must be authorized for room Presence."
  );
  assertEqual(
    await canUseRoomPresence(authD.client, roomTopic),
    false,
    "Same-Group nonparticipant must not be authorized for room Presence."
  );
  assertEqual(
    await canUseRoomPresence(authE.client, roomTopic),
    false,
    "Other-Group Player must not be authorized for room Presence."
  );
  assertEqual(
    await canUseRoomPresence(authA.client, "impostor-room-presence:not-a-room-id"),
    false,
    "Malformed Presence topic must not be authorized."
  );
  results.push(["presence authorization predicate", "PASS", "RoomParticipant yes; same Group nonparticipant, other Group and malformed topic no."]);

  const anonymousClient = createAnonymousClient();
  const { error: anonPresenceError } = await anonymousClient.rpc(
    "is_current_player_room_presence_participant",
    { target_topic: roomTopic }
  );

  assert(anonPresenceError, "Anon client must not execute the Presence authorization helper.");
  results.push(["anon presence authorization", "PASS", "Unauthenticated clients cannot execute the helper."]);

  const presenceA = subscribePresence(authA.client, roomTopic, roomRowsA[0].participant_player_id, "A");
  const presenceB = subscribePresence(authB.client, roomTopic, playerBId, "B");
  const presenceC = subscribePresence(authC.client, roomTopic, playerCId, "C");

  await Promise.all([presenceA.subscribed, presenceB.subscribed, presenceC.subscribed]);
  await waitUntil(() => {
    const connected = connectedPlayerIdsFromPresenceState(presenceA.current.state);
    return connected.has(roomRowsA[0].participant_player_id) && connected.has(playerBId) && connected.has(playerCId);
  }, "A seeing A, B and C connected");
  results.push(["presence connected", "PASS", "A sees A, B and C connected through Supabase Presence."]);

  await presenceB.channel.untrack();
  await waitUntil(() => {
    const connected = connectedPlayerIdsFromPresenceState(presenceA.current.state);
    return connected.has(roomRowsA[0].participant_player_id) && !connected.has(playerBId) && connected.has(playerCId);
  }, "A seeing B disconnected after untrack");
  results.push(["presence disconnected", "PASS", "B untrack leaves B listed in Room but absent from Presence for A and C."]);

  await presenceB.channel.track({ playerId: playerBId });
  await waitUntil(() => {
    const connected = connectedPlayerIdsFromPresenceState(presenceA.current.state);
    return connected.has(roomRowsA[0].participant_player_id) && connected.has(playerBId) && connected.has(playerCId);
  }, "A seeing B connected again");
  results.push(["presence reconnect", "PASS", "B can publish Presence again on the same Room channel."]);

  await presenceA.channel.untrack();
  await waitUntil(() => {
    const connected = connectedPlayerIdsFromPresenceState(presenceB.current.state);
    return !connected.has(roomRowsA[0].participant_player_id) && connected.has(playerBId) && connected.has(playerCId);
  }, "B seeing host disconnected");

  const hostBeforePresence = psql(`
    select host_player_id
    from public.rooms
    where id = ${sqlString(roomId)}::uuid;
  `);

  assertEqual(
    hostBeforePresence,
    roomRowsA[0].participant_player_id,
    "5.1 validation must preserve the original host."
  );
  results.push(["host unchanged", "PASS", "Presence setup does not mutate rooms.host_player_id."]);

  await removePresence(authA.client, presenceA.channel);
  await removePresence(authB.client, presenceB.channel);
  await removePresence(authC.client, presenceC.channel);
  authA.client.realtime.disconnect();
  authB.client.realtime.disconnect();
  authC.client.realtime.disconnect();
  authD.client.realtime.disconnect();
  authE.client.realtime.disconnect();
  anonymousClient.realtime.disconnect();

  for (const [name, status, detail] of results) {
    console.log(`${status} ${name} — ${detail}`);
  }
}

validate().catch((error) => {
  console.error(error);
  process.exit(1);
});
