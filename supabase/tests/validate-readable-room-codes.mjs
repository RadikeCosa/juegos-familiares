import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

// This validator temporarily replaces the generator to force real collisions.
// Refuse the normal dev stack as well as every remote destination.
const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DO_NOT_TRACK: "1" },
});
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map((m) => [m[1], m[2]]));
const db = new URL(env.DB_URL);
const api = new URL(env.API_URL);
if (db.hostname !== "127.0.0.1" || db.port !== "55422" || db.pathname !== "/postgres"
  || api.hostname !== "127.0.0.1" || api.port !== "55421") {
  throw new Error("Requires a dedicated local room-code-validation Supabase stack on ports 55421/55422.");
}
const sqlString = (s) => `'${String(s).replaceAll("'", "''")}'`;
const args = [env.DB_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
function sql(statement) {
  return execFileSync("psql", [...args, "-c", statement], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function equal(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`);
}
async function rpc(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}
async function identity() {
  const client = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in failed");
  return { client, userId: data.user.id };
}
async function errorFor(client, code, game = "impostor") {
  return (await client.rpc("join_room_by_code", { room_code: code, expected_game_type: game })).error;
}
const originalGenerator = sql("select pg_get_functiondef('public.generate_room_join_code()'::regprocedure)");
const generator = (body) => sql(`create or replace function public.generate_room_join_code()
  returns text language plpgsql security definer set search_path = '' as $test$ begin ${body} end; $test$;`);
const legacyCode = [...randomBytes(8)].map((byte) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32]).join("");
function unusedWordCode() {
  return sql(`with candidate as materialized (select public.generate_room_join_code() as code)
    select code from candidate where not exists (select 1 from public.rooms where join_code = code)`);
}
const fixtureName = `Word codes ${Date.now()}`;

const host = await identity();
await markClientAsPlatformAdmin(host.client, sql, sqlString);
const group = (await rpc(host.client, "create_group_with_admin_player", {
  group_name: fixtureName, player_nickname: "Host",
}))[0];
async function member(nickname) {
  const actor = await identity();
  await rpc(actor.client, "join_group_with_invitation", { invitation_code: group.invitation_code, player_nickname: nickname });
  return actor;
}
const guest = await member("Guest");
const outsider = await identity();
await markClientAsPlatformAdmin(outsider.client, sql, sqlString);
await rpc(outsider.client, "create_group_with_admin_player", { group_name: `${fixtureName} other`, player_nickname: "Other" });

try {
  for (const [input, expected] of [
    [" ab7kq2m4 ", "AB7KQ2M4"], ["mate-luna", "MATE-LUNA"],
    ["  MATE luna  ", "MATE-LUNA"], ["mate - luna", "MATE-LUNA"],
    ["mate---luna", "MATE-LUNA"], ["mate\t\t luna", "MATE-LUNA"],
    ["\tÁguila -- LÚNA\n", "AGUILA-LUNA"], ["búho-luna", "BUHO-LUNA"],
    ["mäteluna", ""], ["mateluna", "MATELUNA"], ["mate_luna", ""],
    ["mate-ñube", ""], ["otoño-luna", ""], ["mate/luna", ""], ["mate-luna-sol", ""],
    ["mate-mate", ""], ["-mate-luna", ""], ["mate-luna-", ""], ["", ""],
  ]) equal(sql(`select public.normalize_room_join_code(${sqlString(input)})`), expected, `Normalize ${JSON.stringify(input)}`);
  equal(sql("select public.normalize_room_join_code(null)"), "", "Null code is invalid");
  equal(sql(`select count(*) from generate_series(1, 2000) where public.generate_room_join_code() !~ '^[A-Z]{3,7}-[A-Z]{3,7}$'`), "0", "Generator format");
  for (const role of ["anon", "authenticated"]) {
    for (const name of ["generate_room_join_code()", "normalize_room_join_code(text)"]) {
      equal(sql(`select has_function_privilege('${role}', 'public.${name}', 'EXECUTE')`), "f", `${role} cannot call ${name}`);
    }
  }
  equal(sql("select has_function_privilege('anon', 'public.create_room(text)', 'EXECUTE')"), "f", "Anon cannot create rooms");
  equal(sql("select has_function_privilege('authenticated', 'public.join_room_by_code(text,text)', 'EXECUTE')"), "t", "Authenticated join still granted");

  // A stored legacy room still resolves without renaming its code.
  const legacy = (await rpc(host.client, "create_room"))[0];
  sql(`update public.rooms set join_code = ${sqlString(legacyCode)} where id = ${sqlString(legacy.room_id)}::uuid`);
  equal((await rpc(guest.client, "join_room_by_code", { room_code: ` ${legacyCode.toLowerCase()} ` }))[0].room_join_code, legacyCode, "Legacy lookup");
  await rpc(host.client, "close_room");

  // Words retired from a future catalog remain valid: lookup depends on stored code.
  for (const game of ["impostor", "tutti_frutti"]) {
    const created = (await rpc(host.client, "create_room", { requested_game_type: game }))[0];
    assert(/^[A-Z]{3,7}-[A-Z]{3,7}$/.test(created.room_join_code), `${game} generates words`);
    const parts = created.room_join_code.split("-");
    assert(parts[0] !== parts[1], "Words must differ");
    sql(`update public.rooms set join_code = 'AGUILA-LUNA' where id = ${sqlString(created.room_id)}::uuid`);
    const notFound = await errorFor(outsider.client, "ZZZ-ZZZZ", game);
    const foreign = await errorFor(outsider.client, "águila - luna", game);
    equal(JSON.stringify(foreign), JSON.stringify(notFound), "Foreign and nonexistent rooms have identical public errors");
    equal((await errorFor(guest.client, "aguila-luna", game === "impostor" ? "tutti_frutti" : "impostor"))?.code, "P0030", "Wrong game rejected");
    equal((await errorFor(guest.client, "aguilaluna", game))?.code, "P0010", "Concatenated words rejected");
    const joined = await rpc(guest.client, "join_room_by_code", { room_code: "\táguila - - lúna\n", expected_game_type: game });
    equal(joined.length, 2, "Normalized join returns authorized roster");
    equal((await rpc(guest.client, "get_my_active_room"))[0].room_join_code, "AGUILA-LUNA", "Authoritative discovery preserves code");
    const { error: writeError } = await guest.client.from("rooms").update({ join_code: "GATO-SOL" }).eq("id", created.room_id);
    assert(writeError, "Direct room writes remain denied");
    await rpc(host.client, "close_room");
    // Free only this controlled fixture for the next iteration, using another valid code.
    sql(`update public.rooms set join_code = public.generate_room_join_code() where id = ${sqlString(created.room_id)}::uuid`);
  }

  // Force one collision against a CLOSED legacy room, then a successful retry.
  const retryHost = await member("Retry host");
  sql("create schema room_code_validation; create sequence room_code_validation.attempts;");
  const retryCode = unusedWordCode();
  assert(retryCode, "An unused retry code is available");
  generator(`if nextval('room_code_validation.attempts') = 1 then return ${sqlString(legacyCode)}; end if; return ${sqlString(retryCode)};`);
  const retried = (await rpc(retryHost.client, "create_room"))[0];
  equal(retried.room_join_code, retryCode, "Retry skips occupied closed code");
  equal(sql("select last_value from room_code_validation.attempts"), "2", "Exactly one retry");
  equal(sql(`select join_code from public.rooms where id = ${sqlString(legacy.room_id)}::uuid`), legacyCode, "Closed code preserved");

  const failHost = await member("Fail host");
  sql("alter sequence room_code_validation.attempts restart with 1");
  generator(`perform nextval('room_code_validation.attempts'); return ${sqlString(legacyCode)};`);
  const failed = await failHost.client.rpc("create_room", { requested_game_type: "tutti_frutti" });
  equal(failed.error?.code, "P0057", "Bounded exhaustion code");
  equal(failed.error?.message, "No pudimos generar un código disponible. Intentá crear la sala de nuevo", "Clear bounded error");
  equal(sql("select last_value from room_code_validation.attempts"), "8", "Exactly eight attempts");
  equal((await rpc(failHost.client, "get_my_active_room")).length, 0, "Failure leaves no room or active slot");

  sql(originalGenerator);

  // Two separate DB sessions race for the same code. The losing insert retries.
  const racerA = await member("Racer A");
  const racerB = await member("Racer B");
  sql("alter sequence room_code_validation.attempts restart with 1");
  const raceCode = unusedWordCode();
  let fallbackCode = unusedWordCode();
  while (fallbackCode === raceCode) fallbackCode = unusedWordCode();
  assert(raceCode && fallbackCode, "Unused race codes are available");
  generator(`if nextval('room_code_validation.attempts') <= 2 then perform pg_sleep(0.3); return ${sqlString(raceCode)}; end if; return ${sqlString(fallbackCode)};`);
  const concurrent = await Promise.all([
    rpc(racerA.client, "create_room", { requested_game_type: "impostor" }),
    rpc(racerB.client, "create_room", { requested_game_type: "tutti_frutti" }),
  ]);
  equal(new Set(concurrent.map((rows) => rows[0].room_join_code)).size, 2, "Concurrent hosts receive distinct codes");
  equal(sql("select last_value from room_code_validation.attempts"), "3", "Real concurrent collision caused one retry");
  sql(originalGenerator);

  // Same-identity requests must still converge on the single active room slot.
  const sameHost = await member("Same host");
  const sameRace = await Promise.all([
    rpc(sameHost.client, "create_room"), rpc(sameHost.client, "create_room"),
  ]);
  equal(sameRace[0][0].room_id, sameRace[1][0].room_id, "Same identity race converges");
  console.log("PASS: word and legacy codes, normalization, authorization, closed reservations, 8-attempt bound and forced concurrent collision.");
} finally {
  sql(originalGenerator);
  sql("drop schema if exists room_code_validation cascade");
}
