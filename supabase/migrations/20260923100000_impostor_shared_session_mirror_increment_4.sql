-- Increment 4: mirror Impostor start/end into the neutral session identity.
--
-- The legacy implementations are kept intact under private names. Public RPCs
-- retain their signatures and return contracts while wrapping the legacy
-- state machine in the same transaction as the shared writes.

alter function public.start_session() rename to start_session_legacy_increment_4;
alter function public.end_session() rename to end_session_legacy_increment_4;

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
  current_game_session_group_id uuid;
  current_game_session_room_id uuid;
  shared_session_count integer;
  game_roster_count integer;
  shared_roster_count integer;
begin
  select *
    into legacy_result
  from public.start_session_legacy_increment_4();

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

    select game_sessions.id, game_sessions.room_id, game_sessions.group_id
      into current_game_session_id, current_game_session_room_id, current_game_session_group_id
    from public.game_sessions
    where game_sessions.room_id = active_room_id
      and game_sessions.group_id = current_group_id;

    if current_game_session_id is null
      or current_game_session_room_id <> active_room_id
      or current_game_session_group_id <> current_group_id then
      raise exception 'La tanda Impostor no tiene una identidad compartida consistente.'
        using errcode = 'P0022';
    end if;

    if legacy_result.started is true then
      insert into public.room_sessions (
        id,
        room_id,
        group_id,
        game_type,
        started_at,
        finished_at,
        impostor_game_session_id
      )
      select
        game_sessions.id,
        game_sessions.room_id,
        game_sessions.group_id,
        'impostor',
        game_sessions.started_at,
        game_sessions.finished_at,
        game_sessions.id
      from public.game_sessions
      where game_sessions.id = current_game_session_id
        and game_sessions.group_id = current_group_id
      on conflict (id) do nothing;

      insert into public.room_session_participants (session_id, group_id, player_id)
      select
        session_players.game_session_id,
        session_players.group_id,
        session_players.player_id
      from public.session_players
      where session_players.game_session_id = current_game_session_id
        and session_players.group_id = current_group_id
      on conflict (session_id, player_id) do nothing;
    end if;

    select count(*)
      into shared_session_count
    from public.room_sessions
    where room_sessions.id = current_game_session_id
      and room_sessions.room_id = active_room_id
      and room_sessions.group_id = current_group_id
      and room_sessions.game_type = 'impostor'
      and room_sessions.impostor_game_session_id = current_game_session_id
      and room_sessions.finished_at is null;

    if shared_session_count <> 1 then
      raise exception 'La tanda Impostor no tiene una identidad compartida consistente.'
        using errcode = 'P0022';
    end if;

    select count(*)
      into game_roster_count
    from public.session_players
    where session_players.game_session_id = current_game_session_id
      and session_players.group_id = current_group_id;

    select count(*)
      into shared_roster_count
    from public.room_session_participants
    where room_session_participants.session_id = current_game_session_id
      and room_session_participants.group_id = current_group_id;

    if game_roster_count <> shared_roster_count
      or exists (
        select 1
        from public.session_players
        where session_players.game_session_id = current_game_session_id
          and session_players.group_id = current_group_id
          and not exists (
            select 1
            from public.room_session_participants
            where room_session_participants.session_id = session_players.game_session_id
              and room_session_participants.group_id = session_players.group_id
              and room_session_participants.player_id = session_players.player_id
          )
      ) then
      raise exception 'El roster Impostor no coincide con el roster compartido.'
        using errcode = 'P0022';
    end if;
  end if;

  return query
  select
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

  select *
    into legacy_result
  from public.end_session_legacy_increment_4();

  if legacy_result.ended is true then
    if current_game_session_id is null then
      raise exception 'No se pudo identificar la tanda Impostor finalizada.'
        using errcode = 'P0022';
    end if;

    select game_sessions.finished_at
      into current_game_session_finished_at
    from public.game_sessions
    where game_sessions.id = current_game_session_id
      and game_sessions.group_id = current_group_id;

    if current_game_session_finished_at is null then
      raise exception 'La tanda Impostor finalizada no tiene timestamp consistente.'
        using errcode = 'P0022';
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
        using errcode = 'P0022';
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
        using errcode = 'P0022';
    end if;
  elsif legacy_result.already_ended is true then
    if current_game_session_id is null then
      raise exception 'No se pudo identificar la tanda Impostor ya finalizada.'
        using errcode = 'P0022';
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
        using errcode = 'P0022';
    end if;
  end if;

  return query
  select
    legacy_result.ended,
    legacy_result.already_ended,
    legacy_result.state,
    legacy_result.round_count,
    legacy_result.winner_player_ids;
end;
$$;

revoke all on function public.start_session_legacy_increment_4() from public, authenticated;
revoke all on function public.end_session_legacy_increment_4() from public, authenticated;
revoke all on function public.start_session() from public;
revoke all on function public.end_session() from public;
grant execute on function public.start_session() to authenticated;
grant execute on function public.end_session() to authenticated;
