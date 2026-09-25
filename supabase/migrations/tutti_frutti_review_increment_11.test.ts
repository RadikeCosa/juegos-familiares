import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(),
  "supabase/migrations/20260925110000_tutti_frutti_review_increment_11.sql"), "utf8");

describe("Tutti Frutti increment 11 migration", () => {
  it("gates the review read on the frozen roster and committed lock", () => {
    expect(migration).toContain("roster.session_id = current_session_id and roster.player_id = actor_id");
    expect(migration).toContain("current_phase <> 'REVIEWING' or current_locked_at is null");
    expect(migration).toContain("stable");
  });

  it("returns original text and provisional groups without raw normalized values", () => {
    expect(migration).toContain("'answerText', marked.answer_text");
    expect(migration).toContain("'duplicateGroupId'");
    expect(migration).not.toMatch(/'normalizedValue'\s*,/);
    expect(migration).not.toMatch(/grant select on (table )?public\.tutti_frutti_answers/i);
  });
});
