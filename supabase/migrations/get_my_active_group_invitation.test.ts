import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260818120000_get_my_active_group_invitation.sql"
  ),
  "utf8"
);

describe("get my active group invitation migration", () => {
  it("creates a read-only admin invitation RPC without client identifiers", () => {
    expect(migration).toContain(
      "create or replace function public.get_my_active_group_invitation()"
    );
    expect(migration).toContain("returns table (\n  code text\n)");
    expect(migration).toContain("current_auth_user_id := auth.uid()");
    expect(migration).not.toMatch(
      /get_my_active_group_invitation\([^)]*(group_id|player_id|auth_user_id)/i
    );
  });

  it("checks the current player is the group admin before returning the code", () => {
    expect(migration).toContain("from public.players");
    expect(migration).toContain("join public.groups");
    expect(migration).toContain("groups.admin_player_id = players.id");
    expect(migration).toContain("join public.group_invitations");
    expect(migration).toContain("group_invitations.active = true");
    expect(migration).toContain("where players.auth_user_id = current_auth_user_id");
  });

  it("uses definer security and grants execute only to authenticated users", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "revoke all on function public.get_my_active_group_invitation() from public"
    );
    expect(migration).toContain(
      "grant execute on function public.get_my_active_group_invitation() to authenticated"
    );
    expect(migration).not.toContain("grant execute on function public.get_my_active_group_invitation() to anon");
  });
});
