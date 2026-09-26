import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260924140000_tutti_frutti_letter_skip_increment_8.sql"),
  "utf8"
);

function functionBlock(name: string) {
  const match = migration.match(new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?\\n\\$\\$;'));
  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[0];
}

describe("Increment 8 Tutti Frutti letter skip", () => {
  it("sets a five-second deadline for existing and newly created candidates", () => {
    expect(migration).toContain("add column skip_deadline_at timestamptz");
    expect(migration).toContain("clock_timestamp() + interval '5 seconds'");
    expect(migration).toContain("when status = 'pending'");
    expect(migration).toContain("alter column skip_deadline_at set not null");
  });

  it("keeps individual skip votes closed to direct client access", () => {
    expect(migration).toContain("create table public.tutti_frutti_letter_skip_votes");
    expect(migration).toContain("primary key (candidate_id, player_id)");
    expect(migration).toContain("room_session_participants(session_id, player_id)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.tutti_frutti_letter_skip_votes from public, anon, authenticated");
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*tutti_frutti_letter_skip_votes[^;]*authenticated/i);
  });

  it("resolves expired candidates from the authorized state read", () => {
    const read = functionBlock("get_tutti_frutti_game_state");
    expect(read).toMatch(/language plpgsql\s+volatile/i);
    expect(read).toContain("for update");
    expect(read).toContain("clock_timestamp() >= candidate_deadline");
    expect(read).toContain("set status = 'accepted'");
    expect(read).toContain("set phase = 'PLAYING'");
    expect(read).toContain("'serverNow', clock_timestamp()");
  });

  it("returns aggregate vote state without exposing voter identities", () => {
    const read = functionBlock("get_tutti_frutti_game_state");
    expect(read).toContain("'votes', votes_count");
    expect(read).toContain("'votesRequired', votes_required");
    expect(read).toContain("'hasVoted', current_player_voted");
    expect(read).toContain("'canSkip', letters_remaining >= rounds_remaining");
    expect(read).not.toContain("'voters'");
    expect(read).not.toContain("'voterNames'");
  });

  it("uses strict majority from the frozen roster and serializes the vote", () => {
    const vote = functionBlock("submit_tutti_frutti_letter_skip_vote");
    expect(vote).toContain("from public.room_session_participants");
    expect(vote).toContain("votes_required := (participant_count / 2) + 1");
    expect(vote).toContain("if votes_count >= votes_required then");
    expect(vote).toContain("on conflict (candidate_id, player_id) do nothing");
    expect(vote).toContain("for update");
  });

  it("requires enough unused session letters to finish every configured round", () => {
    const read = functionBlock("get_tutti_frutti_game_state");
    const vote = functionBlock("submit_tutti_frutti_letter_skip_vote");
    expect(read).toContain("cardinality(letters_in_pool) - selected_letter_count");
    expect(vote).toContain("rounds_remaining := configured_round_count - current_round_number + 1");
    expect(vote).toContain("if letters_remaining < rounds_remaining then");
    expect(vote).toContain("errcode = 'P0040'");
  });

  it("consumes skipped letters across the whole session and keeps the same round", () => {
    const vote = functionBlock("submit_tutti_frutti_letter_skip_vote");
    expect(vote).toContain("where used.session_id = current_session_id and used.letter = choices.letter");
    expect(vote).toContain("set status = 'skipped'");
    expect(vote).toContain("order by random()");
    expect(vote).not.toContain("set round_number");
  });

  it("grants only authenticated execution of the vote RPC", () => {
    expect(migration).toContain("revoke all on function public.submit_tutti_frutti_letter_skip_vote(uuid, uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.submit_tutti_frutti_letter_skip_vote(uuid, uuid) to authenticated");
  });
});
