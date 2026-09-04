import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260904190000_avoid_impostor_starting_ties.sql",
  ),
  "utf8",
);

function functionBlock(functionName: string) {
  const match = migration.match(
    new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  );

  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[0];
}

describe("avoid impostor starting ties migration", () => {
  it.each(["start_session", "start_next_round"])(
    "keeps start-count balance first and deprioritizes the selected impostor in %s",
    (functionName) => {
      const block = functionBlock(functionName);

      expect(block).toContain(
        "count(rounds.id) asc,\n    (session_players.player_id = selected_impostor_player_id) asc,\n    random()",
      );
    },
  );

  it("keeps both round-creating operations server-controlled and authenticated", () => {
    expect(functionBlock("start_session")).toContain(
      "create or replace function public.start_session()",
    );
    expect(functionBlock("start_next_round")).toContain(
      "create or replace function public.start_next_round()",
    );
    expect(migration).toContain(
      "grant execute on function public.start_session() to authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.start_next_round() to authenticated",
    );
  });
});
