import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260818140000_delete_my_group_word.sql"
  ),
  "utf8"
);

describe("delete my group word migration", () => {
  it("adds a minimal boolean delete RPC without ownership arguments", () => {
    expect(migration).toContain(
      "create or replace function public.delete_my_group_word(word_id uuid)"
    );
    expect(migration).toContain("returns boolean");
    expect(migration).not.toMatch(/delete_my_group_word\([^)]*(group_id|player_id|author_player_id|auth_user_id)/i);
  });

  it("derives Player and Group from auth.uid", () => {
    expect(migration).toContain("current_auth_user_id := auth.uid()");
    expect(migration).toContain("select players.id, players.group_id");
    expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
    expect(migration).toContain("using errcode = 'P0002'");
  });

  it("limits deletion to the current Player inside the current Group", () => {
    expect(migration).toContain("delete from public.group_words");
    expect(migration).toContain("where group_words.id = word_id");
    expect(migration).toContain("and group_words.group_id = current_group_id");
    expect(migration).toContain(
      "and group_words.author_player_id = current_player_id"
    );
    expect(migration).toContain("get diagnostics deleted_count = row_count");
    expect(migration).toContain("return deleted_count = 1");
  });

  it("uses security definer with a locked search path and narrow grants", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "revoke all on function public.delete_my_group_word(uuid) from public"
    );
    expect(migration).toContain(
      "grant execute on function public.delete_my_group_word(uuid) to authenticated"
    );
    expect(migration).not.toContain("grant delete on table public.group_words");
    expect(migration).not.toContain("create policy");
  });
});
