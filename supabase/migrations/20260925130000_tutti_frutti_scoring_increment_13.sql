-- Increment 13: close social review and persist immutable per-answer scoring.

alter table public.tutti_frutti_answers
  add column awarded_points integer,
  add constraint tutti_frutti_answers_awarded_points_check
    check (awarded_points is null or awarded_points in (0, 5, 10));

alter table public.tutti_frutti_rounds
  add column scored_at timestamptz,
  add constraint tutti_frutti_rounds_scored_phase_check
    check ((phase = 'RESULT') = (scored_at is not null));

create function public.guard_tutti_frutti_scored_answer_immutability()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.awarded_points is not null
    or exists (select 1 from public.tutti_frutti_rounds as rounds
      where rounds.id = old.round_id and rounds.scored_at is not null) then
    raise exception 'Las respuestas y puntos de una ronda puntuada son inmutables.'
      using errcode = 'P0050';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_tutti_frutti_scored_answer_immutability() from public, anon, authenticated;
create trigger tutti_frutti_answers_scored_immutable
  before update or delete on public.tutti_frutti_answers
  for each row execute function public.guard_tutti_frutti_scored_answer_immutability();

create function public.guard_tutti_frutti_scored_round_immutability()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.scored_at is not null
    and (new.scored_at is distinct from old.scored_at or new.phase is distinct from old.phase) then
    raise exception 'El resultado de una ronda puntuada es inmutable.' using errcode = 'P0050';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_tutti_frutti_scored_round_immutability() from public, anon, authenticated;
create trigger tutti_frutti_rounds_scored_immutable
  before update on public.tutti_frutti_rounds
  for each row execute function public.guard_tutti_frutti_scored_round_immutability();

create or replace function public.can_read_tutti_frutti_review_signal(
  target_session_id uuid, target_round_id uuid
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_current_player_tutti_frutti_session_participant(target_session_id)
    and exists (select 1 from public.tutti_frutti_rounds as rounds
      where rounds.id = target_round_id and rounds.session_id = target_session_id
        and rounds.phase in ('REVIEWING', 'RESULT') and rounds.locked_at is not null);
$$;
revoke all on function public.can_read_tutti_frutti_review_signal(uuid, uuid) from public, anon;
grant execute on function public.can_read_tutti_frutti_review_signal(uuid, uuid) to authenticated;

create function public.get_tutti_frutti_round_result(target_room_id uuid, target_round_id uuid default null)
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
      coalesce(sum(answers.awarded_points), 0)::integer as total_points
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
revoke all on function public.get_tutti_frutti_round_result(uuid, uuid) from public, anon;
grant execute on function public.get_tutti_frutti_round_result(uuid, uuid) to authenticated;

create function public.score_tutti_frutti_round(target_room_id uuid, target_round_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_session_id uuid;
  v_round_id uuid;
  v_round_phase text;
  v_scored_at timestamptz;
  v_host_player_id uuid;
begin
  select players.id into v_actor_id from public.players as players
    where players.auth_user_id = auth.uid();
  if v_actor_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;
  perform 1 from public.rooms as rooms
    where rooms.id = target_room_id and rooms.game_type = 'tutti_frutti' and rooms.status = 'playing'
    for update;
  if not found then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;
  select sessions.id into v_session_id from public.room_sessions as sessions
    where sessions.room_id = target_room_id and sessions.game_type = 'tutti_frutti'
      and sessions.finished_at is null for update;
  if v_session_id is null or not exists (select 1 from public.room_session_participants as roster
      where roster.session_id = v_session_id and roster.player_id = v_actor_id) then
    raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;
  perform 1 from public.tutti_frutti_sessions as sessions where sessions.id = v_session_id for update;
  select rounds.id, rounds.phase, rounds.scored_at
    into v_round_id, v_round_phase, v_scored_at
    from public.tutti_frutti_rounds as rounds where rounds.session_id = v_session_id
      and rounds.id = target_round_id
    order by rounds.round_number desc limit 1 for update;
  if v_round_id is null then
    raise exception 'No se pudo recuperar la ronda activa.' using errcode = 'P0038';
  end if;
  -- Once committed, any roster member can safely retry and receive the same
  -- result read available to every participant.
  if v_scored_at is not null then
    return public.get_tutti_frutti_round_result(target_room_id, v_round_id);
  end if;
  select rooms.host_player_id into v_host_player_id from public.rooms as rooms where rooms.id = target_room_id;
  if v_host_player_id is distinct from v_actor_id then
    raise exception 'Solo el anfitrion puede cerrar la revision.' using errcode = 'P0033';
  end if;
  if v_round_phase <> 'REVIEWING' then
    raise exception 'La ronda no esta en revision.' using errcode = 'P0042';
  end if;
  if exists (select 1 from public.tutti_frutti_challenges as challenges
      where challenges.round_id = v_round_id and challenges.status = 'OPEN') then
    raise exception 'Hay una impugnacion pendiente.' using errcode = 'P0049';
  end if;
  if exists (select 1 from public.tutti_frutti_answers as answers
      where answers.round_id = v_round_id and answers.awarded_points is not null) then
    raise exception 'La ronda contiene puntos parciales inesperados.' using errcode = 'P0050';
  end if;

  with answer_validity as (
    select answers.round_id, answers.player_id, answers.category_position,
      answers.normalized_value,
      coalesce(challenges.status, 'RESOLVED_VALID') <> 'RESOLVED_INVALID' as is_valid
    from public.tutti_frutti_answers as answers
    left join public.tutti_frutti_challenges as challenges
      on challenges.round_id = answers.round_id and challenges.answer_player_id = answers.player_id
      and challenges.category_position = answers.category_position
    where answers.round_id = v_round_id
  ), duplicate_counts as (
    select answer_validity.*,
      count(*) filter (where answer_validity.is_valid and answer_validity.normalized_value <> '')
        over (partition by answer_validity.category_position, answer_validity.normalized_value) as duplicate_count
    from answer_validity
  )
  update public.tutti_frutti_answers as answers
    set awarded_points = case
      when duplicate_counts.normalized_value = '' or not duplicate_counts.is_valid then 0
      when duplicate_counts.duplicate_count > 1 then 5 else 10 end
  from duplicate_counts
  where answers.round_id = duplicate_counts.round_id
    and answers.player_id = duplicate_counts.player_id
    and answers.category_position = duplicate_counts.category_position;

  v_scored_at := clock_timestamp();
  update public.tutti_frutti_rounds as rounds
    set phase = 'RESULT', scored_at = v_scored_at
    where rounds.id = v_round_id and rounds.phase = 'REVIEWING' and rounds.scored_at is null;
  if not found then
    raise exception 'La ronda cambio mientras se cerraba la revision.' using errcode = 'P0042';
  end if;
  perform public.touch_tutti_frutti_review_signal(v_session_id, v_round_id);
  return public.get_tutti_frutti_round_result(target_room_id, v_round_id);
end;
$$;
revoke all on function public.score_tutti_frutti_round(uuid, uuid) from public, anon;
grant execute on function public.score_tutti_frutti_round(uuid, uuid) to authenticated;
