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

function activeSlotCountForRoom(roomId) {
  return Number(psql(`
    select count(*)
    from public.player_active_room_slots
    where room_id = ${sqlString(roomId)}::uuid;
  `));
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
  const group = await createGroup(host.client, `Familia 12.3 ${label}`, "Host");
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

  const outsider = await signInAnonymously(`${label} outsider`);
  await joinGroup(outsider.client, group.invitation_code, "Outsider");

  for (const word of words) {
    await addGroupWord(host.client, word);
  }

  const room = await createRoom(host.client);

  for (const player of players) {
    await joinRoomByCode(player.client, room.room_join_code);
  }

  await rpcOk(host.client, "start_session", undefined, `${label}: start_session should succeed`);

  return {
    host: {
      ...host,
      playerId: group.player_id,
      nickname: "Host"
    },
    players,
    outsider,
    room,
    gameSessionId: gameSessionIdForRoom(room.room_id)
  };
}

function assertNoHistoricalSecrets(value, context) {
  const serialized = JSON.stringify(value);

  assert(!serialized.includes("secret_word"), `${context}: must not expose secret_word.`);
  assert(!serialized.includes("normalized_secret_word"), `${context}: must not expose normalized_secret_word.`);
  assert(!serialized.includes("voter_player_id"), `${context}: must not expose historical voter ids.`);
}

function assertFinishedPayload(row, context) {
  assertEqual(row.state, "finished", `${context}: state should be finished.`);
  assertEqual(row.role, null, `${context}: finished should not expose a private role.`);
  assertEqual(row.word, null, `${context}: finished should not expose a private word.`);
  assertEqual(row.my_vote_target_player_id, null, `${context}: finished should not expose caller vote target.`);
  assertEqual(row.can_start_next_round, false, `${context}: cannot start next round.`);
  assertEqual(row.can_end_session, false, `${context}: cannot end again.`);
  assert(row.finished_at, `${context}: finished_at should be present.`);
  assert(Number.isInteger(row.round_count) && row.round_count >= 1, `${context}: round_count should be valid.`);
  assertEqual(row.round_number, row.round_count, `${context}: round_number should remain compatible with round_count.`);
  assert(Array.isArray(row.final_scores) && row.final_scores.length >= 1, `${context}: final_scores should be present.`);
  assert(Array.isArray(row.winner_player_ids) && row.winner_player_ids.length >= 1, `${context}: winner_player_ids should be present.`);
  assert(Array.isArray(row.winners) && row.winners.length >= 1, `${context}: winners should be present.`);
  assert(Array.isArray(row.rounds_summary), `${context}: rounds_summary should be present.`);
  assertEqual(row.rounds_summary.length, row.round_count, `${context}: rounds_summary should match round_count.`);
  assertNoHistoricalSecrets(row, context);
}

function scoreFor(row, playerId) {
  const player = row.final_scores.find((score) => score.player_id === playerId);

  if (!player) {
    throw new Error(`Missing final score for ${playerId}.`);
  }

  return player.score;
}

async function validateFinishedUniqueWinner() {
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
  await endSession(fixture.host.client, "host end session");

  assertEqual(activeSlotCountForRoom(fixture.room.room_id), 0, "Closed Room should have no active slots.");

  const hostRows = await getMyGameState(fixture.host.client, "host finished");
  const hostState = singleRow(hostRows, "Host should receive finished state.");
  assertFinishedPayload(hostState, "host finished");
  assertEqual(hostState.round_count, 2, "Host finished should expose two rounds.");
  assertEqual(hostState.winner_player_ids.length, 1, "Unique winner should expose one winner.");
  assertEqual(hostState.winner_player_ids[0], hostId, "Host should be the unique winner.");
  assertEqual(scoreFor(hostState, hostId), 3, "Host final score should be snapshotted.");
  assertEqual(hostState.rounds_summary[0].scoring_summary.rule, "impostor_plus_2", "Round 1 rule should be snapshotted.");
  assertEqual(hostState.rounds_summary[1].scoring_summary.rule, "group_non_impostors_plus_1", "Round 2 rule should be snapshotted.");

  const nonHostRows = await getMyGameState(playerB.client, "non-host finished");
  const nonHostState = singleRow(nonHostRows, "Non-host participant should receive finished state.");
  assertFinishedPayload(nonHostState, "non-host finished");
  assertEqual(nonHostState.finished_at, hostState.finished_at, "Participants should see the same finished_at.");
  assertEqual(JSON.stringify(nonHostState.final_scores), JSON.stringify(hostState.final_scores), "Participants should see the same final scores.");

  const outsiderRows = await getMyGameState(fixture.outsider.client, "outsider finished");
  assert(Array.isArray(outsiderRows) && outsiderRows.length === 0, "Non-participant should not receive finished history.");
}

async function validateFinishedTiedWinners() {
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
  await endSession(fixture.host.client, "host end tied session");

  const rows = await getMyGameState(fixture.players[1].client, "tied finished");
  const state = singleRow(rows, "Tied participant should receive finished state.");
  assertFinishedPayload(state, "tied finished");
  assertEqual(state.round_count, 1, "Tied fixture should expose one round.");
  assertEqual(state.winner_player_ids.length, 3, "Group win should expose three tied winners.");
  assert(!state.winner_player_ids.includes(impostor.playerId), "Impostor should not be among tied winners.");
  assertEqual(state.winners.length, 3, "Winner snapshots should include all tied winners.");
}

async function main() {
  await validateFinishedUniqueWinner();
  await validateFinishedTiedWinners();

  console.log("validate-12-3 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
