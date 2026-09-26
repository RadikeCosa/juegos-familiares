import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("./20260925160000_tutti_frutti_rematch_increment_16.sql", import.meta.url), "utf8"
);

function startBlock() {
  const marker = "function public.start_tutti_frutti_session";
  const start = sql.indexOf(marker);
  expect(start, "start RPC exists").toBeGreaterThanOrEqual(0);
  const declaration = Math.max(
    sql.lastIndexOf("create function ", start),
    sql.lastIndexOf("create or replace function ", start)
  );
  return sql.slice(declaration, sql.indexOf("\n$$;", start)).toLowerCase();
}

describe("Tutti Frutti increment 16 migration contract", () => {
  it("allows sequential sessions without rescanning finished history", () => {
    const rpc = startBlock();
    expect(rpc).toContain("rooms.status = 'lobby'");
    expect(rpc).toContain("room_sessions.finished_at is null");
    expect(rpc).not.toContain("room_sessions.finished_at is not null");
    expect(rpc).not.toContain("using errcode = 'p0055'");
  });

  it("returns the active game to the starter or current host on retry", () => {
    const rpc = startBlock();
    expect(rpc).toContain("target_status = 'playing'");
    expect(rpc).toContain("current_player_id is distinct from stored_starter_id");
    expect(rpc).toContain("current_player_id is distinct from target_host_player_id");
    expect(rpc).toContain("return public.get_tutti_frutti_game_state(target_room_id)");
  });

  it("separates setup errors from an unfinished session in a lobby", () => {
    const rpc = startBlock();
    expect(rpc).toContain("using errcode = 'p0038'");
    expect(rpc).toContain("using errcode = 'p0056'");
    expect(rpc).toContain("room_sessions.finished_at is null");
  });

  it("freezes a fresh roster and configuration in a new session", () => {
    const rpc = startBlock();
    expect(rpc).toContain("insert into public.room_sessions");
    expect(rpc).toContain("insert into public.room_session_participants");
    expect(rpc).toContain("insert into public.tutti_frutti_sessions");
    expect(rpc).toContain("insert into public.tutti_frutti_session_categories");
    expect(rpc).toContain("update public.rooms set status = 'playing'");
  });

  it("retains authenticated-only execution", () => {
    expect(sql).toContain("revoke all on function public.start_tutti_frutti_session(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.start_tutti_frutti_session(uuid) to authenticated");
  });
});
