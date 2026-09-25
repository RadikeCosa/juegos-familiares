import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(),
  "supabase/migrations/20260925100000_tutti_frutti_countdown_increment_10.sql"), "utf8");

describe("Tutti Frutti increment 10 migration", () => {
  it("keeps one server deadline and blocks expired writes before the cron sweep", () => {
    expect(migration).toContain("countdown_ends_at = started_at + interval '45 seconds'");
    expect(migration).toContain("and clock_timestamp() < current_countdown_deadline");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("and rounds.countdown_ends_at <= clock_timestamp()");
  });

  it("separates shared call metadata from private answers", () => {
    expect(migration).toContain("'calledByPlayerId', current_caller_id");
    expect(migration).toContain("'countdownEndsAt', current_countdown_deadline");
    expect(migration).not.toMatch(/grant select on (table )?public\.tutti_frutti_answers/i);
    expect(migration).toContain("revoke all on function public.lock_expired_tutti_frutti_rounds() from public, anon, authenticated");
  });

  it("bounds the one-second background job", () => {
    expect(migration).toContain("'1 second'");
    expect(migration).toContain("limit 32");
    expect(migration).toContain("statement_timeout = '750ms'");
  });
});
