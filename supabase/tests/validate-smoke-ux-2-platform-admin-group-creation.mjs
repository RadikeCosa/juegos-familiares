import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { markPlatformAdmin } from "./platform-admin-test-helpers.mjs";

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

async function createGroup(client, groupName, playerNickname) {
  const { data, error } = await client.rpc("create_group_with_admin_player", {
    group_name: groupName,
    player_nickname: playerNickname
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error("Create group RPC returned no row.");
  }

  return row;
}

async function main() {
  const platformAdmin = await signInAnonymously("platform admin");
  markPlatformAdmin(platformAdmin.userId, psql, sqlString);

  const { data: adminPermissions, error: adminPermissionsError } =
    await platformAdmin.client.rpc("get_my_platform_permissions");
  assert(!adminPermissionsError, "Platform admin permissions RPC should succeed.");
  assertEqual(
    adminPermissions?.[0]?.can_create_groups,
    true,
    "Platform admin should be allowed to create groups."
  );

  const createdGroup = await createGroup(
    platformAdmin.client,
    "Familia Smoke UX 2",
    "Admin"
  );
  assert(createdGroup.invitation_code, "Created group should include invitation code.");

  const nonAdmin = await signInAnonymously("non-admin");
  const { data: nonAdminPermissions, error: nonAdminPermissionsError } =
    await nonAdmin.client.rpc("get_my_platform_permissions");
  assert(!nonAdminPermissionsError, "Non-admin permissions RPC should succeed.");
  assertEqual(
    nonAdminPermissions?.[0]?.can_create_groups,
    false,
    "Non-admin should not be allowed to create groups."
  );

  const { data: deniedRows, error: deniedError } = await nonAdmin.client.rpc(
    "create_group_with_admin_player",
    {
      group_name: "Grupo no autorizado",
      player_nickname: "No Admin"
    }
  );
  assert(deniedError, "Non-admin group creation should fail.");
  assertEqual(deniedError.code, "42501", "Non-admin failure should be authorization.");
  assert(
    !deniedRows || deniedRows.length === 0,
    "Denied group creation should not return rows."
  );

  const { data: joinedRows, error: joinError } = await nonAdmin.client.rpc(
    "join_group_with_invitation",
    {
      invitation_code: createdGroup.invitation_code,
      player_nickname: "Invitado"
    }
  );
  assert(!joinError, "Non-admin should still join by invitation.");
  assertEqual(
    joinedRows?.[0]?.is_admin,
    false,
    "Joined non-admin should not become group admin."
  );

  const { data: roomRows, error: roomError } = await nonAdmin.client.rpc("create_room");
  assert(!roomError, "Joined non-admin should still create a Room.");
  assert(roomRows?.[0]?.room_join_code, "Room creation should return join code.");

  console.table([
    ["platform admin creates Group", "PASS"],
    ["non-admin cannot create Group", "PASS"],
    ["non-admin joins by invitation", "PASS"],
    ["joined non-admin can create Room", "PASS"]
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
