-- Incremento 9.1 — voting_second + entrada autoritativa a segunda votacion.
--
-- No implementa votos de segunda vuelta, candidatos empatados visibles,
-- resolucion de segunda vuelta, scoring, scoreboard, Round.status,
-- Broadcast ni Realtime de gameplay.

alter table public.game_sessions
  drop constraint game_sessions_state_check;

alter table public.game_sessions
  add constraint game_sessions_state_check
  check (
    state in (
      'role_reveal',
      'discussion',
      'voting_first',
      'tie_discussion',
      'voting_second',
      'impostor_guess',
      'round_result'
    )
  );

create or replace function public.start_second_round_voting()
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
    raise exception 'Se necesita una AuthIdentity valida para ir a segunda votacion.'
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
    raise exception 'No tenes una sala activa para ir a segunda votacion.'
      using errcode = 'P0017';
  end if;

  if active_room_status <> 'playing' then
    raise exception 'La sala no esta disponible para ir a segunda votacion.'
      using errcode = 'P0018';
  end if;

  select game_sessions.id, game_sessions.state
    into current_game_session_id, current_game_session_state
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id
  for update;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para ir a segunda votacion.'
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
    raise exception 'La tanda no tiene una ronda consistente para ir a segunda votacion.'
      using errcode = 'P0022';
  end if;

  if current_game_session_state not in ('tie_discussion', 'voting_second') then
    raise exception 'La tanda no esta disponible para ir a segunda votacion.'
      using errcode = 'P0018';
  end if;

  if active_room_host_player_id <> current_player_id then
    raise exception 'Solo el host actual puede ir a segunda votacion.'
      using errcode = 'P0019';
  end if;

  if current_game_session_state = 'voting_second' then
    advanced := false;
    already_in_phase := true;
    state := 'voting_second';
    round_number := current_round_number;
    return next;
    return;
  end if;

  update public.game_sessions
  set state = 'voting_second'
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id
    and game_sessions.state = 'tie_discussion';

  get diagnostics updated_session_count = row_count;

  if updated_session_count <> 1 then
    raise exception 'No se pudo ir a segunda votacion de forma consistente.'
      using errcode = 'P0018';
  end if;

  advanced := true;
  already_in_phase := false;
  state := 'voting_second';
  round_number := current_round_number;
  return next;
end;
$$;

revoke all on function public.start_second_round_voting() from public;
grant execute on function public.start_second_round_voting() to authenticated;

drop function public.get_my_game_state();

create or replace function public.get_my_game_state()
returns table (
  state text,
  round_number integer,
  role text,
  word text,
  candidates jsonb,
  my_vote_target_player_id uuid,
  has_voted boolean,
  vote_results jsonb
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
    end,
    case
      when game_sessions.state = 'voting_first' then coalesce(voting_candidates.candidates, '[]'::jsonb)
      else null::jsonb
    end,
    case
      when game_sessions.state = 'voting_second' then null::uuid
      else my_vote.target_player_id
    end,
    case
      when game_sessions.state = 'voting_second' then false
      else my_vote.target_player_id is not null
    end,
    case
      when game_sessions.state in ('tie_discussion', 'impostor_guess', 'round_result') then coalesce(aggregated_vote_results.vote_results, '[]'::jsonb)
      else null::jsonb
    end
  from public.game_sessions
  join lateral (
    select
      rounds.id,
      rounds.number,
      rounds.secret_word,
      rounds.impostor_player_id
    from public.rounds
    where rounds.game_session_id = game_sessions.id
      and rounds.group_id = game_sessions.group_id
    order by rounds.number desc
    limit 1
  ) current_round on true
  left join lateral (
    select round_votes.target_player_id
    from public.round_votes
    where round_votes.round_id = current_round.id
      and round_votes.game_session_id = game_sessions.id
      and round_votes.voting_round = 1
      and round_votes.voter_player_id = current_player_id
    limit 1
  ) my_vote on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'player_id', session_players.player_id,
        'nickname', players.nickname
      )
      order by players.nickname, session_players.player_id
    ) as candidates
    from public.session_players
    join public.players
      on players.id = session_players.player_id
     and players.group_id = session_players.group_id
    where session_players.game_session_id = game_sessions.id
      and session_players.group_id = game_sessions.group_id
      and session_players.player_id <> current_player_id
  ) voting_candidates on true
  left join lateral (
    with vote_counts as (
      select
        round_votes.target_player_id,
        count(*)::integer as vote_count
      from public.round_votes
      where round_votes.round_id = current_round.id
        and round_votes.game_session_id = game_sessions.id
        and round_votes.voting_round = 1
      group by round_votes.target_player_id
    )
    select jsonb_agg(
      jsonb_build_object(
        'player_id', vote_counts.target_player_id,
        'nickname', players.nickname,
        'vote_count', vote_counts.vote_count
      )
      order by vote_counts.vote_count desc, players.nickname, vote_counts.target_player_id
    ) as vote_results
    from vote_counts
    join public.players
      on players.id = vote_counts.target_player_id
     and players.group_id = game_sessions.group_id
  ) aggregated_vote_results on true
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
