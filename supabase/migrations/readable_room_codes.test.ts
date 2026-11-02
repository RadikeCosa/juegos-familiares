import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20261102195643_readable_room_codes.sql", import.meta.url), "utf8");
const words = [...sql.split("words constant text[] := array[")[1].split("];", 1)[0].matchAll(/'([A-Z]+)'/g)].map((match) => match[1]);

describe("readable room codes migration", () => {
  it("versions exactly 512 distinct, short ASCII words", () => {
    expect(words).toHaveLength(512);
    expect(new Set(words).size).toBe(512);
    expect(words.every((word) => /^[A-Z]{3,7}$/.test(word))).toBe(true);
  });

  it("keeps lookup independent of the generation catalog and the unique index intact", () => {
    expect(sql).toContain("join_code ~ '^[A-HJ-NP-Z2-9]{8}$'");
    expect(sql).toContain("join_code ~ '^[A-Z]{3,7}-[A-Z]{3,7}$'");
    expect(sql).not.toMatch(/drop\s+(unique\s+)?index/i);
    expect(sql).not.toMatch(/update\s+public\.rooms/i);
    expect(sql).toContain("normalized_code := public.normalize_room_join_code(room_code)");
    expect(sql).toContain("for attempt in 1..8 loop");
    expect(sql).toContain("using errcode = 'P0057'");
  });

  it("keeps internal helpers inaccessible to clients", () => {
    expect(sql).toContain("revoke all on function public.normalize_room_join_code(text) from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.generate_room_join_code() from public, anon, authenticated");
    expect(sql).toContain("target_room_id is null or target_room_group_id <> current_group_id");
  });
});
