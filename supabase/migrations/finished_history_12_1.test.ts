import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825230000_finished_history_12_1.sql"
    ),
    "utf8"
);
const sqlWithoutComments = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

function tableBlock(tableName: string) {
    const match = migration.match(
        new RegExp(`create table public\\.${tableName} \\([\\s\\S]*?\\n\\);`)
    );

    expect(match).not.toBeNull();

    return (match as RegExpMatchArray)[0];
}

describe("finished history 12.1 migration", () => {
    it("extends GameSession with finished state and server-side close timestamp storage", () => {
        expect(migration).toContain("add column finished_at timestamptz");
        expect(migration).toContain("drop constraint game_sessions_state_check");
        expect(migration).toContain("constraint game_sessions_state_check");
        expect(migration).toContain("'scoreboard'");
        expect(migration).toContain("'finished'");
        expect(migration).toContain("constraint game_sessions_finished_at_requires_finished_check");
        expect(migration).toContain("check (finished_at is null or state = 'finished')");
    });

    it("creates one immutable session-history snapshot per GameSession", () => {
        const sessionHistory = tableBlock("game_session_history");

        expect(sessionHistory).toContain("game_session_id uuid not null");
        expect(sessionHistory).toContain("room_id uuid not null");
        expect(sessionHistory).toContain("group_id uuid not null");
        expect(sessionHistory).toContain("started_at timestamptz not null");
        expect(sessionHistory).toContain("finished_at timestamptz not null");
        expect(sessionHistory).toContain("closed_by_player_id uuid not null");
        expect(sessionHistory).toContain("round_count integer not null");
        expect(sessionHistory).toContain("roster jsonb not null");
        expect(sessionHistory).toContain("final_scores jsonb not null");
        expect(sessionHistory).toContain("winner_player_ids uuid[] not null");
        expect(sessionHistory).toContain("winners jsonb not null");
        expect(sessionHistory).toContain("constraint game_session_history_game_session_id_key");
        expect(sessionHistory).toContain("unique (game_session_id)");
    });

    it("keeps session history tied to current operational records while storing a standalone snapshot", () => {
        const sessionHistory = tableBlock("game_session_history");

        expect(sessionHistory).toContain("references public.game_sessions (id, group_id)");
        expect(sessionHistory).toContain("references public.rooms (group_id, id)");
        expect(sessionHistory).toContain("constraint game_session_history_closed_by_session_player_fkey");
        expect(sessionHistory).toContain("references public.session_players (game_session_id, player_id)");
        expect(sessionHistory).toContain("check (round_count >= 1)");
        expect(sessionHistory).toContain("check (jsonb_typeof(roster) = 'array')");
        expect(sessionHistory).toContain("check (jsonb_typeof(final_scores) = 'array')");
        expect(sessionHistory).toContain("check (coalesce(array_length(winner_player_ids, 1), 0) >= 1)");
        expect(sessionHistory).toContain("jsonb_typeof(winners) = 'array'");
        expect(sessionHistory).toContain("jsonb_array_length(winners) >= 1");
    });

    it("creates one round-history snapshot per operational Round and per session number", () => {
        const roundHistory = tableBlock("round_history");

        expect(roundHistory).toContain("game_session_history_id uuid not null");
        expect(roundHistory).toContain("game_session_id uuid not null");
        expect(roundHistory).toContain("round_id uuid not null");
        expect(roundHistory).toContain("number integer not null");
        expect(roundHistory).toContain("impostor_player_id uuid not null");
        expect(roundHistory).toContain("round_winner text not null");
        expect(roundHistory).toContain("discovered_by_vote boolean not null");
        expect(roundHistory).toContain("impostor_guess_text text");
        expect(roundHistory).toContain("impostor_guess_correct boolean");
        expect(roundHistory).toContain("scored_at timestamptz not null");
        expect(roundHistory).toContain("scoring_summary jsonb not null");
        expect(roundHistory).toContain("constraint round_history_round_id_key");
        expect(roundHistory).toContain("unique (round_id)");
        expect(roundHistory).toContain("constraint round_history_game_session_number_key");
        expect(roundHistory).toContain("unique (game_session_id, number)");
    });

    it("defines the minimal round result contract without preserving individual votes", () => {
        const roundHistory = tableBlock("round_history");

        expect(roundHistory).toContain("check (round_winner in ('impostor', 'group'))");
        expect(roundHistory).toContain("constraint round_history_guess_consistency_check");
        expect(roundHistory).toContain("constraint round_history_scoring_summary_object_check");
        expect(roundHistory).toContain("jsonb_typeof(scoring_summary) = 'object'");
        expect(roundHistory).toContain("scoring_summary ? 'rule'");
        expect(roundHistory).toContain("scoring_summary ? 'awarded'");
        expect(roundHistory).toContain("references public.game_session_history (id, game_session_id)");
        expect(roundHistory).toContain("references public.rounds (id, game_session_id, group_id)");
        expect(roundHistory).toContain("references public.session_players (game_session_id, player_id)");
        expect(roundHistory).not.toMatch(/voter_player_id|target_player_id|vote_results|votes_json|individual_votes/i);
    });

    it("does not copy complete secret words into the historical tables", () => {
        const sessionHistory = tableBlock("game_session_history");
        const roundHistory = tableBlock("round_history");

        expect(sessionHistory).not.toMatch(/secret_word|normalized_secret_word|word_text|words/i);
        expect(roundHistory).not.toMatch(/secret_word|normalized_secret_word|word_text/i);
        expect(roundHistory).toContain("impostor_guess_text text");
    });

    it("keeps direct client access closed and avoids implementing later increments", () => {
        expect(migration).toContain("alter table public.game_session_history enable row level security");
        expect(migration).toContain("alter table public.round_history enable row level security");
        expect(migration).toContain("revoke all on table public.game_session_history from anon, authenticated, public");
        expect(migration).toContain("revoke all on table public.round_history from anon, authenticated, public");
        expect(migration).not.toContain("create policy");
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete|all) on table public\.(game_session_history|round_history)/i);
        expect(sqlWithoutComments).not.toMatch(/create (or replace )?function public\.end_session/i);
        expect(sqlWithoutComments).not.toMatch(/drop function public\.get_my_game_state|create or replace function public\.get_my_game_state/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_session_history|round_history|game_sessions|rooms)/i);
        expect(sqlWithoutComments).not.toMatch(/broadcast|postgres_changes|leaderboard|statistics|ranking/i);
    });
});
