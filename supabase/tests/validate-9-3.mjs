import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

function readSupabaseEnv() {
  const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const env = {};

  for (const match of output.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)) {
    env[match[1]] = match[2];
  }

  for (const key of ["API_URL", "PUBLISHABLE_KEY", "DB_URL"]) {
    if (!env[key]) {
      throw new Error(`Missing ${key} from local Supabase status.`);
    }
  }

  return env;
}

const supabaseEnv = readSupabaseEnv();

function createAnonymousClient() {
  return createClient(supabaseEnv.API_URL, supabaseEnv.PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

function psql(sql) {
  return execFileSync("psql", [
    supabaseEnv.DB_URL,
    "--quiet",
    "--tuples-only",
    "--no-align",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    sql
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}.`);
  }
}

async function signInAnonymously(label) {
  const client = createAnonymousClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(`${label}: anonymous sign-in failed.`);
  }

  return { client, userId: data.user.id };
}

function singleRow(data, message) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function createGroup(client, groupName, playerNickname) {
  await markClientAsPlatformAdmin(client, psql, sqlString);

  const { data, error } = await client.rpc("create_group_with_admin_player", {
    group_name: groupName,
    player_nickname: playerNickname
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Create group RPC returned no row.");
}

async function joinGroup(client, invitationCode, playerNickname) {
  const { data, error } = await client.rpc("join_group_with_invitation", {
    invitation_code: invitationCode,
    player_nickname: playerNickname
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Join group RPC returned no row.");
}

async function addGroupWord(client, wordText) {
  const { data, error } = await client.rpc("add_group_word", {
    word_text: wordText
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Add word RPC returned no row.");
}

async function createRoom(client) {
  const { data, error } = await client.rpc("create_room");

  if (error) {
    throw error;
  }

  return singleRow(data, "create_room returned no rows.");
}

async function joinRoomByCode(client, roomCode) {
  const { data, error } = await client.rpc("join_room_by_code", {
    room_code: roomCode
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "join_room_by_code returned no rows.");
}

async function startSession(client) {
  return client.rpc("start_session");
}

async function startRoundDiscussion(client) {
  return client.rpc("start_round_discussion");
}

async function startRoundVoting(client) {
  return client.rpc("start_round_voting");
}

async function submitRoundVote(client, targetPlayerId) {
  return client.rpc("submit_round_vote", {
    target_player_id: targetPlayerId
  });
}

async function startSecondRoundVoting(client) {
  return client.rpc("start_second_round_voting");
}

async function getMyGameState(client) {
  const { data, error } = await client.rpc("get_my_game_state");
  assert(!error, `get_my_game_state should succeed: ${error?.message ?? ""}`);
  return singleRow(data, "get_my_game_state returned no row.");
}

function playerIdForAuthUser(authUserId) {
  return psql(`
    select id from public.players where auth_user_id = ${sqlString(authUserId)}::uuid;
  `);
}

function gameSessionIdForRoom(roomId) {
  return psql(`
    select coalesce(id::text, '')
    from public.game_sessions
    where room_id = ${sqlString(roomId)}::uuid;
  `);
}

function gameSessionState(gameSessionId) {
  return psql(`
    select state
    from public.game_sessions
    where id = ${sqlString(gameSessionId)}::uuid;
  `);
}

function roundSnapshot(gameSessionId) {
  return psql(`
    select concat_ws('|', id, game_session_id, group_id, number, secret_word, normalized_secret_word, impostor_player_id)
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
    order by number desc
    limit 1;
  `);
}

function setRoundOneImpostor(gameSessionId, playerId) {
  psql(`
    update public.rounds
    set impostor_player_id = ${sqlString(playerId)}::uuid
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = 1;
  `);
}

function roundVoteCount(gameSessionId, votingRound) {
  return Number(psql(`
    select count(*)
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = ${Number(votingRound)};
  `));
}

function readModelCandidateIds(row) {
  return (row.candidates ?? []).map((candidate) => candidate.player_id).sort();
}

function readModelResultPairs(row) {
  return (row.vote_results ?? [])
    .map((result) => `${result.player_id}:${result.vote_count}`)
    .sort();
}

function assertNoForbiddenReadModelFields(row, label) {
  assert(!("secret_word" in row), `${label}: read model must not expose secret_word.`);
  assert(!("normalized_secret_word" in row), `${label}: read model must not expose normalized_secret_word.`);
  assert(!("impostor_player_id" in row), `${label}: read model must not expose impostor_player_id.`);
  assert(!("round_votes" in row), `${label}: read model must not expose raw votes.`);
}

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 9.3 ${label}`, "Host");
  const players = [];

  for (const playerName of playerNames) {
    const auth = await signInAnonymously(`${label} ${playerName}`);
    await joinGroup(auth.client, group.invitation_code, playerName);
    players.push({
      ...auth,
      playerId: playerIdForAuthUser(auth.userId),
      nickname: playerName
    });
  }

  const room = await createRoom(host.client);

  for (const player of players) {
    await joinRoomByCode(player.client, room.room_join_code);
  }

  await addGroupWord(host.client, `Palabra ${label}`);
  const { error: startError } = await startSession(host.client);
  assert(!startError, `start_session should succeed for ${label}: ${startError?.message ?? ""}`);
  const gameSessionId = gameSessionIdForRoom(room.room_id);
  const { error: discussionError } = await startRoundDiscussion(host.client);
  assert(!discussionError, `start_round_discussion should succeed for ${label}: ${discussionError?.message ?? ""}`);
  const { error: votingError } = await startRoundVoting(host.client);
  assert(!votingError, `start_round_voting should succeed for ${label}: ${votingError?.message ?? ""}`);

  return {
    host: {
      ...host,
      playerId: group.player_id,
      nickname: "Host"
    },
    players,
    roomId: room.room_id,
    gameSessionId
  };
}

async function createTieFixture(label) {
  const fixture = await buildRoomWithPlayers(label, ["B", "C", "D"]);
  const [playerB, playerC, playerD] = fixture.players;

  await submitRoundVote(fixture.host.client, playerB.playerId);
  await submitRoundVote(playerB.client, playerC.playerId);
  await submitRoundVote(playerC.client, playerB.playerId);
  const { data, error } = await submitRoundVote(playerD.client, playerC.playerId);
  assert(!error, `last first-round vote should succeed: ${error?.message ?? ""}`);
  assertEqual(singleRow(data, "submit_round_vote returned no row.").state, "tie_discussion", "Tie should enter tie_discussion.");
  assertEqual(gameSessionState(fixture.gameSessionId), "tie_discussion", `${label} should be tied.`);

  return fixture;
}

async function main() {
  const tie = await createTieFixture("tie read model");
  const [tieB, tieC] = tie.players;
  setRoundOneImpostor(tie.gameSessionId, tieC.playerId);
  const tieHostState = await getMyGameState(tie.host.client);
  const tieBState = await getMyGameState(tieB.client);

  assertEqual(tieHostState.state, "tie_discussion", "Host should see tie_discussion.");
  assertEqual(tieHostState.my_vote_target_player_id, tieB.playerId, "Host should see only their own round 1 vote.");
  assertEqual(tieHostState.has_voted, true, "Host should be marked voted after first round.");
  assertEqual(tieHostState.vote_results.length, 2, "tie_discussion should expose aggregate first-round results.");
  assertEqual(tieHostState.vote_results[0].vote_count, 2, "Top tie result should include first-round count.");
  assertEqual(readModelCandidateIds(tieHostState).join(","), [tieB.playerId, tieC.playerId].sort().join(","), "tie_discussion candidates should be first-round tied players.");
  assertEqual(readModelCandidateIds(tieBState).join(","), [tieB.playerId, tieC.playerId].sort().join(","), "tie_discussion should show tied candidates even when caller is tied.");
  assertNoForbiddenReadModelFields(tieHostState, "tie_discussion");

  const { error: secondStartError } = await startSecondRoundVoting(tie.host.client);
  assert(!secondStartError, `start_second_round_voting should succeed: ${secondStartError?.message ?? ""}`);
  assertEqual(gameSessionState(tie.gameSessionId), "voting_second", "Host should enter voting_second.");

  const secondHostState = await getMyGameState(tie.host.client);
  const secondBState = await getMyGameState(tieB.client);

  assertEqual(secondHostState.state, "voting_second", "Host should see voting_second.");
  assertEqual(secondHostState.vote_results, null, "voting_second must not expose partial results.");
  assertEqual(secondHostState.my_vote_target_player_id, null, "Host should not carry round 1 vote into round 2.");
  assertEqual(secondHostState.has_voted, false, "Host should not be marked voted before round 2 vote.");
  assertEqual(readModelCandidateIds(secondHostState).join(","), [tieB.playerId, tieC.playerId].sort().join(","), "Host should see both tied candidates.");
  assertEqual(readModelCandidateIds(secondBState).join(","), [tieC.playerId].join(","), "A tied caller must not see self as second-round candidate.");
  assertNoForbiddenReadModelFields(secondHostState, "voting_second");

  const { error: hostVoteError } = await submitRoundVote(tie.host.client, tieB.playerId);
  assert(!hostVoteError, `host second-round vote should succeed: ${hostVoteError?.message ?? ""}`);
  const hostAfterSecondVote = await getMyGameState(tie.host.client);
  const cBeforeVote = await getMyGameState(tieC.client);

  assertEqual(hostAfterSecondVote.my_vote_target_player_id, tieB.playerId, "Host should see own round 2 vote.");
  assertEqual(hostAfterSecondVote.has_voted, true, "Host should be marked voted after round 2 vote.");
  assertEqual(hostAfterSecondVote.vote_results, null, "Own round 2 vote must not reveal partial counts.");
  assertEqual(cBeforeVote.my_vote_target_player_id, null, "Other players should not see host vote as their own.");
  assertEqual(cBeforeVote.vote_results, null, "Other players must not see partial second-round counts.");

  const beforeSnapshot = roundSnapshot(tie.gameSessionId);
  await submitRoundVote(tieB.client, tieC.playerId);
  await submitRoundVote(tieC.client, tieB.playerId);
  const finalResponse = await submitRoundVote(tie.players[2].client, tieB.playerId);
  assert(!finalResponse.error, `final second-round vote should succeed: ${finalResponse.error?.message ?? ""}`);
  assertEqual(gameSessionState(tie.gameSessionId), "round_result", "Second voting should resolve definitively.");

  const finalState = await getMyGameState(tie.host.client);
  assertEqual(finalState.state, "round_result", "Final read model should expose round_result.");
  assertEqual(finalState.candidates, null, "Final read model should not expose active candidates.");
  assertEqual(finalState.my_vote_target_player_id, tieB.playerId, "Final read model should keep caller own round 2 vote.");
  assertEqual(finalState.has_voted, true, "Final read model should use round 2 vote status.");
  assertEqual(roundVoteCount(tie.gameSessionId, 1), 4, "Round 1 votes should remain present.");
  assertEqual(roundVoteCount(tie.gameSessionId, 2), 4, "Round 2 votes should be present.");
  assert(readModelResultPairs(finalState).includes(`${tieB.playerId}:3`), "Final aggregate should come from round 2, not round 1.");
  assert(!readModelResultPairs(finalState).includes(`${tieC.playerId}:2`), "Final aggregate must not reuse first-round tie counts.");
  assertEqual(roundSnapshot(tie.gameSessionId), beforeSnapshot, "Read model and second voting must not mutate Round secrets.");
  assertNoForbiddenReadModelFields(finalState, "round_result after second vote");

  console.log("validate-9-3 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
