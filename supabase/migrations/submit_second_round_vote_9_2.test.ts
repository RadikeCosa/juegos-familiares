import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825140000_submit_second_round_vote_9_2.sql"
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

describe("submit second round vote 9.2 migration", () => {
    it("keeps submit_round_vote public contract unchanged", () => {
        const submitRoundVote = functionBlock("submit_round_vote");
        const signature = submitRoundVote.match(
            /create or replace function public\.submit_round_vote\([^)]*\)/i
        )?.[0] ?? "";

        expect(submitRoundVote).toContain("create or replace function public.submit_round_vote(target_player_id uuid)");
        expect(submitRoundVote).toContain("returns table");
        expect(submitRoundVote).toContain("accepted boolean");
        expect(submitRoundVote).toContain("already_recorded boolean");
        expect(submitRoundVote).toContain("state text");
        expect(submitRoundVote).toContain("round_number integer");
        expect(submitRoundVote).toContain("security definer");
        expect(submitRoundVote).toContain("set search_path = ''");
        expect(migration).toContain("revoke all on function public.submit_round_vote(uuid) from public");
        expect(migration).toContain("grant execute on function public.submit_round_vote(uuid) to authenticated");
        expect(signature).toBe("create or replace function public.submit_round_vote(target_player_id uuid)");
    });

    it("derives voting_round from GameSession state", () => {
        const submitRoundVote = functionBlock("submit_round_vote");

        expect(submitRoundVote).toContain("current_game_session_state = 'voting_first'");
        expect(submitRoundVote).toContain("current_voting_round := 1");
        expect(submitRoundVote).toContain("current_game_session_state = 'voting_second'");
        expect(submitRoundVote).toContain("current_voting_round := 2");
        expect(submitRoundVote).toContain("current_game_session_state in ('impostor_guess', 'round_result')");
    });

    it("reconstructs tie candidates from first-round votes without persisting them", () => {
        const submitRoundVote = functionBlock("submit_round_vote");

        expect(submitRoundVote).toContain("current_voting_round = 2");
        expect(submitRoundVote).toContain("round_votes.voting_round = 1");
        expect(submitRoundVote).toContain("group by round_votes.target_player_id");
        expect(submitRoundVote).toContain("max_vote");
        expect(submitRoundVote).toContain("tie_candidates");
        expect(submitRoundVote).toContain("tie_candidate_count");
        expect(sqlWithoutComments).not.toMatch(/create table .*tie|alter table .*tie_candidates|add column .*tie_candidates|jsonb.*tie_candidates/i);
    });

    it("resolves second voting definitively without third voting", () => {
        const submitRoundVote = functionBlock("submit_round_vote");

        expect(submitRoundVote).toContain("current_voting_round = 1");
        expect(submitRoundVote).toContain("next_game_session_state := 'tie_discussion'");
        expect(submitRoundVote).toContain("current_voting_round = 2");
        expect(submitRoundVote).toContain("next_game_session_state := 'impostor_guess'");
        expect(submitRoundVote).toContain("next_game_session_state := 'round_result'");
        expect(submitRoundVote).toContain("top_candidate_count = 1");
        expect(submitRoundVote).toContain("top_target_player_id = current_impostor_player_id");
    });

    it("does not introduce out-of-scope features", () => {
        expect(sqlWithoutComments).not.toMatch(/scoreboard|finished|new_round|end_session|guess_word|reveal_word|rounds?\.status|broadcast|postgres_changes/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\.round_votes/i);
    });
});
