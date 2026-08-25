import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825130000_start_second_round_voting_9_1.sql"
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

describe("start second round voting 9.1 migration", () => {
    it("extends GameSession state with voting_second and preserves existing gameplay states", () => {
        expect(migration).toContain("drop constraint game_sessions_state_check");
        expect(migration).toContain("constraint game_sessions_state_check");

        for (const state of [
            "role_reveal",
            "discussion",
            "voting_first",
            "tie_discussion",
            "voting_second",
            "impostor_guess",
            "round_result"
        ]) {
            expect(migration).toContain(`'${state}'`);
        }

        expect(sqlWithoutComments).not.toMatch(/scoreboard|finished|preparing_round/i);
    });

    it("creates zero-argument start_second_round_voting without returning secrets", () => {
        const startSecondRoundVoting = functionBlock("start_second_round_voting");
        const returnBlock = startSecondRoundVoting.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(startSecondRoundVoting).toContain("create or replace function public.start_second_round_voting()");
        expect(startSecondRoundVoting).toContain("returns table");
        expect(startSecondRoundVoting).toContain("advanced boolean");
        expect(startSecondRoundVoting).toContain("already_in_phase boolean");
        expect(startSecondRoundVoting).toContain("state text");
        expect(startSecondRoundVoting).toContain("round_number integer");
        expect(startSecondRoundVoting).toContain("security definer");
        expect(startSecondRoundVoting).toContain("set search_path = ''");
        expect(startSecondRoundVoting).toContain("for update of rooms");
        expect(startSecondRoundVoting).toContain("for update;");
        expect(returnBlock).not.toMatch(/word|secret|impostor|role|room_status|host_player_id|vote|candidate/i);
        expect(migration).toContain("revoke all on function public.start_second_round_voting() from public");
        expect(migration).toContain("grant execute on function public.start_second_round_voting() to authenticated");
    });

    it("derives authority and transitions only tie_discussion to voting_second", () => {
        const startSecondRoundVoting = functionBlock("start_second_round_voting");

        expect(startSecondRoundVoting).toContain("current_auth_user_id := auth.uid()");
        expect(startSecondRoundVoting).toContain("from public.players");
        expect(startSecondRoundVoting).toContain("from public.player_active_room_slots");
        expect(startSecondRoundVoting).toContain("join public.rooms");
        expect(startSecondRoundVoting).toContain("active_room_status <> 'playing'");
        expect(startSecondRoundVoting).toContain("from public.game_sessions");
        expect(startSecondRoundVoting).toContain("from public.session_players");
        expect(startSecondRoundVoting).toContain("from public.rounds");
        expect(startSecondRoundVoting).toContain("order by rounds.number desc");
        expect(startSecondRoundVoting).toContain("limit 1");
        expect(startSecondRoundVoting).toContain("current_game_session_state not in ('tie_discussion', 'voting_second')");
        expect(startSecondRoundVoting).toContain("active_room_host_player_id <> current_player_id");
        expect(startSecondRoundVoting).toContain("current_game_session_state = 'voting_second'");
        expect(startSecondRoundVoting).toContain("set state = 'voting_second'");
        expect(startSecondRoundVoting).not.toMatch(/public\.start_second_round_voting\([^)]*(room_id|game_session_id|player_id|host_player_id|round_id|group_id|auth_user_id)/i);
    });

    it("does not persist tie candidates or implement second-vote resolution", () => {
        const startSecondRoundVoting = functionBlock("start_second_round_voting");

        expect(sqlWithoutComments).not.toMatch(/tie_candidates|candidate_ids|jsonb.*candidate|create table .*candidate/i);
        expect(startSecondRoundVoting).not.toMatch(/voting_round\s*=\s*2|insert into public\.round_votes|vote_count|winner|score|scoreboard|rounds?\.status/i);
        expect(sqlWithoutComments).not.toMatch(/insert into public\.round_votes|winner|score|scoreboard|rounds?\.status/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
    });

    it("keeps get_my_game_state compatible with voting_second without exposing round 2 data", () => {
        const getMyGameState = functionBlock("get_my_game_state");

        expect(getMyGameState).toContain("when game_sessions.state = 'voting_second' then null::uuid");
        expect(getMyGameState).toContain("when game_sessions.state = 'voting_second' then false");
        expect(getMyGameState).not.toMatch(/voting_round\s*=\s*2/);
        expect(getMyGameState).not.toMatch(/tie_candidates|candidate_ids/i);
    });
});
