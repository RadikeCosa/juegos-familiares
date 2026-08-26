import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260826010000_get_my_game_state_finished_12_3.sql"
    ),
    "utf8"
);
const sqlWithoutComments = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
const finishedBranch = sqlWithoutComments.split("if active_room_status <> 'playing' then")[0] ?? "";

function functionBlock(functionName: string) {
    const match = migration.match(
        new RegExp(
            `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`
        )
    );

    expect(match).not.toBeNull();

    return (match as RegExpMatchArray)[0];
}

describe("get_my_game_state finished 12.3 migration", () => {
    it("keeps get_my_game_state zero-argument and authoritative", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const signature = getMyGameState.match(
            /create or replace function public\.get_my_game_state\([^)]*\)/i
        )?.[0] ?? "";

        expect(migration).toContain("drop function public.get_my_game_state()");
        expect(signature).toBe("create or replace function public.get_my_game_state()");
        expect(getMyGameState).toContain("security definer");
        expect(getMyGameState).toContain("set search_path = ''");
        expect(getMyGameState).toContain("current_auth_user_id := auth.uid()");
        expect(getMyGameState).not.toMatch(/public\.get_my_game_state\([^)]*(room_id|game_session_id|round_id|player_id|group_id|score|word|impostor)/i);
    });

    it("extends the return shape with final shared snapshot fields", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const returnBlock = getMyGameState.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(returnBlock).toContain("finished_at timestamptz");
        expect(returnBlock).toContain("round_count integer");
        expect(returnBlock).toContain("final_scores jsonb");
        expect(returnBlock).toContain("winner_player_ids uuid[]");
        expect(returnBlock).toContain("winners jsonb");
        expect(returnBlock).toContain("rounds_summary jsonb");
    });

    it("reconstructs finished state from history when no active Room slot remains", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("if active_room_id is null then");
        expect(getMyGameState).toContain("from public.game_session_history");
        expect(getMyGameState).toContain("from public.round_history");
        expect(getMyGameState).toContain("game_sessions.state = 'finished'");
        expect(getMyGameState).toContain("rooms.status = 'closed'");
        expect(getMyGameState).toContain("'finished'::text");
        expect(getMyGameState).toContain("game_session_history.finished_at");
        expect(getMyGameState).toContain("game_session_history.final_scores");
        expect(getMyGameState).toContain("game_session_history.winner_player_ids");
        expect(getMyGameState).toContain("game_session_history.winners");
    });

    it("limits finished reads to historical SessionPlayers in the caller group", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("join public.session_players");
        expect(getMyGameState).toContain("session_players.game_session_id = game_session_history.game_session_id");
        expect(getMyGameState).toContain("session_players.player_id = current_player_id");
        expect(getMyGameState).toContain("where game_session_history.group_id = current_group_id");
        expect(getMyGameState).toContain("order by game_session_history.finished_at desc, game_session_history.id desc");
    });

    it("returns shared finished fields without private role, word, votes or next actions", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("null::text,\n      null::text");
        expect(getMyGameState).toContain("false,\n      false");
        expect(getMyGameState).toContain("null::uuid");
        expect(finishedBranch).not.toMatch(/voter_player_id|\btarget_player_id\b|secret_word|normalized_secret_word/i);
        expect(sqlWithoutComments).not.toMatch(/insert into public\.rounds|order by random\(\)|score\s*=\s*score\s*\+|broadcast|postgres_changes|leaderboard|statistics|ranking/i);
    });

    it("keeps function grants scoped to authenticated callers", () => {
        expect(migration).toContain("revoke all on function public.get_my_game_state() from public");
        expect(migration).toContain("grant execute on function public.get_my_game_state() to authenticated");
    });
});
