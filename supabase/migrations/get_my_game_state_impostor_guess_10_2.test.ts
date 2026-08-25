import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825170000_get_my_game_state_impostor_guess_10_2.sql"
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

describe("get_my_game_state impostor guess 10.2 migration", () => {
    it("keeps get_my_game_state as the zero-argument authoritative read model", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const signature = getMyGameState.match(
            /create or replace function public\.get_my_game_state\([^)]*\)/i
        )?.[0] ?? "";

        expect(migration).toContain("drop function public.get_my_game_state()");
        expect(signature).toBe("create or replace function public.get_my_game_state()");
        expect(getMyGameState).toContain("security definer");
        expect(getMyGameState).toContain("set search_path = ''");
        expect(migration).toContain("revoke all on function public.get_my_game_state() from public");
        expect(migration).toContain("grant execute on function public.get_my_game_state() to authenticated");
        expect(getMyGameState).not.toMatch(/public\.get_my_game_state\([^)]*(room_id|game_session_id|player_id|round_id|group_id)/i);
    });

    it("extends the return shape for impostor_guess and round_result", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const returnBlock = getMyGameState.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(returnBlock).toContain("can_submit_impostor_guess boolean");
        expect(returnBlock).toContain("winner text");
        expect(returnBlock).toContain("impostor_guess_text text");
        expect(returnBlock).toContain("impostor_guess_correct boolean");
    });

    it("does not reveal the secret word during impostor_guess", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("when game_sessions.state = 'round_result' then current_round.secret_word");
        expect(getMyGameState).toContain("when current_round.impostor_player_id = current_player_id then null::text");
        expect(getMyGameState).toContain("game_sessions.state = 'impostor_guess'");
        expect(getMyGameState).toContain("can_submit_impostor_guess");
        expect(getMyGameState).toContain("current_round.normalized_impostor_guess is null");
    });

    it("exposes result details only after round_result", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("when game_sessions.state = 'round_result' then current_round.round_winner");
        expect(getMyGameState).toContain("when game_sessions.state = 'round_result' then current_round.impostor_guess_text");
        expect(getMyGameState).toContain("when game_sessions.state = 'round_result' then current_round.impostor_guess_correct");
        expect(getMyGameState).toContain("else null::text");
        expect(getMyGameState).toContain("else null::boolean");
    });

    it("keeps vote aggregation behavior for existing voting states", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("when game_sessions.state = 'voting_first' then coalesce(first_voting_candidates.candidates");
        expect(getMyGameState).toContain("when game_sessions.state = 'tie_discussion' then coalesce(tie_discussion_candidates.candidates");
        expect(getMyGameState).toContain("when game_sessions.state = 'voting_second' then coalesce(second_voting_candidates.candidates");
        expect(getMyGameState).toContain("when game_sessions.state in ('impostor_guess', 'round_result') then coalesce(resolution_vote_results.vote_results");
        expect(getMyGameState).toContain("visible_vote_round.voting_round");
    });

    it("does not expose normalized secrets or add out-of-scope features", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const returnBlock = getMyGameState.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(returnBlock).not.toMatch(/normalized_secret_word|normalized_impostor_guess|impostor_player_id|round_id|game_session_id/i);
        expect(sqlWithoutComments).not.toMatch(/scoreboard|new_round|end_session|round_history|broadcast|postgres_changes/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\.(rounds|round_votes)/i);
    });
});
