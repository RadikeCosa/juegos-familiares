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

function psqlShouldFail(sql) {
  try {
    psql(sql);
  } catch {
    return;
  }

  throw new Error("Expected SQL statement to fail.");
}

async function expectDirectSelectDenied(operation) {
  const { data, error } = await operation();

  assert(error || !data || data.length === 0, "Expected direct select to expose no rows.");
}

async function expectDirectWriteDenied(operation) {
  const { error } = await operation();

  assert(error, "Expected direct write to be denied for the client.");
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

async function createRoom(client) {
  const { data, error } = await client.rpc("create_room");

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Create room RPC returned no rows.");
  }

  return data;
}

function playerIdForAuthUser(authUserId) {
  return psql(`
    select id from public.players where auth_user_id = ${sqlString(authUserId)}::uuid;
  `);
}

function getColumns(tableName) {
  return psql(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${sqlString(tableName)}
    order by ordinal_position;
  `).split("\n").filter(Boolean);
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

function hasTable(tableName) {
  return psql(`
    select to_regclass('public.${tableName}') is not null;
  `) === "t";
}

function hasRls(tableName) {
  return psql(`
    select relrowsecurity
    from pg_class
    join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = ${sqlString(tableName)};
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

function countPolicies(tableName) {
  return Number(psql(`
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = ${sqlString(tableName)};
  `));
}

function assertNoColumns(tableName, forbiddenColumns) {
  const columns = new Set(getColumns(tableName));

  for (const column of forbiddenColumns) {
    assert(!columns.has(column), `${tableName} should not include ${column}.`);
  }
}

function insertGameSession(roomId, groupId) {
  return psql(`
    insert into public.game_sessions (room_id, group_id, state)
    values (${sqlString(roomId)}::uuid, ${sqlString(groupId)}::uuid, 'role_reveal')
    returning id;
  `);
}

function insertSessionPlayer(gameSessionId, groupId, playerId) {
  psql(`
    insert into public.session_players (game_session_id, group_id, player_id)
    values (
      ${sqlString(gameSessionId)}::uuid,
      ${sqlString(groupId)}::uuid,
      ${sqlString(playerId)}::uuid
    );
  `);
}

async function main() {
  const adminA = await signInAnonymously("admin A");
  const adminB = await signInAnonymously("admin B");
  const playerA = await signInAnonymously("player A");

  const groupA = await createGroup(adminA.client, "Familia 6.1 A", "Admin A");
  const groupB = await createGroup(adminB.client, "Familia 6.1 B", "Admin B");
  const joinedPlayerA = await joinGroup(playerA.client, groupA.invitation_code, "Player A");

  const roomRows = await createRoom(adminA.client);
  const roomAId = roomRows[0].room_id;
  const adminAPlayerId = groupA.player_id;
  const playerAId = playerIdForAuthUser(playerA.userId);
  const groupBAdminPlayerId = groupB.player_id;

  assert(hasTable("game_sessions"), "game_sessions table should exist.");
  assert(hasTable("session_players"), "session_players table should exist.");

  assertEqual(
    constraintDefinition("game_sessions", "game_sessions_pkey"),
    "PRIMARY KEY (id)",
    "game_sessions PK mismatch."
  );
  assertEqual(
    constraintDefinition("game_sessions", "game_sessions_room_id_key"),
    "UNIQUE (room_id)",
    "game_sessions room uniqueness mismatch."
  );
  assertEqual(
    constraintDefinition("game_sessions", "game_sessions_id_group_id_key"),
    "UNIQUE (id, group_id)",
    "game_sessions composite uniqueness mismatch."
  );
  assert(
    constraintDefinition("game_sessions", "game_sessions_room_group_fkey")
      .includes("FOREIGN KEY (group_id, room_id) REFERENCES rooms(group_id, id)"),
    "game_sessions Room/Group FK mismatch."
  );

  assertEqual(
    constraintDefinition("session_players", "session_players_pkey"),
    "PRIMARY KEY (game_session_id, player_id)",
    "session_players PK mismatch."
  );
  assert(
    constraintDefinition("session_players", "session_players_game_session_group_fkey")
      .includes("FOREIGN KEY (game_session_id, group_id) REFERENCES game_sessions(id, group_id) ON DELETE CASCADE"),
    "session_players GameSession/Group FK mismatch."
  );
  assert(
    constraintDefinition("session_players", "session_players_player_group_fkey")
      .includes("FOREIGN KEY (group_id, player_id) REFERENCES players(group_id, id)"),
    "session_players Player/Group FK mismatch."
  );

  const sessionPlayerForeignKeys = psql(`
    select coalesce(string_agg(confrelid::regclass::text, ',' order by confrelid::regclass::text), '')
    from pg_constraint
    where conrelid = 'public.session_players'::regclass
      and contype = 'f';
  `);

  assert(
    !sessionPlayerForeignKeys.includes("room_participants"),
    "session_players must not reference room_participants."
  );

  assert(hasRls("game_sessions"), "game_sessions RLS should be enabled.");
  assert(hasRls("session_players"), "session_players RLS should be enabled.");
  assertEqual(countPolicies("game_sessions"), 0, "game_sessions should not have product policies yet.");
  assertEqual(countPolicies("session_players"), 0, "session_players should not have product policies yet.");

  for (const tableName of ["game_sessions", "session_players"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(
        !hasPrivilege("anon", tableName, privilege),
        `anon should not have ${privilege} on ${tableName}.`
      );
      assert(
        !hasPrivilege("authenticated", tableName, privilege),
        `authenticated should not have ${privilege} on ${tableName}.`
      );
    }
  }

  assertNoColumns("game_sessions", [
    "host_player_id",
    "status",
    "finished_at",
    "winner",
    "round_count",
    "final_scores",
    "created_by"
  ]);
  assertNoColumns("session_players", [
    "id",
    "score",
    "impostor_count",
    "role_acknowledged",
    "vote_submitted",
    "joined_at"
  ]);

  const gameSessionAId = insertGameSession(roomAId, groupA.group_id);
  assert(gameSessionAId, "Should create a GameSession for a valid Room.");

  psqlShouldFail(`
    insert into public.game_sessions (room_id, group_id, state)
    values (extensions.gen_random_uuid(), ${sqlString(groupA.group_id)}::uuid, 'role_reveal');
  `);

  psqlShouldFail(`
    insert into public.game_sessions (room_id, group_id, state)
    values (${sqlString(roomAId)}::uuid, ${sqlString(groupB.group_id)}::uuid, 'role_reveal');
  `);

  psqlShouldFail(`
    insert into public.game_sessions (room_id, group_id, state)
    values (${sqlString(roomAId)}::uuid, ${sqlString(groupA.group_id)}::uuid, 'role_reveal');
  `);

  insertSessionPlayer(gameSessionAId, groupA.group_id, adminAPlayerId);
  insertSessionPlayer(gameSessionAId, groupA.group_id, playerAId);

  psqlShouldFail(`
    insert into public.session_players (game_session_id, group_id, player_id)
    values (
      ${sqlString(gameSessionAId)}::uuid,
      ${sqlString(groupA.group_id)}::uuid,
      ${sqlString(playerAId)}::uuid
    );
  `);

  psqlShouldFail(`
    insert into public.session_players (game_session_id, group_id, player_id)
    values (
      ${sqlString(gameSessionAId)}::uuid,
      ${sqlString(groupA.group_id)}::uuid,
      ${sqlString(groupBAdminPlayerId)}::uuid
    );
  `);

  psqlShouldFail(`
    insert into public.session_players (game_session_id, group_id, player_id)
    values (
      ${sqlString(gameSessionAId)}::uuid,
      ${sqlString(groupB.group_id)}::uuid,
      ${sqlString(groupBAdminPlayerId)}::uuid
    );
  `);

  psql(`
    delete from public.game_sessions
    where id = ${sqlString(gameSessionAId)}::uuid;
  `);
  assertEqual(
    Number(psql(`
      select count(*)
      from public.session_players
      where game_session_id = ${sqlString(gameSessionAId)}::uuid;
    `)),
    0,
    "Deleting a GameSession should cascade to SessionPlayers."
  );

  await expectDirectSelectDenied(() => adminA.client.from("game_sessions").select("*"));
  await expectDirectSelectDenied(() => adminA.client.from("session_players").select("*"));
  await expectDirectWriteDenied(() => adminA.client.from("game_sessions").insert({
    room_id: roomAId,
    group_id: groupA.group_id
  }));
  await expectDirectWriteDenied(() => adminA.client.from("session_players").insert({
    game_session_id: extensionsFakeUuid(),
    group_id: groupA.group_id,
    player_id: adminAPlayerId
  }));
  await expectDirectWriteDenied(() => adminA.client.from("game_sessions").update({
    started_at: new Date().toISOString()
  }).eq("room_id", roomAId));
  await expectDirectWriteDenied(() => adminA.client.from("session_players").update({
    group_id: groupA.group_id
  }).eq("player_id", adminAPlayerId));
  await expectDirectWriteDenied(() => adminA.client.from("game_sessions").delete().eq("room_id", roomAId));
  await expectDirectWriteDenied(() => adminA.client.from("session_players").delete().eq("player_id", adminAPlayerId));

  const roomsStatusCheck = constraintDefinition("rooms", "rooms_status_check");
  assert(roomsStatusCheck.includes("'lobby'"), "rooms_status_check should still include lobby.");
  assert(roomsStatusCheck.includes("'closed'"), "rooms_status_check should still include closed.");

  // Keep this read tied to the joined Player so lint cannot hide an unused
  // fixture; the row also proves the second Player exists in Group A.
  assertEqual(joinedPlayerA.is_admin, false, "Joined Player A should not be admin.");

  console.log("validate-6-1 PASS");
}

function extensionsFakeUuid() {
  return "00000000-0000-4000-8000-000000000061";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
