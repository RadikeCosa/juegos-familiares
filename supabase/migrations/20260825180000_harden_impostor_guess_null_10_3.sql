-- Incremento 10.3 — hardening minimo de input nulo del guess del impostor.
--
-- No cambia contrato publico, UI, read model, scoring, scoreboard, nueva ronda,
-- historial, Broadcast ni Realtime.

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
  if submit_impostor_guess.guess_text is null then
    raise exception 'El intento no puede estar vacio.'
      using errcode = '22023';
  end if;

  requested_guess_text := public.canonicalize_group_word_text(submit_impostor_guess.guess_text);

  if requested_guess_text is null or char_length(requested_guess_text) < 1 then
    raise exception 'El intento no puede estar vacio.'
      using errcode = '22023';
  end if;

  requested_normalized_guess := lower(requested_guess_text);
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para adivinar la palabra.'
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
