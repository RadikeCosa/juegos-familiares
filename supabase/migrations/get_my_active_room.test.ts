import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260821100000_get_my_active_room.sql"),
    "utf8"
);

describe("get_my_active_room migration", () => {
    it("defines an authoritative no-argument RPC for the current Player's active Room", () => {
        expect(migration).toContain("create or replace function public.get_my_active_room()");
        expect(migration).toContain("current_auth_user_id := auth.uid()");
        expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
        expect(migration).not.toMatch(/get_my_active_room\([^)]*room_id/i);
        expect(migration).not.toMatch(/get_my_active_room\([^)]*room_code/i);
        expect(migration).not.toMatch(/get_my_active_room\([^)]*player_id/i);
        expect(migration).not.toMatch(/get_my_active_room\([^)]*group_id/i);
        expect(migration).not.toMatch(/get_my_active_room\([^)]*host_player_id/i);
        expect(migration).not.toMatch(/get_my_active_room\([^)]*auth_user_id/i);
    });

    it("uses the active Room slot as the lookup root instead of exposing a get_room_by_code read surface", () => {
        expect(migration).toContain("from public.player_active_room_slots");
        expect(migration).toContain("where player_active_room_slots.player_id = current_player_id");
        expect(migration).not.toContain("get_room_by_code");
        expect(migration).not.toContain("where rooms.join_code");
    });

    it("returns only product lobby fields in the same shape as create and join", () => {
        const returnsTableMatch = migration.match(
            /create or replace function public\.get_my_active_room\(\)\nreturns table \(([\s\S]*?)\)\nlanguage/
        );

        expect(returnsTableMatch).not.toBeNull();

        const columnNames = (returnsTableMatch as RegExpMatchArray)[1]
            .split(",")
            .map((line) => line.trim().split(/\s+/)[0])
            .filter(Boolean);

        expect(columnNames).toEqual([
            "room_join_code",
            "room_status",
            "participant_nickname",
            "participant_is_host",
            "participant_joined_at"
        ]);
    });

    it("treats a missing active Room as a normal empty result and inconsistent remote state as an error", () => {
        expect(migration).toContain("if active_room_id is null then\n    return;");
        expect(migration).toContain("using errcode = 'P0014'");
        expect(migration).toContain("active_room_status is null or active_room_status <> 'lobby'");
    });

    it("keeps direct table access closed and exposes only execute to authenticated users", () => {
        expect(migration).toContain("security definer");
        expect(migration).toContain("set search_path = ''");
        expect(migration).toContain("revoke all on function public.get_my_active_room() from public");
        expect(migration).toContain("grant execute on function public.get_my_active_room() to authenticated");
        expect(migration).not.toContain("create policy");
        expect(migration).not.toContain("grant select on table public.rooms");
        expect(migration).not.toContain("grant select on table public.room_participants");
        expect(migration).not.toContain("grant select on table public.player_active_room_slots");
    });
});
