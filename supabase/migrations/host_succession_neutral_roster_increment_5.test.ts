import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260924100000_host_succession_neutral_roster_increment_5.sql"),
  "utf8"
);

function functionBlock(name: string) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[0];
}

describe("Increment 5 neutral roster host succession", () => {
  it("keeps the public host succession contract and server-derived authority", () => {
    const succession = functionBlock("reassign_room_host_if_stale");
    expect(succession).toContain("returns table (\n  host_changed boolean");
    expect(succession).toContain("security definer");
    expect(succession).toContain("current_auth_user_id := auth.uid()");
    expect(succession).toContain("for update of rooms");
    expect(succession).toContain("public.is_room_participant_liveness_active");
  });

  it("uses the neutral roster only during playing with explicit consistency errors", () => {
    const succession = functionBlock("reassign_room_host_if_stale");
    expect(succession).toContain("finished_at is null");
    expect(succession).toContain("from public.room_session_participants");
    expect(succession).toContain("multiple active neutral sessions");
    expect(succession).toContain("active game session without neutral mirror");
    expect(succession).toContain("order by room_participants.joined_at asc, room_participants.player_id asc");
    expect(succession).not.toContain("from public.session_players");
  });

  it("keeps the mutation limited to host authority", () => {
    const succession = functionBlock("reassign_room_host_if_stale");
    expect(succession).toContain("set host_player_id = successor_player_id");
    expect(succession).not.toMatch(/set status =|delete from public\\.(rooms|room_participants|room_sessions)/i);
  });

  it("defines strict legacy mirror behavior with distinct P0022 details", () => {
    const mirror = functionBlock("ensure_impostor_shared_session");
    expect(mirror).toContain("legacy mirror: shared session divergence");
    expect(mirror).toContain("legacy mirror: roster divergence");
    expect(mirror).toContain("legacy mirror: multiple active sessions");
    expect(mirror).toContain("insert into public.room_sessions");
    expect(mirror).toContain("insert into public.room_session_participants");
  });

  it("preserves RPC grants and keeps the mirror helper private", () => {
    expect(migration).toContain("revoke all on function public.ensure_impostor_shared_session(uuid, uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reassign_room_host_if_stale() to authenticated");
    expect(migration).toContain("grant execute on function public.start_session() to authenticated");
    expect(migration).toContain("grant execute on function public.end_session() to authenticated");
    expect(migration).not.toMatch(/alter publication supabase_realtime|create policy|secret_word|round_votes|scoreboard/i);
  });
});
