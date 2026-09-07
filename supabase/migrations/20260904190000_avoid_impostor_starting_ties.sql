-- Evita que el impostor empiece la conversación cuando existe otra persona
-- con el mismo conteo mínimo de inicios. Conserva el balance como criterio
-- principal y el azar entre las personas igualmente elegibles.

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

  -- Round 1 empata a todos en cero. Ante ese empate se prioriza a quienes
  -- no son el impostor y luego se conserva el azar entre ellos.
  select session_players.player_id
    into selected_starting_player_id
  from public.session_players
  left join public.rounds
    on rounds.game_session_id = session_players.game_session_id
   and rounds.starting_player_id = session_players.player_id
  where session_players.game_session_id = new_game_session_id
    and session_players.group_id = current_group_id
  group by session_players.player_id
  order by
    count(rounds.id) asc,
    (session_players.player_id = selected_impostor_player_id) asc,
    random()
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

  -- Balance primero: entre quienes hayan empezado menos veces en esta
  -- GameSession, se evita al impostor si existe otra persona empatada.
  select session_players.player_id
    into selected_starting_player_id
  from public.session_players
  left join public.rounds
    on rounds.game_session_id = session_players.game_session_id
   and rounds.starting_player_id = session_players.player_id
  where session_players.game_session_id = current_game_session_id
    and session_players.group_id = current_group_id
  group by session_players.player_id
  order by
    count(rounds.id) asc,
    (session_players.player_id = selected_impostor_player_id) asc,
    random()
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
