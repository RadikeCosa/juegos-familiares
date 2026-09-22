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

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function psql(sql) {
  return execFileSync("psql", [env.DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", sql], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`);
}
function client() {
  return createClient(env.API_URL, env.PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  });
}
async function identity() {
  const instance = client();
  const { data, error } = await instance.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in failed.");
  return instance;
}
async function rpc(instance, name, args) {
  const { data, error } = await instance.rpc(name, args);
  if (error) throw error;
  return data;
}
async function rejects(instance, name, args, code) {
  const { error } = await instance.rpc(name, args);
  equal(error?.code, code, `${name} should fail with ${code}`);
}
async function activeSlotCount(instance) {
  const { data, error } = await instance.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Missing test AuthIdentity.");
  return psql(`select count(*) from public.player_active_room_slots s
    join public.players p on p.id = s.player_id
    where p.auth_user_id = ${sqlString(data.user.id)}::uuid`);
}

equal(psql("select has_function_privilege('anon', 'public.create_room(text)', 'EXECUTE')"), "f", "Anon cannot create typed Room");
equal(psql("select has_function_privilege('anon', 'public.join_room_by_code(text,text)', 'EXECUTE')"), "f", "Anon cannot join typed Room");
equal(psql("select has_function_privilege('authenticated', 'public.create_room(text)', 'EXECUTE')"), "t", "Authenticated can create typed Room");
equal(psql("select has_function_privilege('authenticated', 'public.join_room_by_code(text,text)', 'EXECUTE')"), "t", "Authenticated can join typed Room");

const host = await identity();
await markClientAsPlatformAdmin(host, psql, sqlString);
const group = (await rpc(host, "create_group_with_admin_player", {
  group_name: "Tutti Increment 1 validation", player_nickname: "Host"
}))[0];
const member = await identity();
await rpc(member, "join_group_with_invitation", {
  invitation_code: group.invitation_code, player_nickname: "Member"
});
const other = await identity();
await markClientAsPlatformAdmin(other, psql, sqlString);
await rpc(other, "create_group_with_admin_player", {
  group_name: "Tutti Increment 1 other group", player_nickname: "Other"
});

const tutti = await rpc(host, "create_room", { requested_game_type: "tutti_frutti" });
const tuttiCode = tutti[0].room_join_code;
const tuttiId = tutti[0].room_id;
equal(psql(`select game_type from public.rooms where id = ${sqlString(tuttiId)}::uuid`), "tutti_frutti", "Typed create persisted game identity");
equal((await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0].room_id, tuttiId, "Same-game retry converges");
await rejects(host, "create_room", undefined, "P0029");
await rejects(host, "create_room", { requested_game_type: "invalid" }, "P0028");
await rejects(host, "join_room_by_code", { room_code: tuttiCode, expected_game_type: "invalid" }, "P0028");
equal((await rpc(host, "get_my_active_room"))[0].room_game_type, "tutti_frutti", "Discovery returns Tutti Frutti");

await rejects(member, "join_room_by_code", { room_code: tuttiCode }, "P0030");
await rejects(member, "join_room_by_code", { room_code: "ZZZZZZZZ", expected_game_type: "tutti_frutti" }, "P0010");
await rejects(other, "join_room_by_code", { room_code: tuttiCode, expected_game_type: "tutti_frutti" }, "P0010");
await rejects(other, "join_room_by_code", { room_code: tuttiCode, expected_game_type: "impostor" }, "P0010");
const joined = await rpc(member, "join_room_by_code", { room_code: tuttiCode.toLowerCase(), expected_game_type: "tutti_frutti" });
equal(joined.length, 2, "Typed join enters same-group lobby");
equal((await rpc(member, "join_room_by_code", { room_code: tuttiCode, expected_game_type: "tutti_frutti" })).length, 2, "Join retry does not duplicate membership");
equal(psql(`select count(*) from public.room_participants where room_id = ${sqlString(tuttiId)}::uuid`), "2", "Two Tutti Room participants");

const impostorHost = await identity();
await rpc(impostorHost, "join_group_with_invitation", {
  invitation_code: group.invitation_code, player_nickname: "Impostor Host"
});
const impostor = await rpc(impostorHost, "create_room");
const impostorCode = impostor[0].room_join_code;
equal(psql(`select game_type from public.rooms where id = ${sqlString(impostor[0].room_id)}::uuid`), "impostor", "Legacy create remains Impostor");
equal((await rpc(impostorHost, "create_room", { requested_game_type: "impostor" }))[0].room_id, impostor[0].room_id, "Typed Impostor retry converges");
await rejects(impostorHost, "create_room", { requested_game_type: "tutti_frutti" }, "P0029");
await rejects(member, "join_room_by_code", { room_code: impostorCode, expected_game_type: "tutti_frutti" }, "P0030");
await rejects(member, "join_room_by_code", { room_code: impostorCode, expected_game_type: "impostor" }, "P0012");

const racer = await identity();
await rpc(racer, "join_group_with_invitation", {
  invitation_code: group.invitation_code, player_nickname: "Racer"
});
const race = await Promise.allSettled([
  rpc(racer, "create_room", { requested_game_type: "tutti_frutti" }),
  rpc(racer, "create_room")
]);
equal(race.filter((result) => result.status === "fulfilled").length, 1, "Cross-game create race has one winner");
const racerRoom = (await rpc(racer, "get_my_active_room"))[0];
assert(racerRoom.room_game_type === "impostor" || racerRoom.room_game_type === "tutti_frutti", "Race discovery has a valid game");
equal(await activeSlotCount(racer), "1", "Create race retains one global slot");
await rejects(racer, "create_room", {
  requested_game_type: racerRoom.room_game_type === "impostor" ? "tutti_frutti" : "impostor"
}, "P0029");

const joiningRacer = await identity();
await rpc(joiningRacer, "join_group_with_invitation", {
  invitation_code: group.invitation_code, player_nickname: "Joining Racer"
});
const joinRace = await Promise.allSettled([
  rpc(joiningRacer, "join_room_by_code", { room_code: tuttiCode, expected_game_type: "tutti_frutti" }),
  rpc(joiningRacer, "join_room_by_code", { room_code: impostorCode })
]);
equal(joinRace.filter((result) => result.status === "fulfilled").length, 1, "Cross-game join race has one winner");
const joinedRaceRoom = (await rpc(joiningRacer, "get_my_active_room"))[0];
assert(joinedRaceRoom.room_game_type === "impostor" || joinedRaceRoom.room_game_type === "tutti_frutti", "Join race discovery has a valid game");
equal(await activeSlotCount(joiningRacer), "1", "Join race retains one global slot");

try {
  psql(`begin; insert into public.game_sessions (room_id, group_id, state)
    select id, group_id, 'role_reveal' from public.rooms where id = ${sqlString(tuttiId)}::uuid;
    rollback;`);
  throw new Error("Impostor session insert accepted a Tutti Frutti Room.");
} catch (error) {
  assert(error.stderr?.toString().includes("P0030"), "Impostor session guard failed for another reason.");
}

const { error: directRoomWrite } = await member.from("rooms").update({ game_type: "impostor" }).eq("id", tuttiId);
assert(directRoomWrite, "Client direct Room write must remain denied.");
await rpc(host, "close_room");
const lateJoiner = await identity();
await rpc(lateJoiner, "join_group_with_invitation", {
  invitation_code: group.invitation_code, player_nickname: "Late Joiner"
});
await rejects(lateJoiner, "join_room_by_code", { room_code: tuttiCode, expected_game_type: "tutti_frutti" }, "P0011");
console.log("PASS: game-aware create/join, legacy compatibility, cross-group opacity, slot race, discovery and Impostor session guard.");
