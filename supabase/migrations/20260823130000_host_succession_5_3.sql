-- Incremento 5.3 — sucesion autoritativa de host.
--
-- Presence puede disparar una solicitud cliente, pero no decide stale ni
-- candidato. La autoridad deriva Auth -> Player -> Room activa y revalida
-- liveness con reloj de Postgres antes de modificar rooms.host_player_id.

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

  if active_room_id is null or active_room_status <> 'lobby' then
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
    and rooms.status = 'lobby'
    and rooms.host_player_id = active_room_host_player_id;

  get diagnostics updated_room_count = row_count;
  host_changed := updated_room_count = 1;
  current_host_player_id := successor_player_id;
  return next;
end;
$$;

revoke all on function public.reassign_room_host_if_stale() from public;
grant execute on function public.reassign_room_host_if_stale() to authenticated;
