import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { normalizeDictionaryDefinition } from "../../lib/supabase/dictionary";

const rows = JSON.parse(readFileSync("sources/games/dictionary/catalog/candidates.json", "utf8"));
describe("production dictionary catalogue", () => {
  it("contains 300 distinct reviewed entries with explicit assisted-review evidence", () => {
    expect(rows).toHaveLength(300);
    expect(new Set(rows.map((r: { word: string }) => r.word.normalize("NFC").toLocaleLowerCase("es"))).size).toBe(300);
    for (const row of rows) {
      expect(row.status).toBe("reviewed");
      expect(row.verification_status).toBe("verified");
      expect(row.review_kind).toBe("ai_assisted_authorized");
      expect(row.reviewed_by).toContain("IA autorizada");
      expect(Number.isFinite(Date.parse(row.reviewed_at))).toBe(true);
      expect(new URL(row.verification_reference).hostname).toBe("dle.rae.es");
      expect(row.review_notes.length).toBeGreaterThan(0);
      expect(row.definition).toBe(normalizeDictionaryDefinition(row.definition));
      expect([...row.definition].length).toBeLessThanOrEqual(300);
      expect(row.sense.trim().length).toBeGreaterThan(0);
    }
  });
  it("loads exactly the reviewed artifact in a separate migration before guarded activation", () => {
    const generated = execFileSync(process.execPath, ["supabase/scripts/dictionary-catalog-sql.mjs", "sources/games/dictionary/catalog/candidates.json"], {encoding: "utf8"});
    const catalogue = readFileSync("supabase/migrations/20261102235851_dictionary_reviewed_catalog.sql", "utf8");
    const activation = readFileSync("supabase/migrations/20261102235852_dictionary_enable.sql", "utf8");
    expect(catalogue.endsWith(generated)).toBe(true);
    expect(catalogue).not.toContain("set_enabled(true)");
    expect(activation).toContain("select dictionary_private.set_enabled(true)");
    expect(activation).not.toMatch(/insert into|update .*settings/i);
  });
});
