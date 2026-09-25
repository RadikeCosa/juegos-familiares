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
async function rejects(person, name, args, code) {
  const { data, error } = await person.instance.rpc(name, args);
  assert(data === null, `${name} must return no protected data on denial`);
  equal(error?.code, code, `${name} rejection`);
}
function prepareReview(sessionId, roundId, callerId) {
  psql("update public.tutti_frutti_letter_candidates set status='accepted' where round_id="
    + quote(roundId) + "::uuid and status='pending'; "
    + "update public.tutti_frutti_rounds set phase='REVIEWING', "
    + "countdown_started_at=statement_timestamp()-interval '46 seconds', "
    + "countdown_ends_at=statement_timestamp()-interval '1 second', called_by_player_id="
    + quote(callerId) + "::uuid, locked_at=clock_timestamp() where id=" + quote(roundId)
    + "::uuid and session_id=" + quote(sessionId) + "::uuid");
}

const [host, member, third, newcomer, outsider] = await Promise.all([
  identity(), identity(), identity(), identity(), identity()
]);
await markClientAsPlatformAdmin(host.instance, psql, quote);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Finish 15 " + randomUUID().slice(0, 8), player_nickname: "Host"
}))[0];
for (const [person, nickname] of [[member, "Member"], [third, "Third"], [newcomer, "Newcomer"]]) {
  await rpc(person, "join_group_with_invitation", {
    invitation_code: group.invitation_code, player_nickname: nickname
  });
}
await markClientAsPlatformAdmin(outsider.instance, psql, quote);
await rpc(outsider, "create_group_with_admin_player", {
  group_name: "Tutti Finish outsider " + randomUUID().slice(0, 8), player_nickname: "Outsider"
});

const room = (await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0];
for (const person of [member, third]) {
  await rpc(person, "join_room_by_code", {
    room_code: room.room_join_code, expected_game_type: "tutti_frutti"
  });
}
const started = await rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id });
const hostId = psql("select id from public.players where auth_user_id=" + quote(host.userId) + "::uuid");
const rosterCount = psql("select count(*) from public.room_session_participants where session_id="
  + quote(started.sessionId) + "::uuid");
equal(rosterCount, "3", "the session roster is frozen before postgame membership changes");

// Keep this fixture short while preserving the configured-round invariant.
psql("update public.tutti_frutti_sessions set round_count=3 where id=" + quote(started.sessionId) + "::uuid");
prepareReview(started.sessionId, started.round.id, hostId);
const roundOne = await rpc(host, "score_tutti_frutti_round", {
  target_room_id: room.room_id, target_round_id: started.round.id
});
equal(roundOne.roundNumber, 1, "a non-final round is scored");
equal(psql("select status from public.rooms where id=" + quote(room.room_id) + "::uuid"),
  "playing", "a non-final score keeps the Room playing");
equal(psql("select coalesce(finished_at::text,'') from public.room_sessions where id="
  + quote(started.sessionId) + "::uuid"), "", "a non-final score keeps the session unfinished");

const second = await rpc(host, "advance_tutti_frutti_round", {
  target_room_id: room.room_id, target_base_round_id: started.round.id
});
const roundTwoId = second.round.id;
const roundThreeId = randomUUID();
const roundThreeCandidateId = randomUUID();
psql("insert into public.tutti_frutti_rounds(id,session_id,round_number,phase,countdown_started_at,countdown_ends_at,called_by_player_id,locked_at) "
  + "values (" + quote(roundThreeId) + "::uuid," + quote(started.sessionId)
  + "::uuid,3,'REVIEWING',statement_timestamp()-interval '46 seconds',statement_timestamp()-interval '1 second',"
  + quote(hostId) + "::uuid,clock_timestamp()); "
  + "insert into public.tutti_frutti_letter_candidates(id,session_id,round_id,letter,status) select "
  + quote(roundThreeCandidateId) + "::uuid," + quote(started.sessionId) + "::uuid,"
  + quote(roundThreeId) + "::uuid,choices.letter,'accepted' from unnest((select letter_pool from public.tutti_frutti_sessions where id="
  + quote(started.sessionId) + "::uuid)) choices(letter) where not exists (select 1 from public.tutti_frutti_letter_candidates used where used.session_id="
  + quote(started.sessionId) + "::uuid and used.letter=choices.letter) limit 1");

await rejects(host, "score_tutti_frutti_round", {
  target_room_id: room.room_id, target_round_id: roundThreeId
}, "P0056");
equal(psql("select phase from public.tutti_frutti_rounds where id=" + quote(roundThreeId) + "::uuid"),
  "REVIEWING", "a missing intermediate score rolls back the final round");
equal(psql("select status from public.rooms where id=" + quote(room.room_id) + "::uuid"),
  "playing", "a failed final close keeps the Room playing");

psql("update public.tutti_frutti_letter_candidates set status='accepted' where round_id="
  + quote(roundTwoId) + "::uuid and status='pending'; update public.tutti_frutti_rounds set phase='RESULT', "
  + "countdown_started_at=statement_timestamp()-interval '46 seconds', countdown_ends_at=statement_timestamp()-interval '1 second', "
  + "called_by_player_id=" + quote(hostId) + "::uuid, locked_at=clock_timestamp(), scored_at=clock_timestamp() where id="
  + quote(roundTwoId) + "::uuid");

const closeArgs = { target_room_id: room.room_id, target_round_id: roundThreeId };
const [closed, raced] = await Promise.all([
  rpc(host, "score_tutti_frutti_round", closeArgs),
  rpc(host, "score_tutti_frutti_round", closeArgs)
]);
equal(closed.scoredAt, raced.scoredAt, "concurrent final scoring returns the stored timestamp");
equal(psql("select status from public.rooms where id=" + quote(room.room_id) + "::uuid"),
  "lobby", "the final score returns the Room to lobby");
equal(psql("select finished_at=scored_at from public.room_sessions join public.tutti_frutti_rounds "
  + "on tutti_frutti_rounds.session_id=room_sessions.id where room_sessions.id="
  + quote(started.sessionId) + "::uuid and tutti_frutti_rounds.id=" + quote(roundThreeId) + "::uuid"),
  "t", "the session and final round use one timestamp");
equal(psql("select count(*) from public.room_participants where room_id=" + quote(room.room_id) + "::uuid"),
  "3", "Room participants survive the return to lobby");
equal(psql("select count(*) from public.player_active_room_slots where room_id=" + quote(room.room_id) + "::uuid"),
  "3", "active Room slots survive the return to lobby");

const finalResult = await rpc(member, "get_tutti_frutti_final_result", {
  target_session_id: started.sessionId
});
equal(finalResult.totals.length, 3, "the final result includes the frozen roster");
equal(finalResult.winnerPlayerIds.length, 3, "a three-player tie returns every winner");
assert(finalResult.totals.every(total => total.rank === 1), "a three-player tie assigns rank one to all");
equal(finalResult.isTie, true, "the final result marks a tie");
equal(finalResult.canReturnToRoom, true, "a current participant can return to the lobby");
await rejects(outsider, "get_tutti_frutti_final_result", {
  target_session_id: started.sessionId
}, "P0032");

const memberPostgame = await rpc(member, "get_tutti_frutti_postgame_state", {
  target_room_id: room.room_id
});
equal(memberPostgame.latestFinishedSessionId, started.sessionId,
  "a historical roster member discovers the finished result");

await rpc(newcomer, "join_room_by_code", {
  room_code: room.room_join_code, expected_game_type: "tutti_frutti"
});
const newcomerPostgame = await rpc(newcomer, "get_tutti_frutti_postgame_state", {
  target_room_id: room.room_id
});
equal(newcomerPostgame.hasFinishedSession, true, "a new member sees that the Room is postgame");
equal(newcomerPostgame.latestFinishedSessionId, null,
  "a new member receives no historical session identifier");
await rejects(newcomer, "get_tutti_frutti_final_result", {
  target_session_id: started.sessionId
}, "P0032");

const startAttempts = await Promise.all([
  host.instance.rpc("start_tutti_frutti_session", { target_room_id: room.room_id }),
  host.instance.rpc("start_tutti_frutti_session", { target_room_id: room.room_id })
]);
assert(startAttempts.every(result => result.data === null && result.error?.code === "P0055"),
  "concurrent rematch attempts return P0055 without creating a session");
await rejects(member, "start_tutti_frutti_session", { target_room_id: room.room_id }, "P0033");
equal(psql("select count(*) from public.room_sessions where room_id=" + quote(room.room_id) + "::uuid"),
  "1", "blocked rematch attempts create no session");

psql("update public.rooms set status='playing' where id=" + quote(room.room_id) + "::uuid");
await rejects(member, "score_tutti_frutti_round", closeArgs, "P0056");
psql("update public.rooms set status='lobby' where id=" + quote(room.room_id) + "::uuid");

await rpc(member, "leave_room");
const afterLeave = await rpc(member, "get_tutti_frutti_final_result", {
  target_session_id: started.sessionId
});
equal(afterLeave.canReturnToRoom, false, "historical access survives leaving the Room");
equal(psql("select count(*) from public.room_session_participants where session_id="
  + quote(started.sessionId) + "::uuid"), "3", "leaving does not change the frozen roster");

await rpc(host, "close_room");
const afterCloseRetry = await rpc(member, "score_tutti_frutti_round", closeArgs);
equal(afterCloseRetry.scoredAt, closed.scoredAt, "a retry after Room close returns the stored result");
const afterClose = await rpc(third, "get_tutti_frutti_final_result", {
  target_session_id: started.sessionId
});
equal(afterClose.canReturnToRoom, false, "historical access survives Room closure");

equal(psql("select has_function_privilege('anon','public.get_tutti_frutti_final_result(uuid)','EXECUTE')"),
  "f", "anonymous cannot read final results");
equal(psql("select has_function_privilege('authenticated','public.get_tutti_frutti_final_result(uuid)','EXECUTE')"),
  "t", "authenticated actors can call the guarded final-result RPC");
equal(psql("select has_table_privilege('authenticated','public.room_sessions','UPDATE')"),
  "f", "clients cannot finish shared sessions directly");
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_rounds','UPDATE')"),
  "f", "clients cannot score rounds directly");

console.log("Tutti Frutti increment 15 local final scoring, atomic lobby return, historical roster privacy, rematch guard, and retry validation passed.");
