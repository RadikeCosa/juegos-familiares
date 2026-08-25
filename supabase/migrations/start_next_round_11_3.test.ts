import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825210000_start_next_round_11_3.sql"
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

describe("start next round 11.3 migration", () => {
    it("adds an operational SessionPlayer impostor counter without score changes or history", () => {
        expect(migration).toContain("alter table public.session_players");
        expect(migration).toContain("add column impostor_count integer not null default 0");
        expect(migration).toContain("constraint session_players_impostor_count_check");
        expect(migration).toContain("check (impostor_count >= 0)");
        expect(migration).toContain("set impostor_count = coalesce(derived_counts.impostor_count, 0)");
        expect(sqlWithoutComments).not.toMatch(/create table public\.(scoreboard|scores|score_events|round_history|session_history)/i);
        expect(sqlWithoutComments).not.toMatch(/score\s*=\s*score\s*\+/i);
    });

    it("creates a zero-argument host-only RPC without client-controlled round data", () => {
        const startNextRound = functionBlock("start_next_round");
        const signature = startNextRound.match(
            /create or replace function public\.start_next_round\([^)]*\)/i
        )?.[0] ?? "";
        const returnBlock = startNextRound.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(signature).toBe("create or replace function public.start_next_round()");
        expect(startNextRound).toContain("security definer");
        expect(startNextRound).toContain("set search_path = ''");
        expect(startNextRound).toContain("current_auth_user_id := auth.uid()");
        expect(startNextRound).toContain("active_room_host_player_id <> current_player_id");
        expect(startNextRound).toContain("Solo el host actual puede iniciar otra ronda.");
        expect(startNextRound).not.toMatch(/public\.start_next_round\([^)]*(room_id|game_session_id|round_id|player_id|group_id|word|impostor|number|score)/i);
        expect(returnBlock).not.toMatch(/word|secret|normalized|impostor|player_id|score|host_player_id/i);
    });

    it("requires an active SessionPlayer in a playing room and an already-scored scoreboard", () => {
        const startNextRound = functionBlock("start_next_round");

        expect(startNextRound).toContain("from public.player_active_room_slots");
        expect(startNextRound).toContain("active_room_status <> 'playing'");
        expect(startNextRound).toContain("from public.session_players");
        expect(startNextRound).toContain("session_players.player_id = current_player_id");
        expect(startNextRound).toContain("current_game_session_state <> 'scoreboard'");
        expect(startNextRound).toContain("current_round_winner not in ('impostor', 'group')");
        expect(startNextRound).toContain("current_round_scored_at is null");
    });

    it("reuses the same GameSession and frozen roster while creating Round number + 1", () => {
        const startNextRound = functionBlock("start_next_round");

        expect(startNextRound).toContain("current_game_session_id");
        expect(startNextRound).toContain("current_round_number + 1");
        expect(startNextRound).toContain("insert into public.rounds");
        expect(startNextRound).not.toMatch(/insert into public\.game_sessions|insert into public\.session_players|delete from public\.session_players/i);
        expect(startNextRound).not.toMatch(/update public\.session_players[\s\S]*set score/i);
    });

    it("selects a server-side unused word and aborts before creating a partial round if none exists", () => {
        const startNextRound = functionBlock("start_next_round");

        expect(startNextRound).toContain("from public.group_words");
        expect(startNextRound).toContain("used_rounds.game_session_id = current_game_session_id");
        expect(startNextRound).toContain("used_rounds.normalized_secret_word = group_words.normalized_text");
        expect(startNextRound).toContain("order by random()");
        expect(startNextRound).toContain("if selected_word is null or selected_normalized_word is null then");
        expect(startNextRound).toContain("No hay palabras disponibles para iniciar otra ronda.");
        expect(startNextRound.indexOf("if selected_word is null")).toBeLessThan(
            startNextRound.indexOf("insert into public.rounds")
        );
    });

    it("selects the impostor among the lowest impostor_count players and increments only that player", () => {
        const startNextRound = functionBlock("start_next_round");

        expect(startNextRound).toContain("set impostor_count = coalesce(derived_counts.impostor_count, 0)");
        expect(startNextRound).toContain("and session_players.impostor_count = (");
        expect(startNextRound).toContain("select min(eligible_session_players.impostor_count)");
        expect(startNextRound).toContain("order by random()");
        expect(startNextRound).toContain("set impostor_count = impostor_count + 1");
        expect(startNextRound).toContain("session_players.player_id = selected_impostor_player_id");
    });

    it("moves the same session back to role_reveal and keeps the read model privacy contract", () => {
        const startNextRound = functionBlock("start_next_round");

        expect(startNextRound).toContain("update public.game_sessions");
        expect(startNextRound).toContain("set state = 'role_reveal'");
        expect(startNextRound).toContain("state := 'role_reveal'");
        expect(startNextRound).not.toMatch(/drop function public\.get_my_game_state|create or replace function public\.get_my_game_state/i);
        expect(sqlWithoutComments).not.toMatch(/grant select on table public\.rounds|alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/broadcast|postgres_changes/i);
    });

    it("uses row locks, existing round uniqueness, and retry recovery to avoid duplicate rounds", () => {
        const startNextRound = functionBlock("start_next_round");

        expect(startNextRound).toContain("for update of rooms");
        expect(startNextRound).toContain("from public.game_sessions");
        expect(startNextRound).toContain("for update");
        expect(startNextRound).toContain("current_game_session_state = 'role_reveal'");
        expect(startNextRound).toContain("already_started := true");
        expect(startNextRound).toContain("current_round_number > 1");
        expect(migration).not.toMatch(/drop constraint rounds_game_session_number_key|drop constraint rounds_game_session_normalized_secret_word_key/i);
    });

    it("exposes only the new RPC to authenticated callers", () => {
        expect(migration).toContain("revoke all on function public.start_next_round() from public");
        expect(migration).toContain("grant execute on function public.start_next_round() to authenticated");
    });
});
