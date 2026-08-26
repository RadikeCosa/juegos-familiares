-- Incremento 12.3 - read model finished.
--
-- Amplia get_my_game_state() para reconstruir una tanda cerrada desde
-- game_session_history y round_history. No implementa UI final, estadisticas,
-- ranking, nuevas tandas por Room ni Realtime.

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
  impostor_guess_correct boolean,
  scoreboard_players jsonb,
  round_impostor jsonb,
  can_start_next_round boolean,
  can_end_session boolean,
  available_unused_words_count integer,
  next_round_block_reason text,
  finished_at timestamptz,
  round_count integer,
  final_scores jsonb,
  winner_player_ids uuid[],
  winners jsonb,
  rounds_summary jsonb
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

  select player_active_room_slots.room_id, rooms.status, rooms.host_player_id
    into active_room_id, active_room_status, active_room_host_player_id
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  where player_active_room_slots.player_id = current_player_id
    and player_active_room_slots.group_id = current_group_id;

  if active_room_id is null then
    return query
    select
      'finished'::text,
      game_session_history.round_count,
      null::text,
      null::text,
      null::jsonb,
      null::uuid,
      false,
      null::jsonb,
      false,
      null::text,
      null::text,
      null::boolean,
      null::jsonb,
      null::jsonb,
      false,
      false,
      null::integer,
      null::text,
      game_session_history.finished_at,
      game_session_history.round_count,
      game_session_history.final_scores,
      game_session_history.winner_player_ids,
      game_session_history.winners,
      coalesce(rounds_summary.rounds, '[]'::jsonb)
    from public.game_session_history
    join public.game_sessions
      on game_sessions.id = game_session_history.game_session_id
     and game_sessions.group_id = game_session_history.group_id
     and game_sessions.state = 'finished'
    join public.rooms
      on rooms.id = game_session_history.room_id
     and rooms.group_id = game_session_history.group_id
     and rooms.status = 'closed'
    join public.session_players
      on session_players.game_session_id = game_session_history.game_session_id
     and session_players.group_id = game_session_history.group_id
     and session_players.player_id = current_player_id
    join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'number', round_history.number,
          'round_winner', round_history.round_winner,
          'discovered_by_vote', round_history.discovered_by_vote,
          'impostor_guess_text', round_history.impostor_guess_text,
          'impostor_guess_correct', round_history.impostor_guess_correct,
          'scoring_summary', round_history.scoring_summary
        )
        order by round_history.number
      ) as rounds
      from public.round_history
      where round_history.game_session_history_id = game_session_history.id
        and round_history.game_session_id = game_session_history.game_session_id
        and round_history.group_id = game_session_history.group_id
    ) rounds_summary on true
    where game_session_history.group_id = current_group_id
    order by game_session_history.finished_at desc, game_session_history.id desc
    limit 1;

    return;
  end if;

  if active_room_status <> 'playing' then
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
      when game_sessions.state in ('round_result', 'scoreboard') then current_round.secret_word
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
      when game_sessions.state in ('impostor_guess', 'round_result', 'scoreboard') then coalesce(resolution_vote_results.vote_results, '[]'::jsonb)
      else null::jsonb
    end,
    (
      game_sessions.state = 'impostor_guess'
      and current_round.impostor_player_id = current_player_id
      and current_round.normalized_impostor_guess is null
    ),
    case
      when game_sessions.state in ('round_result', 'scoreboard') then current_round.round_winner
      else null::text
    end,
    case
      when game_sessions.state in ('round_result', 'scoreboard') then current_round.impostor_guess_text
      else null::text
    end,
    case
      when game_sessions.state in ('round_result', 'scoreboard') then current_round.impostor_guess_correct
      else null::boolean
    end,
    case
      when game_sessions.state = 'scoreboard' then coalesce(scoreboard_players.players, '[]'::jsonb)
      else null::jsonb
    end,
    case
      when game_sessions.state in ('round_result', 'scoreboard') then round_impostor.impostor
      else null::jsonb
    end,
    (
      game_sessions.state = 'scoreboard'
      and active_room_host_player_id = current_player_id
      and current_round.round_winner in ('impostor', 'group')
      and current_round.scored_at is not null
      and available_unused_words.word_count > 0
    ),
    (
      game_sessions.state = 'scoreboard'
      and active_room_host_player_id = current_player_id
      and current_round.round_winner in ('impostor', 'group')
      and current_round.scored_at is not null
    ),
    case
      when game_sessions.state = 'scoreboard' then available_unused_words.word_count
      else null::integer
    end,
    case
      when game_sessions.state <> 'scoreboard' then null::text
      when active_room_host_player_id <> current_player_id then 'not_host'
      when current_round.round_winner not in ('impostor', 'group')
        or current_round.scored_at is null then 'session_not_ready'
      when available_unused_words.word_count = 0 then 'no_words'
      else null::text
    end,
    null::timestamptz,
    null::integer,
    null::jsonb,
    null::uuid[],
    null::jsonb,
    null::jsonb
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
      rounds.round_winner,
      rounds.scored_at
    from public.rounds
    where rounds.game_session_id = game_sessions.id
      and rounds.group_id = game_sessions.group_id
    order by rounds.number desc
    limit 1
  ) current_round on true
  join lateral (
    select case
      when game_sessions.state = 'voting_second' then 2
      when game_sessions.state in ('impostor_guess', 'round_result', 'scoreboard')
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
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'player_id', session_players.player_id,
        'nickname', players.nickname,
        'score', session_players.score,
        'is_self', session_players.player_id = current_player_id
      )
      order by session_players.score desc, players.nickname, session_players.player_id
    ) as players
    from public.session_players
    join public.players
      on players.id = session_players.player_id
     and players.group_id = session_players.group_id
    where session_players.game_session_id = game_sessions.id
      and session_players.group_id = game_sessions.group_id
  ) scoreboard_players on true
  left join lateral (
    select jsonb_build_object(
      'player_id', players.id,
      'nickname', players.nickname
    ) as impostor
    from public.players
    where players.id = current_round.impostor_player_id
      and players.group_id = game_sessions.group_id
  ) round_impostor on true
  join lateral (
    select count(*)::integer as word_count
    from public.group_words
    where group_words.group_id = current_group_id
      and not exists (
        select 1
        from public.rounds used_rounds
        where used_rounds.game_session_id = game_sessions.id
          and used_rounds.group_id = game_sessions.group_id
          and used_rounds.normalized_secret_word = group_words.normalized_text
      )
  ) available_unused_words on true
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
