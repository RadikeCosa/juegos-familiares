import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260825110000_submit_round_vote_8_2.sql"
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

describe("submit round vote 8.2 migration", () => {
    it("extends GameSession state to first-vote resolution states only", () => {
        expect(migration).toContain("drop constraint game_sessions_state_check");
        expect(migration).toContain("constraint game_sessions_state_check");
        expect(migration).toContain("'role_reveal'");
        expect(migration).toContain("'discussion'");
        expect(migration).toContain("'voting_first'");
        expect(migration).toContain("'tie_discussion'");
        expect(migration).toContain("'impostor_guess'");
        expect(migration).toContain("'round_result'");
        expect(sqlWithoutComments).not.toMatch(/voting_second|scoreboard|finished/i);
    });

    it("creates submit_round_vote with only target_player_id and no secret return", () => {
        const submitRoundVote = functionBlock("submit_round_vote");
        const returnBlock = submitRoundVote.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(submitRoundVote).toContain("create or replace function public.submit_round_vote(target_player_id uuid)");
        expect(submitRoundVote).toContain("accepted boolean");
        expect(submitRoundVote).toContain("already_recorded boolean");
        expect(submitRoundVote).toContain("state text");
        expect(submitRoundVote).toContain("round_number integer");
        expect(submitRoundVote).toContain("security definer");
        expect(submitRoundVote).toContain("set search_path = ''");
        expect(returnBlock).not.toMatch(/word|secret|impostor|role|host_player_id|vote|target_player_id/i);
        expect(submitRoundVote).not.toMatch(/public\.submit_round_vote\([^)]*(room_id|game_session_id|round_id|voter_player_id|group_id|auth_user_id|voting_round)/i);
    });

    it("derives caller and current gameplay context server-side", () => {
        const submitRoundVote = functionBlock("submit_round_vote");

        expect(submitRoundVote).toContain("current_auth_user_id := auth.uid()");
        expect(submitRoundVote).toContain("from public.players");
        expect(submitRoundVote).toContain("from public.player_active_room_slots");
        expect(submitRoundVote).toContain("join public.rooms");
        expect(submitRoundVote).toContain("active_room_status <> 'playing'");
        expect(submitRoundVote).toContain("from public.game_sessions");
        expect(submitRoundVote).toContain("from public.rounds");
        expect(submitRoundVote).toContain("from public.session_players");
        expect(submitRoundVote).toContain("for update of rooms");
        expect(submitRoundVote).toContain("for update;");
    });

    it("persists first-round votes with idempotence and change rejection", () => {
        const submitRoundVote = functionBlock("submit_round_vote");

        expect(submitRoundVote).toContain("voting_round");
        expect(submitRoundVote).toContain("1");
        expect(submitRoundVote).toContain("existing_target_player_id");
        expect(submitRoundVote).toContain("already_recorded := true");
        expect(submitRoundVote).toContain("already_recorded := false");
        expect(submitRoundVote).toContain("Tu voto ya fue registrado y no se puede cambiar.");
        expect(submitRoundVote).toContain("insert into public.round_votes");
        expect(submitRoundVote).toContain("requested_target_player_id = current_player_id");
    });

    it("resolves first voting automatically when all SessionPlayers voted", () => {
        const submitRoundVote = functionBlock("submit_round_vote");

        expect(submitRoundVote).toContain("required_vote_count");
        expect(submitRoundVote).toContain("submitted_vote_count");
        expect(submitRoundVote).toContain("submitted_vote_count < required_vote_count");
        expect(submitRoundVote).toContain("count(*) as vote_count");
        expect(submitRoundVote).toContain("top_candidate_count > 1");
        expect(submitRoundVote).toContain("next_game_session_state := 'tie_discussion'");
        expect(submitRoundVote).toContain("next_game_session_state := 'impostor_guess'");
        expect(submitRoundVote).toContain("next_game_session_state := 'round_result'");
        expect(submitRoundVote).toContain("set state = next_game_session_state");
    });

    it("keeps round_votes private and avoids out-of-scope features", () => {
        expect(migration).toContain("revoke all on function public.submit_round_vote(uuid) from public");
        expect(migration).toContain("grant execute on function public.submit_round_vote(uuid) to authenticated");
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\.round_votes/i);
        expect(sqlWithoutComments).not.toMatch(/create policy/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds|round_votes)/i);
        expect(sqlWithoutComments).not.toMatch(/broadcast|postgres_changes|rounds?\.status|score|reveal_word|guess_word|start_second|voting_second/i);
    });
});
