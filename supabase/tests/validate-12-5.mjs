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

  assertLocalSupabaseEnv(env);
  return env;
}

function assertLocalSupabaseEnv(env) {
  const apiUrl = new URL(env.API_URL);

  assert(
    ["127.0.0.1", "localhost"].includes(apiUrl.hostname),
    `Refusing to validate against non-local API_URL ${env.API_URL}.`
  );
  assert(
    /127\.0\.0\.1|localhost/.test(env.DB_URL),
    `Refusing to validate against non-local DB_URL ${env.DB_URL}.`
  );
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

function psqlJson(sql) {
  const output = psql(sql);

  if (!output) {
    return null;
  }

  return JSON.parse(output);
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

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${message} Expected ${expectedJson}, got ${actualJson}.`);
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

async function expectRpcFailure(operation, expectedCodes, message) {
  const { error } = await operation();
  const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];

  assert(error, `${message}: expected RPC failure ${codes.join(" or ")}.`);
  assert(
    codes.includes(error.code),
    `${message}: unexpected RPC error code. Expected ${codes.join(" or ")}, got ${error.code}.`
  );
}

async function expectDirectReadBlocked(client, tableName, message) {
  const { data, error } = await client.from(tableName).select("*").limit(1);

  assert(error, `${message}: direct read should be rejected, got ${JSON.stringify(data)}.`);
  assert(
    ["42501", "401", "PGRST301"].includes(error.code),
    `${message}: unexpected direct read error code ${error.code}.`
  );
}

async function createGroup(client, groupName, playerNickname) {
  await markClientAsPlatformAdmin(client, psql, sqlString);

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
  return singleRow(await rpcOk(client, "create_room", undefined, "create_room should succeed"), "Create room RPC returned no row.");
}

async function joinRoomByCode(client, roomCode) {
  return singleRow(await rpcOk(client, "join_room_by_code", {
    room_code: roomCode
  }, "join_room_by_code should succeed"), "Join room RPC returned no row.");
}

async function advanceScoreboard(client, label) {
  return singleRow(await rpcOk(
    client,
    "advance_round_result_to_scoreboard",
    undefined,
    `${label}: advance_round_result_to_scoreboard should succeed`
  ), `${label}: advance_round_result_to_scoreboard returned no row.`);
}

async function startNextRound(client, label) {
  return singleRow(await rpcOk(
    client,
    "start_next_round",
    undefined,
    `${label}: start_next_round should succeed`
  ), `${label}: start_next_round returned no row.`);
}

async function endSession(client, label) {
  return singleRow(await rpcOk(
    client,
    "end_session",
    undefined,
    `${label}: end_session should succeed`
  ), `${label}: end_session returned no row.`);
}

async function getMyGameState(client, label) {
  const { data, error } = await client.rpc("get_my_game_state");

  assert(!error, `${label}: get_my_game_state failed: ${error?.code ?? ""} ${error?.message ?? ""}`);
  return data;
}

async function getMyActiveRoom(client, label) {
  const data = await rpcOk(client, "get_my_active_room", undefined, `${label}: get_my_active_room should succeed`);
  return data;
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

function gameSessionFinishedAt(gameSessionId) {
  return psql(`
    select coalesce(finished_at::text, '')
    from public.game_sessions
    where id = ${sqlString(gameSessionId)}::uuid;
  `);
}

function roomStatus(roomId) {
  return psql(`
    select status from public.rooms where id = ${sqlString(roomId)}::uuid;
  `);
}

function activeSlotCountForRoom(roomId) {
  return Number(psql(`
    select count(*)
    from public.player_active_room_slots
    where room_id = ${sqlString(roomId)}::uuid;
  `));
}

function totalActiveSlotCountForPlayer(playerId) {
  return Number(psql(`
    select count(*)
    from public.player_active_room_slots
    where player_id = ${sqlString(playerId)}::uuid;
  `));
}

function roomParticipantCount(roomId) {
  return Number(psql(`
    select count(*)
    from public.room_participants
    where room_id = ${sqlString(roomId)}::uuid;
  `));
}

function groupPlayerCount(groupId) {
  return Number(psql(`
    select count(*)
    from public.players
    where group_id = ${sqlString(groupId)}::uuid;
  `));
}

function groupWordCount(groupId) {
  return Number(psql(`
    select count(*)
    from public.group_words
    where group_id = ${sqlString(groupId)}::uuid;
  `));
}

function roundCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `));
}

function sessionHistoryCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.game_session_history
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `));
}

function roundHistoryCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.round_history
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `));
}

function sessionPlayerRows(gameSessionId) {
  const output = psql(`
    select player_id::text || '|' || score::text || '|' || impostor_count::text
    from public.session_players
    where game_session_id = ${sqlString(gameSessionId)}::uuid
    order by player_id;
  `);

  if (!output) {
    return [];
  }

  return output.split("\n").map((line) => {
    const [playerId, score, impostorCount] = line.split("|");
    return {
      playerId,
      score: Number(score),
      impostorCount: Number(impostorCount)
    };
  });
}

function sessionPlayer(gameSessionId, playerId) {
  const row = sessionPlayerRows(gameSessionId).find((player) => player.playerId === playerId);

  if (!row) {
    throw new Error(`Missing SessionPlayer ${playerId}.`);
  }

  return row;
}

function roundByNumber(gameSessionId, roundNumber) {
  return psqlJson(`
    select jsonb_build_object(
      'id', id,
      'number', number,
      'secret_word', secret_word,
      'normalized_secret_word', normalized_secret_word,
      'impostor_player_id', impostor_player_id,
      'round_winner', round_winner,
      'scored', scored_at is not null
    )::text
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = ${Number(roundNumber)};
  `);
}

function sessionHistoryJson(gameSessionId) {
  return psqlJson(`
    select jsonb_build_object(
      'game_session_id', game_session_id,
      'room_id', room_id,
      'group_id', group_id,
      'started_at', started_at,
      'finished_at', finished_at,
      'closed_by_player_id', closed_by_player_id,
      'round_count', round_count,
      'roster', roster,
      'final_scores', final_scores,
      'winner_player_ids', winner_player_ids,
      'winners', winners
    )::text
    from public.game_session_history
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `);
}

function roundHistoryRows(gameSessionId) {
  return psqlJson(`
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'number', number,
        'impostor_player_id', impostor_player_id,
        'round_winner', round_winner,
        'discovered_by_vote', discovered_by_vote,
        'impostor_guess_text', impostor_guess_text,
        'impostor_guess_correct', impostor_guess_correct,
        'scoring_summary', scoring_summary
      )
      order by number
    ), '[]'::jsonb)::text
    from public.round_history
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `);
}

function databaseObjectReview() {
  return psqlJson(`
    select jsonb_build_object(
      'functions', (
        select jsonb_object_agg(proname, jsonb_build_object(
          'security_definer', prosecdef,
          'search_path_empty', proconfig @> array['search_path=""'],
          'arguments', pg_get_function_arguments(pg_proc.oid),
          'anon_can_execute', has_function_privilege('anon', pg_proc.oid, 'EXECUTE'),
          'authenticated_can_execute', has_function_privilege('authenticated', pg_proc.oid, 'EXECUTE')
        ))
        from pg_proc
        join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
        where pg_namespace.nspname = 'public'
          and proname in (
            'advance_round_result_to_scoreboard',
            'start_next_round',
            'end_session',
            'get_my_game_state'
          )
      ),
      'history_tables', (
        select jsonb_object_agg(table_name, jsonb_build_object(
          'rls_enabled', relrowsecurity,
          'anon_select', has_table_privilege('anon', format('public.%I', table_name), 'SELECT'),
          'authenticated_select', has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
        ))
        from information_schema.tables
        join pg_class on pg_class.relname = tables.table_name
        join pg_namespace on pg_namespace.oid = pg_class.relnamespace
        where tables.table_schema = 'public'
          and pg_namespace.nspname = 'public'
          and tables.table_name in ('game_session_history', 'round_history')
      ),
      'history_columns', (
        select jsonb_object_agg(table_name, columns)
        from (
          select table_name, jsonb_agg(column_name order by ordinal_position) as columns
          from information_schema.columns
          where table_schema = 'public'
            and table_name in ('game_session_history', 'round_history')
          group by table_name
        ) grouped_columns
      )
    )::text;
  `);
}

function setRoundResolved(gameSessionId, roundNumber, options) {
  psql(`
    update public.rounds
    set
      secret_word = ${sqlString(options.secretWord)},
      normalized_secret_word = lower(${sqlString(options.secretWord)}),
      impostor_player_id = ${sqlString(options.impostorPlayerId)}::uuid,
      impostor_guess_text = ${options.guessText === null ? "null" : sqlString(options.guessText)},
      normalized_impostor_guess = ${options.guessText === null ? "null" : `lower(${sqlString(options.guessText)})`},
      impostor_guess_correct = ${options.guessCorrect === null ? "null" : String(options.guessCorrect)},
      impostor_guess_submitted_at = ${options.guessText === null ? "null" : "now()"},
      round_winner = ${sqlString(options.winner)}
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = ${Number(roundNumber)};

    update public.game_sessions
    set state = 'round_result'
    where id = ${sqlString(gameSessionId)}::uuid;
  `);
}

async function buildPlayingFixture(label, words) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 12.5 ${label}`, "Host");
  const players = [];

  for (const playerName of ["B", "C", "D"]) {
    const auth = await signInAnonymously(`${label} ${playerName}`);
    await joinGroup(auth.client, group.invitation_code, playerName);
    players.push({
      ...auth,
      playerId: playerIdForAuthUser(auth.userId),
      nickname: playerName
    });
  }

  const sameGroupOutsider = await signInAnonymously(`${label} same-group outsider`);
  await joinGroup(sameGroupOutsider.client, group.invitation_code, "Outsider");

  const otherGroupAuth = await signInAnonymously(`${label} other-group outsider`);
  const otherGroup = await createGroup(otherGroupAuth.client, `Otra familia 12.5 ${label}`, "Other");

  for (const word of words) {
    await addGroupWord(host.client, word);
  }

  const room = await createRoom(host.client);

  for (const player of players) {
    await joinRoomByCode(player.client, room.room_join_code);
  }

  await rpcOk(host.client, "start_session", undefined, `${label}: start_session should succeed`);

  const fixture = {
    host: {
      ...host,
      playerId: group.player_id,
      nickname: "Host"
    },
    players,
    sameGroupOutsider: {
      ...sameGroupOutsider,
      playerId: playerIdForAuthUser(sameGroupOutsider.userId)
    },
    otherGroup: {
      ...otherGroupAuth,
      playerId: otherGroup.player_id,
      groupId: otherGroup.group_id
    },
    group,
    room,
    gameSessionId: gameSessionIdForRoom(room.room_id)
  };

  assertEqual(roundCount(fixture.gameSessionId), 1, `${label}: start_session should create one round.`);
  return fixture;
}

function assertNoHistoricalSecrets(value, context) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "secret_word",
    "normalized_secret_word",
    "normalized_impostor_guess",
    "voter_player_id",
    "Casa",
    "Alfa",
    "Beta",
    "Unica"
  ]) {
    assert(!serialized.includes(forbidden), `${context}: must not expose ${forbidden}.`);
  }
}

function assertFinishedPayload(row, context) {
  assertEqual(row.state, "finished", `${context}: state should be finished.`);
  assertEqual(row.role, null, `${context}: finished should not expose private role.`);
  assertEqual(row.word, null, `${context}: finished should not expose private word.`);
  assertEqual(row.candidates, null, `${context}: finished should not expose voting candidates.`);
  assertEqual(row.my_vote_target_player_id, null, `${context}: finished should not expose caller vote target.`);
  assertEqual(row.has_voted, false, `${context}: finished should not expose voting status.`);
  assertEqual(row.vote_results, null, `${context}: finished should not expose vote results.`);
  assertEqual(row.can_submit_impostor_guess, false, `${context}: finished should not allow guess submit.`);
  assertEqual(row.can_start_next_round, false, `${context}: finished should not allow next round.`);
  assertEqual(row.can_end_session, false, `${context}: finished should not allow end session.`);
  assert(row.finished_at, `${context}: finished_at should be present.`);
  assert(Number.isInteger(row.round_count), `${context}: round_count should be integer.`);
  assert(Array.isArray(row.final_scores), `${context}: final_scores should be present.`);
  assert(Array.isArray(row.winner_player_ids), `${context}: winner_player_ids should be present.`);
  assert(Array.isArray(row.winners), `${context}: winners should be present.`);
  assert(Array.isArray(row.rounds_summary), `${context}: rounds_summary should be present.`);
  assertEqual(row.rounds_summary.length, row.round_count, `${context}: rounds_summary should match round_count.`);
  assertNoHistoricalSecrets(row, context);
}

function scoreFor(scores, playerId) {
  const player = scores.find((score) => score.player_id === playerId);

  if (!player) {
    throw new Error(`Missing final score for ${playerId}.`);
  }

  return player.score;
}

function scoreboardScoreFor(row, playerId, context) {
  const player = row.scoreboard_players.find((score) => score.player_id === playerId);

  if (!player) {
    throw new Error(`${context}: missing scoreboard player ${playerId}.`);
  }

  return player.score;
}

function assertHistoryTablesDoNotContainForbiddenColumns(review) {
  const forbiddenColumns = new Set([
    "secret_word",
    "normalized_secret_word",
    "normalized_impostor_guess",
    "voter_player_id",
    "target_player_id",
    "host_player_id"
  ]);

  for (const [tableName, columns] of Object.entries(review.history_columns)) {
    for (const column of columns) {
      assert(!forbiddenColumns.has(column), `${tableName}: forbidden historical column ${column}.`);
    }
  }
}

async function validatePreconditions() {
  const unsignedClient = createAnonymousClient();
  await expectRpcFailure(
    () => unsignedClient.rpc("end_session"),
    ["401", "42501"],
    "Anon caller should not execute end_session"
  );

  const noPlayer = await signInAnonymously("no player precondition");
  await expectRpcFailure(
    () => noPlayer.client.rpc("end_session"),
    "P0002",
    "AuthIdentity without Player should not end session"
  );

  const fixture = await buildPlayingFixture("preconditions", ["Precondicion"]);
  await expectRpcFailure(
    () => fixture.host.client.rpc("end_session"),
    "P0018",
    "Host should not end before scoreboard"
  );

  setRoundResolved(fixture.gameSessionId, 1, {
    secretWord: "Precondicion",
    impostorPlayerId: fixture.players[0].playerId,
    winner: "group",
    guessText: "Otra",
    guessCorrect: false
  });
  await advanceScoreboard(fixture.host.client, "preconditions scoring");

  await expectRpcFailure(
    () => fixture.players[0].client.rpc("end_session"),
    "P0019",
    "Non-host participant should not end session"
  );
  await expectRpcFailure(
    () => fixture.sameGroupOutsider.client.rpc("end_session"),
    "P0017",
    "Same-group non-room player should not end session"
  );
  await expectRpcFailure(
    () => fixture.otherGroup.client.rpc("end_session"),
    "P0017",
    "Other-group player should not end session"
  );
}

async function validateMultiroundCloseAndReadModel() {
  const fixture = await buildPlayingFixture("multiround close", [
    "Alfa",
    "Beta",
    "Gamma"
  ]);
  const allPlayers = [fixture.host, ...fixture.players];
  const roundOneImpostorId = fixture.host.playerId;
  const playerB = fixture.players[0];

  setRoundResolved(fixture.gameSessionId, 1, {
    secretWord: "Alfa",
    impostorPlayerId: roundOneImpostorId,
    winner: "impostor",
    guessText: null,
    guessCorrect: null
  });

  const firstScoreboard = await advanceScoreboard(fixture.host.client, "round 1 scoring");
  assertEqual(firstScoreboard.state, "scoreboard", "Round 1 scoring should enter scoreboard.");
  assertEqual(sessionPlayer(fixture.gameSessionId, roundOneImpostorId).score, 2, "Round 1 impostor should score 2.");

  const scoreboardState = singleRow(await getMyGameState(fixture.host.client, "round 1 scoreboard"), "Host should see scoreboard.");
  assertEqual(scoreboardState.can_end_session, true, "Host scoreboard should expose can_end_session.");
  assertEqual(scoreboardState.can_start_next_round, true, "Host scoreboard should expose can_start_next_round while words remain.");
  assertEqual(scoreboardScoreFor(scoreboardState, roundOneImpostorId, "round 1 scoreboard"), 2, "Scoreboard should expose accumulated score.");

  const countsBeforeRoundTwo = sessionPlayerRows(fixture.gameSessionId);
  const nextRound = await startNextRound(fixture.host.client, "round 2 start");
  assertEqual(nextRound.round_number, 2, "start_next_round should create round 2.");
  assertEqual(roundCount(fixture.gameSessionId), 2, "There should be two rounds after start_next_round.");

  const roundTwo = roundByNumber(fixture.gameSessionId, 2);
  assert(roundTwo.secret_word !== "Alfa", "Round 2 should not reuse round 1 word.");
  assert(roundTwo.impostor_player_id !== roundOneImpostorId, "Round 2 impostor should come from lower impostor-count pool.");

  for (const before of countsBeforeRoundTwo) {
    const after = sessionPlayer(fixture.gameSessionId, before.playerId);
    assertEqual(after.score, before.score, "start_next_round should preserve accumulated scores.");
  }

  setRoundResolved(fixture.gameSessionId, 2, {
    secretWord: "Beta",
    impostorPlayerId: playerB.playerId,
    winner: "group",
    guessText: "Gamma",
    guessCorrect: false
  });
  await advanceScoreboard(fixture.players[1].client, "round 2 scoring by participant");

  const scoresBeforeEnd = sessionPlayerRows(fixture.gameSessionId);
  assertEqual(sessionPlayer(fixture.gameSessionId, fixture.host.playerId).score, 3, "Host should have 3 final points.");
  assertEqual(sessionPlayer(fixture.gameSessionId, playerB.playerId).score, 0, "Round 2 impostor should not score on group win.");
  assertEqual(sessionPlayer(fixture.gameSessionId, fixture.players[1].playerId).score, 1, "Group player should score on round 2.");
  assertEqual(sessionPlayer(fixture.gameSessionId, fixture.players[2].playerId).score, 1, "Other group player should score on round 2.");

  const closeResult = await endSession(fixture.host.client, "host end multiround");
  const finishedAt = gameSessionFinishedAt(fixture.gameSessionId);
  const historyBeforeRetry = sessionHistoryJson(fixture.gameSessionId);
  const roundHistoryBeforeRetry = roundHistoryRows(fixture.gameSessionId);

  assertEqual(closeResult.ended, true, "First end_session should close.");
  assertEqual(closeResult.already_ended, false, "First end_session should not be idempotent.");
  assertEqual(closeResult.state, "finished", "end_session should return finished.");
  assertEqual(closeResult.round_count, 2, "end_session should return two rounds.");
  assertDeepEqual(closeResult.winner_player_ids, [fixture.host.playerId], "Host should be unique winner.");
  assert(finishedAt, "finished_at should be set server-side.");
  assertEqual(gameSessionState(fixture.gameSessionId), "finished", "GameSession should be finished.");
  assertEqual(roomStatus(fixture.room.room_id), "closed", "Room should be closed.");
  assertEqual(activeSlotCountForRoom(fixture.room.room_id), 0, "Closed Room should release active slots.");
  assertEqual(groupPlayerCount(fixture.group.group_id), 5, "Group players should remain available.");
  assertEqual(groupWordCount(fixture.group.group_id), 3, "Group word bank should remain available.");

  assertEqual(sessionHistoryCount(fixture.gameSessionId), 1, "There should be exactly one session history.");
  assertEqual(roundHistoryCount(fixture.gameSessionId), 2, "There should be exactly one round history per round.");
  assertEqual(historyBeforeRetry.game_session_id, fixture.gameSessionId, "History should reference GameSession.");
  assertEqual(historyBeforeRetry.room_id, fixture.room.room_id, "History should reference Room.");
  assertEqual(historyBeforeRetry.group_id, fixture.group.group_id, "History should reference group.");
  assert(historyBeforeRetry.started_at <= historyBeforeRetry.finished_at, "History timestamps should be coherent.");
  assertEqual(historyBeforeRetry.closed_by_player_id, fixture.host.playerId, "History should snapshot closing host.");
  assertEqual(historyBeforeRetry.round_count, 2, "History should snapshot round count.");
  assertEqual(historyBeforeRetry.roster.length, 4, "History should snapshot session roster.");
  assertEqual(historyBeforeRetry.final_scores.length, 4, "History should snapshot final scores.");
  assertEqual(scoreFor(historyBeforeRetry.final_scores, fixture.host.playerId), 3, "History should snapshot host score.");
  assertDeepEqual(historyBeforeRetry.winner_player_ids, [fixture.host.playerId], "History should snapshot unique winner.");
  assertEqual(historyBeforeRetry.winners.length, 1, "History should snapshot one winner.");
  assertNoHistoricalSecrets(historyBeforeRetry, "game_session_history");

  assertEqual(roundHistoryBeforeRetry.length, 2, "Round history should contain two snapshots.");
  assertEqual(roundHistoryBeforeRetry[0].number, 1, "Round 1 history should preserve number.");
  assertEqual(roundHistoryBeforeRetry[0].impostor_player_id, fixture.host.playerId, "Round 1 history should preserve impostor.");
  assertEqual(roundHistoryBeforeRetry[0].round_winner, "impostor", "Round 1 history should preserve winner.");
  assertEqual(roundHistoryBeforeRetry[0].discovered_by_vote, false, "Round 1 history should preserve discovery flag.");
  assertEqual(roundHistoryBeforeRetry[0].impostor_guess_text, null, "Round 1 history should preserve absent guess.");
  assertEqual(roundHistoryBeforeRetry[0].impostor_guess_correct, null, "Round 1 history should preserve absent guess result.");
  assertEqual(roundHistoryBeforeRetry[0].scoring_summary.rule, "impostor_plus_2", "Round 1 history should preserve scoring rule.");
  assertEqual(roundHistoryBeforeRetry[0].scoring_summary.awarded.length, 1, "Round 1 history should award one player.");
  assertEqual(roundHistoryBeforeRetry[1].number, 2, "Round 2 history should preserve number.");
  assertEqual(roundHistoryBeforeRetry[1].impostor_player_id, playerB.playerId, "Round 2 history should preserve impostor.");
  assertEqual(roundHistoryBeforeRetry[1].round_winner, "group", "Round 2 history should preserve winner.");
  assertEqual(roundHistoryBeforeRetry[1].discovered_by_vote, true, "Round 2 history should preserve discovery flag.");
  assertEqual(roundHistoryBeforeRetry[1].impostor_guess_text, "Gamma", "Round 2 history should preserve guess text only.");
  assertEqual(roundHistoryBeforeRetry[1].impostor_guess_correct, false, "Round 2 history should preserve guess result.");
  assertEqual(roundHistoryBeforeRetry[1].scoring_summary.rule, "group_non_impostors_plus_1", "Round 2 history should preserve scoring rule.");
  assertEqual(roundHistoryBeforeRetry[1].scoring_summary.awarded.length, 3, "Round 2 history should award non-impostors.");
  assertNoHistoricalSecrets(roundHistoryBeforeRetry, "round_history");

  const retryResult = await endSession(fixture.host.client, "host retry after close");
  assertEqual(retryResult.ended, false, "Retry should not close again.");
  assertEqual(retryResult.already_ended, true, "Retry should report already_ended.");
  assertEqual(gameSessionFinishedAt(fixture.gameSessionId), finishedAt, "Retry should preserve finished_at.");
  assertEqual(sessionHistoryCount(fixture.gameSessionId), 1, "Retry should not duplicate session history.");
  assertEqual(roundHistoryCount(fixture.gameSessionId), 2, "Retry should not duplicate round history.");
  assertDeepEqual(sessionPlayerRows(fixture.gameSessionId), scoresBeforeEnd, "Retry should not mutate scores.");
  assertDeepEqual(sessionHistoryJson(fixture.gameSessionId), historyBeforeRetry, "Retry should not mutate session history.");
  assertDeepEqual(roundHistoryRows(fixture.gameSessionId), roundHistoryBeforeRetry, "Retry should not mutate round history.");

  const participantStates = [];
  for (const player of [fixture.host, fixture.players[1]]) {
    const state = singleRow(await getMyGameState(player.client, `${player.nickname} finished`), "Participant should reconstruct finished state.");
    assertFinishedPayload(state, `${player.nickname} finished`);
    participantStates.push(state);
  }

  assertEqual(participantStates[0].finished_at, participantStates[1].finished_at, "Participants should see same finished_at.");
  assertDeepEqual(participantStates[0].final_scores, participantStates[1].final_scores, "Participants should see same final scores.");
  assertDeepEqual(participantStates[0].winner_player_ids, participantStates[1].winner_player_ids, "Participants should see same winners.");
  assertEqual(participantStates[0].round_count, 2, "Read model should expose round_count.");
  assertEqual(participantStates[0].rounds_summary.length, 2, "Read model should expose minimal round summaries.");

  for (const player of allPlayers) {
    assertEqual(totalActiveSlotCountForPlayer(player.playerId), 0, "Historical participant should have no active slot after close.");
  }

  const sameGroupRows = await getMyGameState(fixture.sameGroupOutsider.client, "same-group outsider finished");
  assert(Array.isArray(sameGroupRows) && sameGroupRows.length === 0, "Same-group non-participant should not read history.");
  const otherGroupRows = await getMyGameState(fixture.otherGroup.client, "other-group outsider finished");
  assert(Array.isArray(otherGroupRows) && otherGroupRows.length === 0, "Other-group player should not read history.");

  await expectDirectReadBlocked(fixture.sameGroupOutsider.client, "game_session_history", "Same-group outsider history table");
  await expectDirectReadBlocked(fixture.sameGroupOutsider.client, "round_history", "Same-group outsider round history table");

  await expectRpcFailure(
    () => fixture.host.client.rpc("start_next_round"),
    "P0017",
    "Finished session should not start another round"
  );
  assertEqual(roundCount(fixture.gameSessionId), 2, "start_next_round after finished should not create a round.");

  const activeRoomsAfterClose = await getMyActiveRoom(fixture.host.client, "host active room after close");
  assert(Array.isArray(activeRoomsAfterClose) && activeRoomsAfterClose.length === 0, "Closed Room should not be active.");

  const newRoom = await createRoom(fixture.host.client);
  assert(newRoom.room_id !== fixture.room.room_id, "New Room should be distinct from closed Room.");
  assertEqual(roomStatus(newRoom.room_id), "lobby", "New Room should start in lobby.");
  assertEqual(roomParticipantCount(newRoom.room_id), 1, "New Room should contain host.");
  assertEqual(sessionHistoryCount(fixture.gameSessionId), 1, "New Room should not change closed history.");

  await expectRpcFailure(
    () => fixture.host.client.rpc("end_session"),
    "P0018",
    "Late retry while in a new lobby should not close the new Room"
  );
  assertEqual(roomStatus(newRoom.room_id), "lobby", "Late retry should leave new Room open.");
  assertEqual(sessionHistoryCount(fixture.gameSessionId), 1, "Late retry should not duplicate history.");
  assertDeepEqual(sessionHistoryJson(fixture.gameSessionId), historyBeforeRetry, "Late retry should not mutate closed history.");
}

async function validateTiedWinners() {
  const fixture = await buildPlayingFixture("tied winners", ["Unica"]);
  const impostor = fixture.players[0];

  setRoundResolved(fixture.gameSessionId, 1, {
    secretWord: "Unica",
    impostorPlayerId: impostor.playerId,
    winner: "group",
    guessText: "Otra",
    guessCorrect: false
  });

  await advanceScoreboard(fixture.host.client, "tie scoring");
  const closeResult = await endSession(fixture.host.client, "host end tied session");
  const history = sessionHistoryJson(fixture.gameSessionId);
  const participantState = singleRow(await getMyGameState(fixture.players[1].client, "tied finished"), "Participant should see tied finished state.");

  assertEqual(closeResult.winner_player_ids.length, 3, "Group win should create three tied winners.");
  assert(!closeResult.winner_player_ids.includes(impostor.playerId), "Impostor should be outside tied winners.");
  assertEqual(history.winner_player_ids.length, 3, "History should preserve tied winners.");
  assertEqual(history.winners.length, 3, "History should preserve tied winner snapshots.");
  assertEqual(participantState.winner_player_ids.length, 3, "Read model should preserve tied winners.");
  assertEqual(participantState.winners.length, 3, "Read model should preserve tied winner snapshots.");
  assertEqual(scoreFor(participantState.final_scores, impostor.playerId), 0, "Non-winner score should remain real.");

  const sortedWinnerIds = [...participantState.winner_player_ids].sort();
  const expectedWinnerIds = [
    fixture.host.playerId,
    fixture.players[1].playerId,
    fixture.players[2].playerId
  ].sort();
  assertDeepEqual(sortedWinnerIds, expectedWinnerIds, "Tie should include all max-score players and only them.");
}

async function validateStaticSecurityReview() {
  const review = databaseObjectReview();

  for (const functionName of [
    "advance_round_result_to_scoreboard",
    "start_next_round",
    "end_session",
    "get_my_game_state"
  ]) {
    const fn = review.functions[functionName];

    assert(fn, `${functionName}: metadata should exist.`);
    assertEqual(fn.security_definer, true, `${functionName}: should use SECURITY DEFINER.`);
    assertEqual(fn.search_path_empty, true, `${functionName}: should set search_path to empty.`);
    assertEqual(fn.anon_can_execute, false, `${functionName}: anon should not execute.`);
    assertEqual(fn.authenticated_can_execute, true, `${functionName}: authenticated should execute.`);
  }

  assertEqual(review.functions.end_session.arguments, "", "end_session should have no client arguments.");

  for (const tableName of ["game_session_history", "round_history"]) {
    const table = review.history_tables[tableName];

    assert(table, `${tableName}: metadata should exist.`);
    assertEqual(table.rls_enabled, true, `${tableName}: RLS should be enabled.`);
    assertEqual(table.anon_select, false, `${tableName}: anon direct SELECT should be revoked.`);
    assertEqual(table.authenticated_select, false, `${tableName}: authenticated direct SELECT should be revoked.`);
  }

  assertHistoryTablesDoNotContainForbiddenColumns(review);
}

async function main() {
  console.log(`validate-12-5 using local Supabase API ${supabaseEnv.API_URL}`);
  console.log(`validate-12-5 using local Supabase DB ${supabaseEnv.DB_URL}`);

  await validateStaticSecurityReview();
  console.log("A/static security PASS");

  await validatePreconditions();
  console.log("A/preconditions PASS");

  await validateMultiroundCloseAndReadModel();
  console.log("B/C/D/E/G/H/I multiround lifecycle PASS");

  await validateTiedWinners();
  console.log("F/tied winners PASS");

  console.log("validate-12-5 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
