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
async function makeFixture(name, participantCount) {
  const players = await Promise.all(Array.from({ length: participantCount }, () => identity()));
  await markClientAsPlatformAdmin(players[0], psql, sqlString);
  const group = (await rpc(players[0], "create_group_with_admin_player", {
    group_name: name, player_nickname: "Player 1"
  }))[0];
  for (let index = 1; index < players.length; index += 1) {
    await rpc(players[index], "join_group_with_invitation", {
      invitation_code: group.invitation_code, player_nickname: "Player " + (index + 1)
    });
  }
  const room = (await rpc(players[0], "create_room", { requested_game_type: "tutti_frutti" }))[0];
  for (let index = 1; index < players.length; index += 1) {
    await rpc(players[index], "join_room_by_code", {
      room_code: room.room_join_code, expected_game_type: "tutti_frutti"
    });
  }
  return { players, roomId: room.room_id };
}

for (const table of ["tutti_frutti_letter_candidates", "tutti_frutti_letter_skip_votes"]) {
  equal(psql("select relrowsecurity from pg_class where oid='public." + table + "'::regclass"), "t", table + " RLS is enabled");
  equal(psql("select has_table_privilege('authenticated','public." + table + "','SELECT,INSERT,UPDATE,DELETE')"), "f", table + " direct client access is closed");
}
equal(psql("select has_function_privilege('authenticated','public.submit_tutti_frutti_letter_skip_vote(uuid,uuid)','EXECUTE')"), "t", "authenticated can submit a skip vote");
equal(psql("select has_function_privilege('authenticated','public.get_tutti_frutti_game_state(uuid)','EXECUTE')"), "t", "authenticated can lazily resolve and read state");

const fixture2 = await makeFixture("Tutti Increment 8 two-player", 2);
const fixture3 = await makeFixture("Tutti Increment 8 three-player", 3);
const fixture4 = await makeFixture("Tutti Increment 8 four-player", 4);
const allPlayers = [...fixture2.players, ...fixture3.players, ...fixture4.players];
const outsiders = await identity();
await markClientAsPlatformAdmin(outsiders, psql, sqlString);
await rpc(outsiders, "create_group_with_admin_player", {
  group_name: "Tutti Increment 8 outsider", player_nickname: "Outsider"
});

try {
  const game2 = await rpc(fixture2.players[0], "start_tutti_frutti_session", { target_room_id: fixture2.roomId });
  const initialCandidate2 = game2.round.letterDecision.candidateId;
  assert(game2.round.letterDecision.canSkip, "two-player first candidate has enough unused letters for all rounds");
  equal(game2.round.letterDecision.votesRequired, 2, "two players require unanimity");
  assert(Date.parse(game2.round.letterDecision.deadlineAt) > Date.parse(game2.serverNow), "candidate deadline is in the future");
  const candidateRows2 = psql("select count(*) from public.tutti_frutti_letter_candidates where session_id=" + sqlString(game2.sessionId) + "::uuid");
  equal(candidateRows2, "1", "session starts with exactly one candidate");
  const decisionKeys = Object.keys(game2.round.letterDecision).sort().join(",");
  equal(decisionKeys, "canSkip,candidateId,deadlineAt,hasVoted,votes,votesRequired", "read exposes aggregate state only");
  await rejects(outsiders, "submit_tutti_frutti_letter_skip_vote", {
    target_room_id: fixture2.roomId, target_candidate_id: initialCandidate2
  }, "P0032");

  await Promise.all([
    rpc(fixture2.players[0], "submit_tutti_frutti_letter_skip_vote", {
      target_room_id: fixture2.roomId, target_candidate_id: initialCandidate2
    }),
    rpc(fixture2.players[1], "submit_tutti_frutti_letter_skip_vote", {
      target_room_id: fixture2.roomId, target_candidate_id: initialCandidate2
    })
  ]);
  const currentGame2 = await rpc(fixture2.players[0], "get_tutti_frutti_game_state", { target_room_id: fixture2.roomId });
  equal(currentGame2.round.phase, "LETTER_PENDING", "a skip keeps the round in letter decision");
  equal(currentGame2.round.number, 1, "a skipped candidate does not increment the round number");
  assert(currentGame2.round.letterDecision.candidateId !== initialCandidate2, "majority creates a new candidate");
  equal(currentGame2.round.letterDecision.votes, 0, "votes reset for the new candidate");
  equal(currentGame2.round.letterDecision.hasVoted, false, "previous candidate voter starts without a vote on the new candidate");
  equal(psql("select count(distinct letter) from public.tutti_frutti_letter_candidates where session_id=" + sqlString(game2.sessionId) + "::uuid"), "2", "candidate letters are unique across the session");
  equal(psql("select status from public.tutti_frutti_letter_candidates where id=" + sqlString(initialCandidate2) + "::uuid"), "skipped", "majority marks the old candidate skipped");
  await rejects(fixture2.players[0], "submit_tutti_frutti_letter_skip_vote", {
    target_room_id: fixture2.roomId, target_candidate_id: initialCandidate2
  }, "P0039");
  const { error: directVoteReadError } = await fixture2.players[0]
    .from("tutti_frutti_letter_skip_votes").select("player_id").eq("session_id", game2.sessionId);
  equal(directVoteReadError?.code, "42501", "individual voters cannot be read directly");

  const game3 = await rpc(fixture3.players[0], "start_tutti_frutti_session", { target_room_id: fixture3.roomId });
  equal(game3.round.letterDecision.votesRequired, 2, "three players require two votes");
  const candidate3 = game3.round.letterDecision.candidateId;
  await rpc(fixture3.players[0], "submit_tutti_frutti_letter_skip_vote", {
    target_room_id: fixture3.roomId, target_candidate_id: candidate3
  });
  const oneOfThree = await rpc(fixture3.players[1], "get_tutti_frutti_game_state", { target_room_id: fixture3.roomId });
  equal(oneOfThree.round.letterDecision.votes, 1, "one of three votes does not reach the majority");
  equal(oneOfThree.round.phase, "LETTER_PENDING", "candidate remains pending below threshold");
  const twoOfThree = await rpc(fixture3.players[2], "submit_tutti_frutti_letter_skip_vote", {
    target_room_id: fixture3.roomId, target_candidate_id: candidate3
  });
  assert(twoOfThree.round.letterDecision.candidateId !== candidate3, "two of three votes skip immediately");

  const game4 = await rpc(fixture4.players[0], "start_tutti_frutti_session", { target_room_id: fixture4.roomId });
  const candidate4 = game4.round.letterDecision.candidateId;
  equal(game4.round.letterDecision.votesRequired, 3, "four players require three votes");
  await rpc(fixture4.players[0], "submit_tutti_frutti_letter_skip_vote", {
    target_room_id: fixture4.roomId, target_candidate_id: candidate4
  });
  const twoOfFour = await rpc(fixture4.players[1], "submit_tutti_frutti_letter_skip_vote", {
    target_room_id: fixture4.roomId, target_candidate_id: candidate4
  });
  equal(twoOfFour.round.letterDecision.votes, 2, "two of four is a tie and does not pass");
  equal(twoOfFour.round.letterDecision.votesRequired, 3, "tie remains below strict majority");
  equal(twoOfFour.round.letterDecision.candidateId, candidate4, "two-of-four tie preserves the candidate");

  const disconnectedPlayerId = psql(
    "select id from public.players where auth_user_id="
      + sqlString((await fixture4.players[3].auth.getUser()).data.user.id) + "::uuid"
  );
  psql("delete from public.room_participants where room_id=" + sqlString(fixture4.roomId)
    + "::uuid and player_id=" + sqlString(disconnectedPlayerId) + "::uuid");
  const stillFour = await rpc(fixture4.players[0], "get_tutti_frutti_game_state", { target_room_id: fixture4.roomId });
  equal(stillFour.round.letterDecision.votesRequired, 3, "a departed lobby participant remains in the frozen voting denominator");
  const afterThree = await rpc(fixture4.players[2], "submit_tutti_frutti_letter_skip_vote", {
    target_room_id: fixture4.roomId, target_candidate_id: candidate4
  });
  assert(afterThree.round.letterDecision.candidateId !== candidate4, "three of four frozen participants reach strict majority");
  equal(afterThree.round.number, 1, "replacement stays in the same round");
  equal(afterThree.round.letterDecision.votes, 0, "new candidate begins with no votes");
  equal(afterThree.round.letterDecision.hasVoted, false, "a voter's state resets when the candidate changes");

  const sessionId4 = game4.sessionId;
  const pending4 = afterThree.round.letterDecision.candidateId;
  const chosen4 = psql("select coalesce(array_agg(letter), '{}'::text[])::text from public.tutti_frutti_letter_candidates where session_id="
    + sqlString(sessionId4) + "::uuid");
  const existingLetters = chosen4.replace(/[{}]/g, "").split(",").filter(Boolean);
  const pool = ["A","B","C","D","E","F","G","H","I","J","L","M","N","O","P","R","S","T","U","V"];
  const fill = pool.filter((letter) => !existingLetters.includes(letter)).slice(0, 14);
  for (const letter of fill) {
    psql("insert into public.tutti_frutti_letter_candidates(id,session_id,round_id,letter,status) values (extensions.gen_random_uuid(),"
      + sqlString(sessionId4) + "::uuid,(select id from public.tutti_frutti_rounds where session_id="
      + sqlString(sessionId4) + "::uuid and round_number=1)," + sqlString(letter) + ",'skipped')");
  }
  const reserveState = await rpc(fixture4.players[0], "get_tutti_frutti_game_state", { target_room_id: fixture4.roomId });
  equal(reserveState.round.letterDecision.canSkip, false, "skip is blocked when it would leave too few session letters for remaining rounds");
  await rejects(fixture4.players[0], "submit_tutti_frutti_letter_skip_vote", {
    target_room_id: fixture4.roomId, target_candidate_id: pending4
  }, "P0040");
  psql("update public.tutti_frutti_letter_candidates set skip_deadline_at=clock_timestamp()-interval '1 second' where id="
    + sqlString(pending4) + "::uuid");
  const lazyResolved = await rpc(fixture4.players[0], "get_tutti_frutti_game_state", { target_room_id: fixture4.roomId });
  equal(lazyResolved.round.phase, "PLAYING", "any authorized game-state read lazily resolves an expired deadline");
  equal(psql("select status from public.tutti_frutti_letter_candidates where id=" + sqlString(pending4) + "::uuid"), "accepted", "lazy read persists candidate acceptance");

  await Promise.all(allPlayers.map((instance) => instance.realtime.disconnect()));
  await outsiders.realtime.disconnect();
} catch (error) {
  await Promise.all([...allPlayers, outsiders].map((instance) => instance.realtime.disconnect()));
  throw error;
}

console.log("PASS: Tutti Frutti Increment 8 strict majority, frozen roster, concurrent votes, reserve, privacy and lazy deadline resolution.");
