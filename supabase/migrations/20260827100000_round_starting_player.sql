-- Azar equilibrado para elegir quien empieza a hablar en cada Round.
--
-- No controla ni persiste el orden de turnos posterior, no cambia la
-- seleccion del impostor, no agrega configuracion y no reescribe rounds
-- historicas.

alter table public.rounds
  add column starting_player_id uuid;

alter table public.rounds
  add constraint rounds_starting_player_session_player_fkey
  foreign key (game_session_id, starting_player_id)
  references public.session_players (game_session_id, player_id);

create or replace function public.start_session()
returns table (
  started boolean,
  already_started boolean,
  room_status text,
  game_session_state text,
  round_number integer,
  participant_count integer
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
  existing_game_session_id uuid;
  existing_game_session_state text;
  existing_round_number integer;
  existing_participant_count integer;
  observed_at timestamptz;
  refreshed_membership_count integer;
  roster_player_ids uuid[];
  selected_word text;
  selected_normalized_word text;
  new_game_session_id uuid;
  selected_impostor_player_id uuid;
  selected_starting_player_id uuid;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para iniciar la tanda.'
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
    raise exception 'No tenes una sala activa para iniciar.'
      using errcode = 'P0017';
  end if;

  if active_room_status = 'playing' then
    select
      game_sessions.id,
      game_sessions.state,
      rounds.number,
      count(session_players.player_id)::integer
      into
        existing_game_session_id,
        existing_game_session_state,
        existing_round_number,
        existing_participant_count
    from public.game_sessions
    join public.session_players
      on session_players.game_session_id = game_sessions.id
     and session_players.group_id = game_sessions.group_id
    join public.rounds
      on rounds.game_session_id = game_sessions.id
     and rounds.group_id = game_sessions.group_id
     and rounds.number = 1
    where game_sessions.room_id = active_room_id
      and game_sessions.group_id = current_group_id
      and game_sessions.state = 'role_reveal'
      and exists (
        select 1
        from public.session_players caller_session_players
        where caller_session_players.game_session_id = game_sessions.id
          and caller_session_players.group_id = game_sessions.group_id
          and caller_session_players.player_id = current_player_id
      )
    group by game_sessions.id, game_sessions.state, rounds.number;

    if existing_game_session_id is not null then
      started := false;
      already_started := true;
      room_status := 'playing';
      game_session_state := existing_game_session_state;
      round_number := existing_round_number;
      participant_count := existing_participant_count;
      return next;
      return;
    end if;

    raise exception 'La sala no esta disponible para iniciar la tanda.'
      using errcode = 'P0018';
  end if;

  if active_room_status <> 'lobby' then
    raise exception 'La sala no esta disponible para iniciar la tanda.'
      using errcode = 'P0018';
  end if;

  if active_room_host_player_id <> current_player_id then
    raise exception 'Solo el host actual puede iniciar la tanda.'
      using errcode = 'P0019';
  end if;

  if exists (
    select 1
    from public.game_sessions
    where game_sessions.room_id = active_room_id
      and game_sessions.group_id = current_group_id
  ) then
    raise exception 'La sala ya tiene una tanda iniciada.'
      using errcode = 'P0018';
  end if;

  observed_at := now();

  update public.room_participants
  set last_seen_at = observed_at
  where room_participants.room_id = active_room_id
    and room_participants.player_id = current_player_id
    and room_participants.group_id = current_group_id;

  get diagnostics refreshed_membership_count = row_count;

  if refreshed_membership_count <> 1 then
    raise exception 'No se pudo confirmar la participacion del host.'
      using errcode = 'P0018';
  end if;

  select coalesce(array_agg(room_participants.player_id order by room_participants.joined_at asc, room_participants.player_id asc), '{}')
    into roster_player_ids
  from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.group_id = current_group_id
    and public.is_room_participant_liveness_active(
      room_participants.last_seen_at,
      observed_at
    );

  participant_count := coalesce(array_length(roster_player_ids, 1), 0);

  if participant_count < 3 then
    raise exception 'Necesitas al menos 3 participantes activos para iniciar.'
      using errcode = 'P0020';
  end if;

  if current_player_id <> all(roster_player_ids) then
    raise exception 'El host debe estar activo para iniciar la tanda.'
      using errcode = 'P0018';
  end if;

  select group_words.text, group_words.normalized_text
    into selected_word, selected_normalized_word
  from public.group_words
  where group_words.group_id = current_group_id
    and not exists (
      select 1
      from public.rounds
      join public.game_sessions
        on game_sessions.id = rounds.game_session_id
       and game_sessions.group_id = rounds.group_id
      where game_sessions.room_id = active_room_id
        and game_sessions.group_id = current_group_id
        and rounds.normalized_secret_word = group_words.normalized_text
    )
  order by random()
  limit 1;

  if selected_word is null or selected_normalized_word is null then
    raise exception 'No hay palabras disponibles para iniciar la tanda.'
      using errcode = 'P0021';
  end if;

  insert into public.game_sessions (room_id, group_id, state)
  values (active_room_id, current_group_id, 'role_reveal')
  returning id into new_game_session_id;

  insert into public.session_players (game_session_id, group_id, player_id)
  select new_game_session_id, current_group_id, roster_player_id
  from unnest(roster_player_ids) as roster(roster_player_id);

  select session_players.player_id
    into selected_impostor_player_id
  from public.session_players
  left join public.rounds
    on rounds.game_session_id = session_players.game_session_id
   and rounds.impostor_player_id = session_players.player_id
  where session_players.game_session_id = new_game_session_id
    and session_players.group_id = current_group_id
  group by session_players.player_id
  order by count(rounds.id) asc, random()
  limit 1;

  if selected_impostor_player_id is null then
    raise exception 'No se pudo seleccionar impostor.'
      using errcode = 'P0018';
  end if;

  -- Azar equilibrado independiente del rol: Round 1 empata a todos en cero
  -- designaciones previas dentro de la GameSession, asi que cualquier
  -- SessionPlayer (incluido el impostor) tiene la misma posibilidad.
  select session_players.player_id
    into selected_starting_player_id
  from public.session_players
  left join public.rounds
    on rounds.game_session_id = session_players.game_session_id
   and rounds.starting_player_id = session_players.player_id
  where session_players.game_session_id = new_game_session_id
    and session_players.group_id = current_group_id
  group by session_players.player_id
  order by count(rounds.id) asc, random()
  limit 1;

  if selected_starting_player_id is null then
    raise exception 'No se pudo seleccionar quien empieza.'
      using errcode = 'P0018';
  end if;

  insert into public.rounds (
    game_session_id,
    group_id,
    number,
    secret_word,
    normalized_secret_word,
    impostor_player_id,
    starting_player_id
  )
  values (
    new_game_session_id,
    current_group_id,
    1,
    selected_word,
    selected_normalized_word,
    selected_impostor_player_id,
    selected_starting_player_id
  );

  update public.rooms
  set status = 'playing'
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status = 'lobby';

  get diagnostics refreshed_membership_count = row_count;

  if refreshed_membership_count <> 1 then
    raise exception 'No se pudo iniciar la tanda de forma consistente.'
      using errcode = 'P0018';
  end if;

  started := true;
  already_started := false;
  room_status := 'playing';
  game_session_state := 'role_reveal';
  round_number := 1;
  return next;
end;
$$;

revoke all on function public.start_session() from public;
grant execute on function public.start_session() to authenticated;

create or replace function public.start_next_round()
returns table (
  started boolean,
  already_started boolean,
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
  current_round_id uuid;
  current_round_number integer;
  current_round_winner text;
  current_round_scored_at timestamptz;
  previous_round_scored_at timestamptz;
  selected_word text;
  selected_normalized_word text;
  selected_impostor_player_id uuid;
  selected_starting_player_id uuid;
  updated_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para iniciar otra ronda.'
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
    raise exception 'No tenes una sala activa para iniciar otra ronda.'
      using errcode = 'P0017';
  end if;

  if active_room_status <> 'playing' then
    raise exception 'La sala no esta disponible para iniciar otra ronda.'
      using errcode = 'P0018';
  end if;

  select game_sessions.id, game_sessions.state
    into current_game_session_id, current_game_session_state
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id
  for update;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para iniciar otra ronda.'
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
    raise exception 'Solo el host actual puede iniciar otra ronda.'
      using errcode = 'P0019';
  end if;

  select
    rounds.id,
    rounds.number,
    rounds.round_winner,
    rounds.scored_at
    into
      current_round_id,
      current_round_number,
      current_round_winner,
      current_round_scored_at
  from public.rounds
  where rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id
  order by rounds.number desc
  limit 1
  for update;

  if current_round_id is null or current_round_number is null then
    raise exception 'La tanda no tiene una ronda consistente para iniciar otra ronda.'
      using errcode = 'P0022';
  end if;

  if current_game_session_state = 'role_reveal' then
    select previous_rounds.scored_at
      into previous_round_scored_at
    from public.rounds previous_rounds
    where previous_rounds.game_session_id = current_game_session_id
      and previous_rounds.group_id = current_group_id
      and previous_rounds.number = current_round_number - 1;

    if current_round_number > 1
      and current_round_scored_at is null
      and previous_round_scored_at is not null then
      started := false;
      already_started := true;
      state := 'role_reveal';
      round_number := current_round_number;
      return next;
      return;
    end if;
  end if;

  if current_game_session_state <> 'scoreboard' then
    raise exception 'La tanda no esta en marcador para iniciar otra ronda.'
      using errcode = 'P0018';
  end if;

  if current_round_winner not in ('impostor', 'group')
    or current_round_scored_at is null then
    raise exception 'La ronda vigente no esta cerrada y puntuada.'
      using errcode = 'P0018';
  end if;

  select group_words.text, group_words.normalized_text
    into selected_word, selected_normalized_word
  from public.group_words
  where group_words.group_id = current_group_id
    and not exists (
      select 1
      from public.rounds used_rounds
      where used_rounds.game_session_id = current_game_session_id
        and used_rounds.group_id = current_group_id
        and used_rounds.normalized_secret_word = group_words.normalized_text
    )
  order by random()
  limit 1;

  if selected_word is null or selected_normalized_word is null then
    raise exception 'No hay palabras disponibles para iniciar otra ronda.'
      using errcode = 'P0021';
  end if;

  update public.session_players
  set impostor_count = coalesce(derived_counts.impostor_count, 0)
  from (
    select
      session_players.player_id,
      count(rounds.id)::integer as impostor_count
    from public.session_players
    left join public.rounds
      on rounds.game_session_id = session_players.game_session_id
     and rounds.group_id = session_players.group_id
     and rounds.impostor_player_id = session_players.player_id
    where session_players.game_session_id = current_game_session_id
      and session_players.group_id = current_group_id
    group by session_players.player_id
  ) derived_counts
  where session_players.game_session_id = current_game_session_id
    and session_players.group_id = current_group_id
    and session_players.player_id = derived_counts.player_id;

  select session_players.player_id
    into selected_impostor_player_id
  from public.session_players
  where session_players.game_session_id = current_game_session_id
    and session_players.group_id = current_group_id
    and session_players.impostor_count = (
      select min(eligible_session_players.impostor_count)
      from public.session_players eligible_session_players
      where eligible_session_players.game_session_id = current_game_session_id
        and eligible_session_players.group_id = current_group_id
    )
  order by random()
  limit 1;

  if selected_impostor_player_id is null then
    raise exception 'No se pudo seleccionar impostor.'
      using errcode = 'P0022';
  end if;

  -- Azar equilibrado: entre quienes hayan empezado menos veces en esta
  -- GameSession, independiente del rol asignado en la nueva ronda.
  select session_players.player_id
    into selected_starting_player_id
  from public.session_players
  left join public.rounds
    on rounds.game_session_id = session_players.game_session_id
   and rounds.starting_player_id = session_players.player_id
  where session_players.game_session_id = current_game_session_id
    and session_players.group_id = current_group_id
  group by session_players.player_id
  order by count(rounds.id) asc, random()
  limit 1;

  if selected_starting_player_id is null then
    raise exception 'No se pudo seleccionar quien empieza.'
      using errcode = 'P0022';
  end if;

  insert into public.rounds (
    game_session_id,
    group_id,
    number,
    secret_word,
    normalized_secret_word,
    impostor_player_id,
    starting_player_id
  )
  values (
    current_game_session_id,
    current_group_id,
    current_round_number + 1,
    selected_word,
    selected_normalized_word,
    selected_impostor_player_id,
    selected_starting_player_id
  );

  update public.session_players
  set impostor_count = impostor_count + 1
  where session_players.game_session_id = current_game_session_id
    and session_players.group_id = current_group_id
    and session_players.player_id = selected_impostor_player_id;

  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'No se pudo actualizar el contador de impostor.'
      using errcode = 'P0022';
  end if;

  update public.game_sessions
  set state = 'role_reveal'
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id
    and game_sessions.state = 'scoreboard';

  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'No se pudo iniciar otra ronda de forma consistente.'
      using errcode = 'P0018';
  end if;

  started := true;
  already_started := false;
  state := 'role_reveal';
  round_number := current_round_number + 1;
  return next;
end;
$$;

revoke all on function public.start_next_round() from public;
grant execute on function public.start_next_round() to authenticated;

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
  starting_player jsonb,
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
    round_starting_player.starting_player,
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
      rounds.starting_player_id,
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
  left join lateral (
    select jsonb_build_object(
      'player_id', players.id,
      'nickname', players.nickname,
      'is_self', players.id = current_player_id
    ) as starting_player
    from public.players
    where players.id = current_round.starting_player_id
      and players.group_id = game_sessions.group_id
  ) round_starting_player on true
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
