import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
});
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]));
if (!env.DB_URL || !env.API_URL || !env.PUBLISHABLE_KEY
  || new URL(env.DB_URL).hostname !== "127.0.0.1" || new URL(env.API_URL).hostname !== "127.0.0.1") {
  throw new Error("This validator requires the project's local Supabase instance.");
}
const sqlString = value => "'" + String(value).replaceAll("'", "''") + "'";
const psql = sql => execFileSync("psql", [env.DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const psqlAsync = sql => new Promise((resolve, reject) => {
  const child = spawn("psql", [env.DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim())));
});
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
async function session(players, suffix) {
  const host = players[0];
  await markClientAsPlatformAdmin(host.instance, psql, sqlString);
  const group = (await rpc(host, "create_group_with_admin_player", {
    group_name: "Tutti Challenge 12 " + suffix, player_nickname: "Player 1"
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
  const playerIds = players.map(person => psql("select id from public.players where auth_user_id="
    + sqlString(person.userId) + "::uuid"));
  psql("update public.tutti_frutti_letter_candidates set status='accepted' where session_id="
    + sqlString(started.sessionId) + "::uuid and status='pending'; update public.tutti_frutti_rounds "
    + "set phase='PLAYING' where session_id=" + sqlString(started.sessionId) + "::uuid and round_number=1;");
  for (let index = 0; index < players.length; index++) {
    await rpc(players[index], "save_tutti_frutti_answer", {
      target_room_id: room.room_id, target_category_position: 1,
      target_answer_text: `respuesta-${index}`
    });
  }
  psql("update public.tutti_frutti_rounds set phase='REVIEWING', "
    + "countdown_started_at=statement_timestamp()-interval '46 seconds', "
    + "countdown_ends_at=statement_timestamp()-interval '1 second', called_by_player_id="
    + sqlString(playerIds[0]) + "::uuid, locked_at=clock_timestamp() where session_id="
    + sqlString(started.sessionId) + "::uuid and round_number=1");
  return { roomId: room.room_id, sessionId: started.sessionId, invitationCode: group.invitation_code,
    groupId: psql("select group_id from public.rooms where id=" + sqlString(room.room_id) + "::uuid"), roundId: psql(
    "select id from public.tutti_frutti_rounds where session_id=" + sqlString(started.sessionId)
      + "::uuid and round_number=1"), playerIds };
}

for (const table of ["tutti_frutti_challenges", "tutti_frutti_challenge_votes"]) {
  equal(psql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`), "t", `${table} RLS`);
  equal(psql(`select has_table_privilege('authenticated','public.${table}','SELECT,INSERT,UPDATE,DELETE')`),
    "f", `${table} has no direct client access`);
}
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_review_signals','SELECT')"),
  "t", "authenticated can read roster-filtered review invalidations");
equal(psql("select has_function_privilege('authenticated','public.open_tutti_frutti_challenge(uuid,uuid,integer)','EXECUTE')"),
  "t", "authenticated can open a challenge through RPC");
equal(psql("select has_function_privilege('anon','public.open_tutti_frutti_challenge(uuid,uuid,integer)','EXECUTE')"),
  "f", "anonymous cannot open challenges");

const people3 = [await identity(), await identity(), await identity(), await identity()];
const outsider = await identity();
await markClientAsPlatformAdmin(outsider.instance, psql, sqlString);
await rpc(outsider, "create_group_with_admin_player", {
  group_name: "Tutti Outsider 12 " + randomUUID().slice(0, 8), player_nickname: "Outsider"
});
const otherGameRoom = (await rpc(outsider, "create_room", {}))[0];
const three = await session(people3, randomUUID().slice(0, 8));
const host = people3[0];
const review = await rpc(host, "get_tutti_frutti_review", { target_room_id: three.roomId });
assert(!JSON.stringify(review).includes("votes") && !JSON.stringify(review).includes("normalizedValue"),
  "review never returns other ballots, counts, or normalized values");
const opening = { target_room_id: three.roomId,
  target_answer_player_id: three.playerIds[1], target_category_position: 1 };
await rejects(people3[1], "open_tutti_frutti_challenge", opening, "P0045");
await rejects(outsider, "open_tutti_frutti_challenge", opening, "P0032");
await rejects(outsider, "get_tutti_frutti_review", { target_room_id: three.roomId }, "P0032");
await rejects(outsider, "open_tutti_frutti_challenge", { ...opening,
  target_room_id: otherGameRoom.room_id }, "P0032");
await rejects(people3[1], "vote_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_challenge_id: randomUUID(), target_choice: "INVALID"
}, "P0046");
const anonymousCall = await client().rpc("open_tutti_frutti_challenge", opening);
equal(anonymousCall.error?.code, "42501", "anonymous caller has no execute grant");

const late = await identity();
await rpc(late, "join_group_with_invitation", {
  invitation_code: three.invitationCode, player_nickname: "Late"
});
const latePlayerId = psql("select id from public.players where auth_user_id=" + sqlString(late.userId) + "::uuid");
psql("begin; set local session_replication_role=replica; insert into public.room_participants "
  + "(room_id, player_id, group_id) values (" + sqlString(three.roomId) + "::uuid, "
  + sqlString(latePlayerId) + "::uuid, " + sqlString(three.groupId) + "::uuid); commit;");
await rejects(late, "get_tutti_frutti_review", { target_room_id: three.roomId }, "P0032");
await rejects(late, "open_tutti_frutti_challenge", opening, "P0032");

psql("update public.tutti_frutti_rounds set phase='PLAYING', locked_at=null where id="
  + sqlString(three.roundId) + "::uuid");
await rejects(host, "open_tutti_frutti_challenge", opening, "P0042");
psql("update public.tutti_frutti_rounds set phase='REVIEWING', locked_at=clock_timestamp() where id="
  + sqlString(three.roundId) + "::uuid");

const openedValid = await rpc(host, "open_tutti_frutti_challenge", opening);
const retryOpen = await rpc(host, "open_tutti_frutti_challenge", opening);
equal(retryOpen.challengeId, openedValid.challengeId, "opening retry returns the same challenge");
equal(retryOpen.idempotent, true, "opening retry is idempotent");
const rosterSignal = await host.instance.from("tutti_frutti_review_signals").select("round_id")
  .eq("session_id", three.sessionId).eq("round_id", three.roundId);
assert(!rosterSignal.error && rosterSignal.data.length === 1,
  "frozen roster can read a review invalidation signal");
const outsiderSignal = await outsider.instance.from("tutti_frutti_review_signals").select("round_id")
  .eq("session_id", three.sessionId);
assert(!outsiderSignal.error && outsiderSignal.data.length === 0,
  "non-roster cannot read review invalidation signals");
await rejects(people3[2], "open_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_answer_player_id: three.playerIds[3], target_category_position: 1
}, "P0047");
const activeForOthers = await rpc(people3[2], "get_tutti_frutti_review", { target_room_id: three.roomId });
assert(activeForOthers.activeChallenge && activeForOthers.activeChallenge.myVote === null
  && !JSON.stringify(activeForOthers).includes("INVALID"), "other voters cannot see the challenger's ballot");
await rejects(people3[1], "vote_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_challenge_id: openedValid.challengeId, target_choice: "VALID"
}, "P0045");
const validOne = await rpc(people3[2], "vote_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_challenge_id: openedValid.challengeId, target_choice: "VALID"
});
equal(validOne.status, "OPEN", "one VALID vote cannot prematurely decide among three eligible votes");
await rpc(people3[3], "vote_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_challenge_id: openedValid.challengeId, target_choice: "VALID"
});
const validRetry = await rpc(people3[2], "vote_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_challenge_id: openedValid.challengeId, target_choice: "VALID"
});
equal(validRetry.status, "RESOLVED_VALID", "two VALID votes resolve early once INVALID can no longer reach a majority");
await rejects(people3[2], "vote_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_challenge_id: openedValid.challengeId, target_choice: "INVALID"
}, "P0045");
const sameTarget = await people3[3].instance.rpc("open_tutti_frutti_challenge", opening);
equal(sameTarget.error?.code, "P0046", "a resolved answer cannot be challenged again");

const invalidChallenge = await rpc(host, "open_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_answer_player_id: three.playerIds[2], target_category_position: 1
});
const invalidResult = await rpc(people3[1], "vote_tutti_frutti_challenge", {
  target_room_id: three.roomId, target_challenge_id: invalidChallenge.challengeId, target_choice: "INVALID"
});
equal(invalidResult.status, "RESOLVED_INVALID", "a strict majority invalidates immediately");
const afterThree = await rpc(host, "get_tutti_frutti_review", { target_room_id: three.roomId });
assert(!JSON.stringify(afterThree).includes("invalidCount") && !JSON.stringify(afterThree).includes("validCount"),
  "resolved review exposes outcome without tally");

const tiePeople = [await identity(), await identity(), await identity()];
const tieSession = await session(tiePeople, "tie-" + randomUUID().slice(0, 8));
const tieChallenge = await rpc(tiePeople[0], "open_tutti_frutti_challenge", {
  target_room_id: tieSession.roomId, target_answer_player_id: tieSession.playerIds[1], target_category_position: 1
});
const tieResult = await rpc(tiePeople[2], "vote_tutti_frutti_challenge", {
  target_room_id: tieSession.roomId, target_challenge_id: tieChallenge.challengeId, target_choice: "VALID"
});
equal(tieResult.status, "RESOLVED_VALID", "an exact 50/50 tie leaves the answer valid");

async function twoPlayerScenario(choice, suffix, raceDeadline = false) {
  const players = [await identity(), await identity()];
  const fixture = await session(players, suffix);
  const opened = await rpc(players[0], "open_tutti_frutti_challenge", {
    target_room_id: fixture.roomId, target_answer_player_id: fixture.playerIds[1], target_category_position: 1
  });
  const challengerReview = await rpc(players[0], "get_tutti_frutti_review", { target_room_id: fixture.roomId });
  equal(challengerReview.activeChallenge.myVote, "INVALID", "challenger ballot is recorded automatically");
  equal(challengerReview.activeChallenge.canVote, false, "challenger cannot vote again in two-player mode");
  if (choice) {
    const decision = await rpc(players[1], "vote_tutti_frutti_challenge", {
      target_room_id: fixture.roomId, target_challenge_id: opened.challengeId, target_choice: choice
    });
    equal(decision.status, choice === "INVALID" ? "RESOLVED_INVALID" : "RESOLVED_VALID",
      "author resolves two-player challenge by explicit agreement or rejection");
  } else {
    psql("update public.tutti_frutti_challenges set opened_at=statement_timestamp()-interval '31 seconds', "
      + "deadline_at=statement_timestamp()-interval '1 second' "
      + "where id=" + sqlString(opened.challengeId) + "::uuid");
    if (raceDeadline) {
      const [cronCount, late] = await Promise.all([
        psqlAsync("select public.lock_expired_tutti_frutti_rounds()"),
        players[1].instance.rpc("vote_tutti_frutti_challenge", {
          target_room_id: fixture.roomId, target_challenge_id: opened.challengeId, target_choice: "INVALID"
        })
      ]);
      assert(cronCount === "0" || cronCount === "1", "Cron either resolves the challenge or observes the RPC result");
      assert(!late.error && late.data?.accepted === false,
        "a vote racing Cron after the deadline is rejected without adding a ballot");
    } else {
      let resolved = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const current = psql("select status from public.tutti_frutti_challenges where id="
          + sqlString(opened.challengeId) + "::uuid");
        if (current === "RESOLVED_VALID") { resolved = true; break; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert(resolved, "the scheduled Cron job resolves a silent challenge without a client RPC");
    }
    equal(psql("select status from public.tutti_frutti_challenges where id="
      + sqlString(opened.challengeId) + "::uuid"), "RESOLVED_VALID", "silence leaves answer valid");
  }
}
await twoPlayerScenario("INVALID", "agreement-" + randomUUID().slice(0, 8));
await twoPlayerScenario("VALID", "rejection-" + randomUUID().slice(0, 8));
await twoPlayerScenario(null, "silence-" + randomUUID().slice(0, 8));
await twoPlayerScenario(null, "deadline-race-" + randomUUID().slice(0, 8), true);
console.log("Tutti Frutti increment 12 local challenge, privacy, majority, agreement, and deadline validation passed.");
