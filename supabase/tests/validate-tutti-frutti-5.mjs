import { execFileSync } from "node:child_process";

const container = "supabase_db_juegos-familia";

function psql(sql) {
  return execFileSync("docker", [
    "exec", container, "psql", "-U", "postgres", "-d", "postgres",
    "-At", "-v", "ON_ERROR_STOP=1", "-c", sql
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}

function assertIncludes(actual, expected, message) {
  if (!actual.includes(expected)) throw new Error(`${message}: missing ${expected}`);
}

const succession = psql("select pg_get_functiondef('public.reassign_room_host_if_stale()'::regprocedure)");
const mirror = psql("select pg_get_functiondef('public.ensure_impostor_shared_session(uuid,uuid)'::regprocedure)");

assertIncludes(succession, "room_session_participants", "playing succession uses neutral roster");
if (succession.includes("from public.session_players")) {
  throw new Error("playing succession still depends on session_players");
}
assertIncludes(succession, "multiple active neutral sessions", "defensive cardinality detail");
assertIncludes(succession, "active game session without neutral mirror", "missing mirror detail");
assertIncludes(mirror, "legacy mirror: shared session divergence", "shared divergence detail");
assertIncludes(mirror, "legacy mirror: roster divergence", "roster divergence detail");
assertIncludes(mirror, "legacy mirror: multiple active sessions", "legacy cardinality detail");

assertEqual(psql("select has_function_privilege('authenticated','public.reassign_room_host_if_stale()','EXECUTE')"), "t", "authenticated can execute succession");
assertEqual(psql("select has_function_privilege('authenticated','public.ensure_impostor_shared_session(uuid,uuid)','EXECUTE')"), "f", "mirror helper is private");
assertEqual(psql("select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('room_sessions','room_session_participants')"), "0", "shared tables stay out of Realtime");
// Legacy fixtures may predate the mirror; existing neutral rows must still
// point to the corresponding Impostor session and roster.
assertEqual(psql("select count(*) from public.room_sessions rs left join public.game_sessions gs on gs.id = rs.id and gs.group_id = rs.group_id where gs.id is null"), "0", "neutral sessions have game-session identity");
assertEqual(psql("select count(*) from public.room_session_participants rsp left join public.session_players sp on sp.game_session_id = rsp.session_id and sp.group_id = rsp.group_id and sp.player_id = rsp.player_id where sp.game_session_id is null"), "0", "neutral rosters have Impostor identity");
assertEqual(psql("select count(*) from pg_indexes where schemaname = 'public' and tablename = 'room_sessions' and indexdef like 'CREATE UNIQUE INDEX%room_id%finished_at%'"), "1", "active neutral session uniqueness exists");

console.log("Increment 5 neutral roster validation passed.");
