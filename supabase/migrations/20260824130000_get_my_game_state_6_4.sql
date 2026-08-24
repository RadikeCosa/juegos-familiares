-- Incremento 6.4 — lectura privada autoritativa inicial de gameplay.
--
-- No abre tablas privadas, no agrega Realtime/Broadcast, no cambia estados
-- ni implementa role acknowledgment, voting, score, winner, END_SESSION o UI.

create or replace function public.get_my_game_state()
returns table (
  state text,
  round_number integer,
  role text,
  word text
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
  current_game_session_id uuid;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para recuperar la tanda.'
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

  select player_active_room_slots.room_id, rooms.status
    into active_room_id, active_room_status
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  where player_active_room_slots.player_id = current_player_id
    and player_active_room_slots.group_id = current_group_id;

  if active_room_id is null or active_room_status <> 'playing' then
    return;
  end if;

  select game_sessions.id
    into current_game_session_id
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para reconstruir.'
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

  return query
  select
    game_sessions.state,
    current_round.number,
    case
      when current_round.impostor_player_id = current_player_id then 'impostor'
      else 'player'
    end,
    case
      when current_round.impostor_player_id = current_player_id then null::text
      else current_round.secret_word
    end
  from public.game_sessions
  join lateral (
    select rounds.number, rounds.secret_word, rounds.impostor_player_id
    from public.rounds
    where rounds.game_session_id = game_sessions.id
      and rounds.group_id = game_sessions.group_id
    order by rounds.number desc
    limit 1
  ) current_round on true
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id;

  if not found then
    raise exception 'La tanda no tiene una ronda consistente para reconstruir.'
      using errcode = 'P0022';
  end if;
end;
$$;

revoke all on function public.get_my_game_state() from public;
grant execute on function public.get_my_game_state() to authenticated;
