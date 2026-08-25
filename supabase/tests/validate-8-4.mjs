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

  assert(Array.isArray(data) && data.length > 0, "create_room returned no rows.");
  return data;
}

async function joinRoomByCode(client, roomCode) {
  const { data, error } = await client.rpc("join_room_by_code", {
    room_code: roomCode
  });

  if (error) {
    throw error;
  }

  assert(Array.isArray(data) && data.length > 0, "join_room_by_code returned no rows.");
  return data;
}

async function rpcOk(client, fn, params, message) {
  const { data, error } = await client.rpc(fn, params);

  assert(!error, `${message}: ${error?.code ?? ""} ${error?.message ?? ""}`);
  return data;
}

async function getMyGameState(client) {
  const { data, error } = await client.rpc("get_my_game_state");

  if (error) {
    throw error;
  }

  return singleRow(data, "get_my_game_state returned no row.");
}

async function submitRoundVote(client, targetPlayerId) {
  return client.rpc("submit_round_vote", {
    target_player_id: targetPlayerId
  });
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

function roundVoteCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = 1;
  `));
}

function voteTargetFor(gameSessionId, voterPlayerId) {
  return psql(`
    select target_player_id
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = 1
      and voter_player_id = ${sqlString(voterPlayerId)}::uuid;
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

function hasColumn(tableName, columnName) {
  return psql(`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${sqlString(tableName)}
        and column_name = ${sqlString(columnName)}
    );
  `) === "t";
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

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 8.4 ${label}`, "Host");
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

  const roomRows = await createRoom(host.client);
  const roomId = roomRows[0].room_id;
  const roomCode = roomRows[0].room_join_code;

  for (const player of players) {
    await joinRoomByCode(player.client, roomCode);
  }

  return {
    host: {
      ...host,
      playerId: group.player_id,
      nickname: "Host"
    },
    players,
    roomId
  };
}

async function startVotingFixture(label, playerNames = ["B", "C"]) {
  const fixture = await buildRoomWithPlayers(label, playerNames);
  await addGroupWord(fixture.host.client, `Palabra ${label}`);
  await rpcOk(fixture.host.client, "start_session", undefined, "start_session should succeed");
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  await rpcOk(fixture.host.client, "start_round_discussion", undefined, "start_round_discussion should succeed");
  await rpcOk(fixture.host.client, "start_round_voting", undefined, "start_round_voting should succeed");

  return {
    ...fixture,
    gameSessionId
  };
}

function assertNoForbiddenReadModelFields(row, context) {
  for (const forbidden of [
    "normalized_secret_word",
    "secret_word",
    "impostor_player_id",
    "voter_player_id",
    "target_player_id",
    "score",
    "scoreboard",
    "winner"
  ]) {
    assert(!(forbidden in row), `${context}: must not expose ${forbidden}.`);
  }
}

function candidateIds(row) {
  return (row.candidates ?? []).map((candidate) => candidate.player_id);
}

function resultTargets(row) {
  return (row.vote_results ?? []).map((result) => result.player_id);
}

function successfulRows(results) {
  return results
    .filter((result) => !result.error)
    .map((result) => singleRow(result.data, "RPC result returned no row."));
}

async function main() {
  assert(!hasColumn("rounds", "status"), "8.4 must not add Round.status.");
  assert(!hasColumn("rounds", "score"), "8.4 must not add scoring.");
  assert(!isRealtimePublished("round_votes"), "round_votes must not be in Realtime.");
  for (const roleName of ["anon", "authenticated", "public"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(!hasPrivilege(roleName, "round_votes", privilege), `${roleName} should not have ${privilege} on round_votes.`);
    }
  }

  const reconstruct = await startVotingFixture("reconstruct", ["B", "C"]);
  const hostVoting = await getMyGameState(reconstruct.host.client);
  const playerVoting = await getMyGameState(reconstruct.players[0].client);
  assertEqual(hostVoting.state, "voting_first", "Host should reconstruct voting_first.");
  assertEqual(playerVoting.state, "voting_first", "Player should reconstruct voting_first.");
  assertEqual(hostVoting.has_voted, false, "Host should reconstruct has_voted false.");
  assertEqual(playerVoting.has_voted, false, "Player should reconstruct has_voted false.");
  assert(!candidateIds(hostVoting).includes(reconstruct.host.playerId), "Host candidates should exclude self.");
  assert(!candidateIds(playerVoting).includes(reconstruct.players[0].playerId), "Player candidates should exclude self.");
  assertEqual(hostVoting.vote_results, null, "Host must not see partial results during voting_first.");
  assertEqual(playerVoting.vote_results, null, "Player must not see partial results during voting_first.");
  assertNoForbiddenReadModelFields(hostVoting, "host voting_first");
  assertNoForbiddenReadModelFields(playerVoting, "player voting_first");

  await rpcOk(reconstruct.host.client, "submit_round_vote", {
    target_player_id: reconstruct.players[0].playerId
  }, "host vote should succeed");
  const hostAfterRefresh = await getMyGameState(reconstruct.host.client);
  const playerAfterHostVote = await getMyGameState(reconstruct.players[0].client);
  assertEqual(hostAfterRefresh.has_voted, true, "Refresh should reconstruct has_voted true.");
  assertEqual(hostAfterRefresh.my_vote_target_player_id, reconstruct.players[0].playerId, "Refresh should reconstruct own target.");
  assertEqual(playerAfterHostVote.has_voted, false, "Other player must not infer host voted.");
  assertEqual(playerAfterHostVote.my_vote_target_player_id, null, "Other player must not see host target.");
  assertEqual(playerAfterHostVote.vote_results, null, "Other player must not see partial counts.");

  const differentTarget = await startVotingFixture("different target race", ["B", "C"]);
  const raceResults = await Promise.all([
    submitRoundVote(differentTarget.host.client, differentTarget.players[0].playerId),
    submitRoundVote(differentTarget.host.client, differentTarget.players[1].playerId)
  ]);
  assertEqual(successfulRows(raceResults).length, 1, "Different-target race should have exactly one success.");
  assert(
    raceResults.some((result) => result.error?.code === "P0025"),
    "Different-target race should reject the later target change."
  );
  assertEqual(roundVoteCount(differentTarget.gameSessionId), 1, "Different-target race should store one vote.");
  assert(
    [
      differentTarget.players[0].playerId,
      differentTarget.players[1].playerId
    ].includes(voteTargetFor(differentTarget.gameSessionId, differentTarget.host.playerId)),
    "Stored target should be one submitted target."
  );

  const lastVotes = await startVotingFixture("last votes race", ["B", "C", "D"]);
  setRoundOneImpostor(lastVotes.gameSessionId, lastVotes.players[3 - 1].playerId);
  await rpcOk(lastVotes.host.client, "submit_round_vote", {
    target_player_id: lastVotes.players[0].playerId
  }, "first vote should succeed");
  await rpcOk(lastVotes.players[0].client, "submit_round_vote", {
    target_player_id: lastVotes.host.playerId
  }, "second vote should succeed");
  const finalRaceResults = await Promise.all([
    submitRoundVote(lastVotes.players[1].client, lastVotes.players[2].playerId),
    submitRoundVote(lastVotes.players[2].client, lastVotes.players[1].playerId)
  ]);
  assert(finalRaceResults.every((result) => !result.error), "Last votes from different players should both succeed.");
  assertEqual(roundVoteCount(lastVotes.gameSessionId), 4, "All SessionPlayers should have one vote.");
  assertEqual(gameSessionState(lastVotes.gameSessionId), "tie_discussion", "Concurrent last votes should resolve exactly once to tie_discussion.");
  const finalRows = successfulRows(finalRaceResults);
  assertEqual(
    finalRows.filter((row) => row.state === "tie_discussion").length,
    1,
    "Exactly one concurrent last-vote response should observe final resolution."
  );
  const aggregateAfterRefresh = await getMyGameState(lastVotes.host.client);
  assertEqual(aggregateAfterRefresh.state, "tie_discussion", "Refresh should reconstruct final aggregate state.");
  assert(Array.isArray(aggregateAfterRefresh.vote_results), "Final state should return aggregate results.");
  assert(aggregateAfterRefresh.candidates === null || Array.isArray(aggregateAfterRefresh.candidates), "Later increments may expose structured tie candidates.");
  assert(resultTargets(aggregateAfterRefresh).includes(lastVotes.host.playerId), "Aggregate should include accused candidates.");
  assertNoForbiddenReadModelFields(aggregateAfterRefresh, "tie_discussion aggregate");

  const retryAfterFinal = await submitRoundVote(lastVotes.host.client, lastVotes.players[0].playerId);
  assert(!retryAfterFinal.error, `Retry after final state should succeed: ${retryAfterFinal.error?.message ?? ""}`);
  const retryRow = singleRow(retryAfterFinal.data, "Retry after final returned no row.");
  assertEqual(retryRow.already_recorded, true, "Retry after final should be idempotent.");
  assertEqual(retryRow.state, "tie_discussion", "Retry after final should return current final state.");
  assertEqual(roundVoteCount(lastVotes.gameSessionId), 4, "Retry after final must not insert votes.");

  const wrong = await startVotingFixture("round result refresh", ["B", "C"]);
  const realImpostor = wrong.players[1];
  const wrongTarget = wrong.players[0];
  setRoundOneImpostor(wrong.gameSessionId, realImpostor.playerId);
  await rpcOk(wrong.host.client, "submit_round_vote", { target_player_id: wrongTarget.playerId }, "wrong host vote");
  await rpcOk(wrongTarget.client, "submit_round_vote", { target_player_id: wrong.host.playerId }, "wrong target vote");
  await rpcOk(realImpostor.client, "submit_round_vote", { target_player_id: wrongTarget.playerId }, "wrong impostor vote");
  const wrongRefresh = await getMyGameState(wrong.host.client);
  assertEqual(wrongRefresh.state, "round_result", "Refresh should reconstruct round_result.");
  assert(Array.isArray(wrongRefresh.vote_results), "round_result should return aggregate results.");
  assertNoForbiddenReadModelFields(wrongRefresh, "round_result aggregate");

  console.log("validate-8-4 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
