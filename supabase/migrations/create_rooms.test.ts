import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260819100000_create_rooms.sql"),
    "utf8"
);

describe("create rooms migration", () => {
    it("creates Room persistence with lobby/closed lifecycle only", () => {
        expect(migration).toContain("create table public.rooms");
        expect(migration).toContain("group_id uuid not null");
        expect(migration).toContain("join_code text not null");
        expect(migration).toContain("host_player_id uuid not null");
        expect(migration).toContain("status text not null default 'lobby'");
        expect(migration).toContain("check (status in ('lobby', 'closed'))");
        expect(migration).not.toContain("'playing'");
        expect(migration).not.toContain("'finished'");
    });

    it("keeps RoomParticipant as pure membership without connection fields", () => {
        expect(migration).toContain("create table public.room_participants");
        expect(migration).toContain("room_id uuid not null");
        expect(migration).toContain("player_id uuid not null");
        expect(migration).toContain("joined_at timestamptz not null default now()");
        expect(migration).not.toContain("connection_status");
        expect(migration).not.toContain("is_online");
        expect(migration).not.toContain("last_seen_at");
        expect(migration).not.toContain("presence_state");
        expect(migration).not.toContain("ready");
        expect(migration).not.toContain("score");
        expect(migration).not.toContain("game_session_id");
    });

    it("requires an opaque, non-sequential 8-character join code", () => {
        expect(migration).toContain("constraint rooms_join_code_format_check");
        expect(migration).toContain(
            "check (join_code = upper(btrim(join_code)) and join_code ~ '^[A-HJ-NP-Z2-9]{8}$')"
        );
        expect(migration).toContain("create unique index rooms_join_code_key");
        expect(migration).toContain("on public.rooms (join_code)");
    });

    it("ties Room and its host to the same Group with composite foreign keys", () => {
        expect(migration).toContain("constraint rooms_group_id_fkey");
        expect(migration).toContain("references public.groups (id)");
        expect(migration).toContain("constraint rooms_group_id_id_key");
        expect(migration).toContain("unique (group_id, id)");
        expect(migration).toContain("constraint rooms_host_player_same_group_fkey");
        expect(migration).toContain("foreign key (group_id, host_player_id)");
    });

    it("ties RoomParticipant to the same Group as its Room and Player", () => {
        expect(migration).toContain("constraint room_participants_pkey");
        expect(migration).toContain("primary key (room_id, player_id)");
        expect(migration).toContain("constraint room_participants_room_id_group_id_fkey");
        expect(migration).toContain("foreign key (group_id, room_id)");
        expect(migration).toContain("references public.rooms (group_id, id)");
        expect(migration).toContain("constraint room_participants_player_id_group_id_fkey");
        expect(migration).toContain("foreign key (group_id, player_id)");
        expect(migration).toContain("references public.players (group_id, id)");
    });

    it("guarantees atomically that the host is also a RoomParticipant", () => {
        expect(migration).toContain("constraint rooms_host_participant_fkey");
        expect(migration).toContain("foreign key (id, host_player_id)");
        expect(migration).toContain("references public.room_participants (room_id, player_id)");
        expect(migration).toContain("deferrable initially deferred");
    });

    it("enforces one active Room per Player for the host-only scope of 4.1", () => {
        expect(migration).toContain("create unique index rooms_active_host_player_key");
        expect(migration).toContain("on public.rooms (host_player_id)");
        expect(migration).toContain("where status = 'lobby'");
    });

    it("uses an authoritative RPC without accepting ownership identifiers", () => {
        expect(migration).toContain("create or replace function public.create_room()");
        expect(migration).toContain("current_auth_user_id := auth.uid()");
        expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
        expect(migration).toContain("set search_path = ''");
        expect(migration).not.toMatch(/create_room\([^)]*group_id/i);
        expect(migration).not.toMatch(/create_room\([^)]*player_id/i);
        expect(migration).not.toMatch(/create_room\([^)]*host_player_id/i);
        expect(migration).not.toMatch(/create_room\([^)]*auth_user_id/i);
    });

    it("recovers the existing active Room instead of racing a duplicate insert", () => {
        expect(migration).toContain("where rooms.host_player_id = current_player_id");
        expect(migration).toContain("and rooms.status = 'lobby'");
        expect(migration).toContain("when unique_violation then");
    });

    it("keeps table access closed and exposes only the create RPC", () => {
        expect(migration).toContain(
            "revoke all on table public.rooms from anon, authenticated"
        );
        expect(migration).toContain(
            "revoke all on table public.room_participants from anon, authenticated"
        );
        expect(migration).toContain(
            "grant execute on function public.create_room() to authenticated"
        );
        expect(migration).not.toContain("create policy");
        expect(migration).not.toContain("grant select on table public.rooms");
        expect(migration).not.toContain("grant select on table public.room_participants");
        expect(migration).not.toContain("grant insert on table public.rooms");
        expect(migration).not.toContain("grant insert on table public.room_participants");
    });

    it("keeps create_room's returned columns in sync with the TypeScript wrapper", () => {
        const returnsTableMatch = migration.match(
            /create or replace function public\.create_room\(\)\nreturns table \(([\s\S]*?)\)\nlanguage/
        );

        expect(returnsTableMatch).not.toBeNull();

        const columnNames = (returnsTableMatch as RegExpMatchArray)[1]
            .split(",")
            .map((line) => line.trim().split(/\s+/)[0])
            .filter(Boolean);

        // Mirrors CreateRoomRow in lib/supabase/impostor-rooms.ts; if either
        // side renames a column without the other, this test must fail.
        expect(columnNames).toEqual([
            "room_join_code",
            "room_status",
            "participant_nickname",
            "participant_is_host",
            "participant_joined_at"
        ]);
    });
});
