-- Incremento 10.1 — persistencia y RPC autoritativa del guess del impostor.
--
-- No implementa UI, read model completo de round_result, scoring,
-- scoreboard, nueva ronda, historial, fin de tanda, Broadcast ni Realtime.

alter table public.rounds
  add column impostor_guess_text text,
  add column normalized_impostor_guess text,
  add column impostor_guess_correct boolean,
  add column impostor_guess_submitted_at timestamptz,
  add column round_winner text;

alter table public.rounds
  add constraint rounds_impostor_guess_canonical_check
    check (
      impostor_guess_text is null
      or impostor_guess_text = public.canonicalize_group_word_text(impostor_guess_text)
    ),
  add constraint rounds_normalized_impostor_guess_check
    check (
      normalized_impostor_guess is null
      or normalized_impostor_guess = lower(impostor_guess_text)
    ),
  add constraint rounds_impostor_guess_complete_check
    check (
      (
        impostor_guess_text is null
        and normalized_impostor_guess is null
        and impostor_guess_correct is null
        and impostor_guess_submitted_at is null
      )
      or (
        impostor_guess_text is not null
        and normalized_impostor_guess is not null
        and impostor_guess_correct is not null
        and impostor_guess_submitted_at is not null
      )
    ),
  add constraint rounds_round_winner_check
    check (round_winner is null or round_winner in ('impostor', 'group')),
  add constraint rounds_guess_result_matches_winner_check
    check (
      impostor_guess_correct is null
      or (
        impostor_guess_correct = true
        and round_winner = 'impostor'
      )
      or (
        impostor_guess_correct = false
        and round_winner = 'group'
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
  current_voting_round smallint;
  existing_target_player_id uuid;
  required_vote_count integer;
  submitted_vote_count integer;
  top_target_player_id uuid;
  top_candidate_count integer;
  tie_candidate_count integer;
  next_game_session_state text;
  next_round_winner text;
  updated_round_count integer;
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
  limit 1
  for update;

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

  if current_game_session_state = 'voting_first' then
    current_voting_round := 1;
  elsif current_game_session_state = 'voting_second' then
    current_voting_round := 2;
  else
    select round_votes.target_player_id
      into existing_target_player_id
    from public.round_votes
    where round_votes.round_id = current_round_id
      and round_votes.game_session_id = current_game_session_id
      and round_votes.voter_player_id = current_player_id
      and (
        (
          current_game_session_state = 'tie_discussion'
          and round_votes.voting_round = 1
        )
        or (
          current_game_session_state in ('impostor_guess', 'round_result')
          and round_votes.voting_round = (
            select max(existing_votes.voting_round)
            from public.round_votes existing_votes
            where existing_votes.round_id = current_round_id
              and existing_votes.game_session_id = current_game_session_id
              and existing_votes.voter_player_id = current_player_id
          )
        )
      )
    limit 1;

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

  if current_voting_round = 2 then
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
    tie_candidates as (
      select vote_counts.target_player_id
      from vote_counts
      join max_vote
        on max_vote.vote_count = vote_counts.vote_count
    )
    select count(*)
      into tie_candidate_count
    from tie_candidates;

    if tie_candidate_count is null or tie_candidate_count < 2 then
      raise exception 'No se pudo reconstruir el empate para votar.'
        using errcode = 'P0022';
    end if;

    if not exists (
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
      tie_candidates as (
        select vote_counts.target_player_id
        from vote_counts
        join max_vote
          on max_vote.vote_count = vote_counts.vote_count
      )
      select 1
      from tie_candidates
      where tie_candidates.target_player_id = requested_target_player_id
    ) then
      raise exception 'El candidato elegido no participa del empate.'
        using errcode = 'P0024';
    end if;
  end if;

  select round_votes.target_player_id
    into existing_target_player_id
  from public.round_votes
  where round_votes.round_id = current_round_id
    and round_votes.game_session_id = current_game_session_id
    and round_votes.voting_round = current_voting_round
    and round_votes.voter_player_id = current_player_id;

  if existing_target_player_id is not null
    and existing_target_player_id <> requested_target_player_id then
    raise exception 'Tu voto ya fue registrado y no se puede cambiar.'
      using errcode = 'P0025';
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
      current_voting_round,
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
    and round_votes.voting_round = current_voting_round;

  if submitted_vote_count < required_vote_count then
    accepted := true;
    state := current_game_session_state;
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
      and round_votes.voting_round = current_voting_round
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
      and round_votes.voting_round = current_voting_round
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

  if current_voting_round = 1 then
    if top_candidate_count > 1 then
      next_game_session_state := 'tie_discussion';
    elsif top_target_player_id = current_impostor_player_id then
      next_game_session_state := 'impostor_guess';
    else
      next_game_session_state := 'round_result';
      next_round_winner := 'impostor';
    end if;
  elsif top_candidate_count = 1
    and top_target_player_id = current_impostor_player_id then
    next_game_session_state := 'impostor_guess';
  else
    next_game_session_state := 'round_result';
    next_round_winner := 'impostor';
  end if;

  if next_round_winner is not null then
    update public.rounds
    set round_winner = next_round_winner
    where rounds.id = current_round_id
      and rounds.game_session_id = current_game_session_id
      and rounds.group_id = current_group_id
      and rounds.round_winner is null;

    get diagnostics updated_round_count = row_count;

    if updated_round_count <> 1 then
      raise exception 'No se pudo resolver la votacion de forma consistente.'
        using errcode = 'P0022';
    end if;
  end if;

  update public.game_sessions
  set state = next_game_session_state
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id
    and game_sessions.state = current_game_session_state;

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

create or replace function public.submit_impostor_guess(guess_text text)
returns table (
  accepted boolean,
  already_recorded boolean,
  state text,
  round_number integer,
  is_correct boolean,
  winner text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_guess_text text;
  requested_normalized_guess text;
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  active_room_status text;
  current_game_session_id uuid;
  current_game_session_state text;
  current_round_id uuid;
  current_round_number integer;
  current_normalized_secret_word text;
  current_impostor_player_id uuid;
  existing_normalized_guess text;
  existing_guess_correct boolean;
  existing_round_winner text;
  computed_is_correct boolean;
  computed_winner text;
  updated_round_count integer;
  updated_session_count integer;
begin
  requested_guess_text := public.canonicalize_group_word_text(submit_impostor_guess.guess_text);
  requested_normalized_guess := lower(requested_guess_text);
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para adivinar la palabra.'
      using errcode = '28000';
  end if;

  if char_length(requested_guess_text) < 1 then
    raise exception 'El intento no puede estar vacio.'
      using errcode = '22023';
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
    raise exception 'No tenes una sala activa para adivinar la palabra.'
      using errcode = 'P0017';
  end if;

  if active_room_status <> 'playing' then
    raise exception 'La sala no esta disponible para adivinar la palabra.'
      using errcode = 'P0018';
  end if;

  select game_sessions.id, game_sessions.state
    into current_game_session_id, current_game_session_state
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id
  for update;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para adivinar la palabra.'
      using errcode = 'P0022';
  end if;

  select
    rounds.id,
    rounds.number,
    rounds.normalized_secret_word,
    rounds.impostor_player_id,
    rounds.normalized_impostor_guess,
    rounds.impostor_guess_correct,
    rounds.round_winner
    into
      current_round_id,
      current_round_number,
      current_normalized_secret_word,
      current_impostor_player_id,
      existing_normalized_guess,
      existing_guess_correct,
      existing_round_winner
  from public.rounds
  where rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id
  order by rounds.number desc
  limit 1
  for update;

  if current_round_id is null
    or current_round_number is null
    or current_normalized_secret_word is null
    or current_impostor_player_id is null then
    raise exception 'La tanda no tiene una ronda consistente para adivinar la palabra.'
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

  if current_player_id <> current_impostor_player_id then
    raise exception 'Solo el impostor puede enviar el intento final.'
      using errcode = 'P0023';
  end if;

  if existing_normalized_guess is not null then
    if existing_normalized_guess = requested_normalized_guess
      and current_game_session_state = 'round_result' then
      accepted := true;
      already_recorded := true;
      state := current_game_session_state;
      round_number := current_round_number;
      is_correct := existing_guess_correct;
      winner := existing_round_winner;
      return next;
      return;
    end if;

    raise exception 'El intento final ya fue registrado y no se puede cambiar.'
      using errcode = 'P0025';
  end if;

  if current_game_session_state <> 'impostor_guess' then
    raise exception 'La tanda no esta esperando el intento final del impostor.'
      using errcode = 'P0018';
  end if;

  computed_is_correct := requested_normalized_guess = current_normalized_secret_word;

  if computed_is_correct then
    computed_winner := 'impostor';
  else
    computed_winner := 'group';
  end if;

  update public.rounds
  set
    impostor_guess_text = requested_guess_text,
    normalized_impostor_guess = requested_normalized_guess,
    impostor_guess_correct = computed_is_correct,
    impostor_guess_submitted_at = now(),
    round_winner = computed_winner
  where rounds.id = current_round_id
    and rounds.game_session_id = current_game_session_id
    and rounds.group_id = current_group_id
    and rounds.normalized_impostor_guess is null
    and rounds.round_winner is null;

  get diagnostics updated_round_count = row_count;

  if updated_round_count <> 1 then
    raise exception 'No se pudo registrar el intento final de forma consistente.'
      using errcode = 'P0022';
  end if;

  update public.game_sessions
  set state = 'round_result'
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id
    and game_sessions.state = 'impostor_guess';

  get diagnostics updated_session_count = row_count;

  if updated_session_count <> 1 then
    raise exception 'No se pudo resolver el intento final de forma consistente.'
      using errcode = 'P0022';
  end if;

  accepted := true;
  already_recorded := false;
  state := 'round_result';
  round_number := current_round_number;
  is_correct := computed_is_correct;
  winner := computed_winner;
  return next;
end;
$$;

revoke all on function public.submit_impostor_guess(text) from public;
grant execute on function public.submit_impostor_guess(text) to authenticated;
