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

async function getMyGameState(client, label) {
  const data = await rpcOk(client, "get_my_game_state", undefined, `${label}: get_my_game_state should succeed`);
  return singleRow(data, `${label}: get_my_game_state returned no row.`);
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

function roundCount(gameSessionId) {
  return Number(psql(`
    select count(*)
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid;
  `));
}

function roundByNumber(gameSessionId, roundNumber) {
  const row = psql(`
    select
      id::text || '|' ||
      number::text || '|' ||
      secret_word || '|' ||
      normalized_secret_word || '|' ||
      impostor_player_id::text || '|' ||
      coalesce(round_winner, '') || '|' ||
      (scored_at is not null)::text
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = ${Number(roundNumber)};
  `);
  const [
    id,
    number,
    secretWord,
    normalizedSecretWord,
    impostorPlayerId,
    roundWinner,
    isScored
  ] = row.split("|");

  return {
    id,
    number: Number(number),
    secretWord,
    normalizedSecretWord,
    impostorPlayerId,
    roundWinner: roundWinner || null,
    isScored: isScored === "true"
  };
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

function setRoundResolved(gameSessionId, roundNumber, options) {
  psql(`
    update public.rounds
    set
      secret_word = ${sqlString(options.secretWord)},
      normalized_secret_word = lower(${sqlString(options.secretWord)}),
      impostor_player_id = ${sqlString(options.impostorPlayerId)}::uuid,
      round_winner = ${sqlString(options.winner)}
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = ${Number(roundNumber)};

    update public.game_sessions
    set state = 'round_result'
    where id = ${sqlString(gameSessionId)}::uuid;
  `);
}

function assertNoSecretFields(row, context) {
  for (const forbidden of [
    "normalized_secret_word",
    "normalized_impostor_guess",
    "next_word",
    "next_secret_word",
    "next_impostor",
    "next_impostor_player_id",
    "future_word",
    "future_impostor"
  ]) {
    assert(!(forbidden in row), `${context}: read model exposed ${forbidden}.`);
  }
}

function scoreboardPlayer(row, playerId, context) {
  const player = row.scoreboard_players.find((candidate) => candidate.player_id === playerId);

  if (!player) {
    throw new Error(`${context}: scoreboard missing player ${playerId}.`);
  }

  return player;
}

async function buildPlayingFixture(label, words) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia 11.5 ${label}`, "Host");
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

async function validateImpostorScoringAndNextRound() {
  const fixture = await buildPlayingFixture("impostor multiround", [
    "Alfa",
    "Beta",
    "Gamma"
  ]);
  const roundOneImpostorId = fixture.host.playerId;
  const nonHost = fixture.players[0];

  setRoundResolved(fixture.gameSessionId, 1, {
    secretWord: "Alfa",
    impostorPlayerId: roundOneImpostorId,
    winner: "impostor"
  });

  const firstScoreboard = await advanceScoreboard(fixture.host.client, "impostor scoring first close");
  assertEqual(firstScoreboard.advanced, true, "First scoreboard close should advance.");
  assertEqual(firstScoreboard.already_scored, false, "First scoreboard close should not be idempotent.");
  assertEqual(gameSessionState(fixture.gameSessionId), "scoreboard", "Scoring should move session to scoreboard.");
  assertEqual(sessionPlayer(fixture.gameSessionId, roundOneImpostorId).score, 2, "Impostor winner should receive 2 points.");
  for (const player of fixture.players) {
    assertEqual(sessionPlayer(fixture.gameSessionId, player.playerId).score, 0, "Non-impostors should not score when impostor wins.");
  }

  const retryScoreboard = await advanceScoreboard(fixture.host.client, "impostor scoring retry");
  assertEqual(retryScoreboard.advanced, false, "Scoreboard retry should not advance again.");
  assertEqual(retryScoreboard.already_scored, true, "Scoreboard retry should report already_scored.");
  assertEqual(sessionPlayer(fixture.gameSessionId, roundOneImpostorId).score, 2, "Scoreboard retry must not duplicate points.");

  const hostScoreboardState = await getMyGameState(fixture.host.client, "host scoreboard");
  assertNoSecretFields(hostScoreboardState, "host scoreboard");
  assertEqual(hostScoreboardState.state, "scoreboard", "Host read model should be scoreboard.");
  assertEqual(hostScoreboardState.round_number, 1, "Host scoreboard should show round 1.");
  assertEqual(hostScoreboardState.word, "Alfa", "Scoreboard should reveal resolved word.");
  assertEqual(hostScoreboardState.can_start_next_round, true, "Host should be allowed to start next round while words remain.");
  assertEqual(hostScoreboardState.can_end_session, true, "Final read model should expose end-session action to the host.");
  assertEqual(hostScoreboardState.available_unused_words_count, 2, "Read model should count unused words server-side.");
  assertEqual(hostScoreboardState.next_round_block_reason, null, "Allowed host should not have a block reason.");
  assertEqual(hostScoreboardState.round_impostor.player_id, roundOneImpostorId, "Scoreboard should reveal only resolved impostor.");
  assertEqual(scoreboardPlayer(hostScoreboardState, roundOneImpostorId, "host scoreboard").score, 2, "Read model should include accumulated impostor score.");

  const nonHostScoreboardState = await getMyGameState(nonHost.client, "non-host scoreboard");
  assertEqual(nonHostScoreboardState.state, "scoreboard", "Non-host read model should be scoreboard.");
  assertEqual(nonHostScoreboardState.can_start_next_round, false, "Non-host must not be allowed to start next round.");
  assertEqual(nonHostScoreboardState.next_round_block_reason, "not_host", "Non-host block reason should be not_host.");
  assertEqual(scoreboardPlayer(nonHostScoreboardState, roundOneImpostorId, "non-host scoreboard").score, 2, "All players should see accumulated scores.");

  await expectRpcFailure(
    () => nonHost.client.rpc("start_next_round"),
    "P0019",
    "Non-host should not start next round"
  );
  assertEqual(roundCount(fixture.gameSessionId), 1, "Non-host failure must not create a round.");

  const countsBeforeStart = sessionPlayerRows(fixture.gameSessionId);
  const nextRound = await startNextRound(fixture.host.client, "host next round");
  assertEqual(nextRound.started, true, "Host should start a new round.");
  assertEqual(nextRound.already_started, false, "First start_next_round should not be idempotent.");
  assertEqual(nextRound.state, "role_reveal", "New round should enter role_reveal.");
  assertEqual(nextRound.round_number, 2, "New round should be number + 1.");
  assertEqual(gameSessionState(fixture.gameSessionId), "role_reveal", "GameSession should return to role_reveal.");
  assertEqual(roundCount(fixture.gameSessionId), 2, "start_next_round should create exactly one new round.");

  const retryNextRound = await startNextRound(fixture.host.client, "host next round retry");
  assertEqual(retryNextRound.started, false, "Retry should not create another round.");
  assertEqual(retryNextRound.already_started, true, "Retry should be reported as already_started.");
  assertEqual(retryNextRound.round_number, 2, "Retry should return the existing new round number.");
  assertEqual(roundCount(fixture.gameSessionId), 2, "Retry must not create a third round.");

  const roundOne = roundByNumber(fixture.gameSessionId, 1);
  const roundTwo = roundByNumber(fixture.gameSessionId, 2);
  assertEqual(roundOne.secretWord, "Alfa", "Round 1 word should remain stable.");
  assert(roundTwo.secretWord !== "Alfa", "Round 2 must not reuse a used word in the same GameSession.");
  assert(["Beta", "Gamma"].includes(roundTwo.secretWord), "Round 2 should use a remaining group word.");
  assert(roundTwo.impostorPlayerId !== roundOneImpostorId, "Round 2 impostor should come from the lower impostor-count pool.");

  for (const before of countsBeforeStart) {
    const after = sessionPlayer(fixture.gameSessionId, before.playerId);
    assertEqual(after.score, before.score, "start_next_round must preserve scores.");
  }

  for (const player of sessionPlayerRows(fixture.gameSessionId)) {
    const expectedCount = player.playerId === roundOneImpostorId || player.playerId === roundTwo.impostorPlayerId ? 1 : 0;
    assertEqual(player.impostorCount, expectedCount, "start_next_round should reconcile and increment only round impostors.");
  }

  const roundTwoImpostor = [fixture.host, ...fixture.players].find((player) => player.playerId === roundTwo.impostorPlayerId);
  const roundTwoPlayer = [fixture.host, ...fixture.players].find((player) => player.playerId !== roundTwo.impostorPlayerId);
  assert(roundTwoImpostor, "Round 2 impostor client should be known.");
  assert(roundTwoPlayer, "Round 2 non-impostor client should be known.");

  const impostorReveal = await getMyGameState(roundTwoImpostor.client, "round 2 impostor role_reveal");
  assertEqual(impostorReveal.state, "role_reveal", "New round impostor should see role_reveal.");
  assertEqual(impostorReveal.role, "impostor", "Round 2 impostor should receive impostor role.");
  assertEqual(impostorReveal.word, null, "Round 2 impostor must not receive the secret word.");
  assertNoSecretFields(impostorReveal, "round 2 impostor role_reveal");

  const playerReveal = await getMyGameState(roundTwoPlayer.client, "round 2 player role_reveal");
  assertEqual(playerReveal.state, "role_reveal", "New round player should see role_reveal.");
  assertEqual(playerReveal.role, "player", "Round 2 non-impostor should receive player role.");
  assertEqual(playerReveal.word, roundTwo.secretWord, "Round 2 non-impostor should see the selected word.");
  assertNoSecretFields(playerReveal, "round 2 player role_reveal");
}

async function validateGroupScoringAndNoWordsBlock() {
  const fixture = await buildPlayingFixture("group no words", ["Unica"]);
  const impostor = fixture.players[0];

  setRoundResolved(fixture.gameSessionId, 1, {
    secretWord: "Unica",
    impostorPlayerId: impostor.playerId,
    winner: "group"
  });

  await advanceScoreboard(fixture.players[1].client, "group scoring by non-host session player");
  await advanceScoreboard(fixture.host.client, "group scoring retry by host");

  assertEqual(sessionPlayer(fixture.gameSessionId, impostor.playerId).score, 0, "Impostor should not score when group wins.");
  assertEqual(sessionPlayer(fixture.gameSessionId, fixture.host.playerId).score, 1, "Host non-impostor should receive group point.");
  for (const player of fixture.players.slice(1)) {
    assertEqual(sessionPlayer(fixture.gameSessionId, player.playerId).score, 1, "Every non-impostor should receive group point.");
  }

  const hostScoreboardState = await getMyGameState(fixture.host.client, "host no-word scoreboard");
  assertEqual(hostScoreboardState.state, "scoreboard", "No-word fixture should be in scoreboard.");
  assertEqual(hostScoreboardState.can_start_next_round, false, "Host should be blocked when no unused words remain.");
  assertEqual(hostScoreboardState.available_unused_words_count, 0, "No-word fixture should expose zero unused words.");
  assertEqual(hostScoreboardState.next_round_block_reason, "no_words", "Host block reason should be no_words.");
  assertEqual(hostScoreboardState.can_end_session, true, "No-word scoreboard should still let the host end the session.");

  await expectRpcFailure(
    () => fixture.host.client.rpc("start_next_round"),
    "P0021",
    "No unused words should block start_next_round"
  );
  assertEqual(roundCount(fixture.gameSessionId), 1, "No-word failure must not create a partial round.");
  assertEqual(gameSessionState(fixture.gameSessionId), "scoreboard", "No-word failure must keep scoreboard state.");
}

async function main() {
  await validateImpostorScoringAndNextRound();
  await validateGroupScoringAndNoWordsBlock();

  console.log("validate-11-5 PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
