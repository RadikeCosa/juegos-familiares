-- Incremento 10.2 — read model de intento final del impostor.
--
-- Expone lo minimo para UI de impostor_guess y round_result.
-- No implementa scoring, scoreboard, nueva ronda, historial, fin de tanda,
-- Broadcast ni Realtime de gameplay.

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
  vote_results jsonb,
  can_submit_impostor_guess boolean,
  winner text,
  impostor_guess_text text,
  impostor_guess_correct boolean
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
      when game_sessions.state = 'impostor_guess' then null::text
      when game_sessions.state = 'round_result' then current_round.secret_word
      when current_round.impostor_player_id = current_player_id then null::text
      else current_round.secret_word
    end,
    case
      when game_sessions.state = 'voting_first' then coalesce(first_voting_candidates.candidates, '[]'::jsonb)
      when game_sessions.state = 'tie_discussion' then coalesce(tie_discussion_candidates.candidates, '[]'::jsonb)
      when game_sessions.state = 'voting_second' then coalesce(second_voting_candidates.candidates, '[]'::jsonb)
      else null::jsonb
    end,
    my_vote.target_player_id,
    my_vote.target_player_id is not null,
    case
      when game_sessions.state = 'tie_discussion' then coalesce(first_round_vote_results.vote_results, '[]'::jsonb)
      when game_sessions.state in ('impostor_guess', 'round_result') then coalesce(resolution_vote_results.vote_results, '[]'::jsonb)
      else null::jsonb
    end,
    (
      game_sessions.state = 'impostor_guess'
      and current_round.impostor_player_id = current_player_id
      and current_round.normalized_impostor_guess is null
    ),
    case
      when game_sessions.state = 'round_result' then current_round.round_winner
      else null::text
    end,
    case
      when game_sessions.state = 'round_result' then current_round.impostor_guess_text
      else null::text
    end,
    case
      when game_sessions.state = 'round_result' then current_round.impostor_guess_correct
      else null::boolean
    end
  from public.game_sessions
  join lateral (
    select
      rounds.id,
      rounds.number,
      rounds.secret_word,
      rounds.impostor_player_id,
      rounds.normalized_impostor_guess,
      rounds.impostor_guess_text,
      rounds.impostor_guess_correct,
      rounds.round_winner
    from public.rounds
    where rounds.game_session_id = game_sessions.id
      and rounds.group_id = game_sessions.group_id
    order by rounds.number desc
    limit 1
  ) current_round on true
  join lateral (
    select case
      when game_sessions.state = 'voting_second' then 2
      when game_sessions.state in ('impostor_guess', 'round_result')
       and exists (
        select 1
        from public.round_votes
        where round_votes.round_id = current_round.id
          and round_votes.game_session_id = game_sessions.id
          and round_votes.voting_round = 2
      ) then 2
      else 1
    end as voting_round
  ) visible_vote_round on true
  left join lateral (
    select round_votes.target_player_id
    from public.round_votes
    where round_votes.round_id = current_round.id
      and round_votes.game_session_id = game_sessions.id
      and round_votes.voting_round = visible_vote_round.voting_round
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
  ) first_voting_candidates on true
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
    ),
    max_vote as (
      select max(vote_counts.vote_count) as vote_count
      from vote_counts
    ),
    tie_candidates as (
      select vote_counts.target_player_id
      from vote_counts, max_vote
      where vote_counts.vote_count = max_vote.vote_count
    )
    select jsonb_agg(
      jsonb_build_object(
        'player_id', tie_candidates.target_player_id,
        'nickname', players.nickname
      )
      order by players.nickname, tie_candidates.target_player_id
    ) as candidates
    from tie_candidates
    join public.players
      on players.id = tie_candidates.target_player_id
     and players.group_id = game_sessions.group_id
  ) tie_discussion_candidates on true
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
    ),
    max_vote as (
      select max(vote_counts.vote_count) as vote_count
      from vote_counts
    ),
    tie_candidates as (
      select vote_counts.target_player_id
      from vote_counts, max_vote
      where vote_counts.vote_count = max_vote.vote_count
    )
    select jsonb_agg(
      jsonb_build_object(
        'player_id', tie_candidates.target_player_id,
        'nickname', players.nickname
      )
      order by players.nickname, tie_candidates.target_player_id
    ) as candidates
    from tie_candidates
    join public.players
      on players.id = tie_candidates.target_player_id
     and players.group_id = game_sessions.group_id
    where tie_candidates.target_player_id <> current_player_id
  ) second_voting_candidates on true
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
  ) first_round_vote_results on true
  left join lateral (
    with vote_counts as (
      select
        round_votes.target_player_id,
        count(*)::integer as vote_count
      from public.round_votes
      where round_votes.round_id = current_round.id
        and round_votes.game_session_id = game_sessions.id
        and round_votes.voting_round = visible_vote_round.voting_round
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
  ) resolution_vote_results on true
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
