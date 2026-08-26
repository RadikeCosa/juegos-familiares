import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260826000000_end_session_12_2.sql"
    ),
    "utf8"
);
const sqlWithoutComments = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

function functionBlock(functionName: string) {
    const match = migration.match(
        new RegExp(`create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`)
    );

    expect(match).not.toBeNull();

    return (match as RegExpMatchArray)[0];
}

describe("end session 12.2 migration", () => {
    it("creates an authoritative 0-args end_session RPC", () => {
        const endSession = functionBlock("end_session");
        const signature = endSession.match(/create or replace function public\.end_session\([^)]*\)/i)?.[0];

        expect(signature).toBe("create or replace function public.end_session()");
        expect(endSession).toContain("security definer");
        expect(endSession).toContain("current_auth_user_id := auth.uid()");
        expect(endSession).not.toMatch(/public\.end_session\([^)]*(room_id|game_session_id|round_id|player_id|winner|score|finished_at)/i);
    });

    it("derives and validates host-owned active session context", () => {
        const endSession = functionBlock("end_session");

        expect(endSession).toContain("from public.player_active_room_slots");
        expect(endSession).toContain("join public.rooms");
        expect(endSession).toContain("for update of rooms");
        expect(endSession).toContain("active_room_status <> 'playing'");
        expect(endSession).toContain("active_room_host_player_id <> current_player_id");
        expect(endSession).toContain("current_game_session_state <> 'scoreboard'");
        expect(endSession).toContain("using errcode = 'P0019'");
    });

    it("requires scored resolved rounds before finishing", () => {
        const endSession = functionBlock("end_session");

        expect(endSession).toContain("rounds.round_winner not in ('impostor', 'group')");
        expect(endSession).toContain("or rounds.scored_at is null");
        expect(endSession).toContain("computed_round_count < 1");
    });

    it("sets finished state and timestamp server-side", () => {
        const endSession = functionBlock("end_session");

        expect(endSession).toContain("closing_timestamp := now()");
        expect(endSession).toContain("state = 'finished'");
        expect(endSession).toContain("finished_at = coalesce(game_sessions.finished_at, closing_timestamp)");
    });

    it("creates session history with final scores and multiple winners", () => {
        const endSession = functionBlock("end_session");

        expect(endSession).toContain("insert into public.game_session_history");
        expect(endSession).toContain("computed_final_scores");
        expect(endSession).toContain("computed_winner_player_ids");
        expect(endSession).toContain("computed_winners");
        expect(endSession).toContain("session_players.score = (");
        expect(endSession).toContain("select max(max_score_players.score)");
        expect(endSession).toContain("on conflict (game_session_id) do nothing");
    });

    it("creates round history without individual votes or secret words", () => {
        const endSession = functionBlock("end_session");

        expect(endSession).toContain("insert into public.round_history");
        expect(endSession).toContain("rounds.impostor_player_id");
        expect(endSession).toContain("rounds.round_winner");
        expect(endSession).toContain("rounds.impostor_guess_text");
        expect(endSession).toContain("rounds.impostor_guess_correct");
        expect(endSession).toContain("jsonb_build_object(");
        expect(endSession).toContain("scoring_summary");
        expect(endSession).not.toMatch(/voter_player_id|target_player_id|secret_word|normalized_secret_word/i);
    });

    it("closes the Room and keeps retries idempotent", () => {
        const endSession = functionBlock("end_session");

        expect(endSession).toContain("update public.rooms");
        expect(endSession).toContain("set status = 'closed'");
        expect(endSession).toContain("already_ended := true");
        expect(endSession).toContain("on conflict do nothing");
    });

    it("keeps direct execution restricted to authenticated users", () => {
        expect(migration).toContain("revoke all on function public.end_session() from public");
        expect(migration).toContain("grant execute on function public.end_session() to authenticated");
        expect(sqlWithoutComments).not.toMatch(/create policy|alter publication supabase_realtime|broadcast|leaderboard|statistics|ranking/i);
    });
});
