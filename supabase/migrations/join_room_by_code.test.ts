import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260820100000_join_room_by_code.sql"),
    "utf8"
);

describe("join_room_by_code migration", () => {
    it("denormalizes a single active Room slot per Player, covering host and participants alike", () => {
        expect(migration).toContain("create table public.player_active_room_slots");
        expect(migration).toContain("player_id uuid primary key");
        expect(migration).toContain("room_id uuid not null");
        expect(migration).toContain("group_id uuid not null");
        expect(migration).toContain(
            "constraint player_active_room_slots_room_group_fkey"
        );
        expect(migration).toContain(
            "constraint player_active_room_slots_player_group_fkey"
        );
        expect(migration).toContain(
            "constraint player_active_room_slots_participant_fkey"
        );
        expect(migration).toContain(
            "references public.room_participants (room_id, player_id)"
        );
    });

    it("claims the slot atomically via an AFTER INSERT trigger on room_participants", () => {
        expect(migration).toContain(
            "create or replace function public.room_participants_claim_active_slot()"
        );
        expect(migration).toContain(
            "insert into public.player_active_room_slots (player_id, room_id, group_id)"
        );
        expect(migration).toContain(
            "after insert on public.room_participants"
        );
        expect(migration).toContain(
            "revoke all on function public.room_participants_claim_active_slot() from public"
        );
    });

    it("releases the slot when a Room stops being lobby", () => {
        expect(migration).toContain(
            "create or replace function public.rooms_release_active_slots()"
        );
        expect(migration).toContain("old.status = 'lobby' and new.status <> 'lobby'");
        expect(migration).toContain("after update of status on public.rooms");
        expect(migration).toContain(
            "revoke all on function public.rooms_release_active_slots() from public"
        );
    });

    it("does not allow reopening a closed Room without restoring its slots", () => {
        expect(migration).toContain(
            "create or replace function public.rooms_prevent_reopening()"
        );
        expect(migration).toContain(
            "old.status = 'closed' and new.status = 'lobby'"
        );
        expect(migration).toContain(
            "using errcode = 'P0013'"
        );
    });

    it("keeps the slot table closed and only reachable through SECURITY DEFINER RPCs", () => {
        expect(migration).toContain(
            "revoke all on table public.player_active_room_slots from anon, authenticated"
        );
        expect(migration).not.toContain("create policy");
        expect(migration).not.toContain(
            "grant select on table public.player_active_room_slots"
        );
    });

    it("updates create_room() to recognize an active Room from participation, not just from host", () => {
        expect(migration).toContain("create or replace function public.create_room()");
        expect(migration).toContain(
            "from public.player_active_room_slots\n  where player_active_room_slots.player_id = current_player_id"
        );
    });

    it("derives Player and Group from auth.uid(), accepting only room_code as product input", () => {
        expect(migration).toContain(
            "create or replace function public.join_room_by_code(room_code text)"
        );
        expect(migration).toContain("current_auth_user_id := auth.uid()");
        expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
        expect(migration).not.toMatch(/join_room_by_code\([^)]*player_id/i);
        expect(migration).not.toMatch(/join_room_by_code\([^)]*group_id/i);
        expect(migration).not.toMatch(/join_room_by_code\([^)]*host_player_id/i);
        expect(migration).not.toMatch(/join_room_by_code\([^)]*auth_user_id/i);
    });

    it("normalizes the code and rejects another Group's Room with the same product error as a nonexistent code", () => {
        expect(migration).toContain(
            "normalized_code := upper(btrim(coalesce(room_code, '')));"
        );
        expect(migration).toContain(
            "if target_room_id is null or target_room_group_id <> current_group_id then"
        );
    });

    it("rejects joining a Room that is not lobby", () => {
        expect(migration).toContain("if target_room_status <> 'lobby' then");
    });

    it("is idempotent for a Player already in the target Room", () => {
        expect(migration).toContain(
            "select 1\n    from public.room_participants\n    where room_participants.room_id = target_room_id\n      and room_participants.player_id = current_player_id"
        );
    });

    it("rejects joining a second active Room instead of silently moving the Player", () => {
        expect(migration).toContain("Ya estas en otra sala.");
        expect(migration).toContain("using errcode = 'P0012'");
    });

    it("keeps table access closed and exposes only the RPC", () => {
        expect(migration).toContain(
            "revoke all on function public.join_room_by_code(text) from public"
        );
        expect(migration).toContain(
            "grant execute on function public.join_room_by_code(text) to authenticated"
        );
    });
});
