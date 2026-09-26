import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260924130000_tutti_frutti_start_increment_7.sql"),
  "utf8"
);

function functionBlock(name: string) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[0];
}

describe("Increment 7 Tutti Frutti session start", () => {
  it("keeps server defaults in one helper used by lobby read and session start", () => {
    const defaults = functionBlock("tutti_frutti_default_room_configuration");
    const read = functionBlock("get_tutti_frutti_room_setup");
    const start = functionBlock("start_tutti_frutti_session");
    expect(defaults).toContain("'roundCount', 5");
    expect(defaults).toContain("'key', 'name'");
    expect(defaults).toContain("'key', 'object'");
    expect(read).toContain("tutti_frutti_default_room_configuration()");
    expect(start).toContain("get_tutti_frutti_room_setup(target_room_id)");
    expect(start).not.toContain("'roundCount', 5");
  });

  it("creates game-specific snapshots without reusing Impostor state tables", () => {
    expect(migration).toContain("create table public.tutti_frutti_sessions");
    expect(migration).toContain("started_by_player_id uuid not null");
    expect(migration).toContain("create table public.tutti_frutti_session_categories");
    expect(migration).toContain("create table public.tutti_frutti_rounds");
    expect(migration).toContain("'LETTER_PENDING'");
    expect(migration).toContain("create table public.tutti_frutti_letter_candidates");
    expect(migration).toContain("array[");
    expect(migration).toContain("'N','O','P','R','S','T','U','V'");
    expect(migration).not.toMatch(/(insert|update|delete)\s+public\.(game_sessions|session_players)/i);
  });

  it("locks and validates the Room before roster count and snapshots", () => {
    const start = functionBlock("start_tutti_frutti_session");
    const lock = start.indexOf("for update");
    const membership = start.indexOf("room_participants.player_id = current_player_id");
    const participantCount = start.indexOf("select count(*) into participant_count");
    const snapshot = start.indexOf("insert into public.room_session_participants");
    const transition = start.indexOf("update public.rooms set status = 'playing'");
    expect(lock).toBeGreaterThan(-1);
    expect(membership).toBeGreaterThan(lock);
    expect(participantCount).toBeGreaterThan(lock);
    expect(snapshot).toBeGreaterThan(participantCount);
    expect(transition).toBeGreaterThan(snapshot);
    expect(start).toContain("participant_count < 2");
    expect(start).toContain("errcode = 'P0037'");
  });

  it("returns an existing start only to its frozen initiating host", () => {
    const start = functionBlock("start_tutti_frutti_session");
    expect(start).toContain("if target_status = 'playing' then");
    expect(start).toContain("stored_starter_id <> current_player_id");
    expect(start).toContain("is_current_player_tutti_frutti_session_participant(active_session_id)");
    expect(start).toContain("return public.get_tutti_frutti_game_state(target_room_id)");
    expect(start).toContain("errcode = 'P0034'");
  });

  it("authorizes reads from the frozen roster and gives that table its own RLS policy", () => {
    const helper = functionBlock("is_current_player_tutti_frutti_session_participant");
    const read = functionBlock("get_tutti_frutti_game_state");
    expect(migration).toContain("alter table public.room_session_participants enable row level security");
    expect(migration).toContain("Tutti session participants can read frozen roster");
    expect(helper).toContain("room_session_participants.session_id = target_session_id");
    expect(helper).not.toContain("public.room_participants");
    expect(read).toContain("is_current_player_tutti_frutti_session_participant(current_session_id)");
    expect(read).not.toContain("is_current_player_tutti_frutti_room_member");
  });

  it("uses closed-by-default game tables and authenticated RPC access", () => {
    for (const table of [
      "tutti_frutti_sessions",
      "tutti_frutti_session_categories",
      "tutti_frutti_rounds",
      "tutti_frutti_letter_candidates"
    ]) {
      expect(migration).toContain("alter table public." + table + " enable row level security");
      expect(migration).toContain("revoke all on table public." + table + " from public, anon, authenticated");
    }
    expect(migration).toContain("grant execute on function public.start_tutti_frutti_session(uuid) to authenticated");
    expect(migration).toContain("grant execute on function public.get_tutti_frutti_game_state(uuid) to authenticated");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*tutti_frutti_(sessions|rounds|letter_candidates)[^;]*authenticated/i);
  });
});
