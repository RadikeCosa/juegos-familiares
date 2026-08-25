-- Incremento 8.2 — submit_round_vote + resolucion autoritativa de primera votacion.
--
-- No implementa UI de voting, segunda votacion, guess de palabra, reveal,
-- scoring, scoreboard, nueva ronda, Round.status, Broadcast ni Realtime.

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
      'impostor_guess',
      'round_result'
    )
  );

create or replace function public.submit_round_vote(target_player_id uuid)
returns table (
  accepted boolean,
  already_recorded boolean,
  state text,
  round_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_target_player_id uuid;
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
  existing_target_player_id uuid;
  required_vote_count integer;
  submitted_vote_count integer;
  top_target_player_id uuid;
  top_candidate_count integer;
  next_game_session_state text;
  updated_session_count integer;
begin
  requested_target_player_id := submit_round_vote.target_player_id;
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para votar.'
      using errcode = '28000';
  end if;

  if requested_target_player_id is null then
    raise exception 'El voto no tiene un candidato valido.'
      using errcode = 'P0024';
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
    raise exception 'No tenes una sala activa para votar.'
      using errcode = 'P0017';
  end if;

  if active_room_status <> 'playing' then
    raise exception 'La sala no esta disponible para votar.'
      using errcode = 'P0018';
  end if;

  select game_sessions.id, game_sessions.state
    into current_game_session_id, current_game_session_state
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id
  for update;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para votar.'
      using errcode = 'P0022';
  end if;

  select rounds.id, rounds.number, rounds.impostor_player_id
    into current_round_id, current_round_number, current_impostor_player_id
  from public.rounds
  where rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id
  order by rounds.number desc
  limit 1;

  if current_round_id is null
    or current_round_number is null
    or current_impostor_player_id is null then
    raise exception 'La tanda no tiene una ronda consistente para votar.'
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

  if requested_target_player_id = current_player_id then
    raise exception 'No podes votarte a vos mismo.'
      using errcode = 'P0024';
  end if;

  if not exists (
    select 1
    from public.session_players
    where session_players.game_session_id = current_game_session_id
      and session_players.group_id = current_group_id
      and session_players.player_id = requested_target_player_id
  ) then
    raise exception 'El candidato elegido no participa de la tanda actual.'
      using errcode = 'P0024';
  end if;

  select round_votes.target_player_id
    into existing_target_player_id
  from public.round_votes
  where round_votes.round_id = current_round_id
    and round_votes.game_session_id = current_game_session_id
    and round_votes.voting_round = 1
    and round_votes.voter_player_id = current_player_id;

  if existing_target_player_id is not null
    and existing_target_player_id <> requested_target_player_id then
    raise exception 'Tu voto ya fue registrado y no se puede cambiar.'
      using errcode = 'P0025';
  end if;

  if current_game_session_state <> 'voting_first' then
    if existing_target_player_id = requested_target_player_id
      and current_game_session_state in (
        'tie_discussion',
        'impostor_guess',
        'round_result'
      ) then
      accepted := true;
      already_recorded := true;
      state := current_game_session_state;
      round_number := current_round_number;
      return next;
      return;
    end if;

    raise exception 'La tanda no esta en votacion.'
      using errcode = 'P0018';
  end if;

  if existing_target_player_id is null then
    insert into public.round_votes (
      round_id,
      game_session_id,
      group_id,
      voting_round,
      voter_player_id,
      target_player_id
    )
    values (
      current_round_id,
      current_game_session_id,
      current_group_id,
      1,
      current_player_id,
      requested_target_player_id
    );

    already_recorded := false;
  else
    already_recorded := true;
  end if;

  select count(*)
    into required_vote_count
  from public.session_players
  where session_players.game_session_id = current_game_session_id
    and session_players.group_id = current_group_id;

  select count(*)
    into submitted_vote_count
  from public.round_votes
  where round_votes.round_id = current_round_id
    and round_votes.game_session_id = current_game_session_id
    and round_votes.voting_round = 1;

  if submitted_vote_count < required_vote_count then
    accepted := true;
    state := 'voting_first';
    round_number := current_round_number;
    return next;
    return;
  end if;

  with vote_counts as (
    select
      round_votes.target_player_id,
      count(*) as vote_count
    from public.round_votes
    where round_votes.round_id = current_round_id
      and round_votes.game_session_id = current_game_session_id
      and round_votes.voting_round = 1
    group by round_votes.target_player_id
  ),
  max_vote as (
    select max(vote_count) as vote_count
    from vote_counts
  ),
  top_candidates as (
    select vote_counts.target_player_id
    from vote_counts
    join max_vote
      on max_vote.vote_count = vote_counts.vote_count
  )
  select count(*)
    into top_candidate_count
  from top_candidates;

  with vote_counts as (
    select
      round_votes.target_player_id,
      count(*) as vote_count
    from public.round_votes
    where round_votes.round_id = current_round_id
      and round_votes.game_session_id = current_game_session_id
      and round_votes.voting_round = 1
    group by round_votes.target_player_id
  ),
  max_vote as (
    select max(vote_count) as vote_count
    from vote_counts
  ),
  top_candidates as (
    select vote_counts.target_player_id
    from vote_counts
    join max_vote
      on max_vote.vote_count = vote_counts.vote_count
  )
  select top_candidates.target_player_id
    into top_target_player_id
  from top_candidates
  order by top_candidates.target_player_id
  limit 1;

  if top_candidate_count is null or top_candidate_count < 1 then
    raise exception 'No se pudo resolver la votacion de forma consistente.'
      using errcode = 'P0022';
  end if;

  if top_candidate_count > 1 then
    next_game_session_state := 'tie_discussion';
  elsif top_target_player_id = current_impostor_player_id then
    next_game_session_state := 'impostor_guess';
  else
    next_game_session_state := 'round_result';
  end if;

  update public.game_sessions
  set state = next_game_session_state
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id
    and game_sessions.state = 'voting_first';

  get diagnostics updated_session_count = row_count;

  if updated_session_count <> 1 then
    raise exception 'No se pudo resolver la votacion de forma consistente.'
      using errcode = 'P0022';
  end if;

  accepted := true;
  state := next_game_session_state;
  round_number := current_round_number;
  return next;
end;
$$;

revoke all on function public.submit_round_vote(uuid) from public;
grant execute on function public.submit_round_vote(uuid) to authenticated;
