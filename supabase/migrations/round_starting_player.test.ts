import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
    join(
        process.cwd(),
        "supabase/migrations/20260827100000_round_starting_player.sql"
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

describe("round starting player migration", () => {
    it("adds a nullable Round.starting_player_id compatible with historical rounds", () => {
        expect(migration).toContain("alter table public.rounds");
        expect(migration).toContain("add column starting_player_id uuid");
        expect(migration).not.toContain("starting_player_id uuid not null");
        expect(migration).toContain("constraint rounds_starting_player_session_player_fkey");
        expect(migration).toContain("foreign key (game_session_id, starting_player_id)");
        expect(migration).toContain("references public.session_players (game_session_id, player_id)");
        expect(sqlWithoutComments).not.toMatch(/create table public\.(round_turns|round_speaking_order|turn_history)/i);
        expect(sqlWithoutComments).not.toMatch(/starting_count|speaking_order|turn_order/i);
    });

    it("does not accept a client-controlled starting player in either round-creating RPC", () => {
        const startSession = functionBlock("start_session");
        const startNextRound = functionBlock("start_next_round");

        expect(startSession).not.toMatch(/public\.start_session\([^)]*(starting_player|round_id|player_id)/i);
        expect(startNextRound).not.toMatch(/public\.start_next_round\([^)]*(starting_player|round_id|player_id)/i);
        expect(startSession.match(/create or replace function public\.start_session\([^)]*\)/i)?.[0]).toBe(
            "create or replace function public.start_session()"
        );
        expect(startNextRound.match(/create or replace function public\.start_next_round\([^)]*\)/i)?.[0]).toBe(
            "create or replace function public.start_next_round()"
        );
    });

    it("selects the starting player among the SessionPlayers with the fewest prior designations in start_session", () => {
        const startSession = functionBlock("start_session");

        expect(startSession).toContain("selected_starting_player_id uuid");
        expect(startSession).toContain(
            "left join public.rounds\n    on rounds.game_session_id = session_players.game_session_id\n   and rounds.starting_player_id = session_players.player_id"
        );
        expect(startSession).toContain("session_players.game_session_id = new_game_session_id");
        expect(startSession).toContain("group by session_players.player_id");
        expect(startSession).toContain("order by count(rounds.id) asc, random()");
        expect(startSession).toContain("No se pudo seleccionar quien empieza.");
        expect(startSession.indexOf("selected_starting_player_id")).toBeGreaterThan(
            startSession.indexOf("selected_impostor_player_id")
        );
        expect(startSession).toContain("starting_player_id");
        expect(startSession.indexOf("insert into public.rounds")).toBeGreaterThan(
            startSession.indexOf("selected_starting_player_id")
        );
    });

    it("selects the starting player among the SessionPlayers with the fewest prior designations in start_next_round", () => {
        const startNextRound = functionBlock("start_next_round");

        expect(startNextRound).toContain("selected_starting_player_id uuid");
        expect(startNextRound).toContain("session_players.game_session_id = current_game_session_id");
        expect(startNextRound).toContain("group by session_players.player_id");
        expect(startNextRound).toContain("order by count(rounds.id) asc, random()");
        expect(startNextRound).toContain("No se pudo seleccionar quien empieza.");
        expect(startNextRound).toContain("starting_player_id");
    });

    it("does not couple starting player selection with impostor selection or role", () => {
        const startSession = functionBlock("start_session");
        const startNextRound = functionBlock("start_next_round");

        expect(startSession).not.toMatch(/starting_player_id[\s\S]{0,120}impostor_player_id\s*=\s*selected_starting/i);
        expect(startNextRound).not.toMatch(/starting_player_id[\s\S]{0,120}impostor_player_id\s*=\s*selected_starting/i);
        expect(sqlWithoutComments).not.toMatch(/host_player_id\s*=\s*selected_starting_player_id/i);
    });

    it("extends get_my_game_state with an authoritative, non-secret starting_player read model column", () => {
        expect(migration).toContain("drop function public.get_my_game_state();");
        const getMyGameState = functionBlock("get_my_game_state");
        const returnBlock = getMyGameState.match(/returns table \([\s\S]*?\)/i)?.[0] ?? "";

        expect(returnBlock).toContain("starting_player jsonb");
        expect(getMyGameState).toContain("round_starting_player.starting_player");
        expect(getMyGameState).toContain("rounds.starting_player_id,");
        expect(getMyGameState).toContain("'is_self', players.id = current_player_id");
        expect(getMyGameState).toContain(
            "where players.id = current_round.starting_player_id"
        );
        expect(getMyGameState).not.toMatch(
            /case[\s\S]{0,80}state[\s\S]{0,80}=\s*'discussion'[\s\S]{0,120}starting_player/i
        );
    });

    it("keeps starting_player null for the finished history branch and out of round history", () => {
        const getMyGameState = functionBlock("get_my_game_state");
        const finishedBranch = getMyGameState.slice(
            0,
            getMyGameState.indexOf("if active_room_status <> 'playing'")
        );

        expect(finishedBranch).toMatch(/null::jsonb,\s*\n\s*null::jsonb,\s*\n\s*null::jsonb,\s*\n\s*false,/);
        expect(getMyGameState).not.toContain("'starting_player'");
    });

    it("keeps rounds and session_players closed to direct client access", () => {
        expect(sqlWithoutComments).not.toContain("create policy");
        expect(sqlWithoutComments).not.toMatch(
            /grant select on table public\.rounds|alter publication supabase_realtime add table public\.(game_sessions|session_players|rounds)/i
        );
        expect(migration).toContain("grant execute on function public.get_my_game_state() to authenticated");
    });
});
