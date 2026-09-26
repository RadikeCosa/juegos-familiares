import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260921110000_tutti_frutti_lobby_presence_increment_2.sql"), "utf8");

describe("Tutti Frutti lobby Presence authorization", () => {
  it("accepts only game-matched Room topics for current members", () => {
    expect(migration).toContain("tutti-frutti-room-presence:");
    expect(migration).toContain("impostor-room-presence:");
    expect(migration).toContain("rooms.game_type = target_game_type");
    expect(migration).toContain("room_participants.room_id = target_room_id");
    expect(migration).toContain("players.auth_user_id = auth.uid()");
    expect(migration).toContain("rooms.status in ('lobby', 'playing')");
  });
});
