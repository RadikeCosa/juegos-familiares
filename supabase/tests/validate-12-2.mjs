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

function sessionHistoryJson(gameSessionId) {
  const output = psql(`
    select jsonb_build_object(
      'round_count', round_count,
      'closed_by_player_id', closed_by_player_id,
      'winner_player_ids', winner_player_ids,
      'roster', roster,
      'final_scores', final_scores,
      'winners', winners,
      'finished_at', finished_at
    )::text
    from public.game_session_history
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `);

  return JSON.parse(output);
}

function roundHistoryRows(gameSessionId) {
  const output = psql(`
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

  return JSON.parse(output);
}

function sessionPlayerRows(gameSessionId) {
  const output = psql(`
    select player_id::text || '|' || score::text
    from public.session_players
    where game_session_id = ${sqlString(gameSessionId)}::uuid
    order by player_id;
  `);

  if (!output) {
    return [];
  }

  return output.split("\n").map((line) => {
    const [playerId, score] = line.split("|");
    return { playerId, score: Number(score) };
  });
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
  const group = await createGroup(host.client, `Familia 12.2 ${label}`, "Host");
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
    room,
    gameSessionId: gameSessionIdForRoom(room.room_id)
  };

  assertEqual(roundCount(fixture.gameSessionId), 1, `${label}: start_session should create one round.`);
  return fixture;
}

function assertNoHistoricalSecrets(value, context) {
  const serialized = JSON.stringify(value);

  assert(!serialized.includes("secret_word"), `${context}: must not expose secret_word.`);
  assert(!serialized.includes("normalized_secret_word"), `${context}: must not expose normalized_secret_word.`);
  assert(!serialized.includes("voter_player_id"), `${context}: must not preserve individual voter ids.`);
  assert(!serialized.includes("target_player_id"), `${context}: must not preserve individual vote targets.`);
}

async function validateEndSessionWithUniqueWinner() {
  const fixture = await buildPlayingFixture("unique winner", ["Alfa", "Beta", "Gamma"]);
  const hostId = fixture.host.playerId;
  const playerB = fixture.players[0];

  setRoundResolved(fixture.gameSessionId, 1, {
    secretWord: "Alfa",
    impostorPlayerId: hostId,
    winner: "impostor",
    guessText: null,
    guessCorrect: null
  });

  await advanceScoreboard(fixture.host.client, "round 1 scoring");
  await startNextRound(fixture.host.client, "round 2 start");

  setRoundResolved(fixture.gameSessionId, 2, {
    secretWord: "Beta",
    impostorPlayerId: playerB.playerId,
    winner: "group",
    guessText: "Gamma",
    guessCorrect: false
  });

  await advanceScoreboard(fixture.host.client, "round 2 scoring");

  await expectRpcFailure(
    () => playerB.client.rpc("end_session"),
    "P0019",
    "Non-host should not end session"
  );

  const scoresBeforeEnd = sessionPlayerRows(fixture.gameSessionId);
  const closeResult = await endSession(fixture.host.client, "host end session");
  const finishedAt = gameSessionFinishedAt(fixture.gameSessionId);

  assertEqual(closeResult.ended, true, "First end_session should close the session.");
  assertEqual(closeResult.already_ended, false, "First end_session should not be idempotent.");
  assertEqual(closeResult.state, "finished", "end_session should return finished.");
  assertEqual(closeResult.round_count, 2, "end_session should return round count.");
  assertEqual(closeResult.winner_player_ids.length, 1, "Unique winner fixture should return one winner.");
  assertEqual(closeResult.winner_player_ids[0], hostId, "Host should be unique winner with 3 points.");
  assert(finishedAt, "finished_at should be set.");
  assertEqual(gameSessionState(fixture.gameSessionId), "finished", "GameSession should be finished.");
  assertEqual(roomStatus(fixture.room.room_id), "closed", "Room should be closed.");
  assertEqual(activeSlotCountForRoom(fixture.room.room_id), 0, "Closing Room should release active slots.");
  assertEqual(sessionHistoryCount(fixture.gameSessionId), 1, "end_session should create one session history.");
  assertEqual(roundHistoryCount(fixture.gameSessionId), 2, "end_session should create one round history per round.");

  const scoresAfterEnd = sessionPlayerRows(fixture.gameSessionId);
  assertEqual(JSON.stringify(scoresAfterEnd), JSON.stringify(scoresBeforeEnd), "end_session must not mutate scores.");

  const sessionHistory = sessionHistoryJson(fixture.gameSessionId);
  assertEqual(sessionHistory.round_count, 2, "Session history should snapshot round count.");
  assertEqual(sessionHistory.closed_by_player_id, hostId, "Session history should snapshot closing host.");
  assertEqual(sessionHistory.winner_player_ids.length, 1, "Session history should snapshot unique winner.");
  assertEqual(sessionHistory.winner_player_ids[0], hostId, "Session history winner should be host.");
  assertEqual(sessionHistory.roster.length, 4, "Session history should snapshot roster.");
  assertEqual(sessionHistory.final_scores.length, 4, "Session history should snapshot final scores.");
  assertEqual(sessionHistory.winners.length, 1, "Session history should snapshot winners.");
  assertNoHistoricalSecrets(sessionHistory, "session history");

  const roundHistory = roundHistoryRows(fixture.gameSessionId);
  assertEqual(roundHistory.length, 2, "Round history should contain two rows.");
  assertEqual(roundHistory[0].round_winner, "impostor", "Round 1 winner should be impostor.");
  assertEqual(roundHistory[0].discovered_by_vote, false, "Round 1 without guess should not be discovered by vote.");
  assertEqual(roundHistory[0].scoring_summary.rule, "impostor_plus_2", "Round 1 scoring rule should be stored.");
  assertEqual(roundHistory[0].scoring_summary.awarded.length, 1, "Round 1 should award one player.");
  assertEqual(roundHistory[0].scoring_summary.awarded[0].points, 2, "Round 1 should award 2 points.");
  assertEqual(roundHistory[1].round_winner, "group", "Round 2 winner should be group.");
  assertEqual(roundHistory[1].discovered_by_vote, true, "Round 2 group win should be discovered by vote.");
  assertEqual(roundHistory[1].impostor_guess_text, "Gamma", "Round 2 should snapshot guess text.");
  assertEqual(roundHistory[1].impostor_guess_correct, false, "Round 2 should snapshot failed guess.");
  assertEqual(roundHistory[1].scoring_summary.rule, "group_non_impostors_plus_1", "Round 2 scoring rule should be stored.");
  assertEqual(roundHistory[1].scoring_summary.awarded.length, 3, "Round 2 should award every non-impostor.");
  assertNoHistoricalSecrets(roundHistory, "round history");

  const retryResult = await endSession(fixture.host.client, "host end session retry");
  assertEqual(retryResult.ended, false, "Retry should not close again.");
  assertEqual(retryResult.already_ended, true, "Retry should return already_ended.");
  assertEqual(retryResult.state, "finished", "Retry should return finished.");
  assertEqual(retryResult.round_count, 2, "Retry should preserve round count.");
  assertEqual(gameSessionFinishedAt(fixture.gameSessionId), finishedAt, "Retry must not change finished_at.");
  assertEqual(sessionHistoryCount(fixture.gameSessionId), 1, "Retry must not duplicate session history.");
  assertEqual(roundHistoryCount(fixture.gameSessionId), 2, "Retry must not duplicate round history.");
  assertEqual(JSON.stringify(sessionPlayerRows(fixture.gameSessionId)), JSON.stringify(scoresAfterEnd), "Retry must not mutate scores.");
}

async function validateEndSessionWithTiedWinnersAndInvalidPhase() {
  const fixture = await buildPlayingFixture("tied winners", ["Unica"]);
  const impostor = fixture.players[0];

  await expectRpcFailure(
    () => fixture.host.client.rpc("end_session"),
    "P0018",
    "Host should not end outside scoreboard"
  );

  setRoundResolved(fixture.gameSessionId, 1, {
    secretWord: "Unica",
    impostorPlayerId: impostor.playerId,
    winner: "group",
    guessText: "Otra",
    guessCorrect: false
  });

  await advanceScoreboard(fixture.host.client, "tie scoring");
  const closeResult = await endSession(fixture.host.client, "host end tied session");

  assertEqual(closeResult.ended, true, "Tied end_session should close.");
  assertEqual(closeResult.winner_player_ids.length, 3, "Group win should produce three tied winners.");
  assert(!closeResult.winner_player_ids.includes(impostor.playerId), "Impostor should not be among tied group winners.");

  const sessionHistory = sessionHistoryJson(fixture.gameSessionId);
  assertEqual(sessionHistory.winner_player_ids.length, 3, "Session history should preserve tied winners.");
  assertEqual(sessionHistory.winners.length, 3, "Session history winner snapshot should preserve tied winners.");
  assertEqual(roundHistoryCount(fixture.gameSessionId), 1, "Tied fixture should snapshot one round.");
  assertEqual(roomStatus(fixture.room.room_id), "closed", "Tied fixture Room should close.");
}

async function main() {
  await validateEndSessionWithUniqueWinner();
  await validateEndSessionWithTiedWinnersAndInvalidPhase();

  console.log("validate-12-2 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
