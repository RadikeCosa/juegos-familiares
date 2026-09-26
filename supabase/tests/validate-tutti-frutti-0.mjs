import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
});
const env = Object.fromEntries(
  [...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]])
);
if (!env.DB_URL || !env.API_URL || !env.PUBLISHABLE_KEY ||
    new URL(env.DB_URL).hostname !== "127.0.0.1" ||
    new URL(env.API_URL).hostname !== "127.0.0.1") {
  throw new Error("This validator requires the project's local Supabase instance.");
}

function psql(sql) {
  return execFileSync("psql", [env.DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", sql], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function mustReject(sql, code, label) {
  try { psql(sql); } catch (error) {
    assert(error.stderr?.toString().includes(code), `${label} failed for a reason other than ${code}.`);
    return;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

assert(psql("select count(*) from public.rooms where game_type is null or game_type not in ('impostor', 'tutti_frutti')") === "0",
  "A Room has no valid game identity.");
assert(psql("select count(*) from public.game_sessions gs join public.rooms r on r.id = gs.room_id where r.game_type <> 'impostor'") === "0",
  "Historical Impostor sessions changed game identity.");
assert(psql("select attnotnull from pg_attribute where attrelid = 'public.rooms'::regclass and attname = 'game_type'") === "t",
  "Room game identity is nullable.");
assert(psql("select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid = 'public.rooms'::regclass and adnum = (select attnum from pg_attribute where attrelid = 'public.rooms'::regclass and attname = 'game_type')") === "'impostor'::text",
  "Legacy zero-argument create lacks its temporary Impostor default.");
assert(psql("select has_table_privilege('authenticated', 'public.rooms', 'UPDATE')") === "f",
  "Authenticated clients can directly change Rooms.");

const client = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
});
const { data: authData, error: authError } = await client.auth.signInAnonymously();
if (authError || !authData.user) throw new Error("Local anonymous sign-in failed.");
await markClientAsPlatformAdmin(client, psql, sqlString);
const { data: groupRows, error: groupError } = await client.rpc("create_group_with_admin_player", {
  group_name: "Tutti Increment 0 validation", player_nickname: "Validator"
});
if (groupError || !groupRows?.length) throw groupError ?? new Error("Group fixture failed.");
const created = await client.rpc("create_room");
if (created.error || !created.data?.length) throw created.error ?? new Error("Room create failed.");
const roomId = created.data[0].room_id;
mustReject(`begin; insert into public.rooms (group_id, host_player_id, join_code, status, game_type)
  select group_id, host_player_id, public.generate_room_join_code(), 'closed', null
  from public.rooms where id = ${sqlString(roomId)}::uuid; rollback;`, "23502", "NULL game type");
mustReject(`begin; insert into public.rooms (group_id, host_player_id, join_code, status, game_type)
  select group_id, host_player_id, public.generate_room_join_code(), 'closed', 'invalid'
  from public.rooms where id = ${sqlString(roomId)}::uuid; rollback;`, "23514", "Invalid game type");
mustReject(`begin; update public.rooms set game_type = 'tutti_frutti'
  where id = ${sqlString(roomId)}::uuid; rollback;`, "P0027", "Game type conversion");
const reverseCode = psql("select public.generate_room_join_code()");
mustReject(`begin; insert into public.rooms (group_id, host_player_id, join_code, status, game_type)
  select group_id, host_player_id, ${sqlString(reverseCode)}, 'closed', 'tutti_frutti'
  from public.rooms where id = ${sqlString(roomId)}::uuid;
  update public.rooms set game_type = 'impostor'
  where join_code = ${sqlString(reverseCode)}; rollback;`, "P0027", "Reverse game type conversion");
const sameValue = psql(`begin; update public.rooms set game_type = game_type
  where id = ${sqlString(roomId)}::uuid;
  select game_type from public.rooms where id = ${sqlString(roomId)}::uuid;
  rollback;`);
assert(sameValue.split("\n").includes("impostor"), "Same-value game type update failed.");
const unrelatedUpdate = psql(`begin; update public.rooms set status = status
  where id = ${sqlString(roomId)}::uuid;
  select game_type from public.rooms where id = ${sqlString(roomId)}::uuid;
  rollback;`);
assert(unrelatedUpdate.split("\n").includes("impostor"), "Unrelated Room update changed game type.");
assert(psql(`begin; insert into public.rooms (group_id, host_player_id, join_code, status, game_type)
  select group_id, host_player_id, public.generate_room_join_code(), 'closed', 'tutti_frutti'
  from public.rooms where id = ${sqlString(roomId)}::uuid;
  select game_type from public.rooms where game_type = 'tutti_frutti' order by created_at desc limit 1;
  rollback;`).includes("tutti_frutti"), "A valid Tutti Frutti Room identity was rejected.");

const active = await client.rpc("get_my_active_room");
if (active.error || !active.data?.length) throw active.error ?? new Error("Active Room discovery failed.");
assert(active.data[0].room_game_type === "impostor", "Authorized discovery returned the wrong game.");
assert(active.data[0].room_id === created.data[0].room_id, "Discovery disagrees with the active slot.");
assert(psql(`select game_type from public.rooms where id = ${sqlString(created.data[0].room_id)}::uuid`) === "impostor",
  "Legacy create did not persist Impostor game identity.");
const retry = await client.rpc("create_room");
if (retry.error || retry.data?.[0]?.room_id !== created.data[0].room_id) {
  throw retry.error ?? new Error("Legacy create retry did not converge.");
}
console.log("PASS: backfill, NULL/CHECK, both mutation directions, permitted updates, direct-write guard, legacy create/retry, authorized discovery.");
