-- Incremento 4.2 — Join autoritativo.
--
-- "Una Room activa por Player" debe cubrir tambien a participantes normales,
-- no solo al host (eso ya lo garantizaba rooms_active_host_player_key).
-- Se denormaliza un "slot" de Room activa por Player en una tabla dedicada,
-- poblada por trigger cuando se inserta un RoomParticipant y liberada por
-- trigger cuando la Room deja de estar en lobby. El PRIMARY KEY(player_id)
-- hace que el conflicto se resuelva a nivel de indice unico dentro de la
-- misma transaccion que crea el RoomParticipant, sin depender solo de un
-- chequeo aplicativo previo.
create table public.player_active_room_slots (
  player_id uuid primary key,
  room_id uuid not null,
  group_id uuid not null,
  constraint player_active_room_slots_participant_fkey
    foreign key (room_id, player_id)
    references public.room_participants (room_id, player_id)
    on delete cascade,
  constraint player_active_room_slots_room_group_fkey
    foreign key (group_id, room_id)
    references public.rooms (group_id, id),
  constraint player_active_room_slots_player_group_fkey
    foreign key (group_id, player_id)
    references public.players (group_id, id)
);

alter table public.player_active_room_slots enable row level security;

revoke all on table public.player_active_room_slots from anon, authenticated;

create or replace function public.room_participants_claim_active_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_active_room_slots (player_id, room_id, group_id)
  values (new.player_id, new.room_id, new.group_id);

  return new;
end;
$$;

create trigger room_participants_claim_active_slot
  after insert on public.room_participants
  for each row
  execute function public.room_participants_claim_active_slot();

revoke all on function public.room_participants_claim_active_slot() from public;

-- Keeps the slot table honest if a Room ever stops being lobby, so a Player
-- is freed to join or create another Room. No product action closes a Room
-- yet in 4.2, but this keeps the invariant structurally correct rather than
-- relying on every future writer to remember to clean it up.
create or replace function public.rooms_release_active_slots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'lobby' and new.status <> 'lobby' then
    delete from public.player_active_room_slots
    where player_active_room_slots.room_id = new.id;
  end if;

  return new;
end;
$$;

create trigger rooms_release_active_slots
  after update of status on public.rooms
  for each row
  execute function public.rooms_release_active_slots();

revoke all on function public.rooms_release_active_slots() from public;

create or replace function public.rooms_prevent_reopening()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed' and new.status = 'lobby' then
    raise exception 'Una sala cerrada no puede reabrirse.'
      using errcode = 'P0013';
  end if;

  return new;
end;
$$;

create trigger rooms_prevent_reopening
  before update of status on public.rooms
  for each row
  execute function public.rooms_prevent_reopening();

-- create_room() must now recognize an active Room even when the Player
-- belongs to it as a plain participant (not just as host), and return that
-- Room instead of creating a second one.
create or replace function public.create_room()
returns table (
  room_join_code text,
  room_status text,
  participant_nickname text,
  participant_is_host boolean,
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
    rooms.join_code,
    rooms.status,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
  where rooms.id = active_room_id
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

-- Lets a second Player of the same Group join an existing lobby Room by its
-- opaque code. The only product input is room_code; Player/Group identity is
-- always derived server-side from auth.uid().
create or replace function public.join_room_by_code(room_code text)
returns table (
  room_join_code text,
  room_status text,
  participant_nickname text,
  participant_is_host boolean,
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
  where rooms.join_code = normalized_code;

  -- Same error for "no existe" and "existe en otro Group": conocer el codigo
  -- no autoriza a entrar, y no conviene revelar si el codigo pertenece a otro
  -- Group.
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

        if existing_active_room_id is null then
          raise;
        end if;

        if existing_active_room_id <> target_room_id then
          raise exception 'Ya estas en otra sala.'
            using errcode = 'P0012';
        end if;
    end;

    active_room_id := target_room_id;
  end if;

  return query
  select
    rooms.join_code,
    rooms.status,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
  where rooms.id = active_room_id
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

revoke all on function public.join_room_by_code(text) from public;
revoke all on function public.rooms_prevent_reopening() from public;

grant execute on function public.join_room_by_code(text) to authenticated;
