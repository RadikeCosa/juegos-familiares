import { execFileSync, spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
});
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]));
if (!env.DB_URL || !env.API_URL || !env.PUBLISHABLE_KEY
  || new URL(env.DB_URL).hostname !== "127.0.0.1"
  || new URL(env.API_URL).hostname !== "127.0.0.1") {
  throw new Error("This validator requires the project's local Supabase instance.");
}

function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function psql(sql) {
  return execFileSync("psql", [env.DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function psqlAsync(sql, startedMarker) {
  let stdout = "";
  let stderr = "";
  let resolveStarted;
  let rejectStarted;
  const started = new Promise((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });
  const child = spawn("psql", [env.DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  const done = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes(startedMarker)) resolveStarted();
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => { rejectStarted(error); reject(error); });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const error = new Error(stderr || `psql exited with status ${code}`);
        rejectStarted(error);
        reject(error);
      }
    });
  });
  return { started, done };
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function client() {
  return createClient(env.API_URL, env.PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  });
}
async function identity() {
  const instance = client();
  const { data, error } = await instance.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in failed.");
  return instance;
}
async function rpc(instance, name, args) {
  const { data, error } = await instance.rpc(name, args);
  if (error) throw error;
  return data;
}
async function rejects(instance, name, args, code) {
  const { error } = await instance.rpc(name, args);
  equal(error?.code, code, `${name} must reject with ${code}`);
}
async function waitFor(promise, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), 8_000); })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

equal(psql("select relrowsecurity from pg_class where oid = 'public.tutti_frutti_room_setup'::regclass"), "t", "setup RLS is enabled");
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_room_setup','SELECT')"), "t", "members can read setup under RLS");
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_room_setup','INSERT,UPDATE,DELETE')"), "f", "clients cannot write setup directly");
equal(psql("select has_function_privilege('authenticated','public.get_tutti_frutti_room_setup(uuid)','EXECUTE')"), "t", "authenticated can read through RPC");
equal(psql("select has_function_privilege('authenticated','public.save_tutti_frutti_room_setup(uuid,jsonb)','EXECUTE')"), "t", "authenticated can save through RPC");
equal(psql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tutti_frutti_room_setup'"), "1", "setup changes are published to Realtime");

const host = await identity();
await markClientAsPlatformAdmin(host, psql, sqlString);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Increment 6 validation", player_nickname: "Host"
}))[0];
const member = await identity();
await rpc(member, "join_group_with_invitation", { invitation_code: group.invitation_code, player_nickname: "Member" });
const outsider = await identity();
await markClientAsPlatformAdmin(outsider, psql, sqlString);
await rpc(outsider, "create_group_with_admin_player", { group_name: "Tutti Increment 6 outsider", player_nickname: "Outsider" });

const created = await rpc(host, "create_room", { requested_game_type: "tutti_frutti" });
const roomId = created[0].room_id;
await rpc(member, "join_room_by_code", { room_code: created[0].room_join_code, expected_game_type: "tutti_frutti" });
const args = { target_room_id: roomId };
const defaults = await rpc(host, "get_tutti_frutti_room_setup", args);
equal(defaults.configuration.roundCount, 5, "defaults suggest five rounds");
equal(defaults.configuration.categories.length, 5, "defaults suggest five categories");
equal(defaults.updatedAt, null, "defaults have not been persisted");
equal(psql(`select count(*) from public.tutti_frutti_room_setup where room_id=${sqlString(roomId)}::uuid`), "0", "reading defaults creates no setup row");
equal((await rpc(member, "get_tutti_frutti_room_setup", args)).updatedAt, null, "members receive the same unsaved defaults");
await rejects(member, "save_tutti_frutti_room_setup", { ...args, requested_configuration: defaults.configuration }, "P0033");
await rejects(outsider, "get_tutti_frutti_room_setup", args, "P0032");

const invalidDuplicate = {
  version: 1, roundCount: 3,
  categories: [
    { kind: "preset", key: "name" },
    { kind: "preset", key: "animal" },
    { kind: "preset", key: "food" },
    { kind: "custom", label: " CIUDAD " }
  ]
};
await rejects(host, "save_tutti_frutti_room_setup", { ...args, requested_configuration: invalidDuplicate }, "P0036");
const invalidName = {
  version: 1, roundCount: 3,
  categories: [
    { kind: "preset", key: "name" },
    { kind: "preset", key: "animal" },
    { kind: "custom", label: "   " }
  ]
};
await rejects(host, "save_tutti_frutti_room_setup", { ...args, requested_configuration: invalidName }, "P0035");
await rejects(host, "save_tutti_frutti_room_setup", {
  ...args,
  requested_configuration: {
    version: 1, roundCount: 3,
    categories: [
      { kind: "preset", key: "name" }, { kind: "preset", key: "animal" },
      { kind: "custom", label: "x".repeat(41) }
    ]
  }
}, "P0035");

let realtimeResolve;
const realtimeEvent = new Promise((resolve) => { realtimeResolve = resolve; });
let subscribeResolve;
const subscribed = new Promise((resolve) => { subscribeResolve = resolve; });
let postgresReadyResolve;
const postgresReady = new Promise((resolve) => { postgresReadyResolve = resolve; });
const channel = member.channel(`increment-6-setup:${roomId}`)
  .on("system", {}, (payload) => {
    if (payload?.extension === "postgres_changes" && payload?.status === "ok") postgresReadyResolve();
  })
  .on("postgres_changes", {
    event: "INSERT", schema: "public", table: "tutti_frutti_room_setup", filter: `room_id=eq.${roomId}`
  }, (payload) => realtimeResolve(payload))
  .subscribe((channelStatus) => { if (channelStatus === "SUBSCRIBED") subscribeResolve(); });

try {
  await waitFor(subscribed, "Member did not subscribe to local Realtime.");
  await waitFor(postgresReady, "Member did not finish authorizing the Postgres Changes listener.");
  const valid = {
    version: 1, roundCount: 5,
    categories: [
      { kind: "preset", key: "name" },
      { kind: "preset", key: "animal" },
      { kind: "preset", key: "food" },
      { kind: "custom", label: "  Cafe\u0301 favorito?  " }
    ]
  };
  const saved = await rpc(host, "save_tutti_frutti_room_setup", { ...args, requested_configuration: valid });
  equal(saved.configuration.categories[3].label, "Café favorito?", "custom label is trimmed and normalized to NFC");
  assert(saved.updatedAt, "saving a setup returns its timestamp");
  await waitFor(realtimeEvent, "Room member did not receive the config invalidation.");

  const memberRead = await rpc(member, "get_tutti_frutti_room_setup", args);
  equal(memberRead.configuration.categories[3].label, "Café favorito?", "member read sees the saved draft");
  const { data: visibleRows, error: visibleError } = await member.from("tutti_frutti_room_setup").select("room_id, configuration").eq("room_id", roomId);
  if (visibleError) throw visibleError;
  equal(visibleRows?.length ?? 0, 1, "members can read their Room setup row for Realtime");
  const { data: outsiderRows, error: outsiderReadError } = await outsider.from("tutti_frutti_room_setup").select("room_id").eq("room_id", roomId);
  if (outsiderReadError) throw outsiderReadError;
  equal(outsiderRows?.length ?? 0, 0, "RLS hides setup from outsiders");
  const { error: directWriteError } = await member.from("tutti_frutti_room_setup").update({ configuration: defaults.configuration }).eq("room_id", roomId);
  equal(directWriteError?.code, "42501", "member cannot write the setup table directly");

  const concurrentA = {
    version: 1, roundCount: 3,
    categories: [
      { kind: "preset", key: "name" }, { kind: "preset", key: "animal" }, { kind: "preset", key: "place" },
      { kind: "custom", label: "Oficio familiar" }
    ]
  };
  const concurrentB = {
    version: 1, roundCount: 10,
    categories: [
      { kind: "preset", key: "name" }, { kind: "preset", key: "animal" }, { kind: "preset", key: "country" },
      { kind: "custom", label: "Comida imaginaria" }
    ]
  };
  await Promise.all([
    rpc(host, "save_tutti_frutti_room_setup", { ...args, requested_configuration: concurrentA }),
    rpc(host, "save_tutti_frutti_room_setup", { ...args, requested_configuration: concurrentB })
  ]);
  const afterConcurrent = await rpc(host, "get_tutti_frutti_room_setup", args);
  const isA = isDeepStrictEqual(afterConcurrent.configuration, concurrentA);
  const isB = isDeepStrictEqual(afterConcurrent.configuration, concurrentB);
  assert(isA || isB, "serialized writes leave one complete configuration, never a partial merge");

  const transition = psqlAsync(
    `begin;
     select 'increment6_room_lock_acquired' from public.rooms where id=${sqlString(roomId)}::uuid for update;
     select pg_sleep(0.5);
     update public.rooms set status='playing' where id=${sqlString(roomId)}::uuid;
     commit;`,
    "increment6_room_lock_acquired"
  );
  try {
    await waitFor(transition.started, "Room transition did not acquire its row lock.");
    await rejects(host, "save_tutti_frutti_room_setup", { ...args, requested_configuration: concurrentA }, "P0034");
    await transition.done;
    const duringPlay = await rpc(member, "get_tutti_frutti_room_setup", args);
    equal(duringPlay.configuration.roundCount, afterConcurrent.configuration.roundCount, "members can read frozen config while playing");
  } finally {
    psql(`update public.rooms set status='lobby' where id=${sqlString(roomId)}::uuid`);
  }

  const impostorRoom = await rpc(outsider, "create_room", { requested_game_type: "impostor" });
  await rejects(outsider, "get_tutti_frutti_room_setup", { target_room_id: impostorRoom[0].room_id }, "P0032");
} finally {
  await member.removeChannel(channel);
  await Promise.all([host, member, outsider].map((instance) => instance.realtime.disconnect()));
}

console.log("PASS: Tutti Frutti setup defaults, validation, RLS, host writes, Realtime and lobby freeze.");
