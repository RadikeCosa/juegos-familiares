-- Incremento 11.2 — aplicar puntos autoritativamente al cerrar round_result.
--
-- No implementa nueva ronda, UI final de marcador, historial, fin de tanda,
-- estadisticas, objetivo de puntos, Broadcast ni Realtime de gameplay.

alter table public.rounds
  add column scored_at timestamptz;

alter table public.rounds
  add constraint rounds_scored_requires_winner_check
    check (scored_at is null or round_winner is not null);

create or replace function public.advance_round_result_to_scoreboard()
returns table (
  advanced boolean,
  already_scored boolean,
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
  current_game_session_id uuid;
  current_game_session_state text;
  current_round_id uuid;
  current_round_number integer;
  current_impostor_player_id uuid;
  current_round_winner text;
  current_scored_at timestamptz;
  scoring_timestamp timestamptz;
  updated_score_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para mostrar el marcador.'
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
  where player_active_room_slots.player_id = current_player_id
    and player_active_room_slots.group_id = current_group_id
  for update of rooms;

  if active_room_id is null then
    raise exception 'No tenes una sala activa para mostrar el marcador.'
      using errcode = 'P0017';
  end if;

  if active_room_status <> 'playing' then
    raise exception 'La sala no esta disponible para mostrar el marcador.'
      using errcode = 'P0018';
  end if;

  select game_sessions.id, game_sessions.state
    into current_game_session_id, current_game_session_state
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id
  for update;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para mostrar el marcador.'
      using errcode = 'P0022';
  end if;

  select
    rounds.id,
    rounds.number,
    rounds.impostor_player_id,
    rounds.round_winner,
    rounds.scored_at
    into
      current_round_id,
      current_round_number,
      current_impostor_player_id,
      current_round_winner,
      current_scored_at
  from public.rounds
  where rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id
  order by rounds.number desc
  limit 1
  for update;

  if current_round_id is null
    or current_round_number is null
    or current_impostor_player_id is null then
    raise exception 'La tanda no tiene una ronda consistente para mostrar el marcador.'
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

  if current_game_session_state not in ('round_result', 'scoreboard') then
    raise exception 'La ronda no esta lista para mostrar el marcador.'
      using errcode = 'P0018';
  end if;

  if current_round_winner not in ('impostor', 'group') then
    raise exception 'La ronda no tiene un ganador final consistente.'
      using errcode = 'P0022';
  end if;

  if current_scored_at is not null then
    if current_game_session_state <> 'scoreboard' then
      update public.game_sessions
      set state = 'scoreboard'
      where game_sessions.id = current_game_session_id
        and game_sessions.group_id = current_group_id;
    end if;

    advanced := false;
    already_scored := true;
    state := 'scoreboard';
    round_number := current_round_number;
    return next;
    return;
  end if;

  scoring_timestamp := now();

  if current_round_winner = 'impostor' then
    update public.session_players
    set score = score + 2
    where session_players.game_session_id = current_game_session_id
      and session_players.group_id = current_group_id
      and session_players.player_id = current_impostor_player_id;

    get diagnostics updated_score_count = row_count;

    if updated_score_count <> 1 then
      raise exception 'No se pudo puntuar al impostor de la ronda.'
        using errcode = 'P0022';
    end if;
  else
    update public.session_players
    set score = score + 1
    where session_players.game_session_id = current_game_session_id
      and session_players.group_id = current_group_id
      and session_players.player_id <> current_impostor_player_id;

    get diagnostics updated_score_count = row_count;

    if updated_score_count < 2 then
      raise exception 'No se pudo puntuar al grupo de la ronda.'
        using errcode = 'P0022';
    end if;
  end if;

  update public.rounds
  set scored_at = scoring_timestamp
  where rounds.id = current_round_id
    and rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id
    and rounds.scored_at is null;

  get diagnostics updated_score_count = row_count;

  if updated_score_count <> 1 then
    raise exception 'La ronda ya fue puntuada por otra operacion.'
      using errcode = 'P0022';
  end if;

  update public.game_sessions
  set state = 'scoreboard'
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id;

  advanced := true;
  already_scored := false;
  state := 'scoreboard';
  round_number := current_round_number;
  return next;
end;
$$;

revoke all on function public.advance_round_result_to_scoreboard() from public;
grant execute on function public.advance_round_result_to_scoreboard() to authenticated;
