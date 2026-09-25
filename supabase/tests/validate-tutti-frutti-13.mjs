import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
});
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map(match => [match[1], match[2]]));
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

const players = [await identity(), await identity(), await identity(), await identity()];
const host = players[0];
await markClientAsPlatformAdmin(host.instance, psql, quote);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Score 13 " + randomUUID().slice(0, 8), player_nickname: "Player 1"
}))[0];
for (const [index, person] of players.slice(1).entries()) {
  await rpc(person, "join_group_with_invitation", {
    invitation_code: group.invitation_code, player_nickname: `Player ${index + 2}`
  });
}
const room = (await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0];
for (const person of players.slice(1)) {
  await rpc(person, "join_room_by_code", { room_code: room.room_join_code, expected_game_type: "tutti_frutti" });
}
const started = await rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id });
const ids = players.map(person => psql("select id from public.players where auth_user_id=" + quote(person.userId) + "::uuid"));
psql("update public.tutti_frutti_letter_candidates set status='accepted' where session_id="
  + quote(started.sessionId) + "::uuid and status='pending'; update public.tutti_frutti_rounds "
  + "set phase='PLAYING' where session_id=" + quote(started.sessionId) + "::uuid and round_number=1;");
for (let index = 0; index < players.length; index++) {
  await rpc(players[index], "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: `initial-${index}`
  });
}
for (const person of players.slice(0, 2)) {
  await rpc(person, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 2, target_answer_text: "Gato"
  });
}
await rpc(players[3], "save_tutti_frutti_answer", {
  target_room_id: room.room_id, target_category_position: 3, target_answer_text: "   "
});
const roundId = psql("select id from public.tutti_frutti_rounds where session_id="
  + quote(started.sessionId) + "::uuid and round_number=1");
psql("update public.tutti_frutti_answers set original_text='Mono', normalized_value='mono' where round_id="
  + quote(roundId) + "::uuid and player_id=" + quote(ids[0]) + "::uuid and category_position=1; "
  + "update public.tutti_frutti_answers set original_text='mono', normalized_value='mono' where round_id="
  + "(select id from public.tutti_frutti_rounds where session_id=" + quote(started.sessionId)
  + "::uuid and round_number=1) and player_id=" + quote(ids[1]) + "::uuid and category_position=1; "
  + "update public.tutti_frutti_answers set original_text='Mamut', normalized_value='mamut' where round_id="
  + "(select id from public.tutti_frutti_rounds where session_id=" + quote(started.sessionId)
  + "::uuid and round_number=1) and player_id=" + quote(ids[2]) + "::uuid and category_position=1; "
  + "delete from public.tutti_frutti_answers where round_id=(select id from public.tutti_frutti_rounds where session_id="
  + quote(started.sessionId) + "::uuid and round_number=1) and player_id=" + quote(ids[3]) + "::uuid and category_position=1; "
  + "update public.tutti_frutti_rounds set phase='REVIEWING', countdown_started_at=statement_timestamp()-interval '46 seconds', "
  + "countdown_ends_at=statement_timestamp()-interval '1 second', called_by_player_id=" + quote(ids[0])
  + "::uuid, locked_at=clock_timestamp() where session_id=" + quote(started.sessionId) + "::uuid and round_number=1");
for (const table of ["tutti_frutti_answers", "tutti_frutti_rounds"]) {
  equal(psql(`select has_table_privilege('authenticated','public.${table}','INSERT,UPDATE,DELETE')`),
    "f", `${table} direct writes are closed`);
}
equal(psql("select has_function_privilege('authenticated','public.score_tutti_frutti_round(uuid,uuid)','EXECUTE')"),
  "t", "authenticated can score through the guarded RPC");
equal(psql("select has_function_privilege('anon','public.score_tutti_frutti_round(uuid,uuid)','EXECUTE')"),
  "f", "anonymous cannot score");
await psql("do $check$ begin update public.tutti_frutti_answers set awarded_points=7 where round_id="
  + quote(roundId) + "::uuid and player_id=" + quote(ids[0]) + "::uuid and category_position=2; "
  + "raise exception 'Expected point CHECK to reject 7'; exception when check_violation then null; end $check$");

const outsider = await identity();
await markClientAsPlatformAdmin(outsider.instance, psql, quote);
await rpc(outsider, "create_group_with_admin_player", {
  group_name: "Tutti Score Outsider " + randomUUID().slice(0, 8), player_nickname: "Outsider"
});
const outsiderRoom = (await rpc(outsider, "create_room", {}))[0];
await rejects(outsider, "get_tutti_frutti_round_result", { target_room_id: room.room_id, target_round_id: null }, "P0032");
await rejects(outsider, "score_tutti_frutti_round", { target_room_id: room.room_id, target_round_id: roundId }, "P0032");
await rejects(players[1], "score_tutti_frutti_round", { target_room_id: room.room_id, target_round_id: roundId }, "P0033");
await rejects(host, "score_tutti_frutti_round", { target_room_id: outsiderRoom.room_id, target_round_id: roundId }, "P0032");

psql("update public.tutti_frutti_rounds set phase='PLAYING' where id=" + quote(roundId) + "::uuid");
await rejects(host, "score_tutti_frutti_round", { target_room_id: room.room_id, target_round_id: roundId }, "P0042");
psql("update public.tutti_frutti_rounds set phase='REVIEWING' where id=" + quote(roundId) + "::uuid");
const challenge = await rpc(host, "open_tutti_frutti_challenge", {
  target_room_id: room.room_id, target_answer_player_id: ids[1], target_category_position: 1
});
await rejects(host, "score_tutti_frutti_round", { target_room_id: room.room_id, target_round_id: roundId }, "P0049");
const invalidated = await rpc(players[2], "vote_tutti_frutti_challenge", {
  target_room_id: room.room_id, target_challenge_id: challenge.challengeId, target_choice: "INVALID"
});
equal(invalidated.status, "RESOLVED_INVALID", "a strict invalid majority resolves before scoring");

const args = { target_room_id: room.room_id, target_round_id: roundId };
const [scoredA, scoredB] = await Promise.all([
  rpc(host, "score_tutti_frutti_round", args), rpc(host, "score_tutti_frutti_round", args)
]);
const stable = value => JSON.stringify({ ...value, serverNow: "ignored" });
equal(stable(scoredA), stable(scoredB), "concurrent scoring calls return one immutable result");
const retry = await rpc(host, "score_tutti_frutti_round", args);
equal(stable(retry), stable(scoredA), "a later retry returns the same result snapshot");
equal(retry.phase, "RESULT", "the round enters RESULT");
equal(psql("select scored_at is not null from public.tutti_frutti_rounds where id=" + quote(roundId) + "::uuid"),
  "t", "the round records its scoring time");

const result = await rpc(players[3], "get_tutti_frutti_round_result", { target_room_id: room.room_id, target_round_id: null });
const entries = (position) => result.categories.find(category => category.position === position).entries;
const entry = (position, id) => entries(position).find(item => item.playerId === id);
equal(entry(1, ids[0]).points, 10, "the valid answer left after invalidation becomes unique");
equal(entry(1, ids[1]).points, 0, "the invalidated duplicate scores zero");
equal(entry(1, ids[2]).points, 10, "a unique valid answer scores ten");
equal(entry(1, ids[3]).points, 0, "a missing answer remains visible with zero points");
equal(entry(1, ids[3]).answerText, "", "a missing answer is represented as empty text");
equal(entry(2, ids[0]).points, 5, "the first valid duplicate scores five");
equal(entry(2, ids[1]).points, 5, "the second valid duplicate scores five");
equal(entry(3, ids[3]).points, 0, "an explicitly empty answer scores zero");
equal(result.totals.find(total => total.playerId === ids[0]).totalPoints, 15, "round and cumulative totals are derived");
equal(result.totals.length, players.length, "the frozen roster is complete in the result");

const rosterSignal = await players[3].instance.from("tutti_frutti_review_signals").select("round_id")
  .eq("session_id", started.sessionId).eq("round_id", roundId);
assert(!rosterSignal.error && rosterSignal.data.length === 1, "frozen roster can observe RESULT invalidation");
const outsiderSignal = await outsider.instance.from("tutti_frutti_review_signals").select("round_id")
  .eq("session_id", started.sessionId);
assert(!outsiderSignal.error && outsiderSignal.data.length === 0, "outsider cannot observe the result signal");

await psql("do $immutable$ begin update public.tutti_frutti_answers set original_text='changed' where round_id="
  + quote(roundId) + "::uuid and player_id=" + quote(ids[0]) + "::uuid and category_position=1; "
  + "raise exception 'Expected scored answer immutability'; exception when sqlstate 'P0050' then null; end $immutable$");
await psql("do $immutable$ begin update public.tutti_frutti_rounds set phase='REVIEWING' where id="
  + quote(roundId) + "::uuid; raise exception 'Expected scored round immutability'; "
  + "exception when sqlstate 'P0050' then null; end $immutable$");
console.log("Tutti Frutti increment 13 local scoring, concurrency, privacy, and immutability validation passed.");
