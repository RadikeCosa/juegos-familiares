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

async function signInAnonymously(label) {
  const client = createAnonymousClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(`${label}: anonymous sign-in failed.`);
  }

  return client;
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

function includesNicknames(rows, expectedNicknames) {
  const actual = new Set(rows.map((row) => row.participant_nickname));

  return expectedNicknames.every((name) => actual.has(name));
}

function excludesNicknames(rows, excludedNicknames) {
  const actual = new Set(rows.map((row) => row.participant_nickname));

  return excludedNicknames.every((name) => !actual.has(name));
}

function waitForSubscription(channel, postgresReady) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Realtime subscription timed out."));
    }, 10000);

    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        void postgresReady.then(() => {
          clearTimeout(timeout);
          resolve(status);
        }, reject);
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(error ?? new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
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

async function subscribeWithAuthoritativeRefetch(client, label, roomId, snapshots) {
  let eventCount = 0;
  let refetchCount = 0;
  let markPostgresReady = () => { };
  const postgresReady = new Promise((resolve) => {
    markPostgresReady = resolve;
  });
  const channel = client
    .channel(`smoke-4-5:${label}:${roomId}`)
    .on("system", {}, (payload) => {
      if (
        payload?.extension === "postgres_changes" &&
        payload?.status === "ok"
      ) {
        markPostgresReady();
      }
    })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "room_participants",
        filter: `room_id=eq.${roomId}`
      },
      async () => {
        eventCount += 1;
        refetchCount += 1;
        snapshots.push(await getMyActiveRoomRows(client));
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "room_participants",
        filter: `room_id=eq.${roomId}`
      },
      async () => {
        eventCount += 1;
        refetchCount += 1;
        snapshots.push(await getMyActiveRoomRows(client));
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${roomId}`
      },
      async () => {
        eventCount += 1;
        refetchCount += 1;
        snapshots.push(await getMyActiveRoomRows(client));
      }
    );

  await waitForSubscription(channel, postgresReady);

  return {
    channel,
    get eventCount() {
      return eventCount;
    },
    get refetchCount() {
      return refetchCount;
    }
  };
}

async function validate() {
  const results = [];

  const clientA = await signInAnonymously("A");
  const createdA = await createGroup(clientA, "Familia smoke 4.5", "Ramiro");
  const roomRowsA = await createRoom(clientA);
  const roomCode = roomRowsA[0].room_join_code;
  const roomId = roomRowsA[0].room_id;

  const clientB = await signInAnonymously("B");
  await joinGroup(clientB, createdA.invitation_code, "Pedro");
  await joinRoomByCode(clientB, roomCode);

  const snapshotsA = [];
  const subscriptionA = await subscribeWithAuthoritativeRefetch(
    clientA,
    "A",
    roomId,
    snapshotsA
  );

  await leaveRoom(clientB);

  await waitUntil(
    () => snapshotsA.some((rows) => includesNicknames(rows, ["Ramiro"]) && excludesNicknames(rows, ["Pedro"])),
    "A to refetch without B after DELETE"
  );

  assert(subscriptionA.eventCount >= 1, "A must receive B leave event.");
  assertEqual(subscriptionA.refetchCount, subscriptionA.eventCount, "A must refetch authoritatively for every lifecycle event.");
  results.push(["B sale -> A actualiza", "PASS", "DELETE room_participants disparo refetch y A dejo de ver a Pedro."]);

  await joinRoomByCode(clientB, roomCode);
  await waitUntil(
    () => snapshotsA.some((rows) => includesNicknames(rows, ["Ramiro", "Pedro"])),
    "A to refetch A+B after B rejoins"
  );

  const snapshotsB = [];
  const subscriptionB = await subscribeWithAuthoritativeRefetch(
    clientB,
    "B",
    roomId,
    snapshotsB
  );

  const clientOther = await signInAnonymously("Other");
  await createGroup(clientOther, "Familia smoke 4.5 ajena", "Ajena");
  const foreignSnapshots = [];
  const foreignSubscription = await subscribeWithAuthoritativeRefetch(
    clientOther,
    "foreign-filter",
    roomId,
    foreignSnapshots
  );

  await closeRoom(clientA);

  await waitUntil(
    () => snapshotsB.some((rows) => rows.length === 0),
    "B to refetch null after host close"
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));

  assert(subscriptionB.eventCount >= 1, "B must receive host close event.");
  assertEqual(subscriptionB.refetchCount, subscriptionB.eventCount, "B must refetch from RPC after host close.");
  assertEqual(foreignSubscription.eventCount, 0, "Foreign Group must not receive lifecycle events for Room A.");
  assertEqual(foreignSnapshots.length, 0, "Foreign Group must not refetch Room A lifecycle.");
  results.push(["host cierra -> B actualiza", "PASS", "UPDATE rooms -> closed disparo refetch y B quedo sin Room activa."]);
  results.push(["payload no autoritativo", "PASS", "El smoke ignora payloads y usa get_my_active_room() en cada evento."]);
  results.push(["aislamiento", "PASS", "Otro Group no recibio eventos utiles filtrando la Room ajena."]);

  const newRoomRowsA = await createRoom(clientA);
  const newRoomCodeA = newRoomRowsA[0].room_join_code;
  await joinRoomByCode(clientB, newRoomCodeA);
  const refreshedA = await getMyActiveRoomRows(clientA);
  const refreshedB = await getMyActiveRoomRows(clientB);
  assert(includesNicknames(refreshedA, ["Ramiro", "Pedro"]), "A must see B after reuse.");
  assert(includesNicknames(refreshedB, ["Ramiro", "Pedro"]), "B must rejoin after close.");
  results.push(["reutilizacion posterior", "PASS", "A crea nueva Room y B vuelve a unirse tras cierre."]);

  await clientA.removeChannel(subscriptionA.channel);
  await clientB.removeChannel(subscriptionB.channel);
  await clientOther.removeChannel(foreignSubscription.channel);

  assertEqual(clientA.getChannels().length, 0, "A must clean up Realtime channels.");
  assertEqual(clientB.getChannels().length, 0, "B must clean up Realtime channels.");
  assertEqual(clientOther.getChannels().length, 0, "Foreign client must clean up Realtime channels.");
  results.push(["cleanup", "PASS", "removeChannel dejo los clientes sin channels activos."]);

  console.table(results.map(([caseName, result, evidence]) => ({
    "Caso": caseName,
    "Resultado": result,
    "Evidencia": evidence
  })));
}

validate().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
