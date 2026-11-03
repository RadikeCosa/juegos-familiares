import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ranges from "../../lib/cadaver-exquisito/word-ranges.json";
const migration = readFileSync(`supabase/migrations/${readdirSync("supabase/migrations").find(n => n.endsWith("_cadaver_exquisito_v1.sql"))}`, "utf8");
describe("Cadáver migration contracts", () => {
  it("freezes exactly the same Unicode word characters in SQL and JavaScript", () => {
    const sqlRanges = "{" + ranges.map(([lo, hi]) => `[${lo},${hi+1})`).join(",") + "}";
    expect(migration).toContain(sqlRanges);
  });
  it("replicates only an opaque signal with RLS", () => {
    expect(migration).toContain("alter publication supabase_realtime add table public.cadaver_signals");
    expect(migration).toContain("alter table public.cadaver_signals enable row level security");
    expect(migration).not.toMatch(/add table cadaver_private/);
    expect(migration).toContain("using(cadaver_private.can_receive(room_id))");
  });
  it("schedules a private, overlapping-safe expiry sweep", () => {
    expect(migration).toContain("for update of rm skip locked");
    expect(migration).toContain("cron.schedule('cadaver-expire-rooms','*/15 * * * *','select cadaver_private.sweep_expired()')");
  });
  it("stores idempotency on contributions only and freezes authors", () => {
    expect(migration).toContain("primary key(session_id,turn_number), unique(session_id,operation_id)");
    expect(migration).toContain("delete from cadaver_private.contributions where session_id=sid");
    expect(migration).toContain("insert into public.room_session_participants");
    expect(migration).not.toMatch(/create table .*operations|hash\(/);
  });
});
