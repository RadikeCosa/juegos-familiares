import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260823120000_room_liveness_5_2.sql"),
    "utf8"
);

describe("room liveness 5.2 migration", () => {
    it("adds last_seen_at to RoomParticipant with new rows initialized by Postgres", () => {
        expect(migration).toContain("alter table public.room_participants");
        expect(migration).toContain("add column last_seen_at timestamptz");
        expect(migration).toContain("alter column last_seen_at set default now()");
    });

    it("backfills only active lobby memberships without using joined_at as liveness", () => {
        expect(migration).toContain("update public.room_participants");
        expect(migration).toContain("rooms.status = 'lobby'");
        expect(migration).toContain("set last_seen_at = now()");
        expect(migration).not.toMatch(/set last_seen_at = joined_at/i);
    });

    it("defines an internal active/stale helper with a 90 second threshold", () => {
        expect(migration).toContain(
            "create or replace function public.is_room_participant_liveness_active"
        );
        expect(migration).toContain("participant_last_seen_at is not null");
        expect(migration).toContain(
            "observed_at - participant_last_seen_at <= interval '90 seconds'"
        );
        expect(migration).toContain(
            "revoke all on function public.is_room_participant_liveness_active"
        );
        expect(migration).not.toContain(
            "grant execute on function public.is_room_participant_liveness_active"
        );
    });

    it("defines refresh_my_room_liveness as parameterless SECURITY DEFINER RPC", () => {
        expect(migration).toContain(
            "create or replace function public.refresh_my_room_liveness()\nreturns void"
        );
        expect(migration).toContain("security definer");
        expect(migration).toContain("current_auth_user_id := auth.uid()");
        expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
        expect(migration).not.toMatch(/refresh_my_room_liveness\([^)]*(player_id|room_id|timestamp)/i);
    });

    it("derives active Room and updates only the authenticated participant", () => {
        expect(migration).toContain("from public.player_active_room_slots");
        expect(migration).toContain("rooms.status");
        expect(migration).toContain("if active_room_id is null or active_room_status <> 'lobby' then");
        expect(migration).toContain("update public.room_participants");
        expect(migration).toContain("room_participants.room_id = active_room_id");
        expect(migration).toContain("room_participants.player_id = current_player_id");
        expect(migration).toContain("room_participants.group_id = current_group_id");
    });

    it("uses server-side timestamps and throttles short-window writes", () => {
        expect(migration).toContain("set last_seen_at = now()");
        expect(migration).toContain("room_participants.last_seen_at is null");
        expect(migration).toContain(
            "room_participants.last_seen_at <= now() - interval '10 seconds'"
        );
        expect(migration).not.toMatch(/client_timestamp|last_seen_at\s*=\s*[^;\n]*timestamp/i);
    });

    it("keeps RoomParticipant direct writes closed and does not modify host_player_id", () => {
        expect(migration).toContain(
            "grant execute on function public.refresh_my_room_liveness() to authenticated"
        );
        expect(migration).not.toContain("grant update on table public.room_participants");
        expect(migration).not.toMatch(/update public\.rooms[\s\S]*host_player_id/i);
        expect(migration).not.toMatch(/reassign|successor|nuevo host/i);
    });
});
