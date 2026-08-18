import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260814152000_create_group_invitations.sql"
  ),
  "utf8"
);

describe("group invitations migration", () => {
  it("adds one opaque active invitation per group", () => {
    expect(migration).toContain("create table public.group_invitations");
    expect(migration).toContain("group_id uuid not null");
    expect(migration).toContain("code text not null");
    expect(migration).toContain("active boolean not null default true");
    expect(migration).toContain("references public.groups (id)");
    expect(migration).toContain("where active");
    expect(migration).toContain("unique index group_invitations_code_key");
  });

  it("generates invitation codes inside Postgres with retry behavior", () => {
    expect(migration).toContain(
      "create or replace function public.generate_group_invitation_code"
    );
    expect(migration).toContain("extensions.gen_random_bytes(8)");
    expect(migration).toContain("for attempt in 1..8 loop");
    expect(migration).toContain("when unique_violation then");
  });

  it("keeps nickname uniqueness scoped to the group and normalized in Postgres", () => {
    expect(migration).toContain("nickname_normalized text");
    expect(migration).toContain("generated always as (lower(btrim(nickname))) stored");
    expect(migration).toContain("unique (group_id, nickname_normalized)");
  });

  it("uses authoritative RPCs without accepting group_id or auth_user_id", () => {
    expect(migration).toContain(
      "create or replace function public.resolve_group_invitation"
    );
    expect(migration).toContain(
      "create or replace function public.join_group_with_invitation"
    );
    expect(migration).toContain(
      "create or replace function public.join_group_with_invitation(\n  invitation_code text,\n  player_nickname text\n)"
    );
    expect(migration).toContain("current_auth_user_id := auth.uid()");
    expect(migration).toContain("set search_path = ''");
    expect(migration).not.toContain("auth_user_id uuid,");
  });

  it("keeps invitation table access closed to normal clients", () => {
    expect(migration).toContain(
      "alter table public.group_invitations enable row level security"
    );
    expect(migration).toContain(
      "revoke all on table public.group_invitations from anon, authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.resolve_group_invitation(text) to authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.join_group_with_invitation(text, text) to authenticated"
    );
    expect(migration).not.toContain("create policy");
  });
});
