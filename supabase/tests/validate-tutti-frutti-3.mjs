import { execFileSync } from "node:child_process";

const localDbContainer = "supabase_db_juegos-familia";

function psql(sql) {
  return execFileSync("docker", [
    "exec", localDbContainer, "psql", "-U", "postgres", "-d", "postgres",
    "-At", "-v", "ON_ERROR_STOP=1", "-c", sql
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}

assertEqual(psql("select to_regclass('public.room_sessions') is not null"), "t", "room_sessions exists");
assertEqual(psql("select to_regclass('public.room_session_participants') is not null"), "t", "room_session_participants exists");
assertEqual(psql("select relrowsecurity from pg_class where oid = 'public.room_sessions'::regclass"), "t", "room_sessions RLS enabled");
assertEqual(psql("select relrowsecurity from pg_class where oid = 'public.room_session_participants'::regclass"), "t", "room_session_participants RLS enabled");
assertEqual(psql("select has_table_privilege('authenticated', 'public.room_sessions', 'SELECT')"), "f", "room_sessions direct SELECT closed");
assertEqual(psql("select has_table_privilege('authenticated', 'public.room_session_participants', 'SELECT')"), "f", "roster direct SELECT closed");
assertEqual(psql("select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('room_sessions', 'room_session_participants')"), "0", "new tables not published to Realtime");
assertEqual(psql("select count(*) from public.game_sessions where not exists (select 1 from public.room_sessions where room_sessions.id = game_sessions.id)"), "0", "all Impostor sessions mapped");
assertEqual(psql("select count(*) from public.session_players where not exists (select 1 from public.room_session_participants where room_session_participants.session_id = session_players.game_session_id and room_session_participants.player_id = session_players.player_id)"), "0", "all Impostor roster rows mapped");
assertEqual(psql("select count(*) from pg_indexes where schemaname = 'public' and indexname = 'room_sessions_one_unfinished_per_room_key'"), "1", "active session uniqueness exists");
assertEqual(psql("select count(*) from public.room_sessions where game_type = 'impostor' and (impostor_game_session_id is null or impostor_game_session_id <> id)"), "0", "Impostor linkage is stable");

console.log("Increment 3 local schema/backfill validation passed.");
if (psql("select count(*) from public.game_sessions") === "0") {
  console.warn("No local Impostor fixtures loaded; backfill cardinality checks are vacuous.");
}
