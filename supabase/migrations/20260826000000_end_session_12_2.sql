-- Incremento 12.2 - end_session() autoritativa.
--
-- Cierra una tanda desde scoreboard, persiste historial minimo y cierra la
-- Room. No implementa read model finished, UI final, estadisticas ni Realtime.

create or replace function public.end_session()
returns table (
  ended boolean,
  already_ended boolean,
  state text,
  round_count integer,
  winner_player_ids uuid[]
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
  current_started_at timestamptz;
  current_finished_at timestamptz;
  closing_timestamp timestamptz;
  computed_round_count integer;
  computed_roster jsonb;
  computed_final_scores jsonb;
  computed_winner_player_ids uuid[];
  computed_winners jsonb;
  inserted_history_id uuid;
  existing_history_id uuid;
  updated_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para terminar la tanda.'
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

  select game_session_history.id,
         game_session_history.round_count,
         game_session_history.winner_player_ids
    into existing_history_id, computed_round_count, computed_winner_player_ids
  from public.game_session_history
  join public.game_sessions
    on game_sessions.id = game_session_history.game_session_id
   and game_sessions.group_id = game_session_history.group_id
  join public.rooms
    on rooms.id = game_session_history.room_id
   and rooms.group_id = game_session_history.group_id
  where game_session_history.group_id = current_group_id
    and game_session_history.closed_by_player_id = current_player_id
    and game_sessions.state = 'finished'
    and rooms.status = 'closed'
  order by game_session_history.finished_at desc, game_session_history.id desc
  limit 1;

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
    if existing_history_id is not null then
      ended := false;
      already_ended := true;
      state := 'finished';
      round_count := computed_round_count;
      winner_player_ids := computed_winner_player_ids;
      return next;
      return;
    end if;

    raise exception 'No tenes una sala activa para terminar la tanda.'
      using errcode = 'P0017';
  end if;

  if active_room_status <> 'playing' then
    raise exception 'La sala no esta disponible para terminar la tanda.'
      using errcode = 'P0018';
  end if;

  select
    game_sessions.id,
    game_sessions.state,
    game_sessions.started_at,
    game_sessions.finished_at
    into
      current_game_session_id,
      current_game_session_state,
      current_started_at,
      current_finished_at
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id
  for update;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para terminar.'
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

  if active_room_host_player_id <> current_player_id then
    raise exception 'Solo el host actual puede terminar la tanda.'
      using errcode = 'P0019';
  end if;

  select game_session_history.id,
         game_session_history.round_count,
         game_session_history.winner_player_ids
    into existing_history_id, computed_round_count, computed_winner_player_ids
  from public.game_session_history
  where game_session_history.game_session_id = current_game_session_id
    and game_session_history.group_id = current_group_id;

  if current_game_session_state = 'finished' and existing_history_id is not null then
    ended := false;
    already_ended := true;
    state := 'finished';
    round_count := computed_round_count;
    winner_player_ids := computed_winner_player_ids;
    return next;
    return;
  end if;

  if current_game_session_state <> 'scoreboard' then
    raise exception 'La tanda no esta en marcador para terminar.'
      using errcode = 'P0018';
  end if;

  if exists (
    select 1
    from public.rounds
    where rounds.game_session_id = current_game_session_id
      and rounds.group_id = current_group_id
      and (
        rounds.round_winner not in ('impostor', 'group')
        or rounds.scored_at is null
      )
  ) then
    raise exception 'La tanda tiene rondas sin resultado puntuado.'
      using errcode = 'P0018';
  end if;

  select count(*)::integer
    into computed_round_count
  from public.rounds
  where rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id;

  if computed_round_count < 1 then
    raise exception 'La tanda no tiene rondas para historizar.'
      using errcode = 'P0022';
  end if;

  select jsonb_agg(
      jsonb_build_object(
        'player_id', session_players.player_id,
        'nickname', players.nickname,
        'score', session_players.score
      )
      order by players.nickname, session_players.player_id
    )
    into computed_roster
  from public.session_players
  join public.players
    on players.id = session_players.player_id
   and players.group_id = session_players.group_id
  where session_players.game_session_id = current_game_session_id
    and session_players.group_id = current_group_id;

  select jsonb_agg(
      jsonb_build_object(
        'player_id', session_players.player_id,
        'nickname', players.nickname,
        'score', session_players.score
      )
      order by session_players.score desc, players.nickname, session_players.player_id
    )
    into computed_final_scores
  from public.session_players
  join public.players
    on players.id = session_players.player_id
   and players.group_id = session_players.group_id
  where session_players.game_session_id = current_game_session_id
    and session_players.group_id = current_group_id;

  select array_agg(winners.player_id order by winners.nickname, winners.player_id),
         jsonb_agg(
           jsonb_build_object(
             'player_id', winners.player_id,
             'nickname', winners.nickname,
             'score', winners.score
           )
           order by winners.nickname, winners.player_id
         )
    into computed_winner_player_ids, computed_winners
  from (
    select session_players.player_id, players.nickname, session_players.score
    from public.session_players
    join public.players
      on players.id = session_players.player_id
     and players.group_id = session_players.group_id
    where session_players.game_session_id = current_game_session_id
      and session_players.group_id = current_group_id
      and session_players.score = (
        select max(max_score_players.score)
        from public.session_players max_score_players
        where max_score_players.game_session_id = current_game_session_id
          and max_score_players.group_id = current_group_id
      )
  ) winners;

  if computed_roster is null
    or computed_final_scores is null
    or computed_winners is null
    or coalesce(array_length(computed_winner_player_ids, 1), 0) < 1 then
    raise exception 'La tanda no tiene participantes consistentes para historizar.'
      using errcode = 'P0022';
  end if;

  closing_timestamp := now();

  update public.game_sessions
  set
    state = 'finished',
    finished_at = coalesce(game_sessions.finished_at, closing_timestamp)
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id
    and game_sessions.state = 'scoreboard';

  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'No se pudo terminar la tanda de forma consistente.'
      using errcode = 'P0022';
  end if;

  select game_sessions.finished_at
    into current_finished_at
  from public.game_sessions
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id;

  insert into public.game_session_history (
    game_session_id,
    room_id,
    group_id,
    started_at,
    finished_at,
    closed_by_player_id,
    round_count,
    roster,
    final_scores,
    winner_player_ids,
    winners
  )
  values (
    current_game_session_id,
    active_room_id,
    current_group_id,
    current_started_at,
    current_finished_at,
    current_player_id,
    computed_round_count,
    computed_roster,
    computed_final_scores,
    computed_winner_player_ids,
    computed_winners
  )
  on conflict (game_session_id) do nothing
  returning id into inserted_history_id;

  if inserted_history_id is null then
    select game_session_history.id
      into inserted_history_id
    from public.game_session_history
    where game_session_history.game_session_id = current_game_session_id
      and game_session_history.group_id = current_group_id;
  end if;

  if inserted_history_id is null then
    raise exception 'No se pudo crear el historial de la tanda.'
      using errcode = 'P0022';
  end if;

  insert into public.round_history (
    game_session_history_id,
    game_session_id,
    round_id,
    group_id,
    number,
    impostor_player_id,
    round_winner,
    discovered_by_vote,
    impostor_guess_text,
    impostor_guess_correct,
    scored_at,
    scoring_summary
  )
  select
    inserted_history_id,
    rounds.game_session_id,
    rounds.id,
    rounds.group_id,
    rounds.number,
    rounds.impostor_player_id,
    rounds.round_winner,
    (
      rounds.impostor_guess_text is not null
      or rounds.impostor_guess_correct is not null
      or rounds.round_winner = 'group'
    ),
    rounds.impostor_guess_text,
    rounds.impostor_guess_correct,
    rounds.scored_at,
    jsonb_build_object(
      'rule',
      case
        when rounds.round_winner = 'impostor' then 'impostor_plus_2'
        else 'group_non_impostors_plus_1'
      end,
      'awarded',
      coalesce(scoring_awards.awarded, '[]'::jsonb)
    )
  from public.rounds
  join lateral (
    select jsonb_agg(
        jsonb_build_object(
          'player_id', session_players.player_id,
          'points',
          case
            when rounds.round_winner = 'impostor' then 2
            else 1
          end
        )
        order by session_players.player_id
      ) as awarded
    from public.session_players
    where session_players.game_session_id = rounds.game_session_id
      and session_players.group_id = rounds.group_id
      and (
        (
          rounds.round_winner = 'impostor'
          and session_players.player_id = rounds.impostor_player_id
        )
        or (
          rounds.round_winner = 'group'
          and session_players.player_id <> rounds.impostor_player_id
        )
      )
  ) scoring_awards on true
  where rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id
  order by rounds.number
  on conflict do nothing;

  if (
    select count(*)::integer
    from public.round_history
    where round_history.game_session_id = current_game_session_id
      and round_history.game_session_history_id = inserted_history_id
  ) <> computed_round_count then
    raise exception 'El historial de rondas no coincide con la tanda cerrada.'
      using errcode = 'P0022';
  end if;

  update public.rooms
  set status = 'closed'
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status = 'playing';

  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'No se pudo cerrar la sala de la tanda.'
      using errcode = 'P0022';
  end if;

  ended := true;
  already_ended := false;
  state := 'finished';
  round_count := computed_round_count;
  winner_player_ids := computed_winner_player_ids;
  return next;
end;
$$;

revoke all on function public.end_session() from public;
grant execute on function public.end_session() to authenticated;
