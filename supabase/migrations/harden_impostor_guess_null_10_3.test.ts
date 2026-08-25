import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825180000_harden_impostor_guess_null_10_3.sql"
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

describe("harden impostor guess null 10.3 migration", () => {
    it("keeps the public submit_impostor_guess contract unchanged", () => {
        const submitImpostorGuess = functionBlock("submit_impostor_guess");
        const signature = submitImpostorGuess.match(
            /create or replace function public\.submit_impostor_guess\([^)]*\)/i
        )?.[0] ?? "";
        const returnBlock = submitImpostorGuess.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(signature).toBe("create or replace function public.submit_impostor_guess(guess_text text)");
        expect(returnBlock).toContain("accepted boolean");
        expect(returnBlock).toContain("already_recorded boolean");
        expect(returnBlock).toContain("state text");
        expect(returnBlock).toContain("round_number integer");
        expect(returnBlock).toContain("is_correct boolean");
        expect(returnBlock).toContain("winner text");
        expect(submitImpostorGuess).toContain("security definer");
        expect(submitImpostorGuess).toContain("set search_path = ''");
        expect(submitImpostorGuess).not.toMatch(/public\.submit_impostor_guess\([^)]*(room_id|game_session_id|round_id|player_id|group_id|is_correct|winner)/i);
    });

    it("rejects null before normalization and empty normalized text before writes", () => {
        const submitImpostorGuess = functionBlock("submit_impostor_guess");
        const nullGuardIndex = submitImpostorGuess.indexOf("if submit_impostor_guess.guess_text is null then");
        const normalizeIndex = submitImpostorGuess.indexOf("requested_guess_text := public.canonicalize_group_word_text");
        const writeIndex = submitImpostorGuess.indexOf("update public.rounds");

        expect(nullGuardIndex).toBeGreaterThan(-1);
        expect(normalizeIndex).toBeGreaterThan(-1);
        expect(writeIndex).toBeGreaterThan(-1);
        expect(nullGuardIndex).toBeLessThan(normalizeIndex);
        expect(nullGuardIndex).toBeLessThan(writeIndex);
        expect(submitImpostorGuess).toContain("using errcode = '22023'");
        expect(submitImpostorGuess).toContain("if requested_guess_text is null or char_length(requested_guess_text) < 1 then");
    });

    it("does not introduce out-of-scope gameplay surfaces or dangerous grants", () => {
        expect(migration).toContain("revoke all on function public.submit_impostor_guess(text) from public");
        expect(migration).toContain("grant execute on function public.submit_impostor_guess(text) to authenticated");
        expect(sqlWithoutComments).not.toMatch(/scoreboard|new_round|end_session|round_history|broadcast|postgres_changes/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\.(rounds|round_votes|game_sessions)/i);
        expect(sqlWithoutComments).not.toMatch(/grant execute on function public\.submit_impostor_guess\(text\) to (anon|public)/i);
    });
});
