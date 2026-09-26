import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
});
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map(m => [m[1], m[2]]));
if (!env.DB_URL || !env.API_URL || !env.PUBLISHABLE_KEY
  || new URL(env.DB_URL).hostname !== "127.0.0.1" || new URL(env.API_URL).hostname !== "127.0.0.1") {
  throw new Error("This validator requires the project's local Supabase instance.");
}
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const psql = sql => execFileSync("psql", [env.DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
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
async function rejects(person, name, args, code) {
  const { data, error } = await person.instance.rpc(name, args);
  assert(data === null, `${name} must return no protected data on denial`);
  equal(error?.code, code, `${name} rejection`);
}
function completeRound(sessionId, roundId, callerId) {
  psql("update public.tutti_frutti_letter_candidates set status='accepted' where round_id=" + quote(roundId)
    + "::uuid and status='pending'; update public.tutti_frutti_rounds set phase='RESULT', "
    + "countdown_started_at=statement_timestamp()-interval '46 seconds', "
    + "countdown_ends_at=statement_timestamp()-interval '1 second', called_by_player_id=" + quote(callerId)
    + "::uuid, locked_at=clock_timestamp(), scored_at=clock_timestamp() where id=" + quote(roundId)
    + "::uuid and session_id=" + quote(sessionId) + "::uuid");
}

const [host, member, outsider] = await Promise.all([identity(), identity(), identity()]);
await markClientAsPlatformAdmin(host.instance, psql, quote);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Next 14 " + randomUUID().slice(0, 8), player_nickname: "Host"
}))[0];
await rpc(member, "join_group_with_invitation", {
  invitation_code: group.invitation_code, player_nickname: "Member"
});
await markClientAsPlatformAdmin(outsider.instance, psql, quote);
await rpc(outsider, "create_group_with_admin_player", {
  group_name: "Tutti Next outsider " + randomUUID().slice(0, 8), player_nickname: "Outsider"
});
const room = (await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0];
await rpc(member, "join_room_by_code", { room_code: room.room_join_code, expected_game_type: "tutti_frutti" });
const started = await rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id });
const hostId = psql("select id from public.players where auth_user_id=" + quote(host.userId) + "::uuid");
const baseId = started.round.id;
psql("update public.tutti_frutti_letter_candidates set status='accepted' where round_id=" + quote(baseId) + "::uuid and status='pending'; "
  + "update public.tutti_frutti_rounds set phase='PLAYING' where id=" + quote(baseId) + "::uuid");
completeRound(started.sessionId, baseId, hostId);
const args = { target_room_id: room.room_id, target_base_round_id: baseId };
await rejects(member, "advance_tutti_frutti_round", args, "P0053");
await rejects(outsider, "advance_tutti_frutti_round", args, "P0032");
await rejects(outsider, "get_tutti_frutti_round_result", { target_room_id: room.room_id, target_round_id: baseId }, "P0032");
await rejects(host, "advance_tutti_frutti_round", { ...args, target_base_round_id: randomUUID() }, "P0038");
equal(psql("select has_function_privilege('anon','public.advance_tutti_frutti_round(uuid,uuid)','EXECUTE')"),
  "f", "anonymous cannot advance rounds");
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_rounds','INSERT,UPDATE,DELETE')"),
  "f", "clients cannot write round rows directly");

// Exhaustion must not leave a partially created successor.
const originalPool = psql("select letter_pool::text from public.tutti_frutti_sessions where id=" + quote(started.sessionId) + "::uuid");
psql("update public.tutti_frutti_sessions set letter_pool='{}' where id=" + quote(started.sessionId) + "::uuid");
await rejects(host, "advance_tutti_frutti_round", args, "P0051");
equal(psql("select count(*) from public.tutti_frutti_rounds where session_id=" + quote(started.sessionId) + "::uuid"),
  "1", "pool exhaustion creates no partial round");
psql("update public.tutti_frutti_sessions set letter_pool=" + quote(originalPool) + "::text[] where id=" + quote(started.sessionId) + "::uuid");

const [first, raced] = await Promise.all([
  rpc(host, "advance_tutti_frutti_round", args), rpc(host, "advance_tutti_frutti_round", args)
]);
const stable = value => JSON.stringify({ ...value, serverNow: "ignored" });
equal(stable(first), stable(raced), "simultaneous calls return one successor state");
equal(first.round.number, 2, "the successor number is consecutive");
equal(first.round.phase, "LETTER_PENDING", "the successor waits for its letter decision");
const retry = await rpc(host, "advance_tutti_frutti_round", args);
equal(stable(first), stable(retry), "an immediate retry returns the saved successor");
equal(psql("select count(*) from public.tutti_frutti_rounds where session_id=" + quote(started.sessionId) + "::uuid"),
  "2", "concurrent advancement creates one round");
const oldLetters = psql("select string_agg(letter, ',') from public.tutti_frutti_letter_candidates where session_id=" + quote(started.sessionId) + "::uuid");
equal(new Set(oldLetters.split(",")).size, 2, "letters across rounds are unique");
equal(first.categories.map(c => c.label).join(","), started.categories.map(c => c.label).join(","), "category snapshot is unchanged");
equal(first.participants.map(p => p.playerId).sort().join(","),
  started.participants.map(p => p.playerId).sort().join(","), "frozen roster is unchanged");
const hostSignal = await member.instance.from("tutti_frutti_review_signals").select("round_id")
  .eq("session_id", started.sessionId).eq("round_id", baseId);
assert(!hostSignal.error && hostSignal.data.length === 1, "roster can read the reused advancement invalidation signal");
const outsiderSignal = await outsider.instance.from("tutti_frutti_review_signals").select("round_id")
  .eq("session_id", started.sessionId);
assert(!outsiderSignal.error && outsiderSignal.data.length === 0, "non-roster cannot read the advancement signal");

const recovered = await rpc(member, "get_tutti_frutti_game_state", { target_room_id: room.room_id });
equal(recovered.round.number, 2, "authorized game-state recovery reads round two");
const candidateId = recovered.round.letterDecision.candidateId;
const vote1 = await rpc(host, "submit_tutti_frutti_letter_skip_vote", {
  target_room_id: room.room_id, target_candidate_id: candidateId
});
equal(vote1.round.number, 2, "a skip vote reads and acts on round two");
const vote2 = await rpc(member, "submit_tutti_frutti_letter_skip_vote", {
  target_room_id: room.room_id, target_candidate_id: candidateId
});
equal(vote2.round.number, 2, "the second skip vote remains scoped to round two");
const round2 = psql("select id from public.tutti_frutti_rounds where session_id=" + quote(started.sessionId) + "::uuid and round_number=2");
// A skipped candidate is replaced in the same round; complete whichever candidate is current.
psql("insert into public.tutti_frutti_answers(session_id, round_id, player_id, category_position, original_text, normalized_value, awarded_points) "
  + "values (" + quote(started.sessionId) + "::uuid," + quote(round2) + "::uuid," + quote(hostId)
  + "::uuid,1,'Aardvark','aardvark',10)");
completeRound(started.sessionId, round2, hostId);
const historicalBefore = await rpc(host, "get_tutti_frutti_round_result", {
  target_room_id: room.room_id, target_round_id: baseId
});
const hostBefore = historicalBefore.totals.find(t => t.playerId === hostId).totalPoints;
// Round two has a score; verify that round one's cumulative total stays frozen.
const historicalAfter = await rpc(host, "get_tutti_frutti_round_result", {
  target_room_id: room.room_id, target_round_id: baseId
});
equal(historicalAfter.totals.find(t => t.playerId === hostId).totalPoints, hostBefore,
  "round one's cumulative result excludes later rounds");
const secondResult = await rpc(host, "get_tutti_frutti_round_result", {
  target_room_id: room.room_id, target_round_id: round2
});
equal(secondResult.totals.find(t => t.playerId === hostId).totalPoints, hostBefore + 10,
  "round two cumulative includes its own points");
await rejects(host, "advance_tutti_frutti_round", args, "P0054");

let currentId = round2;
let currentNumber = 2;
while (currentNumber < started.roundCount) {
  const expectedNumber = currentNumber + 1;
  const next = await rpc(host, "advance_tutti_frutti_round", {
    target_room_id: room.room_id, target_base_round_id: currentId
  });
  currentId = next.round.id;
  currentNumber = next.round.number;
  equal(currentNumber, expectedNumber, "round numbering stays consecutive through configured count");
  if (currentNumber < started.roundCount) completeRound(started.sessionId, currentId, hostId);
}
const finalId = currentId;
completeRound(started.sessionId, finalId, hostId);
await rejects(host, "advance_tutti_frutti_round", {
  target_room_id: room.room_id, target_base_round_id: finalId
}, "P0052");
console.log("Tutti Frutti increment 14 local advancement, idempotency, current-round recovery, letter uniqueness, and privacy validation passed.");
