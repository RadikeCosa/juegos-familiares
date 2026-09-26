import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20260925120000_tutti_frutti_challenges_increment_12.sql", import.meta.url), "utf8");
function block(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const alternate = sql.indexOf(`create function public.${name}`);
  const offset = start >= 0 ? start : alternate;
  expect(offset, `${name} exists`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", offset);
  return sql.slice(offset, end);
}

describe("Tutti Frutti increment 12 migration contract", () => {
  it("constrains each challenge to the frozen session roster and one challenge per answer/round", () => {
    expect(sql).toContain("references public.room_session_participants(session_id, player_id)");
    expect(sql).toContain("tutti_frutti_challenges_one_open_per_round_key");
    expect(sql).toContain("tutti_frutti_challenges_one_per_answer_key");
    expect(sql).toContain("check (answer_player_id <> challenger_player_id)");
    expect(sql).toContain("deadline_at = opened_at + interval '30 seconds'");
  });

  it("keeps votes private and invalidation signals roster and review gated", () => {
    expect(sql).toContain("alter table public.tutti_frutti_challenge_votes enable row level security");
    expect(sql).toContain("revoke all on table public.tutti_frutti_challenge_votes from public, anon, authenticated");
    expect(sql).toContain("can_read_tutti_frutti_review_signal(session_id, round_id)");
    expect(sql).toContain("authenticated");
  });

  it("uses Room, session, game session, round, challenge, then vote locking", () => {
    for (const name of ["open_tutti_frutti_challenge", "vote_tutti_frutti_challenge"]) {
      const rpc = block(name).toLowerCase();
      const lockQueries = ["public.rooms", "public.room_sessions", "public.tutti_frutti_sessions",
        "public.tutti_frutti_rounds"];
      const locks = lockQueries.map((table) => {
        const position = rpc.indexOf("from " + table);
        return rpc.indexOf("for update", position);
      });
      expect(locks.every((position) => position >= 0), `${name} locks every layer`).toBe(true);
      expect(locks).toEqual([...locks].sort((a, b) => a - b));
      if (name === "vote_tutti_frutti_challenge") {
        const challengeLock = rpc.indexOf("for update", rpc.indexOf("from public.tutti_frutti_challenges"));
        expect(challengeLock).toBeGreaterThan(locks[3]);
        expect(rpc.indexOf("from public.tutti_frutti_challenge_votes", challengeLock)).toBeGreaterThan(challengeLock);
      } else {
        expect(rpc.indexOf("insert into public.tutti_frutti_challenges", locks[3])).toBeGreaterThan(locks[3]);
        expect(rpc.indexOf("insert into public.tutti_frutti_challenge_votes", locks[3])).toBeGreaterThan(locks[3]);
      }
    }
  });

  it("starts the 30-second deadline after acquiring the review locks", () => {
    const opener = block("open_tutti_frutti_challenge");
    const roundLock = opener.indexOf("for update", opener.indexOf("from public.tutti_frutti_rounds"));
    const openClock = opener.indexOf("v_opened_at := clock_timestamp()");
    const insert = opener.indexOf("insert into public.tutti_frutti_challenges");
    expect(roundLock).toBeGreaterThanOrEqual(0);
    expect(openClock).toBeGreaterThan(roundLock);
    expect(insert).toBeGreaterThan(openClock);
  });

  it("resolves both majority directions early and separates two-player agreement", () => {
    const resolver = block("resolve_tutti_frutti_challenge_locked");
    expect(resolver).toContain("if v_roster_count = 2 then");
    expect(resolver).toContain("v_author_choice = 'INVALID'");
    expect(resolver).toContain("v_invalid_count >= v_invalid_required");
    expect(resolver).toContain("v_invalid_count + (v_eligible_count - v_vote_count) < v_invalid_required");
    expect(resolver).toContain("clock_timestamp() >= v_challenge.deadline_at");
  });

  it("extends one bounded existing cron job and uses an advisory guard", () => {
    expect(sql).toContain("pg_try_advisory_xact_lock(74112012)");
    expect(sql).toContain("limit 16");
    expect(sql).toContain("'tutti-frutti-lock-expired-rounds', '1 second'");
    expect(sql).not.toContain("tutti-frutti-challenge-resolution");
  });

  it("returns only the caller's ballot, the active target, and final per-answer status", () => {
    const reader = block("get_tutti_frutti_review");
    expect(reader).toContain("'myVote'");
    expect(reader).toContain("'canVote'");
    expect(reader).toContain("'challengeStatus'");
    expect(reader).toContain("'deadlineAt'");
    expect(reader).not.toContain("'invalidCount'");
    expect(reader).not.toContain("'validCount'");
    expect(reader).not.toContain("'normalizedValue'");
  });
});
