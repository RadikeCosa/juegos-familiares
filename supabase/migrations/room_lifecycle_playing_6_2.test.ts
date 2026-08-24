import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260824110000_room_lifecycle_playing_6_2.sql"
    ),
    "utf8"
);
const sqlWithoutComments = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

function functionBlock(functionName: string) {
    const match = migration.match(
        new RegExp(
            `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`
        )
    );

    expect(match).not.toBeNull();

    return (match as RegExpMatchArray)[0];
}

describe("room lifecycle playing 6.2 migration", () => {
    it("extends Room status to exactly lobby, playing and closed", () => {
        expect(migration).toContain("drop constraint rooms_status_check");
        expect(migration).toContain(
            "check (status in ('lobby', 'playing', 'closed'))"
        );
        expect(migration).not.toMatch(/finished|role_reveal|preparing/i);
    });

    it("keeps active host uniqueness scoped to active Rooms", () => {
        expect(migration).toContain("drop index public.rooms_active_host_player_key");
        expect(migration).toContain("create unique index rooms_active_host_player_key");
        expect(migration).toContain("where status in ('lobby', 'playing')");
    });

    it("preserves slots when moving lobby to playing", () => {
        const releaseSlots = functionBlock("rooms_release_active_slots");

        expect(releaseSlots).toContain("old.status in ('lobby', 'playing')");
        expect(releaseSlots).toContain("new.status not in ('lobby', 'playing')");
        expect(releaseSlots).not.toContain("old.status = 'lobby' and new.status <> 'lobby'");
    });

    it("keeps create and reconstruction on active Room semantics", () => {
        expect(functionBlock("create_room")).toContain(
            "rooms.status in ('lobby', 'playing')"
        );
        expect(functionBlock("get_my_active_room")).toContain(
            "active_room_status not in ('lobby', 'playing')"
        );
        expect(functionBlock("get_my_active_room")).toContain(
            "rooms.status in ('lobby', 'playing')"
        );
    });

    it("extends membership, Presence, liveness and succession to active Rooms", () => {
        expect(functionBlock("is_current_player_room_participant")).toContain(
            "rooms.status in ('lobby', 'playing')"
        );
        expect(functionBlock("is_current_player_room_presence_participant")).toContain(
            "rooms.status in ('lobby', 'playing')"
        );
        expect(functionBlock("refresh_my_room_liveness")).toContain(
            "active_room_status not in ('lobby', 'playing')"
        );
        expect(functionBlock("reassign_room_host_if_stale")).toContain(
            "active_room_status not in ('lobby', 'playing')"
        );
        expect(functionBlock("reassign_room_host_if_stale")).toContain(
            "rooms.status in ('lobby', 'playing')"
        );
    });

    it("does not introduce gameplay operations or secrets", () => {
        expect(sqlWithoutComments).not.toMatch(/start_session/i);
        expect(sqlWithoutComments).not.toMatch(/create table public\.round/i);
        expect(sqlWithoutComments).not.toMatch(/game_sessions.*state|alter table public\.game_sessions/i);
        expect(sqlWithoutComments).not.toMatch(/secret_?word|impostor_?player|role_reveal|private game state/i);
        expect(sqlWithoutComments).not.toContain("alter publication supabase_realtime add table public.game_sessions");
        expect(sqlWithoutComments).not.toContain("alter publication supabase_realtime add table public.session_players");
    });
});
