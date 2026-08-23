import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260820110000_prevent_room_participants_in_closed_rooms.sql"),
    "utf8"
);

describe("prevent room participants in closed rooms migration", () => {
    it("keeps the active-slot trigger as the structural guard for RoomParticipant inserts", () => {
        expect(migration).toContain(
            "create or replace function public.room_participants_claim_active_slot()"
        );
        expect(migration).toContain("select rooms.status");
        expect(migration).toContain("where rooms.id = new.room_id");
        expect(migration).toContain("and rooms.group_id = new.group_id");
    });

    it("rejects RoomParticipant inserts unless the Room is still lobby", () => {
        expect(migration).toContain("if target_room_status <> 'lobby' then");
        expect(migration).toContain("No se puede agregar participantes a una sala cerrada.");
        expect(migration).toContain("using errcode = 'P0014'");
    });

    it("preserves the active slot claim after the lobby guard", () => {
        expect(migration).toContain(
            "insert into public.player_active_room_slots (player_id, room_id, group_id)"
        );
        expect(migration).toContain("values (new.player_id, new.room_id, new.group_id)");
    });
});
