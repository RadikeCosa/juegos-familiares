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

async function expectRpcFailure(operation, message) {
  const { error } = await operation();

  assert(error, `${message}: expected RPC failure.`);
  return error;
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
      coalesce(starting_player_id::text, '') || '|' ||
      impostor_player_id::text
    from public.rounds
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = ${Number(roundNumber)};
  `);
  const [id, startingPlayerId, impostorPlayerId] = row.split("|");

  return {
    id,
    startingPlayerId: startingPlayerId || null,
    impostorPlayerId
  };
}

function rosterPlayerIds(gameSessionId) {
  const output = psql(`
    select player_id::text
    from public.session_players
    where game_session_id = ${sqlString(gameSessionId)}::uuid
    order by player_id;
  `);

  return output ? output.split("\n") : [];
}

function startingPlayerCounts(gameSessionId) {
  const output = psql(`
    select session_players.player_id::text || '|' || count(rounds.id)::text
    from public.session_players
    left join public.rounds
      on rounds.game_session_id = session_players.game_session_id
     and rounds.starting_player_id = session_players.player_id
    where session_players.game_session_id = ${sqlString(gameSessionId)}::uuid
    group by session_players.player_id
    order by session_players.player_id;
  `);

  if (!output) {
    return [];
  }

  return output.split("\n").map((line) => {
    const [playerId, count] = line.split("|");
    return { playerId, count: Number(count) };
  });
}

function setRoundWinner(gameSessionId, roundNumber, winner) {
  psql(`
    update public.rounds
    set round_winner = ${sqlString(winner)}
    where game_session_id = ${sqlString(gameSessionId)}::uuid
      and number = ${Number(roundNumber)};

    update public.game_sessions
    set state = 'round_result'
    where id = ${sqlString(gameSessionId)}::uuid;
  `);
}

async function buildThreePlayerFixture(label, words) {
  const host = await signInAnonymously(`${label} host`);
  const group = await createGroup(host.client, `Familia starting-player ${label}`, "Host");
  const players = [];

  for (const playerName of ["B", "C"]) {
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

  assertEqual(roundCount(fixture.gameSessionId), 1, `${label}: start_session should create round 1.`);
  return fixture;
}

function allParticipants(fixture) {
  return [fixture.host, ...fixture.players];
}

async function advanceToNextRound(fixture, label) {
  const currentRoundNumber = roundCount(fixture.gameSessionId);
  setRoundWinner(fixture.gameSessionId, currentRoundNumber, "group");
  await advanceScoreboard(fixture.host.client, `${label}: advance scoreboard`);
  await startNextRound(fixture.host.client, `${label}: start next round`);
}

async function validateMigrationApplied() {
  const columnExists = psql(`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'rounds'
        and column_name = 'starting_player_id'
    );
  `);
  assertEqual(columnExists, "t", "rounds.starting_player_id column should exist after the migration.");

  for (const fn of ["start_session", "start_next_round", "get_my_game_state"]) {
    const fnExists = psql(`
      select exists (
        select 1
        from pg_proc
        join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
        where pg_namespace.nspname = 'public'
          and pg_proc.proname = ${sqlString(fn)}
      );
    `);
    assertEqual(fnExists, "t", `public.${fn}() should exist after the migration.`);
  }

  const fkExists = psql(`
    select exists (
      select 1
      from pg_constraint
      where conname = 'rounds_starting_player_session_player_fkey'
    );
  `);
  assertEqual(fkExists, "t", "rounds should keep the starting player roster foreign key.");
}

async function validateFirstRoundEligibilityAndRosterMembership() {
  const fixture = await buildThreePlayerFixture("round1", ["Uno"]);
  const round1 = roundByNumber(fixture.gameSessionId, 1);
  const roster = rosterPlayerIds(fixture.gameSessionId);

  assert(
    round1.startingPlayerId !== null,
    "Round 1 must persist a starting player."
  );
  assert(
    roster.includes(round1.startingPlayerId),
    "Starting player must belong to the frozen GameSession roster."
  );
}

async function validateSequentialBalanceAndRoleIndependence() {
  const fixture = await buildThreePlayerFixture("sequential", ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]);
  const participants = allParticipants(fixture);
  const roster = rosterPlayerIds(fixture.gameSessionId);

  const round1 = roundByNumber(fixture.gameSessionId, 1);
  assert(roster.includes(round1.startingPlayerId), "Round 1 starting player must belong to the roster.");

  await advanceToNextRound(fixture, "round 1 to 2");
  const round2 = roundByNumber(fixture.gameSessionId, 2);
  assert(roster.includes(round2.startingPlayerId), "Round 2 starting player must belong to the roster.");

  await advanceToNextRound(fixture, "round 2 to 3");
  const round3 = roundByNumber(fixture.gameSessionId, 3);
  assert(roster.includes(round3.startingPlayerId), "Round 3 starting player must belong to the roster.");

  const firstThree = [round1.startingPlayerId, round2.startingPlayerId, round3.startingPlayerId];
  assertEqual(
    new Set(firstThree).size,
    3,
    "With exactly 3 participants, the first three starting players must all be distinct."
  );
  assertEqual(
    new Set(firstThree).size,
    roster.length,
    "The first three starting players must exactly cover the frozen roster once each."
  );

  assert(
    firstThree.includes(fixture.host.playerId),
    "Host must be selected like any other SessionPlayer, without exclusion or forced priority."
  );

  const countsAfterRound3 = startingPlayerCounts(fixture.gameSessionId);
  const distinctCounts = new Set(countsAfterRound3.map((entry) => entry.count));
  assertEqual(
    distinctCounts.size,
    1,
    "After each of the 3 participants started exactly once, counts must equalize."
  );
  assertEqual(
    countsAfterRound3.length,
    3,
    "All 3 SessionPlayers must be tracked for the balance calculation."
  );

  await advanceToNextRound(fixture, "round 3 to 4");
  const round4 = roundByNumber(fixture.gameSessionId, 4);
  assert(
    roster.includes(round4.startingPlayerId),
    "Round 4 starting player, drawn once counts equalized, must still belong to the roster."
  );

  assert(
    participants.some((participant) => participant.playerId === round1.impostorPlayerId),
    "Round 1 impostor must be one of the frozen SessionPlayers."
  );

  psql(`
    update public.rounds
    set impostor_player_id = ${sqlString(round1.startingPlayerId)}::uuid
    where id = ${sqlString(round1.id)}::uuid;
  `);
  const roundOneAfterUpdate = roundByNumber(fixture.gameSessionId, 1);
  assertEqual(
    roundOneAfterUpdate.impostorPlayerId,
    round1.startingPlayerId,
    "The schema must not prevent the impostor from also being the starting player: selection is role-independent."
  );
}

async function validateClientCannotImposeStartingPlayer() {
  const fixture = await buildThreePlayerFixture("client-cannot-impose", ["Uno", "Dos"]);
  const round1 = roundByNumber(fixture.gameSessionId, 1);
  const otherPlayer = fixture.players.find(
    (player) => player.playerId !== round1.startingPlayerId
  );

  await expectRpcFailure(
    () => fixture.host.client.rpc("start_next_round", { starting_player_id: otherPlayer.playerId }),
    "start_next_round must reject a client-supplied starting_player_id"
  );

  setRoundWinner(fixture.gameSessionId, 1, "group");
  await advanceScoreboard(fixture.host.client, "client-cannot-impose scoreboard");

  await expectRpcFailure(
    () => fixture.host.client.rpc("start_next_round", { starting_player_id: otherPlayer.playerId }),
    "start_next_round in scoreboard must still reject a client-supplied starting_player_id"
  );
  assertEqual(roundCount(fixture.gameSessionId), 1, "Rejected calls must not create a round.");

  await startNextRound(fixture.host.client, "legitimate next round after rejected attempts");
  const round2 = roundByNumber(fixture.gameSessionId, 2);
  const roster = rosterPlayerIds(fixture.gameSessionId);
  assert(
    roster.includes(round2.startingPlayerId),
    "Round 2 starting player must still be server-selected from the roster after the rejected client attempts."
  );
}

async function validateDirectTableAccessStaysClosed() {
  const fixture = await buildThreePlayerFixture("direct-access", ["Uno"]);
  const round1 = roundByNumber(fixture.gameSessionId, 1);

  const { data, error } = await fixture.host.client
    .from("rounds")
    .select("starting_player_id")
    .eq("id", round1.id);

  assert(
    error !== null,
    "Direct SELECT on public.rounds through PostgREST must be denied; access must stay RPC-only."
  );
  assert(
    !data || data.length === 0,
    "Direct SELECT on public.rounds must never return rows to an authenticated client."
  );
}

async function validateSharedReadAcrossAuthorizedParticipants() {
  const fixture = await buildThreePlayerFixture("shared-read", ["Uno"]);
  const round1 = roundByNumber(fixture.gameSessionId, 1);

  const hostState = await getMyGameState(fixture.host.client, "shared-read host");
  const bState = await getMyGameState(fixture.players[0].client, "shared-read B");
  const cState = await getMyGameState(fixture.players[1].client, "shared-read C");

  for (const [label, state] of [["host", hostState], ["B", bState], ["C", cState]]) {
    assert(state.starting_player, `${label}: starting_player must be present in the read model.`);
    assertEqual(
      state.starting_player.player_id,
      round1.startingPlayerId,
      `${label}: all authorized participants must read the same persisted starting player.`
    );
  }

  const expectedSelf = {
    [fixture.host.playerId]: hostState,
    [fixture.players[0].playerId]: bState,
    [fixture.players[1].playerId]: cState
  };

  for (const [playerId, state] of Object.entries(expectedSelf)) {
    assertEqual(
      state.starting_player.is_self,
      playerId === round1.startingPlayerId,
      "is_self must be true only for the chosen participant's own client."
    );
  }
}

async function validateNoCrossGroupOrCrossSessionLeak() {
  const fixtureA = await buildThreePlayerFixture("isolation-a", ["Uno"]);
  const fixtureB = await buildThreePlayerFixture("isolation-b", ["Uno"]);

  const roundA1 = roundByNumber(fixtureA.gameSessionId, 1);
  const roundB1 = roundByNumber(fixtureB.gameSessionId, 1);

  assert(fixtureA.gameSessionId !== fixtureB.gameSessionId, "Fixtures must use independent GameSessions.");

  const stateFromB = await getMyGameState(fixtureB.host.client, "isolation B host");
  assertEqual(
    stateFromB.starting_player.player_id,
    roundB1.startingPlayerId,
    "Group B must only read its own GameSession's starting player."
  );

  const rosterA = rosterPlayerIds(fixtureA.gameSessionId);
  const rosterB = rosterPlayerIds(fixtureB.gameSessionId);
  assert(
    rosterB.includes(stateFromB.starting_player.player_id),
    "Group B's starting player must belong to Group B's own roster."
  );
  assert(
    !rosterA.includes(stateFromB.starting_player.player_id),
    "Group B's starting player must never come from Group A's roster."
  );
  assert(
    stateFromB.starting_player.player_id !== roundA1.startingPlayerId,
    "Group B's read model must never surface Group A's chosen starting player."
  );

  const { data: crossGroupData, error: crossGroupError } = await fixtureB.host.client
    .from("rounds")
    .select("starting_player_id")
    .eq("id", roundA1.id);

  assert(
    crossGroupError !== null,
    "No authenticated client, regardless of group, can read another GameSession's round directly."
  );
  assert(
    !crossGroupData || crossGroupData.length === 0,
    "Direct cross-group SELECT on public.rounds must never return rows."
  );
}

async function validateRefreshDoesNotResample() {
  const fixture = await buildThreePlayerFixture("refresh-stable", ["Uno"]);
  const round1 = roundByNumber(fixture.gameSessionId, 1);

  const reads = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await getMyGameState(fixture.host.client, `refresh attempt ${attempt}`);
    reads.push(state.starting_player.player_id);
  }

  assertEqual(new Set(reads).size, 1, "Repeated get_my_game_state reads must return the same persisted starting player.");
  assertEqual(reads[0], round1.startingPlayerId, "Repeated reads must match the persisted Round.starting_player_id.");
}

async function main() {
  await validateMigrationApplied();
  await validateFirstRoundEligibilityAndRosterMembership();
  await validateSequentialBalanceAndRoleIndependence();
  await validateClientCannotImposeStartingPlayer();
  await validateDirectTableAccessStaysClosed();
  await validateSharedReadAcrossAuthorizedParticipants();
  await validateNoCrossGroupOrCrossSessionLeak();
  await validateRefreshDoesNotResample();

  console.log("validate-round-starting-player PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
