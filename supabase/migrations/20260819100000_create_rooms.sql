create table public.rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  group_id uuid not null,
  join_code text not null,
  host_player_id uuid not null,
  status text not null default 'lobby',
  created_at timestamptz not null default now(),
  constraint rooms_status_check
    check (status in ('lobby', 'closed')),
  constraint rooms_join_code_format_check
    check (join_code = upper(btrim(join_code)) and join_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  constraint rooms_group_id_fkey
    foreign key (group_id)
    references public.groups (id),
  constraint rooms_group_id_id_key
    unique (group_id, id),
  constraint rooms_host_player_same_group_fkey
    foreign key (group_id, host_player_id)
    references public.players (group_id, id)
);

create unique index rooms_join_code_key
  on public.rooms (join_code);

create unique index rooms_active_host_player_key
  on public.rooms (host_player_id)
  where status = 'lobby';

alter table public.rooms enable row level security;

create table public.room_participants (
  room_id uuid not null,
  player_id uuid not null,
  group_id uuid not null,
  joined_at timestamptz not null default now(),
  constraint room_participants_pkey
    primary key (room_id, player_id),
  constraint room_participants_room_id_group_id_fkey
    foreign key (group_id, room_id)
    references public.rooms (group_id, id),
  constraint room_participants_player_id_group_id_fkey
    foreign key (group_id, player_id)
    references public.players (group_id, id)
);

alter table public.room_participants enable row level security;

alter table public.rooms
  add constraint rooms_host_participant_fkey
  foreign key (id, host_player_id)
  references public.room_participants (room_id, player_id)
  deferrable initially deferred;

revoke all on table public.rooms from anon, authenticated;
revoke all on table public.room_participants from anon, authenticated;

create or replace function public.generate_room_join_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated_code text := '';
  random_bytes bytea;
  byte_index integer;
begin
  random_bytes := extensions.gen_random_bytes(8);

  for byte_index in 0..7 loop
    generated_code := generated_code ||
      substr(alphabet, (get_byte(random_bytes, byte_index) % length(alphabet)) + 1, 1);
  end loop;

  return generated_code;
end;
$$;

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

  select rooms.id
    into active_room_id
  from public.rooms
  where rooms.host_player_id = current_player_id
    and rooms.status = 'lobby';

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
          select rooms.id
            into active_room_id
          from public.rooms
          where rooms.host_player_id = current_player_id
            and rooms.status = 'lobby';

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

revoke all on function public.generate_room_join_code() from public;
revoke all on function public.create_room() from public;

grant execute on function public.create_room() to authenticated;
