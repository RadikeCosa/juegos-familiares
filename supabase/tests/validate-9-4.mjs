import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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

function singleRow(data, message) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function signInAnonymously(label) {
  const client = createAnonymousClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(`${label}: anonymous sign-in failed.`);
  }

  return { client, userId: data.user.id };
}

async function rpcOk(client, fn, params, message) {
  const { data, error } = await client.rpc(fn, params);

  assert(!error, `${message}: ${error?.code ?? ""} ${error?.message ?? ""}`);
  return data;
}

async function expectRpcFailure(operation, expectedCode, message) {
  const { error } = await operation();

  assert(error, `${message}: expected RPC failure ${expectedCode}.`);
  assertEqual(error.code, expectedCode, `${message}: unexpected RPC error code.`);
}

async function createGroup(client, groupName, playerNickname) {
  return singleRow(await rpcOk(client, "create_group_with_admin_player", {
    group_name: groupName,
    player_nickname: playerNickname
  }, "create_group_with_admin_player should succeed"), "Create group RPC returned no row.");
}

async function joinGroup(client, invitationCode, playerNickname) {
  return singleRow(await rpcOk(client, "join_group_with_invitation", {
    invitation_code: invitationCode,
    player_nickname: playerNickname
  }, "join_group_with_invitation should succeed"), "Join group RPC returned no row.");
}

async function addGroupWord(client, wordText) {
  return singleRow(await rpcOk(client, "add_group_word", {
    word_text: wordText
  }, "add_group_word should succeed"), "Add word RPC returned no row.");
}

async function createRoom(client) {
  const data = await rpcOk(client, "create_room", undefined, "create_room should succeed");
  assert(Array.isArray(data) && data.length > 0, "create_room returned no rows.");
  return data[0];
}

async function joinRoomByCode(client, roomCode) {
  const data = await rpcOk(client, "join_room_by_code", {
    room_code: roomCode
  }, "join_room_by_code should succeed");
  assert(Array.isArray(data) && data.length > 0, "join_room_by_code returned no rows.");
  return data[0];
}

async function startSecondRoundVoting(client) {
  return client.rpc("start_second_round_voting");
}

async function submitRoundVote(client, targetPlayerId) {
  return client.rpc("submit_round_vote", {
    target_player_id: targetPlayerId
  });
}

async function getMyGameState(client) {
  const data = await rpcOk(client, "get_my_game_state", undefined, "get_my_game_state should succeed");
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

function setGameSessionState(gameSessionId, state) {
  psql(`
    update public.game_sessions
    set state = ${sqlString(state)}
    where id = ${sqlString(gameSessionId)}::uuid;
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

function deleteRoundOneVote(gameSessionId, voterPlayerId) {
  psql(`
    delete from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = 1
      and voter_player_id = ${sqlString(voterPlayerId)}::uuid;
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

function distinctVoterCount(gameSessionId, votingRound) {
  return Number(psql(`
    select count(distinct voter_player_id)
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = ${Number(votingRound)};
  `));
}

function voteTargetFor(gameSessionId, votingRound, voterPlayerId) {
  return psql(`
    select target_player_id
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = ${Number(votingRound)}
      and voter_player_id = ${sqlString(voterPlayerId)}::uuid;
  `);
}

function countPolicies(tableName) {
  return Number(psql(`
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = ${sqlString(tableName)};
  `));
}

function hasPrivilege(roleName, tableName, privilege) {
  return psql(`
    select has_table_privilege(
      ${sqlString(roleName)},
      'public.${tableName}',
      ${sqlString(privilege)}
    );
  `) === "t";
}

function isRealtimePublished(tableName) {
  return psql(`
    select exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = ${sqlString(tableName)}
    );
  `) === "t";
}

function candidateIds(row) {
  return (row.candidates ?? []).map((candidate) => candidate.player_id).sort();
}

function resultPairs(row) {
  return (row.vote_results ?? [])
    .map((result) => `${result.player_id}:${result.vote_count}`)
    .sort();
}

function successfulRows(results, message) {
  return results
    .filter((result) => !result.error)
    .map((result) => singleRow(result.data, message));
}

function assertRpcVoteResponseIsPrivate(row, context) {
  for (const forbidden of [
    "secret_word",
    "normalized_secret_word",
    "impostor_player_id",
    "voter_player_id",
    "target_player_id",
    "vote_count",
    "vote_results"
  ]) {
    assert(!(forbidden in row), `${context}: submit_round_vote must not expose ${forbidden}.`);
  }
}

function assertReadModelIsPrivate(row, context) {
  for (const forbidden of [
    "normalized_secret_word",
    "impostor_player_id",
    "round_votes",
    "voter_player_id",
    "target_player_id"
  ]) {
    assert(!(forbidden in row), `${context}: read model must not expose ${forbidden}.`);
  }

  const serialized = JSON.stringify(row);
  for (const forbiddenKey of [
    "normalized_secret_word",
    "impostor_player_id",
    "round_votes",
    "voter_player_id"
  ]) {
    assert(!serialized.includes(forbiddenKey), `${context}: nested read model must not expose ${forbiddenKey}.`);
  }
}

async function submitAndExpect(client, targetPlayerId, expectedState, expectedAlreadyRecorded = false) {
  const { data, error } = await submitRoundVote(client, targetPlayerId);
  assert(!error, `submit_round_vote should succeed: ${error?.code ?? ""} ${error?.message ?? ""}`);
  const row = singleRow(data, "submit_round_vote returned no row.");

  assertEqual(row.accepted, true, "Vote should be accepted.");
  assertEqual(row.already_recorded, expectedAlreadyRecorded, "already_recorded mismatch.");
  assertEqual(row.state, expectedState, "Returned state mismatch.");
  assertEqual(row.round_number, 1, "Returned round number mismatch.");
  assertRpcVoteResponseIsPrivate(row, `submit ${expectedState}`);
  return row;
}

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 9.4 ${label}`, "Host");
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

  return {
    host: {
      ...host,
      playerId: group.player_id,
      nickname: "Host"
    },
    players,
    roomId: room.room_id
  };
}

async function startVotingFixture(label, playerNames = ["B", "C", "D"]) {
  const fixture = await buildRoomWithPlayers(label, playerNames);
  await addGroupWord(fixture.host.client, `Palabra ${label}`);
  await rpcOk(fixture.host.client, "start_session", undefined, `${label}: start_session should succeed`);
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  await rpcOk(fixture.host.client, "start_round_discussion", undefined, `${label}: start_round_discussion should succeed`);
  await rpcOk(fixture.host.client, "start_round_voting", undefined, `${label}: start_round_voting should succeed`);

  return {
    ...fixture,
    gameSessionId
  };
}

async function createTieDiscussionFixture(label) {
  const fixture = await startVotingFixture(label);
  const [playerB, playerC, playerD] = fixture.players;

  await submitAndExpect(fixture.host.client, playerB.playerId, "voting_first");
  await submitAndExpect(playerB.client, playerC.playerId, "voting_first");
  await submitAndExpect(playerC.client, playerB.playerId, "voting_first");
  await submitAndExpect(playerD.client, playerC.playerId, "tie_discussion");
  assertEqual(gameSessionState(fixture.gameSessionId), "tie_discussion", `${label}: first round should tie.`);

  return fixture;
}

async function createSecondVotingFixture(label) {
  const fixture = await createTieDiscussionFixture(label);
  const { data, error } = await startSecondRoundVoting(fixture.host.client);

  assert(!error, `${label}: start_second_round_voting should succeed: ${error?.message ?? ""}`);
  const row = singleRow(data, "start_second_round_voting returned no row.");
  assertEqual(row.advanced, true, `${label}: start_second_round_voting should advance.`);
  assertEqual(row.already_in_phase, false, `${label}: first start should not be idempotent.`);
  assertEqual(row.state, "voting_second", `${label}: start state mismatch.`);
  assertEqual(gameSessionState(fixture.gameSessionId), "voting_second", `${label}: DB state mismatch.`);

  return fixture;
}

async function validatePrivacyContracts() {
  assertEqual(countPolicies("round_votes"), 0, "round_votes should not have direct policies.");
  assert(!isRealtimePublished("round_votes"), "round_votes must not be published through Realtime.");

  for (const roleName of ["anon", "authenticated", "public"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(!hasPrivilege(roleName, "round_votes", privilege), `${roleName} should not have ${privilege} on round_votes.`);
    }
  }
}

async function validateConcurrentSecondStart() {
  const fixture = await createTieDiscussionFixture("concurrent second start");
  const results = await Promise.all([
    startSecondRoundVoting(fixture.host.client),
    startSecondRoundVoting(fixture.host.client),
    startSecondRoundVoting(fixture.host.client),
    startSecondRoundVoting(fixture.host.client)
  ]);

  assert(results.every((result) => !result.error), "Concurrent second-start calls should all succeed consistently.");
  const rows = successfulRows(results, "Concurrent start returned no row.");
  assertEqual(rows.filter((row) => row.advanced === true).length, 1, "Only one start call should report a real advance.");
  assertEqual(rows.filter((row) => row.already_in_phase === true).length, 3, "Other start calls should report idempotent phase recovery.");
  assert(rows.every((row) => row.state === "voting_second"), "All concurrent start responses should converge to voting_second.");
  assertEqual(gameSessionState(fixture.gameSessionId), "voting_second", "Concurrent second-start DB state should converge to voting_second.");
  assertEqual(roundVoteCount(fixture.gameSessionId, 2), 0, "Starting second voting must not insert votes.");
}

async function validateRetriesRecoveryAndFinalConsistency() {
  const fixture = await createSecondVotingFixture("retries recovery final");
  const [playerB, playerC, playerD] = fixture.players;
  setRoundOneImpostor(fixture.gameSessionId, playerC.playerId);

  const retryStart = await startSecondRoundVoting(fixture.host.client);
  assert(!retryStart.error, `Retrying start_second_round_voting should succeed: ${retryStart.error?.message ?? ""}`);
  const retryStartRow = singleRow(retryStart.data, "Retry start returned no row.");
  assertEqual(retryStartRow.advanced, false, "Retrying start should not advance again.");
  assertEqual(retryStartRow.already_in_phase, true, "Retrying start should report already_in_phase.");

  const beforeVote = await getMyGameState(fixture.host.client);
  assertEqual(beforeVote.state, "voting_second", "Refresh before second vote should reconstruct voting_second.");
  assertEqual(beforeVote.has_voted, false, "Refresh before second vote should reconstruct has_voted false.");
  assertEqual(beforeVote.my_vote_target_player_id, null, "Refresh before second vote should not carry round 1 target.");
  assertEqual(beforeVote.vote_results, null, "voting_second must not expose partial results.");
  assertEqual(candidateIds(beforeVote).join(","), [playerB.playerId, playerC.playerId].sort().join(","), "Host second candidates should be tied players only.");
  assert(!candidateIds(beforeVote).includes(fixture.host.playerId), "Second candidates must not include players outside the tie.");
  assert(!candidateIds(beforeVote).includes(playerD.playerId), "Second candidates must not include non-tied players.");
  assertReadModelIsPrivate(beforeVote, "voting_second before vote");

  await submitAndExpect(fixture.host.client, playerB.playerId, "voting_second");
  assertEqual(roundVoteCount(fixture.gameSessionId, 2), 1, "One second-round vote should be stored.");
  await submitAndExpect(fixture.host.client, playerB.playerId, "voting_second", true);
  assertEqual(roundVoteCount(fixture.gameSessionId, 2), 1, "Same-target retry must not insert another vote.");
  await expectRpcFailure(
    () => submitRoundVote(fixture.host.client, playerC.playerId),
    "P0025",
    "Different-target retry should be immutable"
  );

  const recovered = await getMyGameState(fixture.host.client);
  const otherRecovered = await getMyGameState(playerC.client);
  assertEqual(recovered.has_voted, true, "Lost-response refresh should reconstruct caller has_voted.");
  assertEqual(recovered.my_vote_target_player_id, playerB.playerId, "Lost-response refresh should reconstruct caller round 2 target.");
  assertEqual(recovered.vote_results, null, "Lost-response refresh must not expose partial second results.");
  assertEqual(otherRecovered.my_vote_target_player_id, null, "Other player must not see host vote as their own.");
  assertEqual(otherRecovered.vote_results, null, "Other player must not see partial second results.");
  assertReadModelIsPrivate(recovered, "voting_second after own vote");
  assertReadModelIsPrivate(otherRecovered, "voting_second after other vote");

  await submitAndExpect(playerB.client, playerC.playerId, "voting_second");
  await submitAndExpect(playerC.client, playerB.playerId, "voting_second");
  await submitAndExpect(playerD.client, playerB.playerId, "round_result");
  assertEqual(gameSessionState(fixture.gameSessionId), "round_result", "Second-round final state should be round_result.");
  assertEqual(roundVoteCount(fixture.gameSessionId, 1), 4, "First-round votes should remain intact.");
  assertEqual(roundVoteCount(fixture.gameSessionId, 2), 4, "Second-round votes should be complete.");

  await submitAndExpect(fixture.host.client, playerB.playerId, "round_result", true);
  assertEqual(roundVoteCount(fixture.gameSessionId, 2), 4, "Retry after final must not insert a vote.");
  await expectRpcFailure(
    () => submitRoundVote(fixture.host.client, playerC.playerId),
    "P0018",
    "Different-target retry after final should not be accepted"
  );

  const finalState = await getMyGameState(fixture.host.client);
  assertEqual(finalState.state, "round_result", "Refresh after second resolution should reconstruct round_result.");
  assertEqual(finalState.has_voted, true, "Final read model should use round 2 own vote.");
  assertEqual(finalState.my_vote_target_player_id, playerB.playerId, "Final read model should keep round 2 own target.");
  assertEqual(finalState.candidates, null, "Final read model should not expose active candidates.");
  assert(resultPairs(finalState).includes(`${playerB.playerId}:3`), "Final results should come from voting_round 2.");
  assert(!resultPairs(finalState).includes(`${playerC.playerId}:2`), "Final results must not reuse first-round tie tally.");
  assertReadModelIsPrivate(finalState, "round_result after second voting");
}

async function validateConcurrentLastVotes() {
  const fixture = await createSecondVotingFixture("concurrent last votes 9.4");
  const [playerB, playerC, playerD] = fixture.players;

  await submitAndExpect(fixture.host.client, playerB.playerId, "voting_second");
  await submitAndExpect(playerB.client, playerC.playerId, "voting_second");

  const results = await Promise.all([
    submitRoundVote(playerC.client, playerB.playerId),
    submitRoundVote(playerD.client, playerC.playerId)
  ]);

  assert(results.every((result) => !result.error), "Concurrent last second-round votes should all succeed.");
  const rows = successfulRows(results, "Concurrent second vote returned no row.");
  rows.forEach((row) => assertRpcVoteResponseIsPrivate(row, "concurrent second vote"));
  assertEqual(rows.filter((row) => row.state === "round_result").length, 1, "Exactly one concurrent second-vote response should observe final resolution.");
  assertEqual(rows.filter((row) => row.state === "voting_second").length, 1, "Exactly one concurrent second-vote response should observe pre-final state.");
  assertEqual(gameSessionState(fixture.gameSessionId), "round_result", "Concurrent second votes should resolve once.");
  assertEqual(roundVoteCount(fixture.gameSessionId, 2), 4, "Concurrent second votes should store one vote per player.");
  assertEqual(distinctVoterCount(fixture.gameSessionId, 2), 4, "Concurrent second votes should not duplicate voters.");
  assert(gameSessionState(fixture.gameSessionId) !== "tie_discussion", "Second voting must not return to tie_discussion.");
}

async function validateNoThirdVoting() {
  const fixture = await createSecondVotingFixture("no third voting");
  const [playerB, playerC, playerD] = fixture.players;

  await submitAndExpect(fixture.host.client, playerB.playerId, "voting_second");
  await submitAndExpect(playerB.client, playerC.playerId, "voting_second");
  await submitAndExpect(playerC.client, playerB.playerId, "voting_second");
  await submitAndExpect(playerD.client, playerC.playerId, "round_result");
  assertEqual(gameSessionState(fixture.gameSessionId), "round_result", "A second-round tie should resolve to round_result.");
  await expectRpcFailure(
    () => startSecondRoundVoting(fixture.host.client),
    "P0018",
    "A resolved second-round tie must not start a third vote"
  );
  assertEqual(gameSessionState(fixture.gameSessionId), "round_result", "A failed third-vote attempt must not mutate final state.");
}

async function validateInvalidStates() {
  const discussion = await buildRoomWithPlayers("invalid discussion", ["B", "C"]);
  await addGroupWord(discussion.host.client, "Palabra invalid discussion");
  await rpcOk(discussion.host.client, "start_session", undefined, "invalid discussion start_session");
  const discussionSessionId = gameSessionIdForRoom(discussion.roomId);
  await rpcOk(discussion.host.client, "start_round_discussion", undefined, "invalid discussion start_round_discussion");
  await expectRpcFailure(
    () => startSecondRoundVoting(discussion.host.client),
    "P0018",
    "Cannot start second voting from discussion"
  );
  await expectRpcFailure(
    () => submitRoundVote(discussion.host.client, discussion.players[0].playerId),
    "P0018",
    "Cannot vote from discussion"
  );

  await rpcOk(discussion.host.client, "start_round_voting", undefined, "invalid voting_first start_round_voting");
  await expectRpcFailure(
    () => startSecondRoundVoting(discussion.host.client),
    "P0018",
    "Cannot start second voting from voting_first"
  );

  for (const terminalState of ["impostor_guess", "round_result"]) {
    setGameSessionState(discussionSessionId, terminalState);
    await expectRpcFailure(
      () => startSecondRoundVoting(discussion.host.client),
      "P0018",
      `Cannot start second voting from ${terminalState}`
    );
  }

  const second = await createSecondVotingFixture("invalid second voting");
  const [playerB, , playerD] = second.players;
  await expectRpcFailure(
    () => submitRoundVote(second.host.client, second.host.playerId),
    "P0024",
    "Self-vote should be rejected in second voting"
  );
  await expectRpcFailure(
    () => submitRoundVote(playerB.client, playerB.playerId),
    "P0024",
    "Tied player self-vote should be rejected in second voting"
  );
  await expectRpcFailure(
    () => submitRoundVote(playerD.client, second.host.playerId),
    "P0024",
    "Target outside tie should be rejected in second voting"
  );

  setGameSessionState(second.gameSessionId, "discussion");
  await expectRpcFailure(
    () => submitRoundVote(second.host.client, playerB.playerId),
    "P0018",
    "Cannot cast second vote outside voting_second"
  );

  const malformed = await createSecondVotingFixture("malformed tie reconstruction");
  deleteRoundOneVote(malformed.gameSessionId, malformed.players[1].playerId);
  await expectRpcFailure(
    () => submitRoundVote(malformed.host.client, malformed.players[0].playerId),
    "P0022",
    "Second voting should fail consistently when first-round tie cannot be reconstructed"
  );

  setRoundOneImpostor(malformed.gameSessionId, malformed.players[0].playerId);
}

async function validateSecondUniqueImpostorResult() {
  const fixture = await createSecondVotingFixture("impostor final consistency");
  const [playerB, playerC, playerD] = fixture.players;
  setRoundOneImpostor(fixture.gameSessionId, playerB.playerId);

  await submitAndExpect(fixture.host.client, playerB.playerId, "voting_second");
  await submitAndExpect(playerB.client, playerC.playerId, "voting_second");
  await submitAndExpect(playerC.client, playerB.playerId, "voting_second");
  await submitAndExpect(playerD.client, playerB.playerId, "impostor_guess");
  assertEqual(gameSessionState(fixture.gameSessionId), "impostor_guess", "Unique impostor top in second round should enter impostor_guess.");

  await submitAndExpect(fixture.host.client, playerB.playerId, "impostor_guess", true);
  assertEqual(voteTargetFor(fixture.gameSessionId, 2, fixture.host.playerId), playerB.playerId, "Final retry should preserve second-round vote.");
  const finalState = await getMyGameState(fixture.host.client);
  assertEqual(finalState.state, "impostor_guess", "Refresh should preserve impostor_guess after second round.");
  assert(resultPairs(finalState).includes(`${playerB.playerId}:3`), "impostor_guess final aggregate should use voting_round 2.");
  assertReadModelIsPrivate(finalState, "impostor_guess after second voting");
}

async function main() {
  await validatePrivacyContracts();
  await validateConcurrentSecondStart();
  await validateRetriesRecoveryAndFinalConsistency();
  await validateConcurrentLastVotes();
  await validateNoThirdVoting();
  await validateInvalidStates();
  await validateSecondUniqueImpostorResult();

  console.log("validate-9-4 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
