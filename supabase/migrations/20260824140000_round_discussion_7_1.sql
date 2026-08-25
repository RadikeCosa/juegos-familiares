-- Incremento 7.1 — backend role_reveal -> discussion.
--
-- No implementa polling, UI, Broadcast, Realtime de gameplay, voting,
-- role acknowledgement, Round.status, score, winner ni END_SESSION.

alter table public.game_sessions
  drop constraint game_sessions_state_check;

alter table public.game_sessions
  add constraint game_sessions_state_check
  check (state in ('role_reveal', 'discussion'));

create or replace function public.start_round_discussion()
returns table (
  advanced boolean,
  already_in_phase boolean,
  state text,
  round_number integer
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
  current_game_session_id uuid;
  current_game_session_state text;
  current_round_number integer;
  updated_session_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para empezar la ronda.'
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

  if active_room_id is null then
    raise exception 'No tenes una sala activa para empezar la ronda.'
      using errcode = 'P0017';
  end if;

  if active_room_status <> 'playing' then
    raise exception 'La sala no esta disponible para empezar la ronda.'
      using errcode = 'P0018';
  end if;

  select game_sessions.id, game_sessions.state
    into current_game_session_id, current_game_session_state
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id
  for update;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para empezar la ronda.'
      using errcode = 'P0022';
  end if;

  if not exists (
    select 1
    from public.session_players
    where session_players.game_session_id = current_game_session_id
      and session_players.group_id = current_group_id
      and session_players.player_id = current_player_id
  ) then
    raise exception 'Este jugador no participa de la tanda actual.'
      using errcode = 'P0023';
  end if;

  select rounds.number
    into current_round_number
  from public.rounds
  where rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id
  order by rounds.number desc
  limit 1;

  if current_round_number is null then
    raise exception 'La tanda no tiene una ronda consistente para empezar.'
      using errcode = 'P0022';
  end if;

  if current_game_session_state = 'discussion' then
    advanced := false;
    already_in_phase := true;
    state := 'discussion';
    round_number := current_round_number;
    return next;
    return;
  end if;

  if current_game_session_state <> 'role_reveal' then
    raise exception 'La tanda no esta disponible para empezar la ronda.'
      using errcode = 'P0018';
  end if;

  if active_room_host_player_id <> current_player_id then
    raise exception 'Solo el host actual puede empezar la ronda.'
      using errcode = 'P0019';
  end if;

  update public.game_sessions
  set state = 'discussion'
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id
    and game_sessions.state = 'role_reveal';

  get diagnostics updated_session_count = row_count;

  if updated_session_count <> 1 then
    raise exception 'No se pudo empezar la ronda de forma consistente.'
      using errcode = 'P0018';
  end if;

  advanced := true;
  already_in_phase := false;
  state := 'discussion';
  round_number := current_round_number;
  return next;
end;
$$;

revoke all on function public.start_round_discussion() from public;
grant execute on function public.start_round_discussion() to authenticated;
