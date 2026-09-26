import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260921100000_game_aware_room_entry_increment_1.sql"),
  "utf8"
);

describe("game-aware Room entry migration", () => {
  it("retains Impostor-only legacy signatures and protects the typed RPCs", () => {
    expect(migration).toContain("public.create_room(requested_game_type text)");
    expect(migration).toContain("public.create_room('impostor'::text)");
    expect(migration).toContain("public.join_room_by_code(room_code text, expected_game_type text)");
    expect(migration).toContain("public.join_room_by_code(room_code, 'impostor'::text)");
    expect(migration).toContain("grant execute on function public.create_room(text) to authenticated");
    expect(migration).toContain("grant execute on function public.join_room_by_code(text, text) to authenticated");
  });

  it("enforces global active-room conflicts and checks Group before game identity", () => {
    expect(migration).toContain("using errcode = 'P0029'");
    expect(migration).toContain("using errcode = 'P0030'");
    expect(migration.indexOf("target_room_group_id <> current_group_id")).toBeLessThan(
      migration.indexOf("target_room_game_type <> expected_game_type")
    );
    expect(migration).toContain("game_sessions_require_impostor_room");
  });
});
