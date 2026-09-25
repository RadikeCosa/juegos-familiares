import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
  return execFileSync("psql", [env.DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
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
async function makeGroup(name, owner, members = []) {
  await markClientAsPlatformAdmin(owner, psql, sqlString);
  const group = (await rpc(owner, "create_group_with_admin_player", {
    group_name: name, player_nickname: "Player 1"
  }))[0];
  for (const [index, member] of members.entries()) {
    await rpc(member, "join_group_with_invitation", {
      invitation_code: group.invitation_code, player_nickname: "Player " + (index + 2)
    });
  }
  return group;
}
for (const table of ["tutti_frutti_answers", "tutti_frutti_answer_signals"]) {
  equal(psql("select relrowsecurity from pg_class where oid='public." + table + "'::regclass"), "t", table + " RLS is enabled");
}
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_answers','SELECT,INSERT,UPDATE,DELETE')"), "f", "answer rows have no direct client access");
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_answer_signals','SELECT')"), "t", "authenticated can read RLS-filtered invalidation signals");
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_answer_signals','INSERT,UPDATE,DELETE')"), "f", "clients cannot write invalidation signals");
equal(psql("select has_function_privilege('authenticated','public.get_tutti_frutti_my_answers(uuid)','EXECUTE')"), "t", "authenticated can read own answers through RPC");
equal(psql("select has_function_privilege('authenticated','public.save_tutti_frutti_answer(uuid,integer,text)','EXECUTE')"), "t", "authenticated can save own answer through RPC");
equal(psql("select has_function_privilege('authenticated','public.normalize_tutti_frutti_answer_v1(text)','EXECUTE')"), "f", "normalization helper is not an exposed client RPC");

const host = await identity();
const member = await identity();
const outsider = await identity();
const suffix = randomUUID().slice(0, 8);
await makeGroup("Tutti Countdown 10 " + suffix, host, [member]);
await makeGroup("Tutti Outsider 10 " + suffix, outsider);
const room = (await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0];
await rpc(member, "join_room_by_code", { room_code: room.room_join_code, expected_game_type: "tutti_frutti" });
const started = await rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id });
psql("update public.tutti_frutti_letter_candidates set status='accepted' where session_id="
  + sqlString(started.sessionId) + "::uuid and status='pending'");
psql("update public.tutti_frutti_rounds set phase='PLAYING' where session_id="
  + sqlString(started.sessionId) + "::uuid and round_number=1");
await rejects(host, "call_tutti_frutti", { target_room_id: room.room_id }, "P0044");
await rejects(outsider, "call_tutti_frutti", { target_room_id: room.room_id }, "P0032");
for (let position = 1; position <= 5; position++) {
  if (position === 5) {
    await rejects(host, "call_tutti_frutti", { target_room_id: room.room_id }, "P0044");
  }
  await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: position,
    target_answer_text: "Respuesta " + position
  });
}
const [first, simultaneous] = await Promise.all([
  rpc(host, "call_tutti_frutti", { target_room_id: room.room_id }),
  rpc(host, "call_tutti_frutti", { target_room_id: room.room_id })
]);
equal(first.round.phase, "FINAL_COUNTDOWN", "the first call starts the countdown");
equal(simultaneous.round.countdownEndsAt, first.round.countdownEndsAt,
  "concurrent calls keep the same deadline");
equal(first.round.calledByPlayerId, first.participants.find(x => x.nickname === "Player 1").playerId,
  "the authorized roster can see the first caller");
assert(Math.abs(Date.parse(first.round.countdownEndsAt) - Date.parse(first.serverNow) - 45000) < 2000,
  "the server fixes a 45-second deadline");
const repeat = await rpc(member, "call_tutti_frutti", { target_room_id: room.room_id });
equal(repeat.round.countdownEndsAt, first.round.countdownEndsAt, "later calls cannot extend deadline");
const privateRead = await rpc(member, "get_tutti_frutti_my_answers", { target_room_id: room.room_id });
assert(privateRead.answers.every(answer => answer.answerText === ""), "another player sees no answers");
await rpc(member, "save_tutti_frutti_answer", {
  target_room_id: room.room_id, target_category_position: 1, target_answer_text: "Durante cuenta"
});
psql("update public.tutti_frutti_rounds set countdown_started_at=statement_timestamp() - interval '44 seconds', "
  + "countdown_ends_at=statement_timestamp() + interval '1 second' where session_id="
  + sqlString(started.sessionId) + "::uuid and round_number=1");
const blocker = spawn("psql", [env.DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
  "begin; select 1 from public.rooms where id=" + sqlString(room.room_id)
    + "::uuid for update; select pg_sleep(2); commit;"], { stdio: ["ignore", "pipe", "pipe"] });
const blockerDone = new Promise((resolve, reject) => blocker.on("close", code => code === 0
  ? resolve() : reject(new Error("Room lock fixture failed"))));
await new Promise(resolve => setTimeout(resolve, 250));
const inFlightSave = member.rpc("save_tutti_frutti_answer", {
  target_room_id: room.room_id, target_category_position: 1, target_answer_text: "En vuelo"
});
const inFlightResult = await inFlightSave;
equal(inFlightResult.error?.code, "P0042", "a queued save is rejected after the deadline");
await blockerDone;
const confirmed = await rpc(member, "get_tutti_frutti_my_answers", { target_room_id: room.room_id });
equal(confirmed.answers[0].answerText, "Durante cuenta", "the rejected in-flight edit never replaces the confirmed answer");
await rejects(member, "save_tutti_frutti_answer", {
  target_room_id: room.room_id, target_category_position: 1, target_answer_text: "Demasiado tarde"
}, "P0042");
let locked = false;
for (let attempt = 0; attempt < 20; attempt++) {
  const phase = psql("select phase from public.tutti_frutti_rounds where session_id="
    + sqlString(started.sessionId) + "::uuid and round_number=1");
  if (phase === "REVIEWING") { locked = true; break; }
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert(locked, "cron locks an expired round without a client read");
const after = await rpc(host, "get_tutti_frutti_game_state", { target_room_id: room.room_id });
equal(after.round.phase, "REVIEWING", "authorized state reports review wait");
assert(after.round.lockedAt !== null, "lock timestamp is persisted");
equal(psql("select public.lock_expired_tutti_frutti_rounds()"), "0", "retry is idempotent");
console.log("Tutti Frutti increment 10 local countdown and privacy validation passed.");
