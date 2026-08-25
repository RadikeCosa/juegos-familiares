import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825150000_get_my_game_state_second_voting_9_3.sql"
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

describe("get my game state second voting 9.3 migration", () => {
    it("keeps get_my_game_state as the zero-argument authoritative read model", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("create or replace function public.get_my_game_state()");
        expect(getMyGameState).toContain("returns table");
        expect(getMyGameState).toContain("candidates jsonb");
        expect(getMyGameState).toContain("my_vote_target_player_id uuid");
        expect(getMyGameState).toContain("vote_results jsonb");
        expect(getMyGameState).toContain("security definer");
        expect(getMyGameState).toContain("set search_path = ''");
        expect(migration).toContain("revoke all on function public.get_my_game_state() from public");
        expect(migration).toContain("grant execute on function public.get_my_game_state() to authenticated");
        expect(getMyGameState).not.toMatch(/public\.get_my_game_state\([^)]*(room_id|game_session_id|player_id|round_id)/i);
    });

    it("reconstructs tie candidates from first-round votes for tie_discussion and voting_second", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("when game_sessions.state = 'tie_discussion' then coalesce(tie_discussion_candidates.candidates");
        expect(getMyGameState).toContain("when game_sessions.state = 'voting_second' then coalesce(second_voting_candidates.candidates");
        expect(getMyGameState).toContain("round_votes.voting_round = 1");
        expect(getMyGameState).toContain("max_vote");
        expect(getMyGameState).toContain("tie_candidates");
        expect(getMyGameState).toContain("where tie_candidates.target_player_id <> current_player_id");
        expect(sqlWithoutComments).not.toMatch(/create table .*tie|alter table .*tie_candidates|add column .*tie_candidates|jsonb.*tie_candidates/i);
    });

    it("uses the caller vote status for the visible voting round without partial results", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("when game_sessions.state = 'voting_second' then 2");
        expect(getMyGameState).toContain("round_votes.voting_round = visible_vote_round.voting_round");
        expect(getMyGameState).toContain("and round_votes.voter_player_id = current_player_id");
        expect(getMyGameState).toContain("when game_sessions.state in ('impostor_guess', 'round_result')");
        expect(getMyGameState).toContain("else null::jsonb");
    });

    it("uses final vote results from round 2 when a second vote exists", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("and exists (");
        expect(getMyGameState).toContain("round_votes.voting_round = 2");
        expect(getMyGameState).toContain("resolution_vote_results");
        expect(getMyGameState).toContain("vote_counts.vote_count desc");
    });

    it("does not introduce out-of-scope gameplay features", () => {
        expect(sqlWithoutComments).not.toMatch(/scoreboard|finished|new_round|end_session|guess_word|reveal_word|rounds?\.status|broadcast|postgres_changes/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\.(round_votes|rounds|game_sessions)/i);
    });
});
