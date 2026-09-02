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

async function expectRpcFailure(operation, expectedCode) {
  const { error } = await operation();

  assert(error, `Expected RPC failure ${expectedCode}.`);
  assertEqual(error.code, expectedCode, "Unexpected RPC error code.");
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

function roundIdForGameSession(gameSessionId) {
  return psql(`
    select id
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

function roundSnapshot(gameSessionId) {
  return psql(`
    select concat_ws('|', id, game_session_id, group_id, number, secret_word, normalized_secret_word, impostor_player_id)
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
    order by number desc
    limit 1;
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

function voteTargetFor(gameSessionId, votingRound, voterPlayerId) {
  return psql(`
    select target_player_id
    from public.round_votes
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and voting_round = ${Number(votingRound)}
      and voter_player_id = ${sqlString(voterPlayerId)}::uuid;
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

function hasTable(tableName) {
  return psql(`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${sqlString(tableName)}
    );
  `) === "t";
}

function constraintDefinition(tableName, constraintName) {
  return psql(`
    select pg_get_constraintdef(pg_constraint.oid)
    from pg_constraint
    join pg_class
      on pg_class.oid = pg_constraint.conrelid
    join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = ${sqlString(tableName)}
      and pg_constraint.conname = ${sqlString(constraintName)};
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

function hasFunctionExecute(roleName, functionSignature) {
  return psql(`
    select has_function_privilege(
      ${sqlString(roleName)},
      ${sqlString(`public.${functionSignature}`)},
      'execute'
    );
  `) === "t";
}

function functionArgs(functionName) {
  return psql(`
    select pg_get_function_arguments(pg_proc.oid)
    from pg_proc
    join pg_namespace
      on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = ${sqlString(functionName)};
  `);
}

async function buildRoomWithPlayers(label, playerNames) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 9.2 ${label}`, "Host");
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
    group,
    players,
    roomId,
    roomCode
  };
}

async function startVotingFixture(label, playerNames = ["B", "C"]) {
  const fixture = await buildRoomWithPlayers(label, playerNames);
  await addGroupWord(fixture.host.client, `Palabra ${label}`);
  const { error: startError } = await startSession(fixture.host.client);
  assert(!startError, `start_session should succeed for ${label}: ${startError?.message ?? ""}`);
  const gameSessionId = gameSessionIdForRoom(fixture.roomId);
  const { error: discussionError } = await startRoundDiscussion(fixture.host.client);
  assert(!discussionError, `start_round_discussion should succeed for ${label}: ${discussionError?.message ?? ""}`);
  const { error: votingError } = await startRoundVoting(fixture.host.client);
  assert(!votingError, `start_round_voting should succeed for ${label}: ${votingError?.message ?? ""}`);

  return {
    ...fixture,
    gameSessionId,
    roundId: roundIdForGameSession(gameSessionId)
  };
}

async function startSecondVotingFixture(label) {
  const fixture = await startVotingFixture(label, ["B", "C", "D"]);
  const [playerB, playerC, playerD] = fixture.players;

  await submitAndExpect(fixture.host.client, playerB.playerId, "voting_first", 1);
  await submitAndExpect(playerB.client, playerC.playerId, "voting_first", 1);
  await submitAndExpect(playerC.client, playerB.playerId, "voting_first", 1);
  await submitAndExpect(playerD.client, playerC.playerId, "tie_discussion", 1);
  assertEqual(gameSessionState(fixture.gameSessionId), "tie_discussion", `${label} should enter tie_discussion.`);

  const { error } = await startSecondRoundVoting(fixture.host.client);
  assert(!error, `start_second_round_voting should succeed for ${label}: ${error?.message ?? ""}`);
  assertEqual(gameSessionState(fixture.gameSessionId), "voting_second", `${label} should enter voting_second.`);

  return fixture;
}

async function submitAndExpect(client, targetPlayerId, expectedState, expectedVotingRound, expectedAlreadyRecorded = false) {
  const { data, error } = await submitRoundVote(client, targetPlayerId);
  assert(!error, `submit_round_vote should succeed: ${error?.message ?? ""}`);
  const row = singleRow(data, "submit_round_vote returned no row.");

  assertEqual(row.accepted, true, "Vote should be accepted.");
  assertEqual(row.already_recorded, expectedAlreadyRecorded, "already_recorded mismatch.");
  assertEqual(row.state, expectedState, "Returned state mismatch.");
  assertEqual(row.round_number, 1, "Returned round mismatch.");
  assert(!("secret_word" in row), "submit_round_vote must not return secret_word.");
  assert(!("normalized_secret_word" in row), "submit_round_vote must not return normalized_secret_word.");
  assert(!("impostor_player_id" in row), "submit_round_vote must not return impostor_player_id.");
  assert(!("target_player_id" in row), "submit_round_vote must not return target_player_id.");
  assert(!("vote_count" in row), "submit_round_vote must not return vote_count.");

  void expectedVotingRound;
  return row;
}

async function main() {
  const stateCheck = constraintDefinition("game_sessions", "game_sessions_state_check");
  assert(stateCheck.includes("voting_second"), "game_sessions.state should allow voting_second.");
  assert(!hasColumn("game_sessions", "tie_candidates"), "game_sessions must not include tie_candidates.");
  assert(!hasTable("tie_candidates"), "9.2 must not create tie_candidates table.");
  assertEqual(functionArgs("submit_round_vote"), "target_player_id uuid", "submit_round_vote signature must stay unchanged.");
  assert(!hasFunctionExecute("anon", "submit_round_vote(uuid)"), "anon must not execute submit_round_vote.");
  assert(hasFunctionExecute("authenticated", "submit_round_vote(uuid)"), "authenticated must execute submit_round_vote.");
  assert(!hasFunctionExecute("public", "submit_round_vote(uuid)"), "public must not execute submit_round_vote.");
  assertEqual(countPolicies("round_votes"), 0, "round_votes should not gain direct policies.");
  for (const roleName of ["anon", "authenticated", "public"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(!hasPrivilege(roleName, "round_votes", privilege), `${roleName} should not have ${privilege} on round_votes.`);
    }
  }

  const regression = await startVotingFixture("first regression", ["B", "C"]);
  await submitAndExpect(regression.host.client, regression.players[0].playerId, "voting_first", 1);
  assertEqual(roundVoteCount(regression.gameSessionId, 1), 1, "First vote should insert voting_round 1.");
  await submitAndExpect(regression.host.client, regression.players[0].playerId, "voting_first", 1, true);
  await expectRpcFailure(() => submitRoundVote(regression.host.client, regression.players[1].playerId), "P0025");
  await expectRpcFailure(() => submitRoundVote(regression.players[0].client, regression.players[0].playerId), "P0024");

  const firstImpostorWin = await startVotingFixture("first impostor unique", ["B", "C"]);
  const firstImpostor = firstImpostorWin.players[1];
  setRoundOneImpostor(firstImpostorWin.gameSessionId, firstImpostor.playerId);
  await submitAndExpect(firstImpostorWin.host.client, firstImpostor.playerId, "voting_first", 1);
  await submitAndExpect(firstImpostorWin.players[0].client, firstImpostor.playerId, "voting_first", 1);
  await submitAndExpect(firstImpostor.client, firstImpostorWin.host.playerId, "impostor_guess", 1);
  assertEqual(gameSessionState(firstImpostorWin.gameSessionId), "impostor_guess", "First vote impostor top should still resolve.");

  const validSecond = await startSecondVotingFixture("valid second");
  const [validB, validC, validD] = validSecond.players;
  const beforeSnapshot = roundSnapshot(validSecond.gameSessionId);
  await expectRpcFailure(() => submitRoundVote(validSecond.host.client, validSecond.host.playerId), "P0024");
  await expectRpcFailure(() => submitRoundVote(validB.client, validB.playerId), "P0024");
  await expectRpcFailure(() => submitRoundVote(validD.client, validD.playerId), "P0024");
  await expectRpcFailure(() => submitRoundVote(validB.client, validSecond.host.playerId), "P0024");
  await expectRpcFailure(() => submitRoundVote(validD.client, validSecond.host.playerId), "P0024");
  await submitAndExpect(validSecond.host.client, validB.playerId, "voting_second", 2);
  assertEqual(gameSessionState(validSecond.gameSessionId), "voting_second", "Second vote should wait for missing voters.");
  assertEqual(roundVoteCount(validSecond.gameSessionId, 2), 1, "First second-round vote should insert voting_round 2.");
  await submitAndExpect(validSecond.host.client, validB.playerId, "voting_second", 2, true);
  await expectRpcFailure(() => submitRoundVote(validSecond.host.client, validC.playerId), "P0025");
  await submitAndExpect(validB.client, validC.playerId, "voting_second", 2);
  await submitAndExpect(validC.client, validB.playerId, "voting_second", 2);
  await submitAndExpect(validD.client, validC.playerId, "round_result", 2);
  assertEqual(gameSessionState(validSecond.gameSessionId), "round_result", "Second tie should resolve to round_result.");
  assertEqual(roundVoteCount(validSecond.gameSessionId, 2), 4, "All SessionPlayers should vote in round 2.");
  assertEqual(roundSnapshot(validSecond.gameSessionId), beforeSnapshot, "Second voting must not mutate Round secrets.");
  assertEqual(voteTargetFor(validSecond.gameSessionId, 1, validSecond.host.playerId), validB.playerId, "Round 1 vote should remain intact.");
  assertEqual(voteTargetFor(validSecond.gameSessionId, 2, validSecond.host.playerId), validB.playerId, "Round 2 vote should be independent.");
  await submitAndExpect(validD.client, validC.playerId, "round_result", 2, true);

  const secondImpostor = await startSecondVotingFixture("second impostor unique");
  const [impostorB, impostorC, impostorD] = secondImpostor.players;
  setRoundOneImpostor(secondImpostor.gameSessionId, impostorB.playerId);
  await submitAndExpect(secondImpostor.host.client, impostorB.playerId, "voting_second", 2);
  await submitAndExpect(impostorB.client, impostorC.playerId, "voting_second", 2);
  await submitAndExpect(impostorC.client, impostorB.playerId, "voting_second", 2);
  await submitAndExpect(impostorD.client, impostorB.playerId, "impostor_guess", 2);
  assertEqual(gameSessionState(secondImpostor.gameSessionId), "impostor_guess", "Impostor unique top in second vote should go to impostor_guess.");

  const wrongUnique = await startSecondVotingFixture("wrong unique");
  const [wrongB, wrongC, wrongD] = wrongUnique.players;
  setRoundOneImpostor(wrongUnique.gameSessionId, wrongC.playerId);
  await submitAndExpect(wrongUnique.host.client, wrongB.playerId, "voting_second", 2);
  await submitAndExpect(wrongB.client, wrongC.playerId, "voting_second", 2);
  await submitAndExpect(wrongC.client, wrongB.playerId, "voting_second", 2);
  await submitAndExpect(wrongD.client, wrongB.playerId, "round_result", 2);
  assertEqual(gameSessionState(wrongUnique.gameSessionId), "round_result", "Wrong unique top in second vote should go to round_result.");

  const concurrent = await startSecondVotingFixture("concurrent last votes");
  await submitAndExpect(concurrent.host.client, concurrent.players[0].playerId, "voting_second", 2);
  await submitAndExpect(concurrent.players[0].client, concurrent.players[1].playerId, "voting_second", 2);
  const concurrentResults = await Promise.all([
    submitRoundVote(concurrent.players[1].client, concurrent.players[0].playerId),
    submitRoundVote(concurrent.players[2].client, concurrent.players[1].playerId)
  ]);
  assert(concurrentResults.every((result) => !result.error), "Concurrent last second-round votes should succeed.");
  const concurrentRows = concurrentResults.map((result) => singleRow(result.data, "Concurrent submit returned no row."));
  assertEqual(
    concurrentRows.filter((row) => row.state === "round_result").length,
    1,
    "Exactly one concurrent last vote should observe final second-round resolution."
  );
  assertEqual(
    concurrentRows.filter((row) => row.state === "voting_second").length,
    1,
    "Exactly one concurrent last vote should observe waiting state before final resolution."
  );
  assertEqual(gameSessionState(concurrent.gameSessionId), "round_result", "Concurrent second-round votes should converge to final state.");
  assertEqual(roundVoteCount(concurrent.gameSessionId, 2), 4, "Concurrent second-round votes should create one vote each.");
  assert(gameSessionState(concurrent.gameSessionId) !== "tie_discussion", "Second voting must not create a third-vote tie_discussion.");

  console.log("validate-9-2 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
