-- Incremento 5.1 — Presence basica del lobby.
--
-- RoomParticipant sigue representando membresia persistida. Esta migration agrega
-- metadato tecnico de Player a las lecturas autoritativas del lobby para poder
-- correlacionar Presence efimera sin usar nicknames ni cambiar el host.

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
    and rooms.status = 'lobby'
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

revoke all on function public.create_room() from public;
grant execute on function public.create_room() to authenticated;

drop function public.join_room_by_code(text);

create or replace function public.join_room_by_code(room_code text)
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
  normalized_code text;
  target_room_id uuid;
  target_room_group_id uuid;
  target_room_status text;
  existing_active_room_id uuid;
  active_room_id uuid;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para unirse a una sala.'
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

  normalized_code := upper(btrim(coalesce(room_code, '')));

  select rooms.id, rooms.group_id, rooms.status
    into target_room_id, target_room_group_id, target_room_status
  from public.rooms
  where rooms.join_code = normalized_code
  for update;

  if target_room_id is null or target_room_group_id <> current_group_id then
    raise exception 'No encontramos esa sala.'
      using errcode = 'P0010';
  end if;

  if target_room_status <> 'lobby' then
    raise exception 'Esta sala ya no esta disponible.'
      using errcode = 'P0011';
  end if;

  if exists (
    select 1
    from public.room_participants
    where room_participants.room_id = target_room_id
      and room_participants.player_id = current_player_id
  ) then
    active_room_id := target_room_id;
  else
    select player_active_room_slots.room_id
      into existing_active_room_id
    from public.player_active_room_slots
    where player_active_room_slots.player_id = current_player_id;

    if existing_active_room_id is not null and existing_active_room_id <> target_room_id then
      raise exception 'Ya estas en otra sala.'
        using errcode = 'P0012';
    end if;

    begin
      insert into public.room_participants (room_id, player_id, group_id)
      values (target_room_id, current_player_id, current_group_id);
    exception
      when unique_violation then
        select player_active_room_slots.room_id
          into existing_active_room_id
        from public.player_active_room_slots
        where player_active_room_slots.player_id = current_player_id;

        if existing_active_room_id is not null and existing_active_room_id <> target_room_id then
          raise exception 'Ya estas en otra sala.'
            using errcode = 'P0012';
        end if;
    end;

    active_room_id := target_room_id;
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
    and rooms.status = 'lobby'
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

revoke all on function public.join_room_by_code(text) from public;
grant execute on function public.join_room_by_code(text) to authenticated;

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

  if active_room_status is null or active_room_status <> 'lobby' then
    raise exception 'El slot activo no permite reconstruir una Room lobby consistente.'
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
    and rooms.status = 'lobby'
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
      and rooms.status = 'lobby'
  );
end;
$$;

revoke all on function public.is_current_player_room_presence_participant(text) from public;
grant execute on function public.is_current_player_room_presence_participant(text) to authenticated;

drop policy if exists "Room participants can listen to room presence" on realtime.messages;
drop policy if exists "Room participants can track room presence" on realtime.messages;

create policy "Room participants can listen to room presence"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'presence'
    and public.is_current_player_room_presence_participant(realtime.topic())
  );

create policy "Room participants can track room presence"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and public.is_current_player_room_presence_participant(realtime.topic())
  );
