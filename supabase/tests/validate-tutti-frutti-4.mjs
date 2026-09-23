import { execFileSync } from "node:child_process";

const localDbContainer = "supabase_db_juegos-familia";

function psql(sql) {
  return execFileSync("docker", [
    "exec", localDbContainer, "psql", "-U", "postgres", "-d", "postgres",
    "-At", "-v", "ON_ERROR_STOP=1", "-c", sql
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}

assertEqual(psql("select has_function_privilege('authenticated', 'public.start_session()', 'EXECUTE')"), "t", "authenticated can execute start_session");
assertEqual(psql("select has_function_privilege('authenticated', 'public.end_session()', 'EXECUTE')"), "t", "authenticated can execute end_session");
assertEqual(psql("select has_function_privilege('public', 'public.start_session_legacy_increment_4()', 'EXECUTE')"), "f", "legacy start is private");
assertEqual(psql("select has_function_privilege('public', 'public.end_session_legacy_increment_4()', 'EXECUTE')"), "f", "legacy end is private");
assertEqual(psql("select has_function_privilege('authenticated', 'public.start_session_legacy_increment_4()', 'EXECUTE')"), "f", "legacy start is not callable by clients");
assertEqual(psql("select has_function_privilege('authenticated', 'public.end_session_legacy_increment_4()', 'EXECUTE')"), "f", "legacy end is not callable by clients");
// Legacy fixtures may still have no mirror until they pass through the
// Increment 4 start/end wrappers. Every mirror that does exist must be valid.
assertEqual(psql("select count(*) from public.room_sessions rs left join public.game_sessions gs on gs.id = rs.id and gs.group_id = rs.group_id where gs.id is null"), "0", "no shared session is orphaned");
assertEqual(psql("select count(*) from public.room_session_participants rsp left join public.session_players sp on sp.game_session_id = rsp.session_id and sp.group_id = rsp.group_id and sp.player_id = rsp.player_id where sp.game_session_id is null"), "0", "no neutral roster row is orphaned");
assertEqual(psql("select count(*) from public.room_sessions rs join public.game_sessions gs on gs.id = rs.id and gs.group_id = rs.group_id where rs.finished_at is distinct from gs.finished_at"), "0", "session finish timestamps match");
assertEqual(psql("select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('room_sessions', 'room_session_participants')"), "0", "shared session tables stay out of Realtime");

console.log("Increment 4 shared session mirror validation passed.");
