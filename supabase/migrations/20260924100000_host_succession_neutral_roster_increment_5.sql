-- Incremento 5: mirror legacy de sesiones y sucesion basada en roster neutral.

create or replace function public.ensure_impostor_shared_session(
  p_game_session_id uuid,
  p_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  game_room_id uuid;
  game_group_id uuid;
  game_started_at timestamptz;
  game_finished_at timestamptz;
  shared_exists boolean;
  shared_room_id uuid;
  shared_group_id uuid;
  shared_game_type text;
  shared_started_at timestamptz;
  shared_finished_at timestamptz;
  shared_impostor_id uuid;
  game_roster_count integer;
  shared_roster_count integer;
begin
  select game_sessions.room_id,
         game_sessions.group_id,
         game_sessions.started_at,
         game_sessions.finished_at
    into game_room_id, game_group_id, game_started_at, game_finished_at
  from public.game_sessions
  where game_sessions.id = p_game_session_id
    and game_sessions.group_id = p_group_id
  for update;

  if not found then
    raise exception 'No existe la sesion Impostor a espejar.'
      using errcode = 'P0022',
            detail = 'legacy mirror: game session missing';
  end if;

  if game_group_id is distinct from p_group_id then
    raise exception 'La sesion Impostor pertenece a otro Group.'
      using errcode = 'P0022',
            detail = 'legacy mirror: group mismatch';
  end if;

  if not exists (
    select 1
    from public.rooms
    where rooms.id = game_room_id
      and rooms.group_id = p_group_id
      and rooms.game_type = 'impostor'
  ) then
    raise exception 'La sesion Impostor no tiene una Room compatible.'
      using errcode = 'P0022',
            detail = 'legacy mirror: room or game type mismatch';
  end if;

  select room_sessions.room_id,
         room_sessions.group_id,
         room_sessions.game_type,
         room_sessions.started_at,
         room_sessions.finished_at,
         room_sessions.impostor_game_session_id
    into shared_room_id, shared_group_id, shared_game_type,
         shared_started_at, shared_finished_at, shared_impostor_id
  from public.room_sessions
  where room_sessions.id = p_game_session_id
    and room_sessions.group_id = p_group_id
  for update;

  shared_exists := found;

  if shared_exists then
    if shared_room_id is distinct from game_room_id
      or shared_group_id is distinct from game_group_id
      or shared_game_type is distinct from 'impostor'
      or shared_started_at is distinct from game_started_at
      or shared_finished_at is distinct from game_finished_at
      or shared_impostor_id is distinct from p_game_session_id then
      raise exception 'La identidad compartida de la sesion Impostor diverge.'
        using errcode = 'P0022',
              detail = 'legacy mirror: shared session divergence';
    end if;
  else
    if game_finished_at is null and exists (
      select 1
      from public.room_sessions
      where room_sessions.room_id = game_room_id
        and room_sessions.finished_at is null
    ) then
      raise exception 'La Room ya tiene otra sesion compartida activa.'
        using errcode = 'P0022',
              detail = 'legacy mirror: multiple active sessions';
    end if;

    insert into public.room_sessions (
      id, room_id, group_id, game_type, started_at, finished_at,
      impostor_game_session_id
    ) values (
      p_game_session_id, game_room_id, game_group_id, 'impostor',
      game_started_at, game_finished_at, p_game_session_id
    );
  end if;

  select count(*)
    into game_roster_count
  from public.session_players
  where session_players.game_session_id = p_game_session_id
    and session_players.group_id = p_group_id;

  if not shared_exists then
    insert into public.room_session_participants (session_id, group_id, player_id)
    select session_players.game_session_id,
           session_players.group_id,
           session_players.player_id
    from public.session_players
    where session_players.game_session_id = p_game_session_id
      and session_players.group_id = p_group_id;
  end if;

  select count(*)
    into shared_roster_count
  from public.room_session_participants
  where room_session_participants.session_id = p_game_session_id
    and room_session_participants.group_id = p_group_id;

  if game_roster_count <> shared_roster_count
    or exists (
      select 1
      from public.session_players
      where session_players.game_session_id = p_game_session_id
        and session_players.group_id = p_group_id
        and not exists (
          select 1
          from public.room_session_participants
          where room_session_participants.session_id = session_players.game_session_id
            and room_session_participants.group_id = session_players.group_id
            and room_session_participants.player_id = session_players.player_id
        )
    )
    or exists (
      select 1
      from public.room_session_participants
      where room_session_participants.session_id = p_game_session_id
        and room_session_participants.group_id = p_group_id
        and not exists (
          select 1
          from public.session_players
          where session_players.game_session_id = room_session_participants.session_id
            and session_players.group_id = room_session_participants.group_id
            and session_players.player_id = room_session_participants.player_id
        )
    ) then
    raise exception 'El roster Impostor no coincide con el roster compartido.'
      using errcode = 'P0022',
            detail = 'legacy mirror: roster divergence';
  end if;
end;
$$;

-- Reuse the Increment 4 wrappers, adding the strict legacy mirror before END.
create or replace function public.start_session()
returns table (
  started boolean,
  already_started boolean,
  room_status text,
  game_session_state text,
  round_number integer,
  participant_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result record;
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  current_game_session_id uuid;
begin
  select * into legacy_result from public.start_session_legacy_increment_4();

  if legacy_result.started is true or legacy_result.already_started is true then
    current_auth_user_id := auth.uid();
    if current_auth_user_id is null then
      raise exception 'Se necesita una AuthIdentity valida para verificar la sesion compartida.'
        using errcode = '28000';
    end if;

    select players.id, players.group_id
      into current_player_id, current_group_id
    from public.players
    where players.auth_user_id = current_auth_user_id;

    select player_active_room_slots.room_id
      into active_room_id
    from public.player_active_room_slots
    join public.rooms
      on rooms.id = player_active_room_slots.room_id
     and rooms.group_id = player_active_room_slots.group_id
    where player_active_room_slots.player_id = current_player_id
      and player_active_room_slots.group_id = current_group_id
      and rooms.status = 'playing';

    select game_sessions.id
      into current_game_session_id
    from public.game_sessions
    where game_sessions.room_id = active_room_id
      and game_sessions.group_id = current_group_id;

    if current_game_session_id is null then
      raise exception 'La tanda Impostor no tiene una identidad compartida consistente.'
        using errcode = 'P0022',
              detail = 'start mirror: active game session missing';
    end if;

    perform public.ensure_impostor_shared_session(
      current_game_session_id,
      current_group_id
    );
  end if;

  return query select
    legacy_result.started,
    legacy_result.already_started,
    legacy_result.room_status,
    legacy_result.game_session_state,
    legacy_result.round_number,
    legacy_result.participant_count;
end;
$$;

create or replace function public.end_session()
returns table (
  ended boolean,
  already_ended boolean,
  state text,
  round_count integer,
  winner_player_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result record;
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  current_game_session_id uuid;
  current_game_session_finished_at timestamptz;
  shared_finished_at timestamptz;
  updated_shared_count integer;
begin
  current_auth_user_id := auth.uid();
  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para verificar la sesion compartida.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  select game_sessions.id
    into current_game_session_id
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  join public.game_sessions
    on game_sessions.room_id = rooms.id
   and game_sessions.group_id = rooms.group_id
  where player_active_room_slots.player_id = current_player_id
    and player_active_room_slots.group_id = current_group_id
    and rooms.status = 'playing';

  if current_game_session_id is null then
    select game_session_history.game_session_id
      into current_game_session_id
    from public.game_session_history
    join public.game_sessions
      on game_sessions.id = game_session_history.game_session_id
     and game_sessions.group_id = game_session_history.group_id
    join public.rooms
      on rooms.id = game_session_history.room_id
     and rooms.group_id = game_session_history.group_id
    where game_session_history.group_id = current_group_id
      and game_session_history.closed_by_player_id = current_player_id
      and game_sessions.state = 'finished'
      and rooms.status = 'closed'
    order by game_session_history.finished_at desc, game_session_history.id desc
    limit 1;
  end if;

  if current_game_session_id is not null then
    perform public.ensure_impostor_shared_session(
      current_game_session_id,
      current_group_id
    );
  end if;

  select * into legacy_result from public.end_session_legacy_increment_4();

  if legacy_result.ended is true then
    if current_game_session_id is null then
      raise exception 'No se pudo identificar la tanda Impostor finalizada.'
        using errcode = 'P0022',
              detail = 'end mirror: finished game session missing';
    end if;

    select game_sessions.finished_at
      into current_game_session_finished_at
    from public.game_sessions
    where game_sessions.id = current_game_session_id
      and game_sessions.group_id = current_group_id;

    if current_game_session_finished_at is null then
      raise exception 'La tanda Impostor finalizada no tiene timestamp consistente.'
        using errcode = 'P0022',
              detail = 'end mirror: missing finished timestamp';
    end if;

    select room_sessions.finished_at
      into shared_finished_at
    from public.room_sessions
    where room_sessions.id = current_game_session_id
      and room_sessions.group_id = current_group_id
      and room_sessions.game_type = 'impostor'
      and room_sessions.impostor_game_session_id = current_game_session_id
    for update;

    if not found or shared_finished_at is not null then
      raise exception 'La identidad compartida de la tanda Impostor no es finalizable.'
        using errcode = 'P0022',
              detail = 'end mirror: shared session not active';
    end if;

    update public.room_sessions
    set finished_at = current_game_session_finished_at
    where room_sessions.id = current_game_session_id
      and room_sessions.group_id = current_group_id
      and room_sessions.game_type = 'impostor'
      and room_sessions.impostor_game_session_id = current_game_session_id
      and room_sessions.finished_at is null;

    get diagnostics updated_shared_count = row_count;
    if updated_shared_count <> 1 then
      raise exception 'No se pudo finalizar la identidad compartida de la tanda.'
        using errcode = 'P0022',
              detail = 'end mirror: shared finish update count';
    end if;
  elsif legacy_result.already_ended is true then
    if current_game_session_id is null then
      raise exception 'No se pudo identificar la tanda Impostor ya finalizada.'
        using errcode = 'P0022',
              detail = 'end mirror: retry session missing';
    end if;

    select room_sessions.finished_at, game_sessions.finished_at
      into shared_finished_at, current_game_session_finished_at
    from public.room_sessions
    join public.game_sessions
      on game_sessions.id = room_sessions.impostor_game_session_id
     and game_sessions.group_id = room_sessions.group_id
    where room_sessions.id = current_game_session_id
      and room_sessions.group_id = current_group_id
      and room_sessions.game_type = 'impostor'
      and room_sessions.impostor_game_session_id = current_game_session_id;

    if not found
      or shared_finished_at is null
      or current_game_session_finished_at is null
      or shared_finished_at is distinct from current_game_session_finished_at then
      raise exception 'La tanda Impostor finalizada diverge de su identidad compartida.'
        using errcode = 'P0022',
              detail = 'end mirror: finished session divergence';
    end if;
  end if;

  return query select
    legacy_result.ended,
    legacy_result.already_ended,
    legacy_result.state,
    legacy_result.round_count,
    legacy_result.winner_player_ids;
end;
$$;

create or replace function public.reassign_room_host_if_stale()
returns table (
  host_changed boolean,
  current_host_player_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  active_room_status text;
  active_room_host_player_id uuid;
  active_game_session_id uuid;
  active_shared_session_id uuid;
  active_shared_count integer;
  host_last_seen_at timestamptz;
  successor_player_id uuid;
  observed_at timestamptz;
  updated_room_count integer;
begin
  current_auth_user_id := auth.uid();
  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para reasignar host.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null or current_group_id is null then
    raise exception 'Esta AuthIdentity no tiene un Player asociado.'
      using errcode = 'P0002';
  end if;

  select player_active_room_slots.room_id,
         rooms.status,
         rooms.host_player_id
    into active_room_id, active_room_status, active_room_host_player_id
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  where player_active_room_slots.player_id = current_player_id
    and player_active_room_slots.group_id = current_group_id
  for update of rooms;

  if active_room_id is null or active_room_status not in ('lobby', 'playing') then
    host_changed := false;
    current_host_player_id := null;
    return next;
    return;
  end if;

  if active_room_status = 'playing' then
    select game_sessions.id
      into active_game_session_id
    from public.game_sessions
    where game_sessions.room_id = active_room_id
      and game_sessions.group_id = current_group_id;

    select count(*), (array_agg(room_sessions.id order by room_sessions.id))[1]
      into active_shared_count, active_shared_session_id
    from public.room_sessions
    where room_sessions.room_id = active_room_id
      and room_sessions.group_id = current_group_id
      and room_sessions.finished_at is null;

    if active_shared_count > 1 then
      raise exception 'La Room tiene mas de una sesion compartida activa.'
        using errcode = 'P0022',
              detail = 'host succession: multiple active neutral sessions';
    end if;

    if active_game_session_id is not null and active_shared_count = 0 then
      raise exception 'La sesion de juego activa no tiene espejo neutral.'
        using errcode = 'P0022',
              detail = 'host succession: active game session without neutral mirror';
    end if;

    if active_shared_count = 1
      and active_game_session_id is not null
      and active_shared_session_id is distinct from active_game_session_id then
      raise exception 'La sesion neutral activa no coincide con la sesion de juego.'
        using errcode = 'P0022',
              detail = 'host succession: neutral session identity mismatch';
    end if;
  end if;

  observed_at := now();

  select room_participants.last_seen_at
    into host_last_seen_at
  from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.player_id = active_room_host_player_id
    and room_participants.group_id = current_group_id
  for update;

  if not found
    or public.is_room_participant_liveness_active(host_last_seen_at, observed_at) then
    host_changed := false;
    current_host_player_id := active_room_host_player_id;
    return next;
    return;
  end if;

  select room_participants.player_id
    into successor_player_id
  from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.group_id = current_group_id
    and room_participants.player_id <> active_room_host_player_id
    and public.is_room_participant_liveness_active(
      room_participants.last_seen_at,
      observed_at
    )
    and (
      active_room_status = 'lobby'
      or exists (
        select 1
        from public.room_session_participants
        where room_session_participants.session_id = active_shared_session_id
          and room_session_participants.group_id = current_group_id
          and room_session_participants.player_id = room_participants.player_id
      )
    )
  order by room_participants.joined_at asc, room_participants.player_id asc
  limit 1;

  if successor_player_id is null then
    host_changed := false;
    current_host_player_id := active_room_host_player_id;
    return next;
    return;
  end if;

  update public.rooms
  set host_player_id = successor_player_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing')
    and rooms.host_player_id = active_room_host_player_id;

  get diagnostics updated_room_count = row_count;
  host_changed := updated_room_count = 1;
  current_host_player_id := successor_player_id;
  return next;
end;
$$;

revoke all on function public.ensure_impostor_shared_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_session() from public;
revoke all on function public.end_session() from public;
revoke all on function public.reassign_room_host_if_stale() from public;
grant execute on function public.start_session() to authenticated;
grant execute on function public.end_session() to authenticated;
grant execute on function public.reassign_room_host_if_stale() to authenticated;
