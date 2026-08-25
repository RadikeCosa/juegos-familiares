import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825100000_round_voting_8_1.sql"
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

describe("round voting 8.1 migration", () => {
    it("extends GameSession state only to role_reveal, discussion and voting_first", () => {
        expect(migration).toContain("drop constraint game_sessions_state_check");
        expect(migration).toContain("constraint game_sessions_state_check");
        expect(migration).toContain(
            "check (state in ('role_reveal', 'discussion', 'voting_first'))"
        );
        expect(sqlWithoutComments).not.toMatch(/tie_discussion|impostor_guess|round_result|scoreboard|finished/i);
    });

    it("creates private round_votes with structural vote integrity", () => {
        expect(migration).toContain("create table public.round_votes");
        expect(migration).toContain("round_id uuid not null");
        expect(migration).toContain("game_session_id uuid not null");
        expect(migration).toContain("group_id uuid not null");
        expect(migration).toContain("voting_round smallint not null");
        expect(migration).toContain("voter_player_id uuid not null");
        expect(migration).toContain("target_player_id uuid not null");
        expect(migration).toContain("primary key (round_id, voting_round, voter_player_id)");
        expect(migration).toContain("check (voting_round in (1, 2))");
        expect(migration).toContain("check (voter_player_id <> target_player_id)");
        expect(migration).toContain("foreign key (round_id, game_session_id, group_id)");
        expect(migration).toContain("references public.rounds (id, game_session_id, group_id)");
        expect(migration).toContain("foreign key (game_session_id, voter_player_id)");
        expect(migration).toContain("foreign key (game_session_id, target_player_id)");
        expect(migration).toContain("alter table public.round_votes enable row level security");
        expect(migration).toContain("revoke all on table public.round_votes from anon, authenticated, public");
    });

    it("creates zero-argument start_round_voting without returning secrets", () => {
        const startRoundVoting = functionBlock("start_round_voting");
        const returnBlock = startRoundVoting.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(startRoundVoting).toContain("create or replace function public.start_round_voting()");
        expect(startRoundVoting).toContain("returns table");
        expect(startRoundVoting).toContain("advanced boolean");
        expect(startRoundVoting).toContain("already_in_phase boolean");
        expect(startRoundVoting).toContain("state text");
        expect(startRoundVoting).toContain("round_number integer");
        expect(startRoundVoting).toContain("security definer");
        expect(startRoundVoting).toContain("set search_path = ''");
        expect(startRoundVoting).toContain("for update of rooms");
        expect(startRoundVoting).toContain("for update;");
        expect(returnBlock).not.toMatch(/word|secret|impostor|role|room_status|host_player_id|vote/i);
        expect(migration).toContain("revoke all on function public.start_round_voting() from public");
        expect(migration).toContain("grant execute on function public.start_round_voting() to authenticated");
    });

    it("derives authority and transitions only discussion to voting_first", () => {
        const startRoundVoting = functionBlock("start_round_voting");

        expect(startRoundVoting).toContain("current_auth_user_id := auth.uid()");
        expect(startRoundVoting).toContain("from public.players");
        expect(startRoundVoting).toContain("from public.player_active_room_slots");
        expect(startRoundVoting).toContain("join public.rooms");
        expect(startRoundVoting).toContain("active_room_status <> 'playing'");
        expect(startRoundVoting).toContain("from public.game_sessions");
        expect(startRoundVoting).toContain("from public.session_players");
        expect(startRoundVoting).toContain("from public.rounds");
        expect(startRoundVoting).toContain("order by rounds.number desc");
        expect(startRoundVoting).toContain("limit 1");
        expect(startRoundVoting).toContain("current_game_session_state not in ('discussion', 'voting_first')");
        expect(startRoundVoting).toContain("active_room_host_player_id <> current_player_id");
        expect(startRoundVoting).toContain("current_game_session_state = 'voting_first'");
        expect(startRoundVoting).toContain("set state = 'voting_first'");
        expect(startRoundVoting).not.toMatch(/public\.start_round_voting\([^)]*(room_id|game_session_id|player_id|host_player_id|round_id|group_id|auth_user_id)/i);
    });

    it("does not introduce out-of-scope voting features", () => {
        expect(sqlWithoutComments).not.toMatch(/submit_round_vote|vote_count|tally|winner|score|broadcast|postgres_changes|rounds?\.status/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
    });
});
