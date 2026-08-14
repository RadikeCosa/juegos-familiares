import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260814122000_create_groups_players.sql"
  ),
  "utf8"
);

describe("groups and players migration", () => {
  it("keeps group admin and player membership coherent with deferrable constraints", () => {
    expect(migration).toContain("admin_player_id uuid not null");
    expect(migration).toContain("unique (group_id, id)");
    expect(migration).toContain(
      "constraint groups_admin_player_same_group_fkey"
    );
    expect(migration).toContain("foreign key (id, admin_player_id)");
    expect(migration).toContain("references public.players (group_id, id)");
    expect(migration).toContain("deferrable initially deferred");
  });

  it("links AuthIdentity to one Player without making it product UI data", () => {
    expect(migration).toContain("auth_user_id uuid not null");
    expect(migration).toContain("unique (auth_user_id)");
    expect(migration).toContain("references auth.users (id)");
  });

  it("uses RLS with a security definer membership helper and no direct write policies", () => {
    expect(migration).toContain(
      "create or replace function public.is_group_player"
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("alter table public.groups enable row level security");
    expect(migration).toContain("alter table public.players enable row level security");
    expect(migration).toContain("for select");
    expect(migration).not.toContain("for insert");
    expect(migration).not.toContain("for update");
    expect(migration).not.toContain("for delete");
  });

  it("derives identity inside the authoritative RPC", () => {
    expect(migration).toContain(
      "create or replace function public.create_group_with_admin_player"
    );
    expect(migration).toContain("current_auth_user_id := auth.uid()");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "grant execute on function public.create_group_with_admin_player(text, text)"
    );
    expect(migration).not.toContain("auth_user_id text");
    expect(migration).not.toContain("auth_user_id uuid,");
  });
});
