-- Increment 14: advance from a scored round to one fresh, unused letter.

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
  where rounds.session_id = current_session_id
  order by rounds.round_number desc limit 1
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
      'id', current_round_id,
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
  where rounds.session_id = current_session_id
  order by rounds.round_number desc limit 1
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

create or replace function public.get_tutti_frutti_round_result(target_room_id uuid, target_round_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_session_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_scored_at timestamptz;
  v_categories jsonb;
  v_totals jsonb;
begin
  select players.id into v_actor_id from public.players as players
    where players.auth_user_id = auth.uid();
  if v_actor_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;
  if not exists (select 1 from public.rooms as rooms
      where rooms.id = target_room_id and rooms.game_type = 'tutti_frutti' and rooms.status = 'playing') then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;
  select sessions.id into v_session_id from public.room_sessions as sessions
    where sessions.room_id = target_room_id and sessions.game_type = 'tutti_frutti'
      and sessions.finished_at is null;
  if v_session_id is null or not exists (select 1 from public.room_session_participants as roster
      where roster.session_id = v_session_id and roster.player_id = v_actor_id) then
    raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;
  select rounds.id, rounds.round_number, rounds.scored_at
    into v_round_id, v_round_number, v_scored_at
    from public.tutti_frutti_rounds as rounds where rounds.session_id = v_session_id
      and (target_round_id is null or rounds.id = target_round_id)
    order by rounds.round_number desc limit 1;
  if v_round_id is null or v_scored_at is null then
    raise exception 'El resultado de la ronda todavia no esta disponible.' using errcode = 'P0042';
  end if;

  with answer_rows as (
    select categories.position, categories.label, roster.player_id, players.nickname,
      coalesce(answers.original_text, '') as answer_text,
      coalesce(answers.normalized_value, '') as normalized_value,
      coalesce(challenges.status, 'VALID') <> 'RESOLVED_INVALID'
        and coalesce(answers.normalized_value, '') <> '' as is_valid,
      coalesce(answers.awarded_points, 0) as awarded_points
    from public.tutti_frutti_session_categories as categories
    cross join public.room_session_participants as roster
    join public.players on players.id = roster.player_id
    left join public.tutti_frutti_answers as answers
      on answers.session_id = v_session_id and answers.round_id = v_round_id
      and answers.player_id = roster.player_id and answers.category_position = categories.position
    left join public.tutti_frutti_challenges as challenges
      on challenges.round_id = v_round_id and challenges.answer_player_id = roster.player_id
      and challenges.category_position = categories.position
    where categories.session_id = v_session_id and roster.session_id = v_session_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'position', categories.position,
    'label', categories.label,
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
      'playerId', answer_rows.player_id,
      'nickname', answer_rows.nickname,
      'answerText', answer_rows.answer_text,
      'isEmpty', answer_rows.normalized_value = '',
      'isValid', answer_rows.is_valid,
      'points', answer_rows.awarded_points
    ) order by lower(answer_rows.nickname), answer_rows.player_id)
      from answer_rows where answer_rows.position = categories.position), '[]'::jsonb)
  ) order by categories.position), '[]'::jsonb)
  into v_categories from public.tutti_frutti_session_categories as categories
  where categories.session_id = v_session_id;

  with session_points as (
    select roster.player_id, players.nickname,
      coalesce(sum(answers.awarded_points) filter (where rounds.round_number = v_round_number), 0)::integer as round_points,
      coalesce(sum(answers.awarded_points) filter (where rounds.round_number <= v_round_number), 0)::integer as total_points
    from public.room_session_participants as roster
    join public.players on players.id = roster.player_id
    left join public.tutti_frutti_rounds as rounds
      on rounds.session_id = roster.session_id and rounds.scored_at is not null
    left join public.tutti_frutti_answers as answers
      on answers.session_id = rounds.session_id and answers.round_id = rounds.id
        and answers.player_id = roster.player_id
    where roster.session_id = v_session_id
    group by roster.player_id, players.nickname
  ), ranked as (
    select session_points.*,
      rank() over (order by session_points.total_points desc)::integer as standing
    from session_points
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', ranked.player_id, 'nickname', ranked.nickname,
    'roundPoints', ranked.round_points, 'totalPoints', ranked.total_points,
    'rank', ranked.standing
  ) order by ranked.standing, lower(ranked.nickname), ranked.player_id), '[]'::jsonb)
  into v_totals from ranked;

  return jsonb_build_object(
    'roomId', target_room_id, 'sessionId', v_session_id, 'roundId', v_round_id,
    'roundNumber', v_round_number, 'phase', 'RESULT', 'scoredAt', v_scored_at,
    'serverNow', clock_timestamp(), 'categories', v_categories, 'totals', v_totals
  );
end;
$$;

create function public.advance_tutti_frutti_round(target_room_id uuid, target_base_round_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor_id uuid; v_host_id uuid; v_session_id uuid; v_round_count integer; v_letter_pool text[];
  v_base_id uuid; v_base_number integer; v_base_scored_at timestamptz;
  v_latest_id uuid; v_latest_number integer; v_latest_phase text; v_latest_scored_at timestamptz;
  v_new_round_id uuid; v_next_letter text;
begin
  select players.id into v_actor_id from public.players as players where players.auth_user_id = auth.uid();
  if v_actor_id is null then raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031'; end if;
  select rooms.host_player_id into v_host_id from public.rooms as rooms
    where rooms.id = target_room_id and rooms.game_type = 'tutti_frutti' and rooms.status = 'playing' for update;
  if not found then raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032'; end if;
  select sessions.id into v_session_id from public.room_sessions as sessions
    where sessions.room_id = target_room_id and sessions.game_type = 'tutti_frutti' and sessions.finished_at is null for update;
  if v_session_id is null or not exists (select 1 from public.room_session_participants as roster
    where roster.session_id = v_session_id and roster.player_id = v_actor_id) then
    raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032'; end if;
  if v_host_id is distinct from v_actor_id then raise exception 'Solo el anfitrion puede avanzar a la siguiente ronda.' using errcode = 'P0053'; end if;
  select sessions.round_count, sessions.letter_pool into v_round_count, v_letter_pool
    from public.tutti_frutti_sessions as sessions where sessions.id = v_session_id for update;
  select rounds.id, rounds.round_number, rounds.scored_at into v_base_id, v_base_number, v_base_scored_at
    from public.tutti_frutti_rounds as rounds where rounds.id = target_base_round_id and rounds.session_id = v_session_id;
  if v_base_id is null then raise exception 'La ronda indicada no pertenece a esta partida.' using errcode = 'P0038'; end if;
  select rounds.id, rounds.round_number, rounds.phase, rounds.scored_at
    into v_latest_id, v_latest_number, v_latest_phase, v_latest_scored_at
    from public.tutti_frutti_rounds as rounds where rounds.session_id = v_session_id
    order by rounds.round_number desc limit 1 for update;
  -- Retries return the only immediate, not-yet-scored successor.
  if v_latest_number = v_base_number + 1 and v_base_scored_at is not null and v_latest_scored_at is null then
    return public.get_tutti_frutti_game_state(target_room_id); end if;
  if v_latest_id is distinct from v_base_id then raise exception 'La ronda ya cambio. Actualiza la partida.' using errcode = 'P0054'; end if;
  if v_base_scored_at is null or v_latest_phase <> 'RESULT' then raise exception 'La ronda todavia no tiene un resultado definitivo.' using errcode = 'P0042'; end if;
  if v_base_number >= v_round_count then raise exception 'La partida ya llego a su ultima ronda.' using errcode = 'P0052'; end if;
  select choices.letter into v_next_letter from unnest(v_letter_pool) as choices(letter)
    where not exists (select 1 from public.tutti_frutti_letter_candidates as used
      where used.session_id = v_session_id and used.letter = choices.letter) order by random() limit 1;
  if v_next_letter is null then raise exception 'No quedan letras disponibles para otra ronda.' using errcode = 'P0051'; end if;
  v_new_round_id := extensions.gen_random_uuid();
  insert into public.tutti_frutti_rounds (id, session_id, round_number, phase)
    values (v_new_round_id, v_session_id, v_base_number + 1, 'LETTER_PENDING');
  insert into public.tutti_frutti_letter_candidates (id, session_id, round_id, letter, status)
    values (extensions.gen_random_uuid(), v_session_id, v_new_round_id, v_next_letter, 'pending');
  perform public.touch_tutti_frutti_review_signal(v_session_id, v_base_id);
  return public.get_tutti_frutti_game_state(target_room_id);
end;
$$;
revoke all on function public.advance_tutti_frutti_round(uuid, uuid) from public, anon;
grant execute on function public.advance_tutti_frutti_round(uuid, uuid) to authenticated;

revoke all on function public.get_tutti_frutti_game_state(uuid) from public, anon;
grant execute on function public.get_tutti_frutti_game_state(uuid) to authenticated;
revoke all on function public.submit_tutti_frutti_letter_skip_vote(uuid, uuid) from public, anon;
grant execute on function public.submit_tutti_frutti_letter_skip_vote(uuid, uuid) to authenticated;
revoke all on function public.get_tutti_frutti_round_result(uuid, uuid) from public, anon;
grant execute on function public.get_tutti_frutti_round_result(uuid, uuid) to authenticated;
