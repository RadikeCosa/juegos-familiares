import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260818133000_add_group_word_reads.sql"
  ),
  "utf8"
);

describe("group word reads migration", () => {
  it("adds count and own-list RPCs without ownership arguments", () => {
    expect(migration).toContain(
      "create or replace function public.get_my_group_word_count()"
    );
    expect(migration).toContain(
      "create or replace function public.list_my_group_words()"
    );
    expect(migration).not.toMatch(/get_my_group_word_count\([^)]*(group_id|player_id|author_player_id|auth_user_id)/i);
    expect(migration).not.toMatch(/list_my_group_words\([^)]*(group_id|player_id|author_player_id|auth_user_id)/i);
  });

  it("derives Player and Group from auth.uid inside both RPCs", () => {
    expect(migration).toContain("current_auth_user_id := auth.uid()");
    expect(migration).toContain("select players.id, players.group_id");
    expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
    expect(migration).toContain("using errcode = 'P0002'");
  });

  it("counts all words in the current Player group", () => {
    expect(migration).toContain("returns table (\n  total_count bigint\n)");
    expect(migration).toContain("select count(*)::bigint");
    expect(migration).toContain("where group_words.group_id = current_group_id");
  });

  it("lists only the current Player contributions with a deterministic order", () => {
    expect(migration).toContain(
      "create or replace function public.list_my_group_words()\nreturns table (\n  id uuid,\n  text text,\n  created_at timestamptz\n)"
    );
    expect(migration).toContain("and group_words.author_player_id = current_player_id");
    expect(migration).toContain(
      "order by group_words.created_at desc, group_words.id desc"
    );
  });

  it("uses security definer functions with a locked search path and narrow grants", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "revoke all on function public.get_my_group_word_count() from public"
    );
    expect(migration).toContain(
      "revoke all on function public.list_my_group_words() from public"
    );
    expect(migration).toContain(
      "grant execute on function public.get_my_group_word_count() to authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.list_my_group_words() to authenticated"
    );
    expect(migration).not.toContain("grant select on table public.group_words");
    expect(migration).not.toContain("create policy");
  });
});
