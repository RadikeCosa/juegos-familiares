import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260824120000_start_session_6_3.sql"
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

function tableBlock(tableName: string) {
    const match = migration.match(
        new RegExp(`create table public\\.${tableName} \\([\\s\\S]*?\\n\\);`)
    );

    expect(match).not.toBeNull();

    return (match as RegExpMatchArray)[0];
}

describe("start session 6.3 migration", () => {
    it("adds only the minimal GameSession state", () => {
        expect(migration).toContain("add column state text not null");
        expect(migration).toContain("constraint game_sessions_state_check");
        expect(migration).toContain("check (state in ('role_reveal'))");
        expect(migration).not.toMatch(/preparing_round|voting_first|tie_discussion|round_result|scoreboard|finished/i);
    });

    it("creates private rounds with snapshot word and impostor integrity", () => {
        const rounds = tableBlock("rounds");

        expect(rounds).toContain("id uuid primary key default extensions.gen_random_uuid()");
        expect(rounds).toContain("game_session_id uuid not null");
        expect(rounds).toContain("group_id uuid not null");
        expect(rounds).toContain("number integer not null");
        expect(rounds).toContain("secret_word text not null");
        expect(rounds).toContain("normalized_secret_word text not null");
        expect(rounds).toContain("impostor_player_id uuid not null");
        expect(rounds).toContain("check (number >= 1)");
        expect(rounds).toContain("check (secret_word = public.canonicalize_group_word_text(secret_word))");
        expect(rounds).toContain("check (normalized_secret_word = lower(secret_word))");
        expect(rounds).toContain("unique (game_session_id, number)");
        expect(rounds).toContain("unique (game_session_id, normalized_secret_word)");
        expect(rounds).toContain("foreign key (game_session_id, group_id)");
        expect(rounds).toContain("references public.game_sessions (id, group_id)");
        expect(rounds).toContain("on delete cascade");
        expect(rounds).toContain("foreign key (game_session_id, impostor_player_id)");
        expect(rounds).toContain("references public.session_players (game_session_id, player_id)");
        expect(rounds).not.toMatch(/group_word_id|status|winner|finished_at|guess|accused_player_id|score/i);
    });

    it("keeps gameplay tables closed and out of Realtime", () => {
        expect(migration).toContain("alter table public.rounds enable row level security");
        expect(migration).toContain("revoke all on table public.game_sessions from anon, authenticated, public");
        expect(migration).toContain("revoke all on table public.session_players from anon, authenticated, public");
        expect(migration).toContain("revoke all on table public.rounds from anon, authenticated, public");
        expect(migration).not.toContain("create policy");
        expect(migration).not.toMatch(/alter publication supabase_realtime add table public\\.(game_sessions|session_players|rounds)/i);
    });

    it("creates zero-argument start_session without returning secrets", () => {
        const startSession = functionBlock("start_session");

        expect(startSession).toContain("returns table");
        expect(startSession).toContain("started boolean");
        expect(startSession).toContain("already_started boolean");
        expect(startSession).toContain("room_status text");
        expect(startSession).toContain("game_session_state text");
        expect(startSession).toContain("round_number integer");
        expect(startSession).toContain("participant_count integer");
        expect(startSession).toContain("security definer");
        expect(startSession).toContain("set search_path = ''");
        expect(startSession).toContain("for update of rooms");
        expect(startSession).toContain("create or replace function public.start_session()");
        expect(startSession).not.toMatch(/return query[\\s\\S]*(secret_word|normalized_secret_word|impostor_player_id)/i);
        expect(migration).toContain("grant execute on function public.start_session() to authenticated");
    });

    it("restricts playing host succession to frozen SessionPlayers", () => {
        const succession = functionBlock("reassign_room_host_if_stale");

        expect(succession).toContain("active_room_status = 'playing'");
        expect(succession).toContain("from public.game_sessions");
        expect(succession).toContain("from public.session_players");
        expect(succession).toContain("session_players.game_session_id = active_game_session_id");
        expect(succession).toContain("active_room_status = 'lobby'");
    });

    it("does not introduce out-of-scope gameplay objects", () => {
        expect(sqlWithoutComments).not.toMatch(/get_my_game_state|round_player_assignment|used_word|vote|winner|score|end_session|broadcast/i);
        expect(sqlWithoutComments).not.toMatch(/role_acknowledged|vote_submitted|round\\.status/i);
    });
});
