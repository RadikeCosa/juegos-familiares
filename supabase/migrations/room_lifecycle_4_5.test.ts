import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260823100000_room_lifecycle_4_5.sql"),
    "utf8"
);

describe("room lifecycle 4.5 migration", () => {
    it("adds participant_is_self to authoritative lobby RPCs without exposing player ids", () => {
        expect(migration).toMatch(/create or replace function public\.create_room\(\)\nreturns table \(\n  room_id uuid,/);
        expect(migration).toMatch(/create or replace function public\.join_room_by_code\(room_code text\)\nreturns table \(\n  room_id uuid,/);
        expect(migration).toMatch(/create or replace function public\.get_my_active_room\(\)\nreturns table \(\n  room_id uuid,/);
        expect(migration).toContain("participant_is_self boolean");
        expect(migration).toContain("(room_participants.player_id = current_player_id)");
        expect(migration).not.toMatch(/participant_player_id uuid/i);
        expect(migration).not.toMatch(/participant_auth_user_id uuid/i);
    });

    it("locks the target Room while joining so close vs join cannot leave a slot in a closed Room", () => {
        expect(migration).toContain("where rooms.join_code = normalized_code\n  for update");
        expect(migration).toContain("if target_room_status <> 'lobby' then");
        expect(migration).toContain("using errcode = 'P0011'");
    });

    it("defines leave_room without product identifiers", () => {
        expect(migration).toContain("create or replace function public.leave_room()\nreturns void");
        expect(migration).toContain("current_auth_user_id := auth.uid()");
        expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
        expect(migration).not.toMatch(/leave_room\([^)]*room_id/i);
        expect(migration).not.toMatch(/leave_room\([^)]*player_id/i);
        expect(migration).not.toMatch(/leave_room\([^)]*group_id/i);
    });

    it("makes non-host leave delete only the membership and rely on cascade for the active slot", () => {
        expect(migration).toContain("delete from public.room_participants");
        expect(migration).toContain("room_participants.player_id = current_player_id");
        expect(migration).not.toContain("delete from public.player_active_room_slots");
    });

    it("makes host leave close the Room instead of deleting host membership or electing a successor", () => {
        expect(migration).toContain("if active_room_host_player_id = current_player_id then");
        expect(migration).toContain("set status = 'closed'");
        expect(migration).not.toMatch(/successor|election|next_player/i);
    });

    it("defines close_room as a host-only parameterless RPC", () => {
        expect(migration).toContain("create or replace function public.close_room()\nreturns void");
        expect(migration).toContain("raise exception 'No tenes una sala activa para cerrar.'");
        expect(migration).toContain("using errcode = 'P0015'");
        expect(migration).toContain("raise exception 'Solo el host puede cerrar la sala.'");
        expect(migration).toContain("using errcode = 'P0016'");
        expect(migration).not.toMatch(/close_room\([^)]*room_id/i);
        expect(migration).not.toMatch(/close_room\([^)]*player_id/i);
        expect(migration).not.toMatch(/close_room\([^)]*group_id/i);
    });

    it("keeps lifecycle writes behind SECURITY DEFINER RPCs only", () => {
        expect(migration).toContain("revoke all on function public.leave_room() from public");
        expect(migration).toContain("grant execute on function public.leave_room() to authenticated");
        expect(migration).toContain("revoke all on function public.close_room() from public");
        expect(migration).toContain("grant execute on function public.close_room() to authenticated");
        expect(migration).not.toContain("grant delete on table public.room_participants");
        expect(migration).not.toContain("grant update on table public.rooms");
    });

    it("keeps closed Room lifecycle updates observable only to actual participants", () => {
        expect(migration).toContain("public.is_current_player_room_lifecycle_observer");
        expect(migration).toContain("drop policy \"Room participants can read their lobby room\" on public.rooms");
        expect(migration).toContain("create policy \"Room participants can read their lifecycle room\"");
        expect(migration).toContain("using (public.is_current_player_room_lifecycle_observer(id))");
    });
});
