import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260823130000_host_succession_5_3.sql"),
    "utf8"
);

describe("host succession 5.3 migration", () => {
    it("defines a parameterless SECURITY DEFINER RPC with a minimal return contract", () => {
        expect(migration).toContain(
            "create or replace function public.reassign_room_host_if_stale()\nreturns table ("
        );
        expect(migration).toContain("host_changed boolean");
        expect(migration).toContain("current_host_player_id uuid");
        expect(migration).toContain("security definer");
        expect(migration).not.toMatch(/reassign_room_host_if_stale\([^)]*(room_id|host_player_id|player_id|timestamp)/i);
    });

    it("derives caller, Player and active Room from auth without client ownership ids", () => {
        expect(migration).toContain("current_auth_user_id := auth.uid()");
        expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
        expect(migration).toContain("from public.player_active_room_slots");
        expect(migration).toContain("player_active_room_slots.player_id = current_player_id");
        expect(migration).toContain("for update of rooms");
        expect(migration).not.toMatch(/room_id\s*=>|host_player_id\s*=>|candidate/i);
    });

    it("revalidates current host liveness through the 5.2 helper under participant locking", () => {
        expect(migration).toContain("rooms.host_player_id");
        expect(migration).toContain("into active_room_id, active_room_status, active_room_host_player_id");
        expect(migration).toContain("room_participants.player_id = active_room_host_player_id");
        expect(migration).toContain("for update;");
        expect(migration).toContain(
            "public.is_room_participant_liveness_active(host_last_seen_at, observed_at)"
        );
        expect(migration).not.toContain("interval '90 seconds'");
    });

    it("selects only active non-host candidates by joined_at and player_id", () => {
        expect(migration).toContain("room_participants.player_id <> active_room_host_player_id");
        expect(migration).toContain("public.is_room_participant_liveness_active(");
        expect(migration).toContain(
            "order by room_participants.joined_at asc, room_participants.player_id asc"
        );
        expect(migration).toContain("limit 1");
    });

    it("updates only host_player_id when a stale host has an eligible successor", () => {
        expect(migration).toContain("update public.rooms");
        expect(migration).toContain("set host_player_id = successor_player_id");
        expect(migration).toContain("rooms.status = 'lobby'");
        expect(migration).toContain("rooms.host_player_id = active_room_host_player_id");
        expect(migration).not.toMatch(/set status = 'closed'|delete from public\.room_participants/i);
    });

    it("keeps writes behind execute grant only", () => {
        expect(migration).toContain(
            "revoke all on function public.reassign_room_host_if_stale() from public"
        );
        expect(migration).toContain(
            "grant execute on function public.reassign_room_host_if_stale() to authenticated"
        );
        expect(migration).not.toContain("grant update on table public.rooms");
        expect(migration).not.toContain("grant update on table public.room_participants");
    });
});
