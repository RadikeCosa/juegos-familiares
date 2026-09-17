import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260914100000_room_game_type_increment_0.sql"),
    "utf8"
);

describe("Room game identity migration", () => {
    it("backfills all historical Rooms before enforcing a non-null restricted identity", () => {
        const backfill = migration.indexOf("update public.rooms\nset game_type = 'impostor'");
        const notNull = migration.indexOf("alter column game_type set not null");
        expect(backfill).toBeGreaterThan(0);
        expect(notNull).toBeGreaterThan(backfill);
        expect(migration).toContain("check (game_type in ('impostor', 'tutti_frutti'))");
        expect(migration).toContain("alter column game_type set default 'impostor'");
    });

    it("prevents changing the game of an existing Room", () => {
        expect(migration).toContain("new.game_type is distinct from old.game_type");
        expect(migration).toContain("before update of game_type on public.rooms");
    });

    it("preserves the authorized active-Room guards while returning game type", () => {
        expect(migration).toContain("create function public.get_my_active_room()");
        expect(migration).toContain("room_game_type text");
        expect(migration).toContain("rooms.game_type,");
        expect(migration).toContain("current_auth_user_id := auth.uid()");
        expect(migration).toContain("player_active_room_slots.player_id = current_player_id");
        expect(migration).toContain("room_participants.player_id = current_player_id");
        expect(migration).toContain("rooms.group_id = current_group_id");
        expect(migration).toContain("rooms.status in ('lobby', 'playing')");
        expect(migration).toContain("grant execute on function public.get_my_active_room() to authenticated");
        expect(migration).not.toMatch(/grant (insert|update) on table public\.rooms to authenticated/i);
    });

    it("does not change slots or Impostor gameplay", () => {
        expect(migration).not.toMatch(/player_active_room_slots\s+(add|drop)|alter table public\.player_active_room_slots/i);
        expect(migration).not.toMatch(/(create|replace) function public\.(create_room|join_room_by_code|start_session|end_session)\(/i);
        expect(migration).not.toMatch(/alter table public\.(game_sessions|session_players)/i);
    });
});
