import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260818130000_create_group_words.sql"
  ),
  "utf8"
);

describe("group words migration", () => {
  it("creates GroupWord persistence with generated normalized text", () => {
    expect(migration).toContain("create table public.group_words");
    expect(migration).toContain("group_id uuid not null");
    expect(migration).toContain("text text not null");
    expect(migration).toContain(
      "normalized_text text generated always as (lower(text)) stored"
    );
    expect(migration).toContain("author_player_id uuid not null");
    expect(migration).toContain("created_at timestamptz not null default now()");
  });

  it("keeps author and group ownership coherent with a composite foreign key", () => {
    expect(migration).toContain("constraint group_words_group_id_fkey");
    expect(migration).toContain("references public.groups (id)");
    expect(migration).toContain(
      "constraint group_words_author_player_same_group_fkey"
    );
    expect(migration).toContain("foreign key (group_id, author_player_id)");
    expect(migration).toContain("references public.players (group_id, id)");
  });

  it("normalizes and validates words in Postgres", () => {
    expect(migration).toContain(
      "create or replace function public.canonicalize_group_word_text"
    );
    expect(migration).toContain(
      "create or replace function public.group_word_text_has_emoji"
    );
    expect(migration).toContain("char_length(text) between 2 and 40");
    expect(migration).toContain(
      "check (text = public.canonicalize_group_word_text(text))"
    );
    expect(migration).toContain("check (not public.group_word_text_has_emoji(text))");
  });

  it("enforces case-insensitive uniqueness inside each group", () => {
    expect(migration).toContain(
      "create unique index group_words_group_id_normalized_text_key"
    );
    expect(migration).toContain(
      "on public.group_words (group_id, normalized_text)"
    );
  });

  it("uses an authoritative RPC without accepting ownership identifiers", () => {
    expect(migration).toContain("create or replace function public.add_group_word");
    expect(migration).toContain(
      "create or replace function public.add_group_word(word_text text)"
    );
    expect(migration).toContain("current_auth_user_id := auth.uid()");
    expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
    expect(migration).toContain("set search_path = ''");
    expect(migration).not.toMatch(/add_group_word\([^)]*group_id/i);
    expect(migration).not.toMatch(/add_group_word\([^)]*author_player_id/i);
    expect(migration).not.toMatch(/add_group_word\([^)]*auth_user_id/i);
  });

  it("keeps table access closed and exposes only the add RPC", () => {
    expect(migration).toContain(
      "alter table public.group_words enable row level security"
    );
    expect(migration).toContain(
      "revoke all on table public.group_words from anon, authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.add_group_word(text) to authenticated"
    );
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("grant select on table public.group_words");
    expect(migration).not.toContain("grant insert on table public.group_words");
  });
});
