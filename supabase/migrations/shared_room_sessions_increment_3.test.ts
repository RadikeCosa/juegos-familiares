import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260922100000_shared_room_sessions_increment_3.sql"),
  "utf8"
);

describe("shared Room sessions Increment 3 migration", () => {
  it("creates neutral session identity with explicit Impostor linkage", () => {
    expect(migration).toContain("create table public.room_sessions");
    expect(migration).toContain("impostor_game_session_id uuid");
    expect(migration).toContain("references public.game_sessions (id, group_id)");
    expect(migration).toContain("room_sessions_impostor_link_check");
    expect(migration).toContain("impostor_game_session_id = id");
    expect(migration).toContain("unique (id, group_id)");
  });

  it("enforces one unfinished session per Room and preserves temporal validity", () => {
    expect(migration).toContain("room_sessions_finished_at_check");
    expect(migration).toContain("finished_at >= started_at");
    expect(migration).toContain("room_sessions_one_unfinished_per_room_key");
    expect(migration).toContain("where finished_at is null");
  });

  it("creates a neutral frozen roster without speculative metadata", () => {
    expect(migration).toContain("create table public.room_session_participants");
    expect(migration).toContain("primary key (session_id, player_id)");
    expect(migration).toContain("references public.players (group_id, id)");
    expect(migration).toContain("No temporal or ordinal metadata");
  });

  it("keeps the backfill atomic and treats exact retries as no-ops", () => {
    expect(migration).toContain("sesiones Impostor abiertas en Rooms cerradas");
    expect(migration).toContain("sesiones finalizadas en Rooms playing");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).toContain("on conflict (session_id, player_id) do nothing");
    expect(migration).toContain("fila divergente");
    expect(migration).toContain("dejo una sesion Impostor sin mapear");
    expect(migration).not.toMatch(/on conflict[\s\S]{0,160}do update/i);
  });

  it("closes direct access and does not publish new tables to Realtime", () => {
    expect(migration).toContain("alter table public.room_sessions enable row level security");
    expect(migration).toContain("alter table public.room_session_participants enable row level security");
    expect(migration).toContain("revoke all on table public.room_sessions from anon, authenticated, public");
    expect(migration).toContain("revoke all on table public.room_session_participants from anon, authenticated, public");
    expect(migration).not.toContain("alter publication supabase_realtime");
  });

  it("does not modify Impostor writers", () => {
    expect(migration).not.toMatch(/create or replace function public\.(start_session|end_session)/i);
    expect(migration).not.toMatch(/update public\.(game_sessions|session_players)/i);
  });
});
