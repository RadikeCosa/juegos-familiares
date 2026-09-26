import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260924150000_tutti_frutti_answers_increment_9.sql"),
  "utf8"
);

function functionBlock(name: string) {
  const match = migration.match(new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?\\n\\$\\$;'));
  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[0];
}

describe("Increment 9 Tutti Frutti private answers", () => {
  it("stores one answer per frozen participant, round, and category snapshot", () => {
    expect(migration).toContain("create table public.tutti_frutti_answers");
    expect(migration).toContain("primary key (round_id, player_id, category_position)");
    expect(migration).toContain("foreign key (session_id, round_id)");
    expect(migration).toContain("foreign key (session_id, player_id)");
    expect(migration).toContain("foreign key (session_id, category_position)");
    expect(migration).toContain("answer_normalization_version smallint not null default 1");
  });

  it("closes answer rows to direct access and exposes only per-owner invalidation signals", () => {
    expect(migration).toContain("alter table public.tutti_frutti_answers enable row level security");
    expect(migration).toContain("revoke all on table public.tutti_frutti_answers from public, anon, authenticated");
    expect(migration).toContain("create table public.tutti_frutti_answer_signals");
    expect(migration).toContain("grant select on table public.tutti_frutti_answer_signals to authenticated");
    expect(migration).toContain("players.auth_user_id = auth.uid()");
    expect(migration).toContain("alter publication supabase_realtime add table public.tutti_frutti_answer_signals");
    expect(migration).not.toMatch(/answer_signals[^;]*original_text|answer_signals[^;]*normalized_value/i);
  });

  it("returns the current player's categories and answers without other players' rows", () => {
    const read = functionBlock("get_tutti_frutti_my_answers");
    expect(read).toContain("auth.uid()");
    expect(read).toContain("room_session_participants");
    expect(read).toContain("left join public.tutti_frutti_answers");
    expect(read).toContain("coalesce(answers.original_text, '')");
    expect(read).toContain("'normalizationVersion'");
    expect(read).not.toContain("normalized_value");
    expect(migration).toContain("grant execute on function public.get_tutti_frutti_my_answers(uuid) to authenticated");
  });

  it("derives answer ownership, checks PLAYING and the session category, then returns the persisted row", () => {
    const save = functionBlock("save_tutti_frutti_answer");
    expect(save).toContain("auth.uid()");
    expect(save).toContain("for update");
    expect(save).toContain("current_round_phase <> 'PLAYING'");
    expect(save).toContain("target_category_position");
    expect(save).toContain("on conflict (round_id, player_id, category_position) do update");
    expect(save).toContain("'answerText', saved_answer.original_text");
    expect(save).toContain("'updatedAt', saved_answer.updated_at");
    expect(save).toContain("errcode = 'P0041'");
    expect(save).toContain("errcode = 'P0042'");
    expect(save).toContain("errcode = 'P0043'");
  });

  it("uses one server normalization function and signals only changed writes", () => {
    const normalize = functionBlock("normalize_tutti_frutti_answer_v1");
    const save = functionBlock("save_tutti_frutti_answer");
    expect(normalize).toContain("normalize(input_value, NFC)");
    expect(normalize).toContain("lower(btrim(");
    expect(save).toContain("char_length(normalize(target_answer_text, NFC)) > 200");
    expect(save).toContain("current_normalized_answer = '' then '' else target_answer_text");
    expect(save).toContain("where answers.original_text is distinct from excluded.original_text");
    expect(save).toContain("revision = signals.revision + 1");
  });
});
