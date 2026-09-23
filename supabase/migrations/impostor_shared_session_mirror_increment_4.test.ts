import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260923100000_impostor_shared_session_mirror_increment_4.sql"),
  "utf8"
);

function functionBlock(name: string) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[0];
}

describe("Increment 4 Impostor shared session mirror", () => {
  it("keeps the public RPC signatures and delegates the existing state machine", () => {
    expect(migration).toContain("alter function public.start_session() rename to start_session_legacy_increment_4");
    expect(migration).toContain("alter function public.end_session() rename to end_session_legacy_increment_4");
    expect(functionBlock("start_session")).toContain("from public.start_session_legacy_increment_4()");
    expect(functionBlock("end_session")).toContain("from public.end_session_legacy_increment_4()");
    expect(migration).toContain("started boolean");
    expect(migration).toContain("already_ended boolean");
  });

  it("requires a consistent shared session and neutral roster on start", () => {
    const start = functionBlock("start_session");
    expect(start).toContain("room_sessions.game_type = 'impostor'");
    expect(start).toContain("room_sessions.impostor_game_session_id = current_game_session_id");
    expect(start).toContain("game_roster_count <> shared_roster_count");
    expect(start).toContain("room_session_participants");
    expect(start).toContain("P0022");
  });

  it("mirrors the authoritative finish timestamp and validates retries", () => {
    const end = functionBlock("end_session");
    expect(end).toContain("set finished_at = current_game_session_finished_at");
    expect(end).toContain("get diagnostics updated_shared_count = row_count");
    expect(end).toContain("shared_finished_at is distinct from current_game_session_finished_at");
    expect(end).toContain("for update");
    expect(end).toContain("P0022");
  });

  it("keeps access limited and does not add gameplay or Realtime objects", () => {
    expect(migration).toContain("grant execute on function public.start_session() to authenticated");
    expect(migration).toContain("grant execute on function public.end_session() to authenticated");
    expect(migration).not.toMatch(/alter publication supabase_realtime|create policy|broadcast/i);
    expect(migration).not.toMatch(/secret_word|round_votes|scoreboard|tutti_frutti/i);
  });
});
