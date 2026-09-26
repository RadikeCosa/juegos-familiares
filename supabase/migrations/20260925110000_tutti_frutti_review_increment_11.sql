-- Increment 11: a read-only review snapshot after the committed answer lock.
create function public.get_tutti_frutti_review(target_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  current_session_id uuid;
  current_round_id uuid;
  current_round_number integer;
  current_phase text;
  current_locked_at timestamptz;
  review_categories jsonb;
begin
  select players.id into actor_id
  from public.players
  where players.auth_user_id = auth.uid();
  if actor_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  if not exists (
    select 1 from public.rooms
    where rooms.id = target_room_id
      and rooms.game_type = 'tutti_frutti'
      and rooms.status = 'playing'
  ) then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  select sessions.id into current_session_id
  from public.room_sessions as sessions
  where sessions.room_id = target_room_id
    and sessions.game_type = 'tutti_frutti'
    and sessions.finished_at is null;
  if current_session_id is null or not exists (
    select 1 from public.room_session_participants as roster
    where roster.session_id = current_session_id and roster.player_id = actor_id
  ) then
    raise exception 'La partida de Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;

  select rounds.id, rounds.round_number, rounds.phase, rounds.locked_at
    into current_round_id, current_round_number, current_phase, current_locked_at
  from public.tutti_frutti_rounds as rounds
  where rounds.session_id = current_session_id
  order by rounds.round_number desc
  limit 1;
  if current_round_id is null then
    raise exception 'No se pudo recuperar la ronda activa.' using errcode = 'P0038';
  end if;
  if current_phase <> 'REVIEWING' or current_locked_at is null then
    raise exception 'La revision aun no esta disponible.' using errcode = 'P0042';
  end if;

  with answer_rows as (
    select categories.position, categories.label, roster.player_id,
      players.nickname, coalesce(answers.original_text, '') as answer_text,
      coalesce(answers.normalized_value, '') as normalized_value
    from public.tutti_frutti_session_categories as categories
    cross join public.room_session_participants as roster
    join public.players on players.id = roster.player_id
    left join public.tutti_frutti_answers as answers
      on answers.session_id = categories.session_id
      and answers.round_id = current_round_id
      and answers.player_id = roster.player_id
      and answers.category_position = categories.position
    where categories.session_id = current_session_id
      and roster.session_id = current_session_id
  ), marked as (
    select answer_rows.*,
      count(*) over (partition by position, normalized_value)::integer as match_count,
      dense_rank() over (partition by position order by normalized_value)::integer as match_group
    from answer_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'position', categories.position,
    'label', categories.label,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', marked.player_id,
        'nickname', marked.nickname,
        'answerText', marked.answer_text,
        'isEmpty', marked.normalized_value = '',
        'duplicateGroupId', case when marked.normalized_value <> '' and marked.match_count > 1
          then marked.match_group else null end,
        'duplicateCount', case when marked.normalized_value <> '' and marked.match_count > 1
          then marked.match_count else 0 end
      ) order by lower(marked.nickname), marked.player_id)
      from marked where marked.position = categories.position
    ), '[]'::jsonb)
  ) order by categories.position), '[]'::jsonb)
  into review_categories
  from public.tutti_frutti_session_categories as categories
  where categories.session_id = current_session_id;

  return jsonb_build_object(
    'roomId', target_room_id,
    'sessionId', current_session_id,
    'roundId', current_round_id,
    'roundNumber', current_round_number,
    'phase', 'REVIEWING',
    'categories', review_categories
  );
end;
$$;

revoke all on function public.get_tutti_frutti_review(uuid) from public, anon;
grant execute on function public.get_tutti_frutti_review(uuid) to authenticated;
