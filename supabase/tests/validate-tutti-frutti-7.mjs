import { execFileSync } from "node:child_process";
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

function sqlString(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function psql(sql) {
  return execFileSync("psql", [env.DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message + ": expected " + expected + ", received " + actual);
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
  equal(error?.code, code, name + " must reject with " + code);
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

for (const table of [
  "tutti_frutti_sessions",
  "tutti_frutti_session_categories",
  "tutti_frutti_rounds",
  "tutti_frutti_letter_candidates"
]) {
  equal(psql("select relrowsecurity from pg_class where oid = 'public." + table + "'::regclass"), "t", table + " RLS is enabled");
  equal(psql("select has_table_privilege('authenticated','public." + table + "','SELECT,INSERT,UPDATE,DELETE')"), "f", table + " direct access is closed");
}
equal(psql("select has_table_privilege('authenticated','public.room_session_participants','SELECT')"), "t", "frozen roster has RLS-scoped read");
equal(psql("select has_function_privilege('authenticated','public.start_tutti_frutti_session(uuid)','EXECUTE')"), "t", "authenticated can start Tutti Frutti");
equal(psql("select has_function_privilege('authenticated','public.get_tutti_frutti_game_state(uuid)','EXECUTE')"), "t", "authenticated can reconstruct Tutti Frutti state");

const host = await identity();
await markClientAsPlatformAdmin(host, psql, sqlString);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Increment 7 validation", player_nickname: "Host"
}))[0];
const hostUser = (await host.auth.getUser()).data.user;
const member = await identity();
await rpc(member, "join_group_with_invitation", { invitation_code: group.invitation_code, player_nickname: "Member" });
const memberUser = (await member.auth.getUser()).data.user;
const late = await identity();
await rpc(late, "join_group_with_invitation", { invitation_code: group.invitation_code, player_nickname: "Late" });
const outsider = await identity();
await markClientAsPlatformAdmin(outsider, psql, sqlString);
await rpc(outsider, "create_group_with_admin_player", { group_name: "Tutti Increment 7 outsider", player_nickname: "Outsider" });

const solo = await identity();
await markClientAsPlatformAdmin(solo, psql, sqlString);
await rpc(solo, "create_group_with_admin_player", { group_name: "Tutti Increment 7 solo", player_nickname: "Solo" });
const soloRoom = (await rpc(solo, "create_room", { requested_game_type: "tutti_frutti" }))[0];
await rejects(solo, "start_tutti_frutti_session", { target_room_id: soloRoom.room_id }, "P0037");
equal(psql("select count(*) from public.room_sessions where room_id=" + sqlString(soloRoom.room_id) + "::uuid"), "0", "failed solo start creates no session");
psql("update public.rooms set status='closed' where id=" + sqlString(soloRoom.room_id) + "::uuid");
await rejects(solo, "start_tutti_frutti_session", { target_room_id: soloRoom.room_id }, "P0034");
equal(psql("select count(*) from public.room_sessions where room_id=" + sqlString(soloRoom.room_id) + "::uuid"), "0", "start outside lobby creates no orphan session");

const created = (await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0];
const roomId = created.room_id;
await rpc(member, "join_room_by_code", { room_code: created.room_join_code, expected_game_type: "tutti_frutti" });
const defaults = await rpc(host, "get_tutti_frutti_room_setup", { target_room_id: roomId });
equal(defaults.updatedAt, null, "defaults remain unpersisted");
equal(defaults.configuration.roundCount, 5, "default round count is five");
equal(psql("select count(*) from public.tutti_frutti_room_setup where room_id=" + sqlString(roomId) + "::uuid"), "0", "reading defaults creates no setup row");
await rejects(member, "start_tutti_frutti_session", { target_room_id: roomId }, "P0033");
await rejects(outsider, "get_tutti_frutti_game_state", { target_room_id: roomId }, "P0032");
await rejects(host, "get_tutti_frutti_game_state", { target_room_id: roomId }, "P0032");

let subscribedResolve;
const subscribed = new Promise((resolve) => { subscribedResolve = resolve; });
let postgresReadyResolve;
const postgresReady = new Promise((resolve) => { postgresReadyResolve = resolve; });
let roomEventResolve;
const roomEvent = new Promise((resolve) => { roomEventResolve = resolve; });
const channel = member.channel("increment-7-room:" + roomId)
  .on("system", {}, (payload) => {
    if (payload?.extension === "postgres_changes" && payload?.status === "ok") postgresReadyResolve();
  })
  .on("postgres_changes", {
    event: "UPDATE", schema: "public", table: "rooms", filter: "id=eq." + roomId
  }, (payload) => roomEventResolve(payload))
  .subscribe((channelStatus) => { if (channelStatus === "SUBSCRIBED") subscribedResolve(); });

try {
  await waitFor(subscribed, "Member did not subscribe to the Room realtime channel.");
  await waitFor(postgresReady, "Member did not finish authorizing the Room listener.");
  const [first, concurrentRetry] = await Promise.all([
    rpc(host, "start_tutti_frutti_session", { target_room_id: roomId }),
    rpc(host, "start_tutti_frutti_session", { target_room_id: roomId })
  ]);
  equal(first.sessionId, concurrentRetry.sessionId, "concurrent starts converge on one session");
  equal(first.round.letter, concurrentRetry.round.letter, "concurrent starts converge on one letter");
  equal(first.round.phase, "LETTER_PENDING", "first round starts with letter pending");
  equal(first.round.number, 1, "first round number is one");
  equal(first.roundCount, 5, "start snapshots the default round count");
  equal(first.categories.length, 5, "start snapshots default categories");
  assert(/^[A-Z]$/.test(first.round.letter), "candidate is one uppercase basic Latin letter");
  assert(!"KQWXYZ".includes(first.round.letter), "candidate excludes difficult pool letters");
  equal(first.participants.length, 2, "start freezes the Room roster");
  const hostPlayerId = psql("select id from public.players where auth_user_id=" + sqlString(hostUser.id) + "::uuid");
  equal(first.startedByPlayerId, hostPlayerId, "initiating host is recorded");
  equal(psql("select count(*) from public.room_sessions where room_id=" + sqlString(roomId) + "::uuid and finished_at is null"), "1", "one active shared session exists");
  equal(psql("select count(*) from public.tutti_frutti_rounds where session_id=" + sqlString(first.sessionId) + "::uuid"), "1", "one first round exists");
  equal(psql("select count(*) from public.tutti_frutti_letter_candidates where session_id=" + sqlString(first.sessionId) + "::uuid and status='pending'"), "1", "one candidate exists");
  await waitFor(roomEvent, "Member did not receive the Room start invalidation.");

  const memberState = await rpc(member, "get_tutti_frutti_game_state", { target_room_id: roomId });
  equal(memberState.sessionId, first.sessionId, "member reads the same session after invalidation");
  equal(memberState.round.letter, first.round.letter, "member reads the same candidate letter");
  const retry = await rpc(host, "start_tutti_frutti_session", { target_room_id: roomId });
  equal(retry.sessionId, first.sessionId, "host retry returns the same session");
  equal(retry.round.letter, first.round.letter, "host retry does not redraw the letter");
  await rejects(member, "start_tutti_frutti_session", { target_room_id: roomId }, "P0033");
  await rejects(late, "start_tutti_frutti_session", { target_room_id: roomId }, "P0032");

  const { data: frozenRoster, error: rosterError } = await member.from("room_session_participants").select("player_id").eq("session_id", first.sessionId);
  if (rosterError) throw rosterError;
  equal(frozenRoster?.length ?? 0, 2, "authorized session member can read the frozen roster");
  const { data: outsiderRoster, error: outsiderRosterError } = await outsider.from("room_session_participants").select("player_id").eq("session_id", first.sessionId);
  if (outsiderRosterError) throw outsiderRosterError;
  equal(outsiderRoster?.length ?? 0, 0, "RLS hides the frozen roster from outsiders");
  const { error: privateTableError } = await member.from("tutti_frutti_sessions").select("id").eq("id", first.sessionId);
  equal(privateTableError?.code, "42501", "game session rows are available only through RPC");

  psql("delete from public.room_participants where room_id=" + sqlString(roomId) + "::uuid and player_id=(select id from public.players where auth_user_id=" + sqlString(memberUser.id) + "::uuid)");
  await rejects(member, "start_tutti_frutti_session", { target_room_id: roomId }, "P0033");
  const afterRosterChange = await rpc(host, "start_tutti_frutti_session", { target_room_id: roomId });
  equal(afterRosterChange.sessionId, first.sessionId, "retry after Room roster drift returns existing session");
  equal(afterRosterChange.participants.length, 2, "retry does not refreeze the changed Room roster");
  equal(psql("select count(*) from public.room_participants where room_id=" + sqlString(roomId) + "::uuid"), "1", "Room roster changes after start");

  const memberAfterLobbyDeparture = await rpc(member, "get_tutti_frutti_game_state", { target_room_id: roomId });
  equal(memberAfterLobbyDeparture.sessionId, first.sessionId, "frozen participant keeps access after mutable lobby membership is removed");
  const { error: directWriteError } = await member.from("room_session_participants").delete().eq("session_id", first.sessionId);
  equal(directWriteError?.code, "42501", "clients cannot alter the frozen roster");
} finally {
  await member.removeChannel(channel);
  await Promise.all([host, member, late, outsider, solo].map((instance) => instance.realtime.disconnect()));
}

console.log("PASS: Tutti Frutti Increment 7 defaults, authorization, atomic concurrent start, snapshot and recovery.");
