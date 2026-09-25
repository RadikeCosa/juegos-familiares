-- Increment 10: one authoritative countdown and an autonomous answer lock.
create extension if not exists pg_cron;

alter table public.tutti_frutti_rounds
  drop constraint tutti_frutti_rounds_phase_check;
alter table public.tutti_frutti_rounds
  add constraint tutti_frutti_rounds_phase_check
  check (phase in ('LETTER_PENDING', 'PLAYING', 'FINAL_COUNTDOWN', 'LOCKED', 'REVIEWING', 'RESULT'));
alter table public.tutti_frutti_rounds
  add column countdown_started_at timestamptz,
  add column countdown_ends_at timestamptz,
  add column called_by_player_id uuid,
  add column locked_at timestamptz,
  add constraint tutti_frutti_rounds_countdown_check check (
    (countdown_started_at is null and countdown_ends_at is null and called_by_player_id is null and locked_at is null)
    or (countdown_started_at is not null and countdown_ends_at = countdown_started_at + interval '45 seconds'
      and called_by_player_id is not null and (locked_at is null or locked_at >= countdown_ends_at))
  ),
  add constraint tutti_frutti_rounds_caller_fkey
    foreign key (session_id, called_by_player_id)
    references public.room_session_participants(session_id, player_id);

create index tutti_frutti_rounds_due_countdown_idx
  on public.tutti_frutti_rounds (countdown_ends_at)
  where phase = 'FINAL_COUNTDOWN';

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
  current_countdown_deadline timestamptz;
  current_caller_id uuid;
  current_locked_at timestamptz;
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

  select rounds.id, rounds.round_number, rounds.phase, rounds.countdown_ends_at, rounds.called_by_player_id, rounds.locked_at
    into current_round_id, current_round_number, current_round_phase, current_countdown_deadline, current_caller_id, current_locked_at
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
      'countdownEndsAt', current_countdown_deadline,
      'calledByPlayerId', current_caller_id,
      'lockedAt', current_locked_at,
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


create or replace function public.save_tutti_frutti_answer(
  target_room_id uuid,
  target_category_position integer,
  target_answer_text text
)
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
  current_room_status text;
  current_round_id uuid;
  current_round_number integer;
  current_round_phase text;
  current_countdown_deadline timestamptz;
  current_answer text;
  current_normalized_answer text;
  saved_answer public.tutti_frutti_answers%rowtype;
  answer_changed boolean := false;
begin
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  if target_answer_text is null
    or char_length(normalize(target_answer_text, NFC)) > 200 then
    raise exception 'La respuesta debe tener como maximo 200 puntos de codigo Unicode.' using errcode = 'P0041';
  end if;

  select players.id into current_player_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null then
    raise exception 'La identidad no tiene un jugador asociado.' using errcode = 'P0031';
  end if;

  select rooms.status into current_room_status
  from public.rooms
  where rooms.id = target_room_id
    and rooms.game_type = 'tutti_frutti'
  for update;

  if not found then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  if current_room_status <> 'playing' then
    raise exception 'La sala ya no esta en juego.' using errcode = 'P0042';
  end if;

  select room_sessions.id into current_session_id
  from public.room_sessions
  where room_sessions.room_id = target_room_id
    and room_sessions.game_type = 'tutti_frutti'
    and room_sessions.finished_at is null
  for update;

  if current_session_id is null
    or not exists (
      select 1 from public.room_session_participants
      where room_session_participants.session_id = current_session_id
        and room_session_participants.player_id = current_player_id
    ) then
    raise exception 'La partida de Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;

  select rounds.id, rounds.round_number, rounds.phase, rounds.countdown_ends_at
    into current_round_id, current_round_number, current_round_phase, current_countdown_deadline
  from public.tutti_frutti_rounds as rounds
  where rounds.session_id = current_session_id
  order by rounds.round_number desc
  limit 1
  for update;

  if current_round_id is null or not (
    current_round_phase = 'PLAYING' or (
      current_round_phase = 'FINAL_COUNTDOWN'
      and clock_timestamp() < current_countdown_deadline
    )
  ) then
    raise exception 'La ronda ya no acepta cambios.' using errcode = 'P0042';
  end if;

  if target_category_position is null or not exists (
    select 1 from public.tutti_frutti_session_categories as categories
    where categories.session_id = current_session_id
      and categories.position = target_category_position
  ) then
    raise exception 'La categoria no pertenece a la sesion activa.' using errcode = 'P0043';
  end if;

  current_normalized_answer := public.normalize_tutti_frutti_answer_v1(target_answer_text);
  current_answer := case when current_normalized_answer = '' then '' else target_answer_text end;

  insert into public.tutti_frutti_answers as answers (
    session_id, round_id, player_id, category_position,
    original_text, normalized_value, updated_at
  ) values (
    current_session_id, current_round_id, current_player_id, target_category_position,
    current_answer, current_normalized_answer, clock_timestamp()
  )
  on conflict (round_id, player_id, category_position) do update
    set original_text = excluded.original_text,
        normalized_value = excluded.normalized_value,
        updated_at = clock_timestamp()
    where answers.original_text is distinct from excluded.original_text
       or answers.normalized_value is distinct from excluded.normalized_value
  returning answers.* into saved_answer;

  if found then
    answer_changed := true;
  else
    select answers.* into saved_answer
    from public.tutti_frutti_answers as answers
    where answers.round_id = current_round_id
      and answers.player_id = current_player_id
      and answers.category_position = target_category_position;
  end if;

  if answer_changed then
    insert into public.tutti_frutti_answer_signals as signals (
      session_id, player_id, revision, updated_at
    ) values (
      current_session_id, current_player_id, 1, clock_timestamp()
    )
    on conflict (session_id, player_id) do update
      set revision = signals.revision + 1,
          updated_at = clock_timestamp();
  end if;

  return jsonb_build_object(
    'roomId', target_room_id,
    'sessionId', current_session_id,
    'roundId', current_round_id,
    'roundNumber', current_round_number,
    'categoryPosition', target_category_position,
    'answerText', saved_answer.original_text,
    'updatedAt', saved_answer.updated_at
  );
end;
$$;

revoke all on function public.save_tutti_frutti_answer(uuid, integer, text) from public, anon;
grant execute on function public.save_tutti_frutti_answer(uuid, integer, text) to authenticated;

create or replace function public.call_tutti_frutti(target_room_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  actor_id uuid;
  current_session_id uuid;
  current_round_id uuid;
  round_phase text;
  category_count integer;
  completed_count integer;
  started_at timestamptz;
begin
  select players.id into actor_id from public.players
  where players.auth_user_id = auth.uid();
  if actor_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  -- Every gameplay writer takes Room -> shared Session -> Round -> Answer -> Signal.
  perform 1 from public.rooms
  where id = target_room_id and game_type = 'tutti_frutti' and status = 'playing'
  for update;
  if not found then
    raise exception 'La partida no esta disponible.' using errcode = 'P0032';
  end if;
  select id into current_session_id from public.room_sessions
  where room_id = target_room_id and game_type = 'tutti_frutti' and finished_at is null
  for update;
  if current_session_id is null or not exists (
    select 1 from public.room_session_participants
    where room_session_participants.session_id = current_session_id
      and player_id = actor_id
  ) then
    raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;
  perform 1 from public.tutti_frutti_sessions
  where id = current_session_id for update;
  select id, phase into current_round_id, round_phase from public.tutti_frutti_rounds
  where tutti_frutti_rounds.session_id = current_session_id
  order by round_number desc limit 1 for update;
  if round_phase = 'FINAL_COUNTDOWN' or round_phase = 'REVIEWING' then
    return public.get_tutti_frutti_game_state(target_room_id);
  end if;
  if round_phase <> 'PLAYING' then
    raise exception 'La ronda no acepta llamadas.' using errcode = 'P0042';
  end if;

  select count(*) into category_count from public.tutti_frutti_session_categories
  where tutti_frutti_session_categories.session_id = current_session_id;
  select count(*) into completed_count from public.tutti_frutti_answers
  where tutti_frutti_answers.round_id = current_round_id
    and player_id = actor_id and normalized_value <> '';
  if completed_count <> category_count then
    raise exception 'Completa y guarda todas las categorias antes de llamar.' using errcode = 'P0044';
  end if;

  started_at := clock_timestamp();
  update public.tutti_frutti_rounds
  set phase = 'FINAL_COUNTDOWN', countdown_started_at = started_at,
      countdown_ends_at = started_at + interval '45 seconds', called_by_player_id = actor_id
  where id = current_round_id;
  return public.get_tutti_frutti_game_state(target_room_id);
end;
$$;
revoke all on function public.call_tutti_frutti(uuid) from public, anon;
grant execute on function public.call_tutti_frutti(uuid) to authenticated;

create or replace function public.lock_expired_tutti_frutti_rounds()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  candidate record;
  locked_count integer := 0;
  active_session_id uuid;
begin
  -- Discovery is read-only. Acquire Room first and skip contention; then Session and Round.
  for candidate in
    select rounds.id as round_id, sessions.room_id
    from public.tutti_frutti_rounds as rounds
    join public.room_sessions as sessions on sessions.id = rounds.session_id
    where rounds.phase = 'FINAL_COUNTDOWN'
      and rounds.countdown_ends_at <= clock_timestamp()
    order by rounds.countdown_ends_at, rounds.id limit 32
  loop
    perform 1 from public.rooms
    where id = candidate.room_id and game_type = 'tutti_frutti' and status = 'playing'
    for update skip locked;
    if not found then continue; end if;
    select id into active_session_id from public.room_sessions
    where room_id = candidate.room_id and game_type = 'tutti_frutti' and finished_at is null
    for update;
    if active_session_id is null then continue; end if;
    perform 1 from public.tutti_frutti_sessions
    where id = active_session_id for update;
    update public.tutti_frutti_rounds as rounds
      set phase = 'REVIEWING', locked_at = clock_timestamp()
      where rounds.id = candidate.round_id and rounds.session_id = active_session_id
        and rounds.phase = 'FINAL_COUNTDOWN'
        and rounds.countdown_ends_at <= clock_timestamp();
    if found then locked_count := locked_count + 1; end if;
  end loop;
  return locked_count;
end;
$$;
revoke all on function public.lock_expired_tutti_frutti_rounds() from public, anon, authenticated;

select cron.schedule(
  'tutti-frutti-lock-expired-rounds', '1 second',
  $$set statement_timeout = '750ms'; select public.lock_expired_tutti_frutti_rounds()$$
);

select cron.schedule(
  'tutti-frutti-cron-history-retention', '0 3 * * *',
  $$delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'tutti-frutti-lock-expired-rounds')
      and end_time < now() - interval '7 days'$$
);
