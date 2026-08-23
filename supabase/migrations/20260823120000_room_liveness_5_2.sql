-- Incremento 5.2 — liveness autoritativo minimo.
--
-- last_seen_at representa evidencia verificable de actividad reciente del
-- Player dentro de esa Room. No representa Presence, conexion, abandono,
-- host, ready ni estado de juego.

alter table public.room_participants
  add column last_seen_at timestamptz;

alter table public.room_participants
  alter column last_seen_at set default now();

-- Backfill explicito y acotado: las Rooms cerradas no tienen liveness activo.
-- Para Rooms todavia en lobby, usar now() evita que una sala activa quede
-- stale inmediatamente al aplicar la migration. No se usa joined_at como proxy
-- historico de actividad reciente.
update public.room_participants
set last_seen_at = now()
from public.rooms
where rooms.id = room_participants.room_id
  and rooms.group_id = room_participants.group_id
  and rooms.status = 'lobby'
  and room_participants.last_seen_at is null;

create or replace function public.is_room_participant_liveness_active(
  participant_last_seen_at timestamptz,
  observed_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select participant_last_seen_at is not null
    and observed_at - participant_last_seen_at <= interval '90 seconds';
$$;

revoke all on function public.is_room_participant_liveness_active(timestamptz, timestamptz)
  from public;

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

  if active_room_id is null or active_room_status <> 'lobby' then
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
