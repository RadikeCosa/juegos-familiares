import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
});
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]));
if (!env.DB_URL || !env.API_URL || !env.PUBLISHABLE_KEY ||
    new URL(env.DB_URL).hostname !== "127.0.0.1" ||
    new URL(env.API_URL).hostname !== "127.0.0.1") {
  throw new Error("This validator requires the project's local Supabase instance.");
}

function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function psql(sql) {
  return execFileSync("psql", [env.DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}
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
async function presenceAllowed(instance, topic) {
  return rpc(instance, "is_current_player_room_presence_participant", { target_topic: topic });
}

equal(psql("select has_function_privilege('anon', 'public.is_current_player_room_presence_participant(text)', 'EXECUTE')"), "f", "Anon cannot inspect Presence membership");
const host = await identity();
await markClientAsPlatformAdmin(host, psql, sqlString);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Increment 2 validation", player_nickname: "Host"
}))[0];
const first = await identity();
await rpc(first, "join_group_with_invitation", { invitation_code: group.invitation_code, player_nickname: "First" });
const second = await identity();
await rpc(second, "join_group_with_invitation", { invitation_code: group.invitation_code, player_nickname: "Second" });
const outsider = await identity();
await markClientAsPlatformAdmin(outsider, psql, sqlString);
await rpc(outsider, "create_group_with_admin_player", {
  group_name: "Tutti Increment 2 outsider", player_nickname: "Outsider"
});

const created = await rpc(host, "create_room", { requested_game_type: "tutti_frutti" });
const roomId = created[0].room_id;
const code = created[0].room_join_code;
await rpc(first, "join_room_by_code", { room_code: code, expected_game_type: "tutti_frutti" });
await rpc(second, "join_room_by_code", { room_code: code, expected_game_type: "tutti_frutti" });
const topic = `tutti-frutti-room-presence:${roomId}`;
equal(await presenceAllowed(host, topic), true, "Host can access Tutti Presence");
equal(await presenceAllowed(first, topic), true, "Member can access Tutti Presence");
equal(await presenceAllowed(outsider, topic), false, "Outsider cannot access Tutti Presence");
equal(await presenceAllowed(first, `impostor-room-presence:${roomId}`), false, "Tutti member cannot use Impostor topic");
equal(await presenceAllowed(first, `tutti-frutti-room-presence:${roomId.toUpperCase()}`), false, "Malformed topic is rejected");
equal((await rpc(first, "get_my_active_room")).length, 3, "Member recovers authoritative roster");
equal((await rpc(outsider, "get_my_active_room")).length, 0, "Outsider cannot discover Room");
await rejects(outsider, "close_room", undefined, "P0015");

const hostId = created.find((row) => row.participant_is_self).participant_player_id;
psql(`update public.room_participants set last_seen_at = now() - interval '5 minutes'
  where room_id = ${sqlString(roomId)}::uuid and player_id = ${sqlString(hostId)}::uuid`);
await Promise.allSettled([
  rpc(first, "reassign_room_host_if_stale"),
  rpc(second, "reassign_room_host_if_stale")
]);
const afterSuccession = await rpc(first, "get_my_active_room");
equal(afterSuccession.filter((row) => row.participant_is_host).length, 1, "Concurrent succession keeps one host");
equal(afterSuccession.find((row) => row.participant_is_host).participant_nickname, "First", "Successor selection is deterministic");
await rpc(host, "refresh_my_room_liveness");
equal((await rpc(host, "get_my_active_room")).find((row) => row.participant_is_host).participant_nickname, "First", "Returning host does not regain authority");
await rejects(host, "close_room", undefined, "P0016");

await rpc(second, "leave_room");
await rpc(second, "leave_room");
equal((await rpc(second, "get_my_active_room")).length, 0, "Repeated leave clears only member slot");
equal(await presenceAllowed(second, topic), false, "Departed member loses Presence access");
equal((await rpc(first, "get_my_active_room")).length, 2, "Other memberships remain");
await rpc(first, "close_room");
equal(psql(`select status from public.rooms where id = ${sqlString(roomId)}::uuid`), "closed", "Successor closed Room");
equal(psql(`select count(*) from public.player_active_room_slots where room_id = ${sqlString(roomId)}::uuid`), "0", "Close released all active slots");
equal(await presenceAllowed(host, topic), false, "Closed Room denies Presence");
await rejects(first, "close_room", undefined, "P0015");
equal(psql(`select status from public.rooms where id = ${sqlString(roomId)}::uuid`), "closed", "Repeated close leaves Room closed");

console.log("PASS: Tutti lobby membership, Presence isolation, recovery, deterministic succession, leave/close and slots.");
