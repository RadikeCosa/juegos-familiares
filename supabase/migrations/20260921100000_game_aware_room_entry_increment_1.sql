-- Increment 1: game-aware Room entry. Legacy signatures remain Impostor-only.
-- All writes and guards remain in the typed RPCs; wrappers preserve old callers.

create or replace function public.create_room(requested_game_type text)
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
  active_game_type text;
begin
  if requested_game_type is null or requested_game_type not in ('impostor', 'tutti_frutti') then
    raise exception 'Juego de sala invalido.' using errcode = 'P0028';
  end if;

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
        insert into public.rooms (id, group_id, join_code, host_player_id, game_type)
        values (new_room_id, current_group_id, new_join_code, current_player_id, requested_game_type);

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

  select rooms.game_type into active_game_type
  from public.rooms
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing');

  if active_game_type is null then
    raise exception 'El slot activo no permite reconstruir una Room activa consistente.' using errcode = 'P0014';
  end if;

  if active_game_type <> requested_game_type then
    raise exception 'Ya estas en una sala activa de otro juego.' using errcode = 'P0029';
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
begin
  return query select * from public.create_room('impostor'::text);
end;
$$;

create or replace function public.join_room_by_code(room_code text, expected_game_type text)
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
  target_room_game_type text;
  existing_active_room_id uuid;
  active_room_id uuid;
begin
  if expected_game_type is null or expected_game_type not in ('impostor', 'tutti_frutti') then
    raise exception 'Juego de sala invalido.' using errcode = 'P0028';
  end if;

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

  select rooms.id, rooms.group_id, rooms.status, rooms.game_type
    into target_room_id, target_room_group_id, target_room_status, target_room_game_type
  from public.rooms
  where rooms.join_code = normalized_code
  for update;

  if target_room_id is null or target_room_group_id <> current_group_id then
    raise exception 'No encontramos esa sala.'
      using errcode = 'P0010';
  end if;

  if target_room_game_type <> expected_game_type then
    raise exception 'El codigo pertenece a otro juego.' using errcode = 'P0030';
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
begin
  return query select * from public.join_room_by_code(room_code, 'impostor'::text);
end;
$$;

revoke all on function public.create_room(text) from public;
revoke all on function public.create_room() from public;
revoke all on function public.join_room_by_code(text, text) from public;
revoke all on function public.join_room_by_code(text) from public;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.create_room() to authenticated;
grant execute on function public.join_room_by_code(text, text) to authenticated;
grant execute on function public.join_room_by_code(text) to authenticated;

-- Impostor's existing start RPC writes game_sessions. Reject that write for a
-- Tutti Frutti Room even when a client bypasses game-specific navigation.
create function public.game_sessions_require_impostor_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.rooms
    where rooms.id = new.room_id
      and rooms.group_id = new.group_id
      and rooms.game_type = 'impostor'
  ) then
    raise exception 'La sala no pertenece a Impostor.' using errcode = 'P0030';
  end if;
  return new;
end;
$$;

create trigger game_sessions_require_impostor_room
  before insert or update of room_id, group_id on public.game_sessions
  for each row execute function public.game_sessions_require_impostor_room();

revoke all on function public.game_sessions_require_impostor_room() from public;
