-- Incremento 4.3 — Reconstrucción autoritativa de Room + lobby.
--
-- La plataforma sigue resolviendo Auth -> Player -> Group. La Room activa se
-- reconstruye dentro de Impostor desde el slot autoritativo del Player, sin
-- aceptar ids ni código como input de lectura.
create or replace function public.get_my_active_room()
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
