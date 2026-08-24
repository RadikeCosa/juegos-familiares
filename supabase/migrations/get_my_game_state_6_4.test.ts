import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260824130000_get_my_game_state_6_4.sql"
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

describe("get my game state 6.4 migration", () => {
    it("creates a zero-argument security definer RPC", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("create or replace function public.get_my_game_state()");
        expect(getMyGameState).toContain("returns table");
        expect(getMyGameState).toContain("state text");
        expect(getMyGameState).toContain("round_number integer");
        expect(getMyGameState).toContain("role text");
        expect(getMyGameState).toContain("word text");
        expect(getMyGameState).toContain("security definer");
        expect(getMyGameState).toContain("set search_path = ''");
        expect(migration).toContain("revoke all on function public.get_my_game_state() from public");
        expect(migration).toContain("grant execute on function public.get_my_game_state() to authenticated");
    });

    it("derives authority from auth, active Room, GameSession and SessionPlayer", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("current_auth_user_id := auth.uid()");
        expect(getMyGameState).toContain("from public.players");
        expect(getMyGameState).toContain("from public.player_active_room_slots");
        expect(getMyGameState).toContain("join public.rooms");
        expect(getMyGameState).toContain("from public.game_sessions");
        expect(getMyGameState).toContain("from public.session_players");
        expect(getMyGameState).not.toMatch(/public\.get_my_game_state\([^)]*(room_id|game_session_id|player_id|round_id)/i);
    });

    it("returns only caller private view without leaking secret internals", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const returnBlock = getMyGameState.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(getMyGameState).toContain("order by rounds.number desc");
        expect(getMyGameState).toContain("limit 1");
        expect(getMyGameState).toContain("then 'impostor'");
        expect(getMyGameState).toContain("then null::text");
        expect(getMyGameState).toContain("else current_round.secret_word");
        expect(returnBlock).not.toMatch(/normalized_secret_word|impostor_player_id|game_session_id|round_id|host_player_id/i);
    });

    it("keeps private gameplay tables closed and out of Realtime", () => {
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\\.(game_sessions|session_players|rounds)/i);
        expect(sqlWithoutComments).not.toMatch(/create policy/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\\.(game_sessions|session_players|rounds)/i);
    });

    it("does not introduce out-of-scope gameplay features", () => {
        expect(sqlWithoutComments).not.toMatch(/role_acknowledged|advance_to_playing|round_player_assignment|vote|score|winner|end_session|broadcast/i);
    });
});
