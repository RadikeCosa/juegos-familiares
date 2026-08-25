import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825200000_apply_round_scoring_11_2.sql"
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

describe("apply round scoring 11.2 migration", () => {
    it("adds a persistent round-level scoring marker without creating scoreboard history", () => {
        expect(migration).toContain("alter table public.rounds");
        expect(migration).toContain("add column scored_at timestamptz");
        expect(migration).toContain("constraint rounds_scored_requires_winner_check");
        expect(migration).toContain("check (scored_at is null or round_winner is not null)");
        expect(sqlWithoutComments).not.toMatch(/create table public\.(scoreboard|scores|score_events|round_history|session_history)/i);
    });

    it("creates a zero-argument authoritative RPC for closing round_result into scoreboard", () => {
        const advanceScoreboard = functionBlock("advance_round_result_to_scoreboard");
        const signature = advanceScoreboard.match(
            /create or replace function public\.advance_round_result_to_scoreboard\([^)]*\)/i
        )?.[0] ?? "";

        expect(signature).toBe("create or replace function public.advance_round_result_to_scoreboard()");
        expect(advanceScoreboard).toContain("security definer");
        expect(advanceScoreboard).toContain("set search_path = ''");
        expect(advanceScoreboard).not.toMatch(/public\.advance_round_result_to_scoreboard\([^)]*(room_id|game_session_id|round_id|player_id|group_id|winner|score)/i);
        expect(advanceScoreboard).toContain("current_auth_user_id := auth.uid()");
    });

    it("only allows active SessionPlayers in round_result or scoreboard to trigger scoring", () => {
        const advanceScoreboard = functionBlock("advance_round_result_to_scoreboard");

        expect(advanceScoreboard).toContain("from public.player_active_room_slots");
        expect(advanceScoreboard).toContain("active_room_status <> 'playing'");
        expect(advanceScoreboard).toContain("from public.session_players");
        expect(advanceScoreboard).toContain("session_players.player_id = current_player_id");
        expect(advanceScoreboard).toContain("current_game_session_state not in ('round_result', 'scoreboard')");
        expect(advanceScoreboard).toContain("current_round_winner not in ('impostor', 'group')");
    });

    it("scores the final round winner according to the documented contract", () => {
        const advanceScoreboard = functionBlock("advance_round_result_to_scoreboard");

        expect(advanceScoreboard).toContain("if current_round_winner = 'impostor' then");
        expect(advanceScoreboard).toContain("set score = score + 2");
        expect(advanceScoreboard).toContain("session_players.player_id = current_impostor_player_id");
        expect(advanceScoreboard).toContain("set score = score + 1");
        expect(advanceScoreboard).toContain("session_players.player_id <> current_impostor_player_id");
    });

    it("uses scored_at and row locks to make repeated calls non-destructive", () => {
        const advanceScoreboard = functionBlock("advance_round_result_to_scoreboard");

        expect(advanceScoreboard).toContain("for update of rooms");
        expect(advanceScoreboard).toContain("for update");
        expect(advanceScoreboard).toContain("if current_scored_at is not null then");
        expect(advanceScoreboard).toContain("already_scored := true");
        expect(advanceScoreboard).toContain("and rounds.scored_at is null");
        expect(advanceScoreboard).toContain("set scored_at = scoring_timestamp");
    });

    it("advances the session to scoreboard without implementing later increments", () => {
        const advanceScoreboard = functionBlock("advance_round_result_to_scoreboard");

        expect(advanceScoreboard).toContain("set state = 'scoreboard'");
        expect(advanceScoreboard).toContain("state := 'scoreboard'");
        expect(migration).toContain("revoke all on function public.advance_round_result_to_scoreboard() from public");
        expect(migration).toContain("grant execute on function public.advance_round_result_to_scoreboard() to authenticated");
        expect(sqlWithoutComments).not.toMatch(/create (or replace )?function public\.(start_new_round|new_round|end_session)/i);
        expect(sqlWithoutComments).not.toMatch(/insert into public\.rounds|target_score|final_winner|leaderboard|statistics/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/broadcast|postgres_changes/i);
    });
});
