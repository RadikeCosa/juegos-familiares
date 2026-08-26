import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260826120000_restrict_group_creation_to_platform_admin.sql"
  ),
  "utf8"
);

describe("restrict group creation to platform admins migration", () => {
  it("models platform admins minimally and keeps the table closed", () => {
    expect(migration).toContain("create table public.platform_admins");
    expect(migration).toContain("auth_user_id uuid primary key");
    expect(migration).toContain("references auth.users (id)");
    expect(migration).toContain(
      "alter table public.platform_admins enable row level security"
    );
    expect(migration).toContain(
      "revoke all on table public.platform_admins from anon, authenticated"
    );
    expect(migration).not.toContain("create policy");
  });

  it("checks platform admin status inside the authoritative group creation RPC", () => {
    expect(migration).toContain(
      "create or replace function public.is_platform_admin()"
    );
    expect(migration).toContain("where platform_admins.auth_user_id = auth.uid()");
    expect(migration).toContain(
      "create or replace function public.create_group_with_admin_player"
    );
    expect(migration).toContain("if not public.is_platform_admin() then");
    expect(migration).toContain("using errcode = '42501'");
  });

  it("exposes only a boolean permissions read for the frontend", () => {
    expect(migration).toContain(
      "create or replace function public.get_my_platform_permissions()"
    );
    expect(migration).toContain("can_create_groups boolean");
    expect(migration).toContain("select public.is_platform_admin()");
    expect(migration).toContain(
      "grant execute on function public.get_my_platform_permissions() to authenticated"
    );
  });

  it("does not change invitation join contracts", () => {
    expect(migration).not.toContain("create or replace function public.join_group_with_invitation");
    expect(migration).not.toContain("create or replace function public.resolve_group_invitation");
  });
});
