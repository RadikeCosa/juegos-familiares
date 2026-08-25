import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825160000_submit_impostor_guess_10_1.sql"
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

describe("submit impostor guess 10.1 migration", () => {
    it("adds minimal round-level persistence for the single impostor guess", () => {
        expect(migration).toContain("alter table public.rounds");
        expect(migration).toContain("add column impostor_guess_text text");
        expect(migration).toContain("add column normalized_impostor_guess text");
        expect(migration).toContain("add column impostor_guess_correct boolean");
        expect(migration).toContain("add column impostor_guess_submitted_at timestamptz");
        expect(migration).toContain("add column round_winner text");
        expect(migration).toContain("constraint rounds_round_winner_check");
        expect(migration).toContain("round_winner in ('impostor', 'group')");
        expect(migration).toContain("constraint rounds_guess_result_matches_winner_check");
        expect(sqlWithoutComments).not.toMatch(/create table public\.(impostor_guesses|round_results|scoreboard|round_history)/i);
    });

    it("creates the zero-ownership submit_impostor_guess RPC without returning secrets", () => {
        const submitImpostorGuess = functionBlock("submit_impostor_guess");
        const signature = submitImpostorGuess.match(
            /create or replace function public\.submit_impostor_guess\([^)]*\)/i
        )?.[0] ?? "";
        const returnBlock = submitImpostorGuess.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(signature).toBe("create or replace function public.submit_impostor_guess(guess_text text)");
        expect(submitImpostorGuess).toContain("returns table");
        expect(submitImpostorGuess).toContain("accepted boolean");
        expect(submitImpostorGuess).toContain("already_recorded boolean");
        expect(submitImpostorGuess).toContain("state text");
        expect(submitImpostorGuess).toContain("round_number integer");
        expect(submitImpostorGuess).toContain("is_correct boolean");
        expect(submitImpostorGuess).toContain("winner text");
        expect(submitImpostorGuess).toContain("security definer");
        expect(submitImpostorGuess).toContain("set search_path = ''");
        expect(returnBlock).not.toMatch(/secret_word|normalized_secret_word|impostor_player_id|player_id|vote/i);
        expect(submitImpostorGuess).not.toMatch(/public\.submit_impostor_guess\([^)]*(room_id|game_session_id|round_id|player_id|group_id|is_correct|winner)/i);
    });

    it("derives authority server-side and restricts the RPC to the real impostor", () => {
        const submitImpostorGuess = functionBlock("submit_impostor_guess");

        expect(submitImpostorGuess).toContain("current_auth_user_id := auth.uid()");
        expect(submitImpostorGuess).toContain("from public.players");
        expect(submitImpostorGuess).toContain("from public.player_active_room_slots");
        expect(submitImpostorGuess).toContain("join public.rooms");
        expect(submitImpostorGuess).toContain("active_room_status <> 'playing'");
        expect(submitImpostorGuess).toContain("from public.game_sessions");
        expect(submitImpostorGuess).toContain("from public.rounds");
        expect(submitImpostorGuess).toContain("from public.session_players");
        expect(submitImpostorGuess).toContain("current_player_id <> current_impostor_player_id");
        expect(submitImpostorGuess).toContain("current_game_session_state <> 'impostor_guess'");
        expect(submitImpostorGuess).toContain("current_game_session_state = 'round_result'");
    });

    it("normalizes and compares server-side against the stored normalized secret word", () => {
        const submitImpostorGuess = functionBlock("submit_impostor_guess");

        expect(submitImpostorGuess).toContain("public.canonicalize_group_word_text(submit_impostor_guess.guess_text)");
        expect(submitImpostorGuess).toContain("requested_normalized_guess := lower(requested_guess_text)");
        expect(submitImpostorGuess).toContain("char_length(requested_guess_text) < 1");
        expect(submitImpostorGuess).toContain("computed_is_correct := requested_normalized_guess = current_normalized_secret_word");
        expect(submitImpostorGuess).toContain("computed_winner := 'impostor'");
        expect(submitImpostorGuess).toContain("computed_winner := 'group'");
        expect(submitImpostorGuess).not.toMatch(/levenshtein|similarity|soundex|unaccent|synonym|regexp_match/i);
    });

    it("persists exactly one guess and transitions to round_result", () => {
        const submitImpostorGuess = functionBlock("submit_impostor_guess");

        expect(submitImpostorGuess).toContain("rounds.normalized_impostor_guess is null");
        expect(submitImpostorGuess).toContain("impostor_guess_text = requested_guess_text");
        expect(submitImpostorGuess).toContain("normalized_impostor_guess = requested_normalized_guess");
        expect(submitImpostorGuess).toContain("impostor_guess_correct = computed_is_correct");
        expect(submitImpostorGuess).toContain("round_winner = computed_winner");
        expect(submitImpostorGuess).toContain("set state = 'round_result'");
        expect(submitImpostorGuess).toContain("already_recorded := true");
        expect(submitImpostorGuess).toContain("raise exception 'El intento final ya fue registrado y no se puede cambiar.'");
    });

    it("keeps direct access and execution grants private", () => {
        expect(migration).toContain("revoke all on function public.submit_impostor_guess(text) from public");
        expect(migration).toContain("grant execute on function public.submit_impostor_guess(text) to authenticated");
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\.rounds/i);
        expect(sqlWithoutComments).not.toMatch(/grant execute on function public\.submit_impostor_guess\(text\) to (anon|public)/i);
    });

    it("does not introduce out-of-scope gameplay surfaces", () => {
        expect(sqlWithoutComments).not.toMatch(/scoreboard|new_round|end_session|round_history|broadcast|postgres_changes/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/create policy .*rounds|alter table public\.rounds.*force row level security/i);
    });
});
