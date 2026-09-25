-- Increment 8: authoritative letter-skip window and frozen-roster vote.

alter table public.tutti_frutti_letter_candidates
  add column skip_deadline_at timestamptz;

update public.tutti_frutti_letter_candidates
set skip_deadline_at = case
  when status = 'pending' then clock_timestamp() + interval '5 seconds'
  else created_at + interval '5 seconds'
end;

alter table public.tutti_frutti_letter_candidates
  alter column skip_deadline_at set not null,
  alter column skip_deadline_at set default (clock_timestamp() + interval '5 seconds');

alter table public.tutti_frutti_letter_candidates
  add constraint tutti_frutti_letter_candidates_id_session_key unique (id, session_id);

create table public.tutti_frutti_letter_skip_votes (
  candidate_id uuid not null,
  session_id uuid not null,
  player_id uuid not null references public.players(id),
  voted_at timestamptz not null default clock_timestamp(),
  constraint tutti_frutti_letter_skip_votes_pkey primary key (candidate_id, player_id),
  constraint tutti_frutti_letter_skip_votes_candidate_session_fkey
    foreign key (candidate_id, session_id)
    references public.tutti_frutti_letter_candidates(id, session_id)
    on delete cascade,
  constraint tutti_frutti_letter_skip_votes_session_participant_fkey
    foreign key (session_id, player_id)
    references public.room_session_participants(session_id, player_id)
    on delete cascade
);

create index tutti_frutti_letter_skip_votes_session_idx
  on public.tutti_frutti_letter_skip_votes(session_id, candidate_id);

alter table public.tutti_frutti_letter_skip_votes enable row level security;
revoke all on table public.tutti_frutti_letter_skip_votes from public, anon, authenticated;

create or replace function public.get_tutti_frutti_game_state(target_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := auth.uid();
  current_player_id uuid;
  current_session_id uuid;
  current_round_id uuid;
  current_round_number integer;
  current_round_phase text;
  current_candidate_id uuid;
  current_candidate_status text;
  current_letter text;
  candidate_deadline timestamptz;
  room_status text;
  configured_round_count integer;
  letters_in_pool text[];
  participant_count integer;
  votes_count integer;
  votes_required integer;
  selected_letter_count integer;
  letters_remaining integer;
  rounds_remaining integer;
  current_player_voted boolean;
  result jsonb;
begin
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  select players.id into current_player_id
  from public.players
  where players.auth_user_id = current_auth_user_id;
  if current_player_id is null then
    raise exception 'La identidad no tiene un jugador asociado.' using errcode = 'P0031';
  end if;

  -- Lock order is Room -> shared Session -> Round -> candidate for every
  -- Increment 8 writer and lazy deadline resolution.
  select rooms.status into room_status
  from public.rooms
  where rooms.id = target_room_id and rooms.game_type = 'tutti_frutti'
  for update;
  if not found then
    raise exception 'La sala Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  select room_sessions.id into current_session_id
  from public.room_sessions
  where room_sessions.room_id = target_room_id
    and room_sessions.game_type = 'tutti_frutti'
    and room_sessions.finished_at is null
  for update;
  if current_session_id is null
    or not public.is_current_player_tutti_frutti_session_participant(current_session_id) then
    raise exception 'La sala Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;

  select tutti_frutti_sessions.round_count, tutti_frutti_sessions.letter_pool
    into configured_round_count, letters_in_pool
  from public.tutti_frutti_sessions
  where tutti_frutti_sessions.id = current_session_id
  for update;

  select rounds.id, rounds.round_number, rounds.phase
    into current_round_id, current_round_number, current_round_phase
  from public.tutti_frutti_rounds as rounds
  where rounds.session_id = current_session_id and rounds.round_number = 1
  for update;
  if current_round_id is null then
    raise exception 'No se pudo reconstruir la partida de Tutti Frutti.' using errcode = 'P0038';
  end if;

  select candidates.id, candidates.letter, candidates.status, candidates.skip_deadline_at
    into current_candidate_id, current_letter, current_candidate_status, candidate_deadline
  from public.tutti_frutti_letter_candidates as candidates
  where candidates.round_id = current_round_id and candidates.status in ('pending', 'accepted')
  order by candidates.created_at desc
  limit 1
  for update;
  if current_candidate_id is null then
    raise exception 'No se pudo reconstruir la partida de Tutti Frutti.' using errcode = 'P0038';
  end if;

  if current_candidate_status = 'pending'
    and current_round_phase = 'LETTER_PENDING'
    and clock_timestamp() >= candidate_deadline then
    update public.tutti_frutti_letter_candidates
      set status = 'accepted'
      where id = current_candidate_id;
    update public.tutti_frutti_rounds
      set phase = 'PLAYING'
      where id = current_round_id and phase = 'LETTER_PENDING';
    current_candidate_status := 'accepted';
    current_round_phase := 'PLAYING';
  end if;

  select count(*)::integer into participant_count
  from public.room_session_participants
  where room_session_participants.session_id = current_session_id;
  votes_required := (participant_count / 2) + 1;

  if current_candidate_status = 'pending' then
    select count(*)::integer into votes_count
    from public.tutti_frutti_letter_skip_votes
    where candidate_id = current_candidate_id;
    select exists (
      select 1 from public.tutti_frutti_letter_skip_votes
      where candidate_id = current_candidate_id and player_id = current_player_id
    ) into current_player_voted;
    select count(*)::integer into selected_letter_count
    from public.tutti_frutti_letter_candidates
    where session_id = current_session_id;
    letters_remaining := cardinality(letters_in_pool) - selected_letter_count;
    rounds_remaining := configured_round_count - current_round_number + 1;
  else
    votes_count := 0;
    current_player_voted := false;
    letters_remaining := cardinality(letters_in_pool) - (
      select count(*)::integer from public.tutti_frutti_letter_candidates
      where session_id = current_session_id
    );
    rounds_remaining := configured_round_count - current_round_number + 1;
  end if;

  select jsonb_build_object(
    'roomId', target_room_id,
    'roomStatus', room_status,
    'sessionId', current_session_id,
    'serverNow', clock_timestamp(),
    'startedByPlayerId', tutti_frutti_sessions.started_by_player_id,
    'roundCount', tutti_frutti_sessions.round_count,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', categories.position,
        'kind', categories.category_kind,
        'key', categories.preset_key,
        'label', categories.label
      ) order by categories.position)
      from public.tutti_frutti_session_categories as categories
      where categories.session_id = current_session_id
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', roster.player_id,
        'nickname', players.nickname
      ) order by roster.player_id)
      from public.room_session_participants as roster
      join public.players on players.id = roster.player_id
      where roster.session_id = current_session_id
    ), '[]'::jsonb),
    'round', jsonb_build_object(
      'number', current_round_number,
      'phase', current_round_phase,
      'letter', current_letter,
      'letterDecision', case when current_candidate_status = 'pending' then jsonb_build_object(
        'candidateId', current_candidate_id,
        'deadlineAt', candidate_deadline,
        'votes', votes_count,
        'votesRequired', votes_required,
        'hasVoted', current_player_voted,
        'canSkip', letters_remaining >= rounds_remaining
      ) else null end
    )
  ) into result
  from public.tutti_frutti_sessions
  where tutti_frutti_sessions.id = current_session_id;

  return result;
end;
$$;

create or replace function public.submit_tutti_frutti_letter_skip_vote(
  target_room_id uuid,
  target_candidate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := auth.uid();
  current_player_id uuid;
  current_session_id uuid;
  current_round_id uuid;
  current_round_number integer;
  current_round_phase text;
  candidate_session_id uuid;
  candidate_round_id uuid;
  candidate_status text;
  candidate_deadline timestamptz;
  configured_round_count integer;
  letters_in_pool text[];
  participant_count integer;
  votes_required integer;
  votes_count integer;
  selected_letter_count integer;
  letters_remaining integer;
  rounds_remaining integer;
  next_letter text;
  room_status text;
begin
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;
  select players.id into current_player_id
  from public.players where players.auth_user_id = current_auth_user_id;
  if current_player_id is null then
    raise exception 'La identidad no tiene un jugador asociado.' using errcode = 'P0031';
  end if;

  select rooms.status into room_status
  from public.rooms
  where rooms.id = target_room_id and rooms.game_type = 'tutti_frutti'
  for update;
  if not found or room_status <> 'playing' then
    raise exception 'La sala Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;
  select room_sessions.id into current_session_id
  from public.room_sessions
  where room_sessions.room_id = target_room_id
    and room_sessions.game_type = 'tutti_frutti'
    and room_sessions.finished_at is null
  for update;
  if current_session_id is null
    or not public.is_current_player_tutti_frutti_session_participant(current_session_id) then
    raise exception 'La sala Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;
  select tutti_frutti_sessions.round_count, tutti_frutti_sessions.letter_pool
    into configured_round_count, letters_in_pool
  from public.tutti_frutti_sessions
  where tutti_frutti_sessions.id = current_session_id
  for update;
  select rounds.id, rounds.round_number, rounds.phase
    into current_round_id, current_round_number, current_round_phase
  from public.tutti_frutti_rounds as rounds
  where rounds.session_id = current_session_id and rounds.round_number = 1
  for update;
  select candidates.session_id, candidates.round_id, candidates.status, candidates.skip_deadline_at
    into candidate_session_id, candidate_round_id, candidate_status, candidate_deadline
  from public.tutti_frutti_letter_candidates as candidates
  where candidates.id = target_candidate_id
  for update;

  if candidate_session_id is distinct from current_session_id
    or candidate_round_id is distinct from current_round_id then
    raise exception 'La letra ya cambio. Actualiza la partida.' using errcode = 'P0039';
  end if;
  if candidate_status = 'accepted' or current_round_phase = 'PLAYING' then
    return public.get_tutti_frutti_game_state(target_room_id);
  end if;
  if candidate_status <> 'pending' or current_round_phase <> 'LETTER_PENDING' then
    raise exception 'La letra ya cambio. Actualiza la partida.' using errcode = 'P0039';
  end if;
  if clock_timestamp() >= candidate_deadline then
    update public.tutti_frutti_letter_candidates set status = 'accepted'
    where id = target_candidate_id and status = 'pending';
    update public.tutti_frutti_rounds set phase = 'PLAYING'
    where id = current_round_id and phase = 'LETTER_PENDING';
    return public.get_tutti_frutti_game_state(target_room_id);
  end if;

  select count(*)::integer into participant_count
  from public.room_session_participants
  where session_id = current_session_id;
  votes_required := (participant_count / 2) + 1;
  select count(*)::integer into selected_letter_count
  from public.tutti_frutti_letter_candidates
  where session_id = current_session_id;
  letters_remaining := cardinality(letters_in_pool) - selected_letter_count;
  rounds_remaining := configured_round_count - current_round_number + 1;
  if letters_remaining < rounds_remaining then
    raise exception 'No se puede saltar esta letra y conservar una letra distinta para cada ronda restante.' using errcode = 'P0040';
  end if;

  insert into public.tutti_frutti_letter_skip_votes(candidate_id, session_id, player_id)
  values (target_candidate_id, current_session_id, current_player_id)
  on conflict (candidate_id, player_id) do nothing;

  select count(*)::integer into votes_count
  from public.tutti_frutti_letter_skip_votes
  where candidate_id = target_candidate_id;
  if votes_count >= votes_required then
    update public.tutti_frutti_letter_candidates set status = 'skipped'
    where id = target_candidate_id and status = 'pending';

    select choices.letter into next_letter
    from unnest(letters_in_pool) as choices(letter)
    where not exists (
      select 1 from public.tutti_frutti_letter_candidates as used
      where used.session_id = current_session_id and used.letter = choices.letter
    )
    order by random()
    limit 1;
    if next_letter is null then
      raise exception 'No hay una letra disponible para reemplazar la candidata.' using errcode = 'P0040';
    end if;

    insert into public.tutti_frutti_letter_candidates(
      id, session_id, round_id, letter, status
    ) values (
      extensions.gen_random_uuid(), current_session_id, current_round_id, next_letter, 'pending'
    );
  end if;

  return public.get_tutti_frutti_game_state(target_room_id);
end;
$$;

revoke all on function public.submit_tutti_frutti_letter_skip_vote(uuid, uuid) from public, anon;
grant execute on function public.submit_tutti_frutti_letter_skip_vote(uuid, uuid) to authenticated;
