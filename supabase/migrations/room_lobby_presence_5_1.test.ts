import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260823110000_room_lobby_presence_5_1.sql"),
    "utf8"
);

describe("room lobby presence 5.1 migration", () => {
    it("returns participant_player_id as technical metadata for Presence correlation", () => {
        for (const fn of ["create_room", "join_room_by_code", "get_my_active_room"]) {
            const returnsTableMatch = migration.match(
                new RegExp(`create or replace function public\\.${fn}\\([^)]*\\)\\nreturns table \\(([\\s\\S]*?)\\)\\nlanguage`)
            );

            expect(returnsTableMatch).not.toBeNull();
            expect((returnsTableMatch as RegExpMatchArray)[1]).toContain(
                "participant_player_id uuid"
            );
        }

        expect(migration).toContain("room_participants.player_id,");
    });

    it("authorizes private Presence channels only for RoomParticipants of the active lobby Room", () => {
        expect(migration).toContain(
            "create or replace function public.is_current_player_room_presence_participant(target_topic text)"
        );
        expect(migration).toContain("target_topic !~ '^impostor-room-presence:");
        expect(migration).toContain("players.auth_user_id = auth.uid()");
        expect(migration).toContain("room_participants.room_id = target_room_id");
        expect(migration).toContain("rooms.status = 'lobby'");
    });

    it("creates Presence-only realtime.messages policies for listen and track", () => {
        expect(migration).toContain("on realtime.messages");
        expect(migration).toContain("for select");
        expect(migration).toContain("for insert");
        expect(migration).toContain("realtime.messages.extension = 'presence'");
        expect(migration).toContain("public.is_current_player_room_presence_participant(realtime.topic())");
        expect(migration).not.toContain("extension = 'broadcast'");
        expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
        expect(migration).not.toMatch(/with check\s*\(\s*true\s*\)/i);
    });

    it("does not introduce liveness, heartbeat or host succession in 5.1", () => {
        expect(migration).not.toMatch(/last_seen_at|lastSeenAt/i);
        expect(migration).not.toMatch(/heartbeat/i);
        expect(migration).not.toMatch(/reassign|sucesion|sucesión/i);
        expect(migration).not.toMatch(/update public\.rooms[\s\S]*host_player_id/i);
    });
});
