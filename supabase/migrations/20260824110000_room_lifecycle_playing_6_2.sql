-- Incremento 6.2 — lifecycle de Room preparado para gameplay.
--
-- Room activa pasa a significar status in ('lobby', 'playing').
-- Room joinable sigue significando status = 'lobby'.
--
-- No se implementa START_SESSION, GameSession.state, Round, seleccion de
-- palabra/impostor, lectura privada, END_SESSION ni UI de gameplay.

alter table public.rooms
  drop constraint rooms_status_check;

alter table public.rooms
  add constraint rooms_status_check
  check (status in ('lobby', 'playing', 'closed'));

drop index public.rooms_active_host_player_key;

create unique index rooms_active_host_player_key
  on public.rooms (host_player_id)
  where status in ('lobby', 'playing');

create or replace function public.rooms_release_active_slots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('lobby', 'playing')
    and new.status not in ('lobby', 'playing') then
    delete from public.player_active_room_slots
    where player_active_room_slots.room_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.rooms_release_active_slots() from public;

create or replace function public.rooms_prevent_reopening()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed' and new.status in ('lobby', 'playing') then
    raise exception 'Una sala cerrada no puede reabrirse.'
      using errcode = 'P0013';
  end if;

  return new;
end;
$$;

revoke all on function public.rooms_prevent_reopening() from public;

drop function public.create_room();

create or replace function public.create_room()
returns table (
  room_id uuid,
  room_join_code text,
  room_status text,
  participant_player_id uuid,
  participant_nickname text,
  participant_is_host boolean,
  participant_is_self boolean,
  participant_joined_at timestamptz
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
  new_room_id uuid;
  new_join_code text;
  attempt integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para crear una sala.'
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

  select player_active_room_slots.room_id
    into active_room_id
  from public.player_active_room_slots
  where player_active_room_slots.player_id = current_player_id;

  if active_room_id is null then
    for attempt in 1..8 loop
      new_join_code := public.generate_room_join_code();
      new_room_id := extensions.gen_random_uuid();

      begin
        insert into public.rooms (id, group_id, join_code, host_player_id)
        values (new_room_id, current_group_id, new_join_code, current_player_id);

        insert into public.room_participants (room_id, player_id, group_id)
        values (new_room_id, current_player_id, current_group_id);

        active_room_id := new_room_id;
        exit;
      exception
        when unique_violation then
          select player_active_room_slots.room_id
            into active_room_id
          from public.player_active_room_slots
          where player_active_room_slots.player_id = current_player_id;

          if active_room_id is not null then
            exit;
          end if;
      end;
    end loop;

    if active_room_id is null then
      raise exception 'No se pudo crear la sala. Intenta de nuevo.';
    end if;
  end if;

  return query
  select
    rooms.id,
    rooms.join_code,
    rooms.status,
    room_participants.player_id,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    (room_participants.player_id = current_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
   and players.group_id = rooms.group_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing')
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

revoke all on function public.create_room() from public;
grant execute on function public.create_room() to authenticated;

drop function public.get_my_active_room();

create or replace function public.get_my_active_room()
returns table (
  room_id uuid,
  room_join_code text,
  room_status text,
  participant_player_id uuid,
  participant_nickname text,
  participant_is_host boolean,
  participant_is_self boolean,
  participant_joined_at timestamptz
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
  returned_participant_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para recuperar la sala activa.'
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

  select player_active_room_slots.room_id
    into active_room_id
  from public.player_active_room_slots
  where player_active_room_slots.player_id = current_player_id;

  if active_room_id is null then
    return;
  end if;

  select rooms.status
    into active_room_status
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
   and room_participants.player_id = current_player_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id;

  if active_room_status is null
    or active_room_status not in ('lobby', 'playing') then
    raise exception 'El slot activo no permite reconstruir una Room activa consistente.'
      using errcode = 'P0014';
  end if;

  return query
  select
    rooms.id,
    rooms.join_code,
    rooms.status,
    room_participants.player_id,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    (room_participants.player_id = current_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
   and players.group_id = rooms.group_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing')
  order by room_participants.joined_at asc, room_participants.player_id asc;

  get diagnostics returned_participant_count = row_count;

  if returned_participant_count = 0 then
    raise exception 'El slot activo no devolvio participantes para la Room.'
      using errcode = 'P0014';
  end if;
end;
$$;

revoke all on function public.get_my_active_room() from public;
grant execute on function public.get_my_active_room() to authenticated;

create or replace function public.is_current_player_room_participant(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    join public.room_participants
      on room_participants.player_id = players.id
     and room_participants.group_id = players.group_id
    join public.rooms
      on rooms.id = room_participants.room_id
     and rooms.group_id = room_participants.group_id
    where players.auth_user_id = auth.uid()
      and room_participants.room_id = target_room_id
      and rooms.status in ('lobby', 'playing')
  );
$$;

revoke all on function public.is_current_player_room_participant(uuid) from public;
grant execute on function public.is_current_player_room_participant(uuid) to authenticated;

create or replace function public.is_current_player_room_presence_participant(target_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_room_id uuid;
begin
  if target_topic !~ '^impostor-room-presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  target_room_id := replace(target_topic, 'impostor-room-presence:', '')::uuid;

  return exists (
    select 1
    from public.players
    join public.room_participants
      on room_participants.player_id = players.id
     and room_participants.group_id = players.group_id
    join public.rooms
      on rooms.id = room_participants.room_id
     and rooms.group_id = room_participants.group_id
    where players.auth_user_id = auth.uid()
      and room_participants.room_id = target_room_id
      and rooms.status in ('lobby', 'playing')
  );
end;
$$;

revoke all on function public.is_current_player_room_presence_participant(text) from public;
grant execute on function public.is_current_player_room_presence_participant(text) to authenticated;

create or replace function public.refresh_my_room_liveness()
returns void
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
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para refrescar liveness.'
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

  select
    player_active_room_slots.room_id,
    rooms.status
    into active_room_id, active_room_status
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  where player_active_room_slots.player_id = current_player_id;

  if active_room_id is null
    or active_room_status not in ('lobby', 'playing') then
    return;
  end if;

  update public.room_participants
  set last_seen_at = now()
  where room_participants.room_id = active_room_id
    and room_participants.player_id = current_player_id
    and room_participants.group_id = current_group_id
    and (
      room_participants.last_seen_at is null
      or room_participants.last_seen_at <= now() - interval '10 seconds'
    );
end;
$$;

revoke all on function public.refresh_my_room_liveness() from public;
grant execute on function public.refresh_my_room_liveness() to authenticated;

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

  select
    player_active_room_slots.room_id,
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

  if active_room_id is null
    or active_room_status not in ('lobby', 'playing') then
    host_changed := false;
    current_host_player_id := null;
    return next;
    return;
  end if;

  observed_at := now();

  select room_participants.last_seen_at
    into host_last_seen_at
  from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.player_id = active_room_host_player_id
    and room_participants.group_id = current_group_id
  for update;

  if not found then
    host_changed := false;
    current_host_player_id := active_room_host_player_id;
    return next;
    return;
  end if;

  if public.is_room_participant_liveness_active(host_last_seen_at, observed_at) then
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

revoke all on function public.reassign_room_host_if_stale() from public;
grant execute on function public.reassign_room_host_if_stale() to authenticated;
