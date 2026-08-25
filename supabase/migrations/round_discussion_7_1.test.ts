import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260824140000_round_discussion_7_1.sql"
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

describe("round discussion 7.1 migration", () => {
    it("extends GameSession state only to role_reveal and discussion", () => {
        expect(migration).toContain("drop constraint game_sessions_state_check");
        expect(migration).toContain("constraint game_sessions_state_check");
        expect(migration).toContain("check (state in ('role_reveal', 'discussion'))");
        expect(sqlWithoutComments).not.toMatch(/voting|result|finished|scoreboard/i);
    });

    it("creates zero-argument start_round_discussion without returning secrets", () => {
        const startRoundDiscussion = functionBlock("start_round_discussion");
        const returnBlock = startRoundDiscussion.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(startRoundDiscussion).toContain("create or replace function public.start_round_discussion()");
        expect(startRoundDiscussion).toContain("returns table");
        expect(startRoundDiscussion).toContain("advanced boolean");
        expect(startRoundDiscussion).toContain("already_in_phase boolean");
        expect(startRoundDiscussion).toContain("state text");
        expect(startRoundDiscussion).toContain("round_number integer");
        expect(startRoundDiscussion).toContain("security definer");
        expect(startRoundDiscussion).toContain("set search_path = ''");
        expect(startRoundDiscussion).toContain("for update of rooms");
        expect(startRoundDiscussion).toContain("for update;");
        expect(returnBlock).not.toMatch(/word|secret|impostor|role|room_status|host_player_id/i);
        expect(migration).toContain("revoke all on function public.start_round_discussion() from public");
        expect(migration).toContain("grant execute on function public.start_round_discussion() to authenticated");
    });

    it("derives authority from auth, active Room, SessionPlayer and current Round", () => {
        const startRoundDiscussion = functionBlock("start_round_discussion");

        expect(startRoundDiscussion).toContain("current_auth_user_id := auth.uid()");
        expect(startRoundDiscussion).toContain("from public.players");
        expect(startRoundDiscussion).toContain("from public.player_active_room_slots");
        expect(startRoundDiscussion).toContain("join public.rooms");
        expect(startRoundDiscussion).toContain("active_room_status <> 'playing'");
        expect(startRoundDiscussion).toContain("from public.game_sessions");
        expect(startRoundDiscussion).toContain("from public.session_players");
        expect(startRoundDiscussion).toContain("from public.rounds");
        expect(startRoundDiscussion).toContain("order by rounds.number desc");
        expect(startRoundDiscussion).toContain("limit 1");
        expect(startRoundDiscussion).not.toMatch(/public\.start_round_discussion\([^)]*(room_id|game_session_id|player_id|host_player_id|round_id)/i);
    });

    it("keeps mutation host-only while allowing SessionPlayer idempotent discussion retry", () => {
        const startRoundDiscussion = functionBlock("start_round_discussion");
        const discussionBranchIndex = startRoundDiscussion.indexOf("current_game_session_state = 'discussion'");
        const hostCheckIndex = startRoundDiscussion.indexOf("active_room_host_player_id <> current_player_id");

        expect(discussionBranchIndex).toBeGreaterThan(0);
        expect(hostCheckIndex).toBeGreaterThan(discussionBranchIndex);
        expect(startRoundDiscussion).toContain("already_in_phase := true");
        expect(startRoundDiscussion).toContain("advanced := false");
        expect(startRoundDiscussion).toContain("current_game_session_state <> 'role_reveal'");
        expect(startRoundDiscussion).toContain("set state = 'discussion'");
    });

    it("keeps private gameplay tables closed and out of Realtime", () => {
        expect(sqlWithoutComments).not.toMatch(/grant (select|insert|update|delete).*public\\.(game_sessions|session_players|rounds)/i);
        expect(sqlWithoutComments).not.toMatch(/create policy/i);
        expect(sqlWithoutComments).not.toMatch(/alter publication supabase_realtime add table public\\.(game_sessions|session_players|rounds)/i);
    });

    it("does not introduce out-of-scope gameplay features", () => {
        expect(sqlWithoutComments).not.toMatch(/role_acknowledged|all_roles|vote|score|winner|end_session|broadcast|rounds?\.status/i);
        expect(sqlWithoutComments).not.toMatch(/setinterval|channel\(|presence|postgres_changes/i);
    });
});
