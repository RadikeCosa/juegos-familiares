import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260822100000_sync_room_lobby_realtime.sql"),
    "utf8"
);

describe("sync room lobby realtime migration", () => {
    it("publishes only the Room tables needed by lobby synchronization", () => {
        expect(migration).toContain("alter publication supabase_realtime add table public.room_participants");
        expect(migration).toContain("alter publication supabase_realtime add table public.rooms");
        expect(migration).not.toContain("alter table public.room_participants replica identity full");
        expect(migration).not.toContain("alter publication supabase_realtime add table public.player_active_room_slots");
    });

    it("uses participant-scoped RLS instead of broad table reads", () => {
        expect(migration).toContain("public.is_current_player_room_participant");
        expect(migration).toContain("players.auth_user_id = auth.uid()");
        expect(migration).toContain("using (public.is_current_player_room_participant(id))");
        expect(migration).toContain("using (public.is_current_player_room_participant(room_id))");
        expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
    });

    it("keeps writes closed and grants only select needed for Realtime RLS checks", () => {
        expect(migration).toContain("grant select on table public.rooms to authenticated");
        expect(migration).toContain("grant select on table public.room_participants to authenticated");
        expect(migration).not.toContain("grant insert on table public.room_participants");
        expect(migration).not.toContain("grant update on table public.rooms");
        expect(migration).not.toContain("grant delete on table public.room_participants");
    });

    it("returns room_id from authoritative lobby RPCs as technical subscription metadata", () => {
        expect(migration).toMatch(/create or replace function public\.create_room\(\)\nreturns table \(\n  room_id uuid,/);
        expect(migration).toMatch(/create or replace function public\.join_room_by_code\(room_code text\)\nreturns table \(\n  room_id uuid,/);
        expect(migration).toMatch(/create or replace function public\.get_my_active_room\(\)\nreturns table \(\n  room_id uuid,/);
    });
});
