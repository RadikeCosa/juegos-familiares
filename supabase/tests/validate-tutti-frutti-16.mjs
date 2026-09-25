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
  assert(data === null, `${name} must return no data on rejection`);
  equal(error?.code, code, `${name} rejection`);
}
function phase(sessionId, roundId, roundPhase) {
  psql("update public.tutti_frutti_letter_candidates set status='accepted' where round_id="
    + quote(roundId) + "::uuid and status='pending'; update public.tutti_frutti_rounds set phase="
    + quote(roundPhase) + " where id=" + quote(roundId) + "::uuid and session_id="
    + quote(sessionId) + "::uuid");
}
function prepareReview(sessionId, roundId, callerId) {
  psql("update public.tutti_frutti_letter_candidates set status='accepted' where round_id="
    + quote(roundId) + "::uuid and status='pending'; update public.tutti_frutti_rounds set phase='REVIEWING', "
    + "countdown_started_at=statement_timestamp()-interval '46 seconds', "
    + "countdown_ends_at=statement_timestamp()-interval '1 second', called_by_player_id="
    + quote(callerId) + "::uuid, locked_at=clock_timestamp() where id=" + quote(roundId)
    + "::uuid and session_id=" + quote(sessionId) + "::uuid");
}

const [host, member, third, newcomer, outsider, unlinked] = await Promise.all([
  identity(), identity(), identity(), identity(), identity(), identity()
]);
await markClientAsPlatformAdmin(host.instance, psql, quote);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Rematch 16 " + randomUUID().slice(0, 8), player_nickname: "Host"
}))[0];
for (const [person, nickname] of [[member, "Member"], [third, "Third"], [newcomer, "Newcomer"]]) {
  await rpc(person, "join_group_with_invitation", {
    invitation_code: group.invitation_code, player_nickname: nickname
  });
}
await markClientAsPlatformAdmin(outsider.instance, psql, quote);
await rpc(outsider, "create_group_with_admin_player", {
  group_name: "Tutti Rematch outsider " + randomUUID().slice(0, 8), player_nickname: "Outsider"
});

const room = (await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0];
await rejects(unlinked, "start_tutti_frutti_session", { target_room_id: room.room_id }, "P0031");
for (const person of [member, third]) {
  await rpc(person, "join_room_by_code", {
    room_code: room.room_join_code, expected_game_type: "tutti_frutti"
  });
}
const hostId = psql("select id from public.players where auth_user_id=" + quote(host.userId) + "::uuid");
const memberId = psql("select id from public.players where auth_user_id=" + quote(member.userId) + "::uuid");
const thirdId = psql("select id from public.players where auth_user_id=" + quote(third.userId) + "::uuid");
const newcomerId = psql("select id from public.players where auth_user_id=" + quote(newcomer.userId) + "::uuid");
const firstConfig = {
  version: 1, roundCount: 3,
  categories: [
    { kind: "preset", key: "name" },
    { kind: "preset", key: "animal" },
    { kind: "preset", key: "food" }
  ]
};
await rpc(host, "save_tutti_frutti_room_setup", {
  target_room_id: room.room_id, requested_configuration: firstConfig
});
const first = await rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id });
const firstSessionId = first.sessionId;
equal(first.roundCount, 3, "first session snapshots the Room draft");

let round = first.round;
for (let number = 1; number <= 3; number += 1) {
  phase(firstSessionId, round.id, "PLAYING");
  if (number === 1) {
    for (const [person, text] of [[host, "Ana"], [member, "Beto"], [third, "Cata"]]) {
      await rpc(person, "save_tutti_frutti_answer", {
        target_room_id: room.room_id, target_category_position: 1, target_answer_text: text
      });
    }
  }
  prepareReview(firstSessionId, round.id, hostId);
  await rpc(host, "score_tutti_frutti_round", {
    target_room_id: room.room_id, target_round_id: round.id
  });
  if (number < 3) {
    const next = await rpc(host, "advance_tutti_frutti_round", {
      target_room_id: room.room_id, target_base_round_id: round.id
    });
    round = next.round;
  }
}
equal(psql("select status from public.rooms where id=" + quote(room.room_id) + "::uuid"),
  "lobby", "finishing the first session returns its Room to lobby");
equal(psql("select count(*) from public.room_sessions where id=" + quote(firstSessionId)
  + "::uuid and finished_at is not null"), "1", "first session is terminal before rematch");
const firstTotals = await rpc(member, "get_tutti_frutti_final_result", { target_session_id: firstSessionId });
assert(firstTotals.totals.every(total => total.totalPoints === 10),
  "the previous result retains positive per-player totals");

await rpc(member, "leave_room");
await rpc(newcomer, "join_room_by_code", {
  room_code: room.room_join_code, expected_game_type: "tutti_frutti"
});
await rpc(third, "leave_room");
await rpc(newcomer, "leave_room");
await rejects(host, "start_tutti_frutti_session", { target_room_id: room.room_id }, "P0037");
await rpc(third, "join_room_by_code", {
  room_code: room.room_join_code, expected_game_type: "tutti_frutti"
});
await rpc(newcomer, "join_room_by_code", {
  room_code: room.room_join_code, expected_game_type: "tutti_frutti"
});

// A Room in lobby with an unfinished session is an integrity error, distinct
// from invalid setup data. This fixture has no gameplay child rows by design.
const unfinishedFixtureId = randomUUID();
psql("insert into public.room_sessions(id,room_id,group_id,game_type,started_at,impostor_game_session_id) values ("
  + quote(unfinishedFixtureId) + "::uuid," + quote(room.room_id) + "::uuid," + quote(group.group_id)
  + "::uuid,'tutti_frutti',clock_timestamp(),null)");
await rejects(host, "start_tutti_frutti_session", { target_room_id: room.room_id }, "P0056");
equal(psql("select count(*) from public.room_sessions where room_id=" + quote(room.room_id)
  + "::uuid"), "2", "inconsistent unfinished session does not create another session");
psql("delete from public.room_sessions where id=" + quote(unfinishedFixtureId) + "::uuid");

const nextConfig = {
  version: 1, roundCount: 3,
  categories: [
    { kind: "custom", label: "Río" },
    { kind: "preset", key: "city" },
    { kind: "preset", key: "profession" }
  ]
};
const invalidConfig = JSON.stringify({ version: 1, roundCount: 2, categories: [] });
psql("update public.tutti_frutti_room_setup set configuration=" + quote(invalidConfig)
  + "::jsonb where room_id=" + quote(room.room_id) + "::uuid");
await rejects(host, "start_tutti_frutti_session", { target_room_id: room.room_id }, "P0038");
await rpc(host, "save_tutti_frutti_room_setup", {
  target_room_id: room.room_id, requested_configuration: nextConfig
});

const [retryA, retryB] = await Promise.all([
  rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id }),
  rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id })
]);
const secondSessionId = retryA.sessionId;
assert(secondSessionId !== firstSessionId, "rematch creates a distinct session ID");
equal(retryB.sessionId, secondSessionId, "concurrent retry returns the same new session");
equal(retryA.roundCount, 3, "new session snapshots the edited round count");
equal(retryA.categories.map(category => category.label).join(","), "Río,Ciudad,Profesión",
  "new session snapshots the edited categories");
equal(psql("select count(*) from public.room_sessions where room_id=" + quote(room.room_id)
  + "::uuid"), "2", "concurrent rematch creates exactly one additional session");
equal(psql("select count(*) from public.room_sessions where room_id=" + quote(room.room_id)
  + "::uuid and finished_at is null"), "1", "Room has exactly one active session");
equal(psql("select count(*) from public.room_session_participants where session_id="
  + quote(secondSessionId) + "::uuid and player_id in (" + quote(hostId) + "::uuid,"
  + quote(thirdId) + "::uuid," + quote(newcomerId) + "::uuid)"), "3",
  "new roster freezes current RoomParticipants");
equal(psql("select count(*) from public.room_session_participants where session_id="
  + quote(secondSessionId) + "::uuid and player_id=" + quote(memberId) + "::uuid"), "0",
  "participant who left is excluded from the new roster");
equal(psql("select coalesce(sum(awarded_points),0) from public.tutti_frutti_answers where session_id="
  + quote(secondSessionId) + "::uuid"), "0", "new session starts with no inherited points");
equal(psql("select count(*) from public.tutti_frutti_session_categories where session_id="
  + quote(firstSessionId) + "::uuid and label in ('Nombre','Animal','Comida')"), "3",
  "previous category snapshot remains unchanged");

// A host succession after the start may recover the active game; an ordinary
// non-host participant cannot turn the idempotent start path into a read RPC.
psql("update public.rooms set host_player_id=" + quote(newcomerId) + "::uuid where id="
  + quote(room.room_id) + "::uuid");
const successorRetry = await rpc(newcomer, "start_tutti_frutti_session", {
  target_room_id: room.room_id
});
equal(successorRetry.sessionId, secondSessionId, "current host successor recovers the active session");
const originalRetry = await rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id });
equal(originalRetry.sessionId, secondSessionId, "original starter retains the active retry");
await rejects(third, "start_tutti_frutti_session", { target_room_id: room.room_id }, "P0033");
await rejects(outsider, "start_tutti_frutti_session", { target_room_id: room.room_id }, "P0032");

await rpc(member, "get_tutti_frutti_final_result", { target_session_id: firstSessionId });
await rejects(newcomer, "get_tutti_frutti_final_result", {
  target_session_id: firstSessionId
}, "P0032");
await rejects(member, "get_tutti_frutti_final_result", {
  target_session_id: secondSessionId
}, "P0032");

let secondRound = successorRetry.round;
for (let number = 1; number <= 3; number += 1) {
  phase(secondSessionId, secondRound.id, "PLAYING");
  prepareReview(secondSessionId, secondRound.id, newcomerId);
  await rpc(newcomer, "score_tutti_frutti_round", {
    target_room_id: room.room_id, target_round_id: secondRound.id
  });
  if (number < 3) {
    const next = await rpc(newcomer, "advance_tutti_frutti_round", {
      target_room_id: room.room_id, target_base_round_id: secondRound.id
    });
    secondRound = next.round;
  }
}
equal(psql("select status from public.rooms where id=" + quote(room.room_id) + "::uuid"),
  "lobby", "the second final score also returns the same Room to lobby");
equal(psql("select count(*) from public.room_sessions where room_id=" + quote(room.room_id)
  + "::uuid and finished_at is not null"), "2", "both sessions remain independently finished");
const secondResult = await rpc(newcomer, "get_tutti_frutti_final_result", {
  target_session_id: secondSessionId
});
assert(secondResult.totals.every(total => total.totalPoints === 0),
  "the new session result starts at zero rather than inheriting prior points");
const firstResultAgain = await rpc(member, "get_tutti_frutti_final_result", {
  target_session_id: firstSessionId
});
assert(firstResultAgain.totals.every(total => total.totalPoints === 10),
  "the first result remains unchanged after the rematch is finished");

await rpc(newcomer, "close_room");
await rejects(newcomer, "start_tutti_frutti_session", { target_room_id: room.room_id }, "P0034");

equal(psql("select has_function_privilege('anon','public.start_tutti_frutti_session(uuid)','EXECUTE')"),
  "f", "anonymous cannot start or retry sessions");
equal(psql("select has_function_privilege('authenticated','public.start_tutti_frutti_session(uuid)','EXECUTE')"),
  "t", "authenticated actors can call the guarded start RPC");
equal(psql("select has_table_privilege('authenticated','public.room_sessions','INSERT')"),
  "f", "clients cannot create shared sessions directly");
equal(psql("select has_table_privilege('authenticated','public.room_session_participants','INSERT')"),
  "f", "clients cannot write roster snapshots directly");

console.log("Tutti Frutti increment 16 sequential sessions, retry authorization, editable configuration, roster snapshots, score isolation, and local error guards passed.");
