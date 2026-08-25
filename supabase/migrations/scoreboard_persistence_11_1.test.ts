import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825190000_scoreboard_persistence_11_1.sql"
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

describe("scoreboard persistence 11.1 migration", () => {
    it("adds operational SessionPlayer score with a safe default", () => {
        expect(migration).toContain("alter table public.session_players");
        expect(migration).toContain("add column score integer not null default 0");
        expect(migration).toContain("constraint session_players_score_check");
        expect(migration).toContain("check (score >= 0)");
        expect(sqlWithoutComments).not.toMatch(/create table public\.(scoreboard|scores|score_events)/i);
    });

    it("extends GameSession state with scoreboard and keeps existing gameplay phases", () => {
        expect(migration).toContain("drop constraint game_sessions_state_check");
        expect(migration).toContain("constraint game_sessions_state_check");
        expect(migration).toContain("'role_reveal'");
        expect(migration).toContain("'discussion'");
        expect(migration).toContain("'voting_first'");
        expect(migration).toContain("'tie_discussion'");
        expect(migration).toContain("'voting_second'");
        expect(migration).toContain("'impostor_guess'");
        expect(migration).toContain("'round_result'");
        expect(migration).toContain("'scoreboard'");
        expect(sqlWithoutComments).not.toMatch(/'finished'|'preparing_round'/i);
    });

    it("keeps get_my_game_state zero-argument and compatible with scoreboard", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const signature = getMyGameState.match(
            /create or replace function public\.get_my_game_state\([^)]*\)/i
        )?.[0] ?? "";
        const returnBlock = getMyGameState.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(signature).toBe("create or replace function public.get_my_game_state()");
        expect(getMyGameState).toContain("security definer");
        expect(getMyGameState).toContain("set search_path = ''");
        expect(returnBlock).not.toMatch(/scoreboard|score|normalized_secret_word|normalized_impostor_guess/i);
        expect(getMyGameState).not.toMatch(/public\.get_my_game_state\([^)]*(room_id|game_session_id|player_id|round_id|group_id)/i);
    });

    it("reveals result details in both round_result and scoreboard without exposing normalized secrets", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("when game_sessions.state in ('round_result', 'scoreboard') then current_round.secret_word");
        expect(getMyGameState).toContain("when game_sessions.state in ('round_result', 'scoreboard') then current_round.round_winner");
        expect(getMyGameState).toContain("when game_sessions.state in ('round_result', 'scoreboard') then current_round.impostor_guess_text");
        expect(getMyGameState).toContain("when game_sessions.state in ('round_result', 'scoreboard') then current_round.impostor_guess_correct");
        expect(getMyGameState).toContain("when game_sessions.state in ('impostor_guess', 'round_result', 'scoreboard') then coalesce(resolution_vote_results.vote_results");
        expect(getMyGameState).not.toMatch(/normalized_secret_word/);
    });

    it("does not implement scoring, new round, end session, history or realtime", () => {
        expect(sqlWithoutComments).not.toMatch(/score\s*=\s*score\s*\+|update public\.session_players[\s\S]*score/i);
        expect(sqlWithoutComments).not.toMatch(/create (or replace )?function public\.(start_new_round|new_round|end_session)/i);
        expect(sqlWithoutComments).not.toMatch(/round_history|session_history|statistics|leaderboard/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/broadcast|postgres_changes/i);
    });
});
