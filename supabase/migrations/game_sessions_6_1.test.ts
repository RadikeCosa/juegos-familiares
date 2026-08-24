import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260824100000_game_sessions_6_1.sql"
    ),
    "utf8"
);

function tableBlock(tableName: string) {
    const match = migration.match(
        new RegExp(`create table public\\.${tableName} \\([\\s\\S]*?\\n\\);`)
    );

    expect(match).not.toBeNull();

    return (match as RegExpMatchArray)[0];
}

describe("game sessions 6.1 migration", () => {
    it("creates minimal GameSession persistence without future gameplay fields", () => {
        const gameSessions = tableBlock("game_sessions");

        expect(gameSessions).toContain("id uuid primary key default extensions.gen_random_uuid()");
        expect(gameSessions).toContain("room_id uuid not null");
        expect(gameSessions).toContain("group_id uuid not null");
        expect(gameSessions).toContain("started_at timestamptz not null default now()");
        expect(gameSessions).not.toMatch(/host_player_id|state|status|finished_at|winner|round_count|final_scores|created_by/i);
    });

    it("enforces one GameSession per Room and composite group integrity", () => {
        const gameSessions = tableBlock("game_sessions");

        expect(gameSessions).toContain("constraint game_sessions_room_id_key");
        expect(gameSessions).toContain("unique (room_id)");
        expect(gameSessions).toContain("constraint game_sessions_id_group_id_key");
        expect(gameSessions).toContain("unique (id, group_id)");
        expect(gameSessions).toContain("constraint game_sessions_room_group_fkey");
        expect(gameSessions).toContain("foreign key (group_id, room_id)");
        expect(gameSessions).toContain("references public.rooms (group_id, id)");
        expect(gameSessions).not.toMatch(/on delete cascade/i);
    });

    it("creates SessionPlayer with a composite primary key and no own UUID", () => {
        const sessionPlayers = tableBlock("session_players");

        expect(sessionPlayers).toContain("game_session_id uuid not null");
        expect(sessionPlayers).toContain("group_id uuid not null");
        expect(sessionPlayers).toContain("player_id uuid not null");
        expect(sessionPlayers).toContain("constraint session_players_pkey");
        expect(sessionPlayers).toContain("primary key (game_session_id, player_id)");
        expect(sessionPlayers).not.toMatch(/\nid uuid/i);
    });

    it("ties SessionPlayer to GameSession and Player without RoomParticipant coupling", () => {
        const sessionPlayers = tableBlock("session_players");

        expect(sessionPlayers).toContain("constraint session_players_game_session_group_fkey");
        expect(sessionPlayers).toContain("foreign key (game_session_id, group_id)");
        expect(sessionPlayers).toContain("references public.game_sessions (id, group_id)");
        expect(sessionPlayers).toContain("on delete cascade");
        expect(sessionPlayers).toContain("constraint session_players_player_group_fkey");
        expect(sessionPlayers).toContain("foreign key (group_id, player_id)");
        expect(sessionPlayers).toContain("references public.players (group_id, id)");
        expect(sessionPlayers).not.toContain("references public.room_participants");
    });

    it("does not add future SessionPlayer fields", () => {
        const sessionPlayers = tableBlock("session_players");

        expect(sessionPlayers).not.toMatch(/score|impostor_count|role_acknowledged|vote_submitted|joined_at/i);
    });

    it("enables RLS and keeps direct client access closed", () => {
        expect(migration).toContain("alter table public.game_sessions enable row level security");
        expect(migration).toContain("alter table public.session_players enable row level security");
        expect(migration).toContain("revoke all on table public.game_sessions from anon, authenticated");
        expect(migration).toContain("revoke all on table public.session_players from anon, authenticated");
        expect(migration).not.toContain("create policy");
        expect(migration).not.toMatch(/grant (select|insert|update|delete|all) on table public\.(game_sessions|session_players)/i);
    });

    it("does not modify Room lifecycle or gameplay infrastructure", () => {
        expect(migration).not.toContain("alter table public.rooms");
        expect(migration).not.toContain("'playing'");
        expect(migration).not.toMatch(/create (or replace )?function/i);
        expect(migration).not.toContain("alter publication supabase_realtime");
        expect(migration).not.toContain("create table public.round");
    });
});
