import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20260925140000_tutti_frutti_next_round_increment_14.sql", import.meta.url), "utf8");
function block(name: string) {
  const marker = `function public.${name}`;
  const start = sql.indexOf(marker);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const declarationStart = Math.max(sql.lastIndexOf("create function ", start), sql.lastIndexOf("create or replace function ", start));
  return sql.slice(declarationStart, sql.indexOf("\n$$;", start));
}

describe("Tutti Frutti increment 14 migration contract", () => {
  it("advances under Room, Session, Tutti Session, Round locks and only for the current host", () => {
    const rpc = block("advance_tutti_frutti_round").toLowerCase();
    const locks = ["public.rooms", "public.room_sessions", "public.tutti_frutti_sessions", "public.tutti_frutti_rounds"]
      .map(table => rpc.indexOf("for update", rpc.indexOf("from " + table)));
    expect(locks.every(position => position >= 0)).toBe(true);
    expect(locks).toEqual([...locks].sort((a, b) => a - b));
    expect(rpc).toContain("v_host_id is distinct from v_actor_id");
    expect(rpc).toContain("v_latest_number = v_base_number + 1");
    expect(rpc).toContain("v_latest_scored_at is null");
    expect(rpc).toContain("v_base_number >= v_round_count");
  });

  it("selects the latest round for recovery and letter-skip voting", () => {
    for (const name of ["get_tutti_frutti_game_state", "submit_tutti_frutti_letter_skip_vote"]) {
      const rpc = block(name).toLowerCase();
      expect(rpc).toContain("order by rounds.round_number desc limit 1");
      expect(rpc).not.toContain("round_number = 1");
    }
    expect(block("get_tutti_frutti_game_state")).toContain("'id', current_round_id");
  });

  it("chooses an unused letter, rejects exhaustion, and signals the roster after creation", () => {
    const rpc = block("advance_tutti_frutti_round");
    expect(rpc).toContain("where used.session_id = v_session_id and used.letter = choices.letter");
    expect(rpc).toContain("errcode = 'P0051'");
    expect(rpc).toContain("touch_tutti_frutti_review_signal(v_session_id, v_base_id)");
  });

  it("keeps a historical result cumulative only through that scored round", () => {
    expect(block("get_tutti_frutti_round_result")).toContain(
      "filter (where rounds.round_number <= v_round_number)");
  });
});
