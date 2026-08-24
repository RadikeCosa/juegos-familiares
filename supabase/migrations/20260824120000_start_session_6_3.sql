-- Incremento 6.3 — START_SESSION atomico + snapshot + Round 1 privada.
--
-- No se implementa lectura privada, UI, votos, score, END_SESSION, Broadcast
-- ni Realtime de gameplay. La unica senal compartida sigue siendo Room.status.

alter table public.game_sessions
  add column state text not null;

alter table public.game_sessions
  add constraint game_sessions_state_check
  check (state in ('role_reveal'));

create table public.rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  game_session_id uuid not null,
  group_id uuid not null,
  number integer not null,
  secret_word text not null,
  normalized_secret_word text not null,
  impostor_player_id uuid not null,
  created_at timestamptz not null default now(),
  constraint rounds_number_check
    check (number >= 1),
  constraint rounds_secret_word_canonical_check
    check (secret_word = public.canonicalize_group_word_text(secret_word)),
  constraint rounds_normalized_secret_word_check
    check (normalized_secret_word = lower(secret_word)),
  constraint rounds_game_session_number_key
    unique (game_session_id, number),
  constraint rounds_game_session_normalized_secret_word_key
    unique (game_session_id, normalized_secret_word),
  constraint rounds_game_session_group_fkey
    foreign key (game_session_id, group_id)
    references public.game_sessions (id, group_id)
    on delete cascade,
  constraint rounds_impostor_session_player_fkey
    foreign key (game_session_id, impostor_player_id)
    references public.session_players (game_session_id, player_id)
);

alter table public.rounds enable row level security;

revoke all on table public.game_sessions from anon, authenticated, public;
revoke all on table public.session_players from anon, authenticated, public;
revoke all on table public.rounds from anon, authenticated, public;

create or replace function public.reassign_room_host_if_stale()
returns table (
  host_changed boolean,
  current_host_player_id uuid
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
  active_game_session_id uuid;
  host_last_seen_at timestamptz;
  successor_player_id uuid;
  observed_at timestamptz;
  updated_room_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para reasignar host.'
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

  if active_room_id is null
    or active_room_status not in ('lobby', 'playing') then
    host_changed := false;
    current_host_player_id := null;
    return next;
    return;
  end if;

  if active_room_status = 'playing' then
    select game_sessions.id
      into active_game_session_id
    from public.game_sessions
    where game_sessions.room_id = active_room_id
      and game_sessions.group_id = current_group_id;

    if active_game_session_id is null then
      host_changed := false;
      current_host_player_id := active_room_host_player_id;
      return next;
      return;
    end if;
  end if;

  observed_at := now();

  select room_participants.last_seen_at
    into host_last_seen_at
  from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.player_id = active_room_host_player_id
    and room_participants.group_id = current_group_id
  for update;

  if not found then
    host_changed := false;
    current_host_player_id := active_room_host_player_id;
    return next;
    return;
  end if;

  if public.is_room_participant_liveness_active(host_last_seen_at, observed_at) then
    host_changed := false;
    current_host_player_id := active_room_host_player_id;
    return next;
    return;
  end if;

  select room_participants.player_id
    into successor_player_id
  from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.group_id = current_group_id
    and room_participants.player_id <> active_room_host_player_id
    and public.is_room_participant_liveness_active(
      room_participants.last_seen_at,
      observed_at
    )
    and (
      active_room_status = 'lobby'
      or exists (
        select 1
        from public.session_players
        where session_players.game_session_id = active_game_session_id
          and session_players.group_id = current_group_id
          and session_players.player_id = room_participants.player_id
      )
    )
  order by room_participants.joined_at asc, room_participants.player_id asc
  limit 1;

  if successor_player_id is null then
    host_changed := false;
    current_host_player_id := active_room_host_player_id;
    return next;
    return;
  end if;

  update public.rooms
  set host_player_id = successor_player_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing')
    and rooms.host_player_id = active_room_host_player_id;

  get diagnostics updated_room_count = row_count;
  host_changed := updated_room_count = 1;
  current_host_player_id := successor_player_id;
  return next;
end;
$$;

revoke all on function public.reassign_room_host_if_stale() from public;
grant execute on function public.reassign_room_host_if_stale() to authenticated;

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

  insert into public.rounds (
    game_session_id,
    group_id,
    number,
    secret_word,
    normalized_secret_word,
    impostor_player_id
  )
  values (
    new_game_session_id,
    current_group_id,
    1,
    selected_word,
    selected_normalized_word,
    selected_impostor_player_id
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
