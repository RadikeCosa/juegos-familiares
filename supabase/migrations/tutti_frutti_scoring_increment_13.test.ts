import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20260925130000_tutti_frutti_scoring_increment_13.sql", import.meta.url), "utf8");
function block(name: string) {
  const start = sql.indexOf(`create function public.${name}`);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("\n$$;", start));
}

describe("Tutti Frutti increment 13 migration contract", () => {
  it("stores only the allowed point values and makes scored snapshots immutable", () => {
    expect(sql).toContain("awarded_points in (0, 5, 10)");
    expect(sql).toContain("add column scored_at timestamptz");
    expect(sql).toContain("tutti_frutti_answers_scored_immutable");
    expect(sql).toContain("tutti_frutti_rounds_scored_immutable");
    expect(sql).toContain("(phase = 'RESULT') = (scored_at is not null)");
  });

  it("serializes scoring in Room, shared Session, Tutti Session, Round order and guards host/open challenges", () => {
    const rpc = block("score_tutti_frutti_round").toLowerCase();
    const lockQueries = ["public.rooms", "public.room_sessions", "public.tutti_frutti_sessions",
      "public.tutti_frutti_rounds"];
    const locks = lockQueries.map((table) => rpc.indexOf("for update", rpc.indexOf("from " + table)));
    expect(locks.every((position) => position >= 0)).toBe(true);
    expect(locks).toEqual([...locks].sort((a, b) => a - b));
    expect(rpc).toContain("v_host_player_id is distinct from v_actor_id");
    expect(rpc).toContain("challenges.status = 'open'");
  });

  it("retries the exact round through its immutable result and calculates final-valid duplicates", () => {
    const scorer = block("score_tutti_frutti_round");
    expect(scorer).toContain("if v_scored_at is not null");
    expect(scorer).toContain("get_tutti_frutti_round_result(target_room_id, v_round_id)");
    expect(scorer).toContain("count(*) filter (where answer_validity.is_valid");
    expect(scorer).toContain("when duplicate_counts.duplicate_count > 1 then 5 else 10");
    expect(scorer).toContain("set phase = 'RESULT', scored_at = v_scored_at");
  });

  it("returns the whole roster, missing answers as zero, and grouped round/game totals", () => {
    const reader = block("get_tutti_frutti_round_result");
    expect(reader).toContain("cross join public.room_session_participants");
    expect(reader).toContain("left join public.tutti_frutti_answers");
    expect(reader).toContain("coalesce(answers.awarded_points, 0)");
    expect(reader).toContain("group by roster.player_id, players.nickname");
    expect(reader).toContain("'roundPoints'");
    expect(reader).toContain("'totalPoints'");
  });

  it("opens roster-filtered review invalidations after transition to RESULT", () => {
    expect(sql).toContain("rounds.phase in ('REVIEWING', 'RESULT')");
    expect(sql).toContain("grant execute on function public.score_tutti_frutti_round(uuid, uuid) to authenticated");
    expect(sql).toContain("revoke all on function public.score_tutti_frutti_round(uuid, uuid) from public, anon");
  });
});
