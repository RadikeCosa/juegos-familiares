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
function assert(condition, message) { if (!condition) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message + ": expected " + expected + ", received " + actual);
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
  return { instance, userId: data.user.id };
}
async function rpc(instance, name, args) {
  const { data, error } = await instance.rpc(name, args);
  if (error) throw error;
  return data;
}
async function rejects(instance, name, args, code) {
  const { data, error } = await instance.rpc(name, args);
  assert(data === null, name + " must not return protected data");
  equal(error?.code, code, name + " must reject with " + code);
}
function transaction(statements, marker) {
  const child = spawn("psql", [env.DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1",
    ...statements.flatMap(statement => ["-c", statement])], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  let signalReady;
  let signalFailed;
  const ready = new Promise((resolve, reject) => { signalReady = resolve; signalFailed = reject; });
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
    if (output.includes(marker)) signalReady();
  });
  const done = new Promise((resolve, reject) => child.on("close", (code) => {
    if (!output.includes(marker)) signalFailed(new Error("Fixture transaction did not reach " + marker));
    if (code === 0) resolve();
    else reject(new Error("Fixture transaction failed"));
  }));
  return { ready, done };
}

equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_answers','SELECT')"),
  "f", "answer rows remain private");
equal(psql("select has_function_privilege('authenticated','public.get_tutti_frutti_review(uuid)','EXECUTE')"),
  "t", "roster can call review RPC");
equal(psql("select has_function_privilege('anon','public.get_tutti_frutti_review(uuid)','EXECUTE')"),
  "f", "anonymous role cannot call review RPC");

const host = await identity();
const member = await identity();
const third = await identity();
const late = await identity();
const outsider = await identity();
const suffix = randomUUID().slice(0, 8);
await markClientAsPlatformAdmin(host.instance, psql, sqlString);
const group = (await rpc(host.instance, "create_group_with_admin_player", {
  group_name: "Tutti Review 11 " + suffix, player_nickname: "Ana"
}))[0];
for (const [person, nickname] of [[member, "Beto"], [third, "Cora"], [late, "Dani"]]) {
  await rpc(person.instance, "join_group_with_invitation", {
    invitation_code: group.invitation_code, player_nickname: nickname
  });
}
await markClientAsPlatformAdmin(outsider.instance, psql, sqlString);
await rpc(outsider.instance, "create_group_with_admin_player", {
  group_name: "Tutti Other 11 " + suffix, player_nickname: "Otra"
});
const otherGameRoom = (await rpc(outsider.instance, "create_room", {}))[0];
await rejects(outsider.instance, "get_tutti_frutti_review", {
  target_room_id: otherGameRoom.room_id
}, "P0032");

const room = (await rpc(host.instance, "create_room", { requested_game_type: "tutti_frutti" }))[0];
for (const person of [member, third]) {
  await rpc(person.instance, "join_room_by_code", {
    room_code: room.room_join_code, expected_game_type: "tutti_frutti"
  });
}
const started = await rpc(host.instance, "start_tutti_frutti_session", { target_room_id: room.room_id });
const roomIdSql = sqlString(room.room_id) + "::uuid";
const sessionIdSql = sqlString(started.sessionId) + "::uuid";
const latePlayerId = psql("select id from public.players where auth_user_id=" + sqlString(late.userId) + "::uuid");
const groupId = psql("select group_id from public.rooms where id=" + roomIdSql);
// A playing Room disallows late joins. Simulate a Room-only member to verify
// that a future policy change cannot grant access without frozen roster membership.
psql("begin; set local session_replication_role = replica; "
  + "insert into public.room_participants (room_id, player_id, group_id) values ("
  + roomIdSql + "," + sqlString(latePlayerId) + "::uuid," + sqlString(groupId) + "::uuid); commit;");
await rejects(late.instance, "get_tutti_frutti_review", { target_room_id: room.room_id }, "P0032");
await rejects(outsider.instance, "get_tutti_frutti_review", { target_room_id: room.room_id }, "P0032");
const unauthenticated = await client().rpc("get_tutti_frutti_review", { target_room_id: room.room_id });
assert(unauthenticated.data === null && unauthenticated.error,
  "unauthenticated callers receive no protected data");
await rejects(host.instance, "get_tutti_frutti_review", { target_room_id: room.room_id }, "P0042");

psql("update public.tutti_frutti_letter_candidates set status='accepted' where session_id="
  + sessionIdSql + " and status='pending'");
psql("update public.tutti_frutti_rounds set phase='PLAYING' where session_id=" + sessionIdSql);
const answers = [
  [host, ["Mono", "San Juan", "ABC", "Rosa", "X"]],
  [member, [" mono ", "San  Juan", "abc", "", "x"]],
  [third, ["Móno", "", "ABC!", "", "x"]]
];
for (const [person, values] of answers) {
  for (let index = 0; index < values.length; index++) {
    await rpc(person.instance, "save_tutti_frutti_answer", {
      target_room_id: room.room_id, target_category_position: index + 1,
      target_answer_text: values[index]
    });
  }
}
await rejects(host.instance, "get_tutti_frutti_review", { target_room_id: room.room_id }, "P0042");
await rpc(host.instance, "call_tutti_frutti", { target_room_id: room.room_id });
await rejects(host.instance, "get_tutti_frutti_review", { target_room_id: room.room_id }, "P0042");

const roomBlocker = transaction(["begin", "select 'ROOM_HELD' from public.rooms where id="
  + roomIdSql + " for update", "select pg_sleep(3)", "commit"], "ROOM_HELD");
await roomBlocker.ready;
psql("update public.tutti_frutti_rounds set countdown_started_at=statement_timestamp()-interval '46 seconds',"
  + " countdown_ends_at=statement_timestamp()-interval '1 second' where session_id=" + sessionIdSql);
await rejects(host.instance, "get_tutti_frutti_review", { target_room_id: room.room_id }, "P0042");
const transition = transaction(["begin", "update public.tutti_frutti_rounds set phase='REVIEWING',"
  + " locked_at=clock_timestamp() where session_id=" + sessionIdSql,
"select 'ROUND_UNCOMMITTED'", "select pg_sleep(1)", "commit"], "ROUND_UNCOMMITTED");
await transition.ready;
await rejects(member.instance, "get_tutti_frutti_review", { target_room_id: room.room_id }, "P0042");
await transition.done;
await roomBlocker.done;

const review = await rpc(host.instance, "get_tutti_frutti_review", { target_room_id: room.room_id });
equal(review.phase, "REVIEWING", "review is available after commit");
equal(review.categories.length, 5, "every configured category appears");
assert(review.categories.every(category => category.entries.length === 3),
  "every frozen participant appears in every category");
assert(!JSON.stringify(review).includes("normalizedValue"), "normalized values are not returned");
function entry(position, nickname) {
  return review.categories[position - 1].entries.find(item => item.nickname === nickname);
}
equal(entry(1, "Ana").answerText, "Mono", "the original text remains visible");
equal(entry(1, "Ana").duplicateGroupId, entry(1, "Beto").duplicateGroupId,
  "case and edge whitespace compare equal");
equal(entry(1, "Ana").duplicateCount, 2, "one pair forms a duplicate group");
equal(entry(1, "Cora").duplicateGroupId, null, "accents remain distinct");
equal(entry(2, "Ana").duplicateGroupId, null, "internal spaces remain distinct");
equal(entry(2, "Beto").duplicateGroupId, null, "internal spaces are not collapsed");
equal(entry(3, "Ana").duplicateGroupId, entry(3, "Beto").duplicateGroupId,
  "mixed case compares equal");
equal(entry(3, "Cora").duplicateGroupId, null, "punctuation remains distinct");
equal(entry(4, "Beto").isEmpty, true, "empty answers appear explicitly");
equal(entry(4, "Cora").duplicateGroupId, null, "empty answers are not grouped");
equal(entry(5, "Ana").duplicateCount, 3, "a three-player group remains within its category");
equal(JSON.stringify(await rpc(member.instance, "get_tutti_frutti_review", { target_room_id: room.room_id })),
  JSON.stringify(review), "roster members see the same locked snapshot");
equal(JSON.stringify(await rpc(host.instance, "get_tutti_frutti_review", { target_room_id: room.room_id })),
  JSON.stringify(review), "repeat reads do not mutate the review");
const hostPlayerId = psql("select id from public.players where auth_user_id="
  + sqlString(host.userId) + "::uuid");
psql("insert into public.tutti_frutti_rounds (id, session_id, round_number, phase,"
  + " countdown_started_at, countdown_ends_at, called_by_player_id, locked_at) values ("
  + "extensions.gen_random_uuid()," + sessionIdSql + ",2,'REVIEWING',"
  + "statement_timestamp()-interval '46 seconds', statement_timestamp()-interval '1 second',"
  + sqlString(hostPlayerId) + "::uuid,clock_timestamp())");
const nextRound = await rpc(host.instance, "get_tutti_frutti_review", { target_room_id: room.room_id });
equal(nextRound.roundNumber, 2, "the read follows the active round number");
assert(nextRound.categories.every(category => category.entries.every(answer => answer.isEmpty)),
  "answers from the prior round do not contaminate the next round");
console.log("Tutti Frutti increment 11 local review and privacy validation passed.");
