import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
});
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map(match => [match[1], match[2]]));
if (!env.DB_URL || !env.API_URL || !env.PUBLISHABLE_KEY
  || new URL(env.DB_URL).hostname !== "127.0.0.1"
  || new URL(env.API_URL).hostname !== "127.0.0.1") {
  throw new Error("This validator requires the project's local Supabase instance.");
}

const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const psql = sql => execFileSync("psql", [env.DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
}).trim();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => assert(actual === expected,
  `${message}: expected ${expected}, got ${actual}`);
const client = () => createClient(env.API_URL, env.PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
});
async function identity() {
  const instance = client();
  const { data, error } = await instance.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in failed.");
  return { instance, userId: data.user.id };
}
async function rpc(person, name, args) {
  const { data, error } = await person.instance.rpc(name, args);
  if (error) throw error;
  return data;
}
function playerId(person) {
  return psql("select id from public.players where auth_user_id=" + quote(person.userId) + "::uuid");
}
function row(value) {
  return Array.isArray(value) ? value[0] : value;
}
function setLiveness(roomId, ids, interval) {
  psql("update public.room_participants set last_seen_at=now()-interval " + quote(interval)
    + " where room_id=" + quote(roomId) + "::uuid and player_id in ("
    + ids.map(id => quote(id) + "::uuid").join(",") + ")");
}
async function state(person, roomId) {
  const snapshot = await rpc(person, "get_tutti_frutti_game_state", { target_room_id: roomId });
  return JSON.stringify({
    sessionId: snapshot.sessionId,
    phase: snapshot.round.phase,
    roundId: snapshot.round.id,
    roundNumber: snapshot.round.number,
    letter: snapshot.round.letter,
    countdownEndsAt: snapshot.round.countdownEndsAt,
    lockedAt: snapshot.round.lockedAt,
    participants: snapshot.participants.map(item => item.playerId).sort()
  });
}

const [host, second, third] = await Promise.all([identity(), identity(), identity()]);
await markClientAsPlatformAdmin(host.instance, psql, quote);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Recovery 17 " + randomUUID().slice(0, 8), player_nickname: "Host"
}))[0];
for (const [person, nickname] of [[second, "Second"], [third, "Third"]]) {
  await rpc(person, "join_group_with_invitation", {
    invitation_code: group.invitation_code, player_nickname: nickname
  });
}
const room = (await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0];
for (const person of [second, third]) {
  await rpc(person, "join_room_by_code", {
    room_code: room.room_join_code, expected_game_type: "tutti_frutti"
  });
}
const ids = [host, second, third].map(playerId);
const started = await rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id });
const roundId = started.round.id;
psql("update public.tutti_frutti_letter_candidates set status='accepted' where round_id="
  + quote(roundId) + "::uuid and status='pending'; update public.tutti_frutti_rounds set phase='PLAYING' where id="
  + quote(roundId) + "::uuid");
for (let position = 1; position <= started.categories.length; position += 1) {
  await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id,
    target_category_position: position,
    target_answer_text: "Respuesta " + position
  });
}
const countdown = await rpc(host, "call_tutti_frutti", { target_room_id: room.room_id });
equal(countdown.round.phase, "FINAL_COUNTDOWN", "fixture enters the authoritative countdown");
const countdownBefore = await state(second, room.room_id);

// A liveness-valid frozen participant takes over the stale host during countdown.
setLiveness(room.room_id, [ids[0]], "120 seconds");
setLiveness(room.room_id, [ids[1], ids[2]], "0 seconds");
const firstSuccession = row(await rpc(second, "reassign_room_host_if_stale", {}));
equal(firstSuccession.host_changed, true, "eligible participant succeeds stale host during countdown");
equal(firstSuccession.current_host_player_id, ids[1], "deterministic first successor becomes host");
equal(psql("select host_player_id from public.rooms where id=" + quote(room.room_id) + "::uuid"),
  ids[1], "Room records the countdown successor");
equal(await state(second, room.room_id), countdownBefore, "countdown state survives host succession");

// A second succession during review proves phase and locked work survive too.
psql("update public.tutti_frutti_rounds set phase='REVIEWING', "
  + "countdown_started_at=statement_timestamp()-interval '46 seconds', "
  + "countdown_ends_at=statement_timestamp()-interval '1 second', locked_at=clock_timestamp() "
  + "where id=" + quote(roundId) + "::uuid");
const reviewBefore = await state(third, room.room_id);
setLiveness(room.room_id, [ids[1]], "120 seconds");
setLiveness(room.room_id, [ids[2]], "0 seconds");
const secondSuccession = row(await rpc(third, "reassign_room_host_if_stale", {}));
equal(secondSuccession.host_changed, true, "eligible participant succeeds stale host during review");
equal(secondSuccession.current_host_player_id, ids[2], "review successor becomes host");
equal(await state(third, room.room_id), reviewBefore, "review phase, deadline and lock survive host succession");

// Returning hosts remain ordinary roster members and cannot reclaim authority.
setLiveness(room.room_id, [ids[0], ids[2]], "0 seconds");
const returnedHostCheck = row(await rpc(host, "reassign_room_host_if_stale", {}));
equal(returnedHostCheck.host_changed, false, "returning former host cannot reclaim a live host role");
equal(returnedHostCheck.current_host_player_id, ids[2], "current host remains authoritative after former host returns");

// With every other roster participant stale, no liveness-valid successor exists.
setLiveness(room.room_id, ids, "120 seconds");
const noSuccessor = row(await rpc(second, "reassign_room_host_if_stale", {}));
equal(noSuccessor.host_changed, false, "no eligible successor leaves the host unchanged");
equal(noSuccessor.current_host_player_id, ids[2], "room keeps the existing host when nobody is eligible");
equal(psql("select host_player_id from public.rooms where id=" + quote(room.room_id) + "::uuid"),
  ids[2], "no-successor check does not mutate Room authority");

console.log("Tutti Frutti increment 17 local host recovery passed: countdown, review, former-host return, and no successor.");
