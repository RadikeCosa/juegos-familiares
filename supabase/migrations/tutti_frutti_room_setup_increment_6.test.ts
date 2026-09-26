import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260924110000_tutti_frutti_room_setup_increment_6.sql"),
  "utf8"
);

function functionBlock(name: string) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[0];
}

describe("Increment 6 Tutti Frutti room setup", () => {
  it("stores one whole draft per Room and allows only member reads", () => {
    expect(migration).toContain("create table public.tutti_frutti_room_setup (");
    expect(migration).toContain("room_id uuid primary key");
    expect(migration).toContain("configuration jsonb not null");
    expect(migration).toContain("alter table public.tutti_frutti_room_setup enable row level security");
    expect(migration).toContain("grant select on table public.tutti_frutti_room_setup to authenticated");
    expect(migration).toContain("Tutti Frutti room members can read their setup");
    expect(migration).toContain("alter publication supabase_realtime add table public.tutti_frutti_room_setup");
    expect(migration).toContain("rooms.game_type = 'tutti_frutti'");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*tutti_frutti_room_setup[^;]*authenticated/i);
  });

  it("returns the unsaved defaults to members without restricting reads to lobby", () => {
    const helper = functionBlock("is_current_player_tutti_frutti_room_member");
    const read = functionBlock("get_tutti_frutti_room_setup");
    expect(helper).toContain("rooms.game_type = 'tutti_frutti'");
    expect(helper).not.toContain("rooms.status");
    expect(read).toContain("'roundCount', 5");
    expect(read).toContain("'key', 'name'");
    expect(read).toContain("'key', 'object'");
    expect(read).toContain("'updatedAt', null");
    expect(read).toContain("errcode = 'P0031'");
    expect(read).toContain("errcode = 'P0032'");
    expect(read).toContain("stable");
  });

  it("serializes host writes with Room state changes and validates the full config", () => {
    const save = functionBlock("save_tutti_frutti_room_setup");
    expect(save).toContain("for update");
    expect(save).toContain("room_host_player_id");
    expect(save).toContain("room_status <> 'lobby'");
    expect(save).toContain("on conflict (room_id) do update");
    expect(save).toContain("normalize(");
    expect(save).toContain("lower(category_label)");
    expect(save).toContain("when 'movie_or_series' then 'Película o serie'");
    expect(save).toContain("errcode = 'P0033'");
    expect(save).toContain("errcode = 'P0034'");
    expect(save).toContain("errcode = 'P0035'");
    expect(save).toContain("errcode = 'P0036'");
    expect(migration).toContain("grant execute on function public.save_tutti_frutti_room_setup(uuid, jsonb) to authenticated");
  });

  it("keeps privileged RPCs narrow and does not change Impostor lifecycle", () => {
    expect(migration).toContain("revoke all on function public.get_tutti_frutti_room_setup(uuid) from public, anon");
    expect(migration).toContain("revoke all on function public.save_tutti_frutti_room_setup(uuid, jsonb) from public, anon");
    expect(migration).not.toMatch(/update public\.(game_sessions|session_players|room_sessions|room_session_participants)/i);
    expect(migration).not.toMatch(/create policy[^;]+for\s+(insert|update|delete|all)/i);
  });
});
