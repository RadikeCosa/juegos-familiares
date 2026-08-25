import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825220000_get_my_game_state_scoreboard_11_4.sql"
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

describe("get_my_game_state scoreboard 11.4 migration", () => {
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

    it("adds scoreboard fields without exposing normalized secrets or future round data", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const returnBlock = getMyGameState.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(returnBlock).toContain("scoreboard_players jsonb");
        expect(returnBlock).toContain("round_impostor jsonb");
        expect(returnBlock).toContain("can_start_next_round boolean");
        expect(returnBlock).toContain("can_end_session boolean");
        expect(returnBlock).toContain("available_unused_words_count integer");
        expect(returnBlock).toContain("next_round_block_reason text");
        expect(returnBlock).not.toMatch(/normalized_secret_word|normalized_impostor_guess|future|next_word|next_impostor/i);
    });

    it("derives scores from the frozen SessionPlayers roster in scoreboard only", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("when game_sessions.state = 'scoreboard' then coalesce(scoreboard_players.players");
        expect(getMyGameState).toContain("'score', session_players.score");
        expect(getMyGameState).toContain("'is_self', session_players.player_id = current_player_id");
        expect(getMyGameState).toContain("where session_players.game_session_id = game_sessions.id");
        expect(getMyGameState).toContain("order by session_players.score desc, players.nickname, session_players.player_id");
    });

    it("derives next-round permissions and block reasons server-side", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("rooms.host_player_id");
        expect(getMyGameState).toContain("active_room_host_player_id = current_player_id");
        expect(getMyGameState).toContain("current_round.scored_at is not null");
        expect(getMyGameState).toContain("available_unused_words.word_count > 0");
        expect(getMyGameState).toContain("when active_room_host_player_id <> current_player_id then 'not_host'");
        expect(getMyGameState).toContain("then 'session_not_ready'");
        expect(getMyGameState).toContain("then 'no_words'");
    });

    it("counts unused words against normalized words already used in the same GameSession", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("from public.group_words");
        expect(getMyGameState).toContain("used_rounds.game_session_id = game_sessions.id");
        expect(getMyGameState).toContain("used_rounds.normalized_secret_word = group_words.normalized_text");
        expect(getMyGameState).toContain("count(*)::integer as word_count");
    });

    it("does not implement scoring, next-round selection, history, end session or realtime", () => {
        expect(sqlWithoutComments).not.toMatch(/score\s*=\s*score\s*\+|set impostor_count = impostor_count \+ 1/i);
        expect(sqlWithoutComments).not.toMatch(/create (or replace )?function public\.(start_next_round|end_session)/i);
        expect(sqlWithoutComments).not.toMatch(/insert into public\.rounds|order by random\(\)|round_history|session_history|statistics/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/broadcast|postgres_changes/i);
    });

    it("keeps function grants scoped to authenticated callers", () => {
        expect(migration).toContain("revoke all on function public.get_my_game_state() from public");
        expect(migration).toContain("grant execute on function public.get_my_game_state() to authenticated");
    });
});
