-- Increment 15: finish the last scored round and return its Room to lobby atomically.

create or replace function public.get_tutti_frutti_round_result(
  target_room_id uuid,
  target_round_id uuid default null
)
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
  select players.id into v_actor_id
  from public.players as players
  where players.auth_user_id = auth.uid();
  if v_actor_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  if not exists (
    select 1 from public.rooms as rooms
    where rooms.id = target_room_id and rooms.game_type = 'tutti_frutti'
  ) then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  if target_round_id is null then
    select sessions.id into v_session_id
    from public.room_sessions as sessions
    where sessions.room_id = target_room_id
      and sessions.game_type = 'tutti_frutti'
      and sessions.finished_at is null;
    if v_session_id is not null then
      select rounds.id, rounds.round_number, rounds.scored_at
        into v_round_id, v_round_number, v_scored_at
      from public.tutti_frutti_rounds as rounds
      where rounds.session_id = v_session_id
      order by rounds.round_number desc
      limit 1;
    end if;
  else
    select sessions.id, rounds.id, rounds.round_number, rounds.scored_at
      into v_session_id, v_round_id, v_round_number, v_scored_at
    from public.tutti_frutti_rounds as rounds
    join public.room_sessions as sessions on sessions.id = rounds.session_id
    where rounds.id = target_round_id
      and sessions.room_id = target_room_id
      and sessions.game_type = 'tutti_frutti';
  end if;

  if v_session_id is null or not exists (
    select 1 from public.room_session_participants as roster
    where roster.session_id = v_session_id and roster.player_id = v_actor_id
  ) then
    raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;
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
  into v_categories
  from public.tutti_frutti_session_categories as categories
  where categories.session_id = v_session_id;

  with session_points as (
    select roster.player_id, players.nickname,
      coalesce(sum(answers.awarded_points) filter (
        where rounds.round_number = v_round_number
      ), 0)::integer as round_points,
      coalesce(sum(answers.awarded_points) filter (
        where rounds.round_number <= v_round_number
      ), 0)::integer as total_points
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
    'playerId', ranked.player_id,
    'nickname', ranked.nickname,
    'roundPoints', ranked.round_points,
    'totalPoints', ranked.total_points,
    'rank', ranked.standing
  ) order by ranked.standing, lower(ranked.nickname), ranked.player_id), '[]'::jsonb)
  into v_totals from ranked;

  return jsonb_build_object(
    'roomId', target_room_id,
    'sessionId', v_session_id,
    'roundId', v_round_id,
    'roundNumber', v_round_number,
    'phase', 'RESULT',
    'scoredAt', v_scored_at,
    'serverNow', clock_timestamp(),
    'categories', v_categories,
    'totals', v_totals
  );
end;
$$;

create or replace function public.score_tutti_frutti_round(
  target_room_id uuid,
  target_round_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_host_player_id uuid;
  v_room_status text;
  v_session_id uuid;
  v_finished_at timestamptz;
  v_round_count integer;
  v_round_id uuid;
  v_round_number integer;
  v_round_phase text;
  v_scored_at timestamptz;
  v_latest_round_number integer;
  v_existing_round_count integer;
  v_scored_round_count integer;
  v_min_round_number integer;
  v_max_round_number integer;
  v_closed_at timestamptz;
  v_updated_status text;
begin
  select players.id into v_actor_id
  from public.players as players
  where players.auth_user_id = auth.uid();
  if v_actor_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  select rooms.host_player_id, rooms.status
    into v_host_player_id, v_room_status
  from public.rooms as rooms
  where rooms.id = target_room_id and rooms.game_type = 'tutti_frutti'
  for update;
  if not found then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  select sessions.id into v_session_id
  from public.tutti_frutti_rounds as rounds
  join public.room_sessions as sessions on sessions.id = rounds.session_id
  where rounds.id = target_round_id
    and sessions.room_id = target_room_id
    and sessions.game_type = 'tutti_frutti';
  if v_session_id is null then
    raise exception 'No se pudo recuperar la ronda indicada.' using errcode = 'P0038';
  end if;

  select sessions.finished_at into v_finished_at
  from public.room_sessions as sessions
  where sessions.id = v_session_id
  for update;
  if not exists (
    select 1 from public.room_session_participants as roster
    where roster.session_id = v_session_id and roster.player_id = v_actor_id
  ) then
    raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;

  select sessions.round_count into v_round_count
  from public.tutti_frutti_sessions as sessions
  where sessions.id = v_session_id
  for update;
  if v_round_count is null then
    raise exception 'La sesion Tutti Frutti es inconsistente.' using errcode = 'P0056';
  end if;

  select rounds.id, rounds.round_number, rounds.phase, rounds.scored_at
    into v_round_id, v_round_number, v_round_phase, v_scored_at
  from public.tutti_frutti_rounds as rounds
  where rounds.id = target_round_id and rounds.session_id = v_session_id
  for update;
  if v_round_id is null then
    raise exception 'No se pudo recuperar la ronda indicada.' using errcode = 'P0038';
  end if;

  select max(rounds.round_number) into v_latest_round_number
  from public.tutti_frutti_rounds as rounds
  where rounds.session_id = v_session_id;

  if v_scored_at is not null then
    if v_round_number < v_round_count then
      if v_finished_at is not null or v_room_status <> 'playing' then
        raise exception 'La ronda puntuada no coincide con el estado de la sesion.' using errcode = 'P0056';
      end if;
    elsif v_round_number = v_round_count then
      if v_finished_at is null or v_room_status not in ('lobby', 'closed') then
        raise exception 'El cierre guardado no coincide con el estado de la sala.' using errcode = 'P0056';
      end if;
      select count(*), count(*) filter (where rounds.scored_at is not null),
        min(rounds.round_number), max(rounds.round_number)
        into v_existing_round_count, v_scored_round_count, v_min_round_number, v_max_round_number
      from public.tutti_frutti_rounds as rounds
      where rounds.session_id = v_session_id;
      if v_existing_round_count <> v_round_count
        or v_scored_round_count <> v_round_count
        or v_min_round_number <> 1
        or v_max_round_number <> v_round_count then
        raise exception 'El cierre guardado no contiene todas las rondas.' using errcode = 'P0056';
      end if;
    else
      raise exception 'La ronda puntuada excede la configuracion de la sesion.' using errcode = 'P0056';
    end if;
    return public.get_tutti_frutti_round_result(target_room_id, v_round_id);
  end if;

  if v_room_status <> 'playing' or v_finished_at is not null then
    raise exception 'La partida no esta disponible para puntuar.' using errcode = 'P0042';
  end if;
  if v_host_player_id is distinct from v_actor_id then
    raise exception 'Solo el anfitrion puede cerrar la revision.' using errcode = 'P0033';
  end if;
  if v_round_phase <> 'REVIEWING' or v_latest_round_number <> v_round_number then
    raise exception 'La ronda no esta en revision.' using errcode = 'P0042';
  end if;
  if exists (
    select 1 from public.tutti_frutti_challenges as challenges
    where challenges.round_id = v_round_id and challenges.status = 'OPEN'
  ) then
    raise exception 'Hay una impugnacion pendiente.' using errcode = 'P0049';
  end if;
  if exists (
    select 1 from public.tutti_frutti_answers as answers
    where answers.round_id = v_round_id and answers.awarded_points is not null
  ) then
    raise exception 'La ronda contiene puntos parciales inesperados.' using errcode = 'P0050';
  end if;

  with answer_validity as (
    select answers.round_id, answers.player_id, answers.category_position,
      answers.normalized_value,
      coalesce(challenges.status, 'RESOLVED_VALID') <> 'RESOLVED_INVALID' as is_valid
    from public.tutti_frutti_answers as answers
    left join public.tutti_frutti_challenges as challenges
      on challenges.round_id = answers.round_id
      and challenges.answer_player_id = answers.player_id
      and challenges.category_position = answers.category_position
    where answers.round_id = v_round_id
  ), duplicate_counts as (
    select answer_validity.*,
      count(*) filter (
        where answer_validity.is_valid and answer_validity.normalized_value <> ''
      ) over (
        partition by answer_validity.category_position, answer_validity.normalized_value
      ) as duplicate_count
    from answer_validity
  )
  update public.tutti_frutti_answers as answers
  set awarded_points = case
    when duplicate_counts.normalized_value = '' or not duplicate_counts.is_valid then 0
    when duplicate_counts.duplicate_count > 1 then 5
    else 10
  end
  from duplicate_counts
  where answers.round_id = duplicate_counts.round_id
    and answers.player_id = duplicate_counts.player_id
    and answers.category_position = duplicate_counts.category_position;

  v_closed_at := clock_timestamp();
  update public.tutti_frutti_rounds as rounds
  set phase = 'RESULT', scored_at = v_closed_at
  where rounds.id = v_round_id
    and rounds.phase = 'REVIEWING'
    and rounds.scored_at is null
  returning rounds.scored_at into v_scored_at;
  if v_scored_at is null then
    raise exception 'La ronda cambio mientras se cerraba la revision.' using errcode = 'P0042';
  end if;

  if v_round_number = v_round_count then
    select count(*), count(*) filter (where rounds.scored_at is not null),
      min(rounds.round_number), max(rounds.round_number)
      into v_existing_round_count, v_scored_round_count, v_min_round_number, v_max_round_number
    from public.tutti_frutti_rounds as rounds
    where rounds.session_id = v_session_id;
    if v_existing_round_count <> v_round_count
      or v_scored_round_count <> v_round_count
      or v_min_round_number <> 1
      or v_max_round_number <> v_round_count then
      raise exception 'No todas las rondas configuradas estan puntuadas.' using errcode = 'P0056';
    end if;

    update public.room_sessions as sessions
    set finished_at = v_closed_at
    where sessions.id = v_session_id and sessions.finished_at is null
    returning sessions.finished_at into v_finished_at;
    if v_finished_at is null then
      raise exception 'No se pudo finalizar la sesion.' using errcode = 'P0056';
    end if;

    update public.rooms as rooms
    set status = 'lobby'
    where rooms.id = target_room_id and rooms.status = 'playing'
    returning rooms.status into v_updated_status;
    if v_updated_status is distinct from 'lobby' then
      raise exception 'No se pudo devolver la sala al lobby.' using errcode = 'P0056';
    end if;
  end if;

  perform public.touch_tutti_frutti_review_signal(v_session_id, v_round_id);
  return public.get_tutti_frutti_round_result(target_room_id, v_round_id);
end;
$$;

create or replace function public.get_tutti_frutti_final_result(target_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_room_id uuid;
  v_room_code text;
  v_room_status text;
  v_finished_at timestamptz;
  v_round_count integer;
  v_existing_round_count integer;
  v_scored_round_count integer;
  v_min_round_number integer;
  v_max_round_number integer;
  v_totals jsonb;
  v_winner_ids uuid[];
  v_can_return boolean;
begin
  select players.id into v_actor_id
  from public.players as players
  where players.auth_user_id = auth.uid();
  if v_actor_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  select sessions.room_id, sessions.finished_at, games.round_count,
    rooms.join_code, rooms.status
    into v_room_id, v_finished_at, v_round_count, v_room_code, v_room_status
  from public.room_sessions as sessions
  join public.tutti_frutti_sessions as games on games.id = sessions.id
  join public.rooms as rooms on rooms.id = sessions.room_id
  where sessions.id = target_session_id
    and sessions.game_type = 'tutti_frutti';
  if v_room_id is null or v_finished_at is null or not exists (
    select 1 from public.room_session_participants as roster
    where roster.session_id = target_session_id and roster.player_id = v_actor_id
  ) then
    raise exception 'El resultado final no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;

  select count(*), count(*) filter (where rounds.scored_at is not null),
    min(rounds.round_number), max(rounds.round_number)
    into v_existing_round_count, v_scored_round_count, v_min_round_number, v_max_round_number
  from public.tutti_frutti_rounds as rounds
  where rounds.session_id = target_session_id;
  if v_existing_round_count <> v_round_count
    or v_scored_round_count <> v_round_count
    or v_min_round_number <> 1
    or v_max_round_number <> v_round_count then
    raise exception 'El resultado final es inconsistente.' using errcode = 'P0056';
  end if;

  with session_points as (
    select roster.player_id, players.nickname,
      coalesce(sum(answers.awarded_points), 0)::integer as total_points
    from public.room_session_participants as roster
    join public.players on players.id = roster.player_id
    left join public.tutti_frutti_rounds as rounds
      on rounds.session_id = roster.session_id and rounds.scored_at is not null
    left join public.tutti_frutti_answers as answers
      on answers.session_id = rounds.session_id and answers.round_id = rounds.id
      and answers.player_id = roster.player_id
    where roster.session_id = target_session_id
    group by roster.player_id, players.nickname
  ), ranked as (
    select session_points.*,
      rank() over (order by session_points.total_points desc)::integer as standing
    from session_points
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'playerId', ranked.player_id,
      'nickname', ranked.nickname,
      'totalPoints', ranked.total_points,
      'rank', ranked.standing
    ) order by ranked.standing, lower(ranked.nickname), ranked.player_id), '[]'::jsonb),
    coalesce(array_agg(ranked.player_id order by lower(ranked.nickname), ranked.player_id)
      filter (where ranked.standing = 1), '{}'::uuid[])
    into v_totals, v_winner_ids
  from ranked;

  v_can_return := v_room_status in ('lobby', 'playing') and exists (
    select 1 from public.room_participants as participants
    where participants.room_id = v_room_id and participants.player_id = v_actor_id
  );

  return jsonb_build_object(
    'roomId', v_room_id,
    'roomCode', case when v_can_return then v_room_code else null end,
    'sessionId', target_session_id,
    'finishedAt', v_finished_at,
    'serverNow', clock_timestamp(),
    'roundCount', v_round_count,
    'totals', v_totals,
    'winnerPlayerIds', to_jsonb(v_winner_ids),
    'isTie', cardinality(v_winner_ids) > 1,
    'canReturnToRoom', v_can_return
  );
end;
$$;

create or replace function public.get_tutti_frutti_postgame_state(target_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_session_id uuid;
  v_roster_session_id uuid;
begin
  select players.id into v_actor_id
  from public.players as players
  where players.auth_user_id = auth.uid();
  if v_actor_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;
  if not exists (
    select 1
    from public.rooms as rooms
    join public.room_participants as participants
      on participants.room_id = rooms.id and participants.group_id = rooms.group_id
    where rooms.id = target_room_id
      and rooms.game_type = 'tutti_frutti'
      and participants.player_id = v_actor_id
  ) then
    raise exception 'La sala Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  select sessions.id into v_session_id
  from public.room_sessions as sessions
  where sessions.room_id = target_room_id
    and sessions.game_type = 'tutti_frutti'
    and sessions.finished_at is not null
  order by sessions.finished_at desc, sessions.id desc
  limit 1;
  if v_session_id is not null and exists (
    select 1 from public.room_session_participants as roster
    where roster.session_id = v_session_id and roster.player_id = v_actor_id
  ) then
    v_roster_session_id := v_session_id;
  end if;
  return jsonb_build_object(
    'hasFinishedSession', v_session_id is not null,
    'latestFinishedSessionId', v_roster_session_id
  );
end;
$$;

create or replace function public.start_tutti_frutti_session(target_room_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  current_auth_user_id uuid := auth.uid();
  current_player_id uuid;
  target_group_id uuid;
  target_host_player_id uuid;
  target_game_type text;
  target_status text;
  active_session_id uuid;
  stored_starter_id uuid;
  saved_configuration jsonb;
  configuration_result jsonb;
  category_item record;
  category_label text;
  selected_pool constant text[] := array[
    'A','B','C','D','E','F','G','H','I','J','L','M','N','O','P','R','S','T','U','V'
  ];
  new_session_id uuid;
  new_round_id uuid;
  new_candidate_id uuid;
  selected_letter text;
  participant_count integer;
  category_count integer;
  configured_round_count integer;
begin
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;
  select players.id into current_player_id
  from public.players where players.auth_user_id = current_auth_user_id;
  if current_player_id is null then
    raise exception 'La identidad no tiene un jugador asociado.' using errcode = 'P0031';
  end if;

  select rooms.group_id, rooms.host_player_id, rooms.game_type, rooms.status
    into target_group_id, target_host_player_id, target_game_type, target_status
  from public.rooms
  where rooms.id = target_room_id
  for update;
  if not found or target_game_type is distinct from 'tutti_frutti' then
    raise exception 'La sala Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  if target_status = 'playing' then
    select room_sessions.id, tutti_frutti_sessions.started_by_player_id
      into active_session_id, stored_starter_id
    from public.room_sessions
    join public.tutti_frutti_sessions on tutti_frutti_sessions.id = room_sessions.id
    where room_sessions.room_id = target_room_id
      and room_sessions.group_id = target_group_id
      and room_sessions.game_type = 'tutti_frutti'
      and room_sessions.finished_at is null;
    if active_session_id is null then
      raise exception 'La sala no tiene una partida Tutti Frutti activa.' using errcode = 'P0038';
    end if;
    if not public.is_current_player_tutti_frutti_session_participant(active_session_id) then
      raise exception 'La sala Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
    end if;
    if stored_starter_id <> current_player_id then
      raise exception 'Solo quien inicio la partida puede reintentar el inicio.' using errcode = 'P0033';
    end if;
    return public.get_tutti_frutti_game_state(target_room_id);
  end if;

  if not exists (
    select 1 from public.room_participants
    where room_participants.room_id = target_room_id
      and room_participants.group_id = target_group_id
      and room_participants.player_id = current_player_id
  ) then
    raise exception 'La sala Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;
  if current_player_id <> target_host_player_id then
    raise exception 'Solo el anfitrion puede iniciar la partida.' using errcode = 'P0033';
  end if;
  if target_status <> 'lobby' then
    raise exception 'La sala no esta en el lobby.' using errcode = 'P0034';
  end if;

  -- Increment 15 guard: Increment 16 replaces this with authorized creation
  -- of a new session and never reuses the finished gameplay snapshot.
  if exists (
    select 1 from public.room_sessions
    where room_sessions.room_id = target_room_id
      and room_sessions.game_type = 'tutti_frutti'
      and room_sessions.finished_at is not null
  ) then
    raise exception 'Esta sala ya termino una partida. La revancha todavia no esta disponible.'
      using errcode = 'P0055';
  end if;

  select count(*) into participant_count
  from public.room_participants
  where room_participants.room_id = target_room_id
    and room_participants.group_id = target_group_id;
  if participant_count < 2 then
    raise exception 'Se necesitan al menos dos participantes.' using errcode = 'P0037';
  end if;

  configuration_result := public.get_tutti_frutti_room_setup(target_room_id);
  saved_configuration := configuration_result -> 'configuration';
  if jsonb_typeof(saved_configuration) is distinct from 'object'
    or (saved_configuration ->> 'version') is distinct from '1'
    or (saved_configuration ->> 'roundCount') !~ '^(3|5|10)$'
    or jsonb_typeof(saved_configuration -> 'categories') is distinct from 'array' then
    raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
  end if;
  configured_round_count := (saved_configuration ->> 'roundCount')::integer;
  select jsonb_array_length(saved_configuration -> 'categories') into category_count;
  if category_count < 3 or category_count > 6 then
    raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
  end if;
  if exists (
    select 1 from public.room_sessions
    where room_sessions.room_id = target_room_id and room_sessions.finished_at is null
  ) then
    raise exception 'La sala tiene una sesion activa inconsistente.' using errcode = 'P0038';
  end if;

  new_session_id := extensions.gen_random_uuid();
  insert into public.room_sessions (
    id, room_id, group_id, game_type, started_at, impostor_game_session_id
  ) values (
    new_session_id, target_room_id, target_group_id, 'tutti_frutti', now(), null
  );
  insert into public.room_session_participants (session_id, group_id, player_id)
  select new_session_id, target_group_id, room_participants.player_id
  from public.room_participants
  where room_participants.room_id = target_room_id
    and room_participants.group_id = target_group_id
  order by room_participants.joined_at, room_participants.player_id;
  insert into public.tutti_frutti_sessions (
    id, round_count, letter_pool, started_by_player_id
  ) values (
    new_session_id, configured_round_count, selected_pool, current_player_id
  );

  for category_item in
    select categories.value, categories.ordinality
    from jsonb_array_elements(saved_configuration -> 'categories')
      with ordinality as categories(value, ordinality)
    order by categories.ordinality
  loop
    if category_item.value ->> 'kind' = 'preset' then
      category_label := case category_item.value ->> 'key'
        when 'name' then 'Nombre'
        when 'animal' then 'Animal'
        when 'food' then 'Comida'
        when 'place' then 'Lugar'
        when 'object' then 'Objeto'
        when 'country' then 'País'
        when 'city' then 'Ciudad'
        when 'profession' then 'Profesión'
        when 'famous_person' then 'Persona famosa'
        when 'movie_or_series' then 'Película o serie'
        else null
      end;
      if category_label is null then
        raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
      end if;
      insert into public.tutti_frutti_session_categories (
        session_id, position, category_kind, preset_key, label
      ) values (
        new_session_id, category_item.ordinality::integer,
        'preset', category_item.value ->> 'key', category_label
      );
    elsif category_item.value ->> 'kind' = 'custom'
      and jsonb_typeof(category_item.value -> 'label') = 'string' then
      category_label := normalize(category_item.value ->> 'label', NFC);
      if char_length(category_label) < 1 or char_length(category_label) > 40 then
        raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
      end if;
      insert into public.tutti_frutti_session_categories (
        session_id, position, category_kind, preset_key, label
      ) values (
        new_session_id, category_item.ordinality::integer,
        'custom', null, category_label
      );
    else
      raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
    end if;
  end loop;

  new_round_id := extensions.gen_random_uuid();
  new_candidate_id := extensions.gen_random_uuid();
  selected_letter := selected_pool[1 + floor(random() * cardinality(selected_pool))::integer];
  insert into public.tutti_frutti_rounds (id, session_id, round_number, phase)
  values (new_round_id, new_session_id, 1, 'LETTER_PENDING');
  insert into public.tutti_frutti_letter_candidates (
    id, session_id, round_id, letter, status
  ) values (
    new_candidate_id, new_session_id, new_round_id, selected_letter, 'pending'
  );
  update public.rooms set status = 'playing'
  where rooms.id = target_room_id and rooms.status = 'lobby';
  if not found then
    raise exception 'La sala ya no esta en el lobby.' using errcode = 'P0034';
  end if;
  return public.get_tutti_frutti_game_state(target_room_id);
end;
$$;

revoke all on function public.get_tutti_frutti_round_result(uuid, uuid) from public, anon;
grant execute on function public.get_tutti_frutti_round_result(uuid, uuid) to authenticated;
revoke all on function public.score_tutti_frutti_round(uuid, uuid) from public, anon;
grant execute on function public.score_tutti_frutti_round(uuid, uuid) to authenticated;
revoke all on function public.get_tutti_frutti_final_result(uuid) from public, anon;
grant execute on function public.get_tutti_frutti_final_result(uuid) to authenticated;
revoke all on function public.get_tutti_frutti_postgame_state(uuid) from public, anon;
grant execute on function public.get_tutti_frutti_postgame_state(uuid) to authenticated;
revoke all on function public.start_tutti_frutti_session(uuid) from public, anon;
grant execute on function public.start_tutti_frutti_session(uuid) to authenticated;
