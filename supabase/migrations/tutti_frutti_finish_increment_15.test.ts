import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("./20260925150000_tutti_frutti_finish_increment_15.sql", import.meta.url), "utf8"
);

function block(name: string) {
  const marker = `function public.${name}`;
  const start = sql.indexOf(marker);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const declarationStart = Math.max(
    sql.lastIndexOf("create function ", start),
    sql.lastIndexOf("create or replace function ", start)
  );
  return sql.slice(declarationStart, sql.indexOf("\n$$;", start));
}

describe("Tutti Frutti increment 15 migration contract", () => {
  it("keeps the established Room, shared session, game session, round lock order", () => {
    const rpc = block("score_tutti_frutti_round").toLowerCase();
    const locks = [
      rpc.indexOf("from public.rooms as rooms\n  where rooms.id = target_room_id"),
      rpc.indexOf("from public.room_sessions as sessions\n  where sessions.id = v_session_id\n  for update"),
      rpc.indexOf("from public.tutti_frutti_sessions as sessions\n  where sessions.id = v_session_id\n  for update"),
      rpc.indexOf("from public.tutti_frutti_rounds as rounds\n  where rounds.id = target_round_id and rounds.session_id = v_session_id\n  for update")
    ];
    expect(locks.every(position => position >= 0)).toBe(true);
    expect(locks).toEqual([...locks].sort((a, b) => a - b));
  });

  it("uses guarded returning updates and rejects inconsistent retries", () => {
    const rpc = block("score_tutti_frutti_round").toLowerCase();
    expect(rpc).toContain("rounds.scored_at is null\n  returning rounds.scored_at");
    expect(rpc).toContain("sessions.finished_at is null\n    returning sessions.finished_at");
    expect(rpc).toContain("rooms.status = 'playing'\n    returning rooms.status");
    expect(rpc).toContain("using errcode = 'p0056'");
    expect(rpc).toContain("v_scored_round_count <> v_round_count");
  });

  it("authorizes historical reads from the frozen roster", () => {
    for (const name of ["get_tutti_frutti_round_result", "get_tutti_frutti_final_result"]) {
      const rpc = block(name).toLowerCase();
      expect(rpc).toContain("public.room_session_participants");
      expect(rpc).toContain("roster.player_id = v_actor_id");
    }
    expect(block("get_tutti_frutti_final_result").toLowerCase())
      .toContain("rank() over (order by session_points.total_points desc)");
  });

  it("keeps rematch blocked with an explicit Increment 16 marker", () => {
    const rpc = block("start_tutti_frutti_session");
    expect(rpc).toContain("Increment 16 replaces this");
    expect(rpc).toContain("errcode = 'P0055'");
  });

  it("keeps client table writes closed and grants only RPC execution", () => {
    expect(sql).toContain("grant execute on function public.get_tutti_frutti_final_result(uuid) to authenticated");
    expect(sql).toContain("grant execute on function public.get_tutti_frutti_postgame_state(uuid) to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*to authenticated/i);
  });
});
