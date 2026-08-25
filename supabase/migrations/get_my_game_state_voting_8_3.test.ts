import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825120000_get_my_game_state_voting_8_3.sql"
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

describe("get my game state voting 8.3 migration", () => {
    it("extends the existing zero-argument get_my_game_state read model", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("create or replace function public.get_my_game_state()");
        expect(getMyGameState).toContain("candidates jsonb");
        expect(getMyGameState).toContain("my_vote_target_player_id uuid");
        expect(getMyGameState).toContain("has_voted boolean");
        expect(getMyGameState).toContain("vote_results jsonb");
        expect(getMyGameState).toContain("security definer");
        expect(getMyGameState).toContain("set search_path = ''");
        expect(migration).toContain("grant execute on function public.get_my_game_state() to authenticated");
    });

    it("derives voting candidates from SessionPlayers and excludes the caller", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("from public.session_players");
        expect(getMyGameState).toContain("session_players.player_id <> current_player_id");
        expect(getMyGameState).toContain("'player_id', session_players.player_id");
        expect(getMyGameState).toContain("'nickname', players.nickname");
        expect(getMyGameState).not.toMatch(/presence|room_participants/i);
    });

    it("returns only the caller vote during voting_first and no partial results", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const votingBranch = getMyGameState.slice(
            getMyGameState.indexOf("when game_sessions.state = 'voting_first'"),
            getMyGameState.indexOf("when game_sessions.state in ('tie_discussion'")
        );

        expect(votingBranch).toContain("my_vote.target_player_id");
        expect(votingBranch).toContain("my_vote.target_player_id is not null");
        expect(votingBranch).not.toMatch(/vote_count|submitted_vote_count|required_vote_count/i);
    });

    it("returns aggregate post-resolution results without individual voter mappings", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("'vote_count', vote_counts.vote_count");
        expect(getMyGameState).toContain("group by round_votes.target_player_id");
        expect(getMyGameState).not.toContain("'voter_player_id'");
        expect(getMyGameState).not.toContain("'target_player_id', round_votes.target_player_id");
    });

    it("keeps private internals and out-of-scope features closed", () => {
        const returnBlock = functionBlock("get_my_game_state").match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(returnBlock).not.toMatch(/normalized_secret_word|impostor_player_id|game_session_id|round_id/i);
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/create policy/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/broadcast|postgres_changes|voting_second|start_second|guess_word|reveal_word|score|scoreboard|new_round/i);
    });
});
