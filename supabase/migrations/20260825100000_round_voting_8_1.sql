-- Incremento 8.1 — persistencia de votos + voting_first + start_round_voting.
--
-- No implementa submit de votos, UI de voting, conteo, resolucion, empate,
-- segunda votacion, Round.status, Broadcast ni Realtime de gameplay.

alter table public.game_sessions
  drop constraint game_sessions_state_check;

alter table public.game_sessions
  add constraint game_sessions_state_check
  check (state in ('role_reveal', 'discussion', 'voting_first'));

alter table public.rounds
  add constraint rounds_id_game_session_group_key
  unique (id, game_session_id, group_id);

create table public.round_votes (
  round_id uuid not null,
  game_session_id uuid not null,
  group_id uuid not null,
  voting_round smallint not null,
  voter_player_id uuid not null,
  target_player_id uuid not null,
  created_at timestamptz not null default now(),
  constraint round_votes_pkey
    primary key (round_id, voting_round, voter_player_id),
  constraint round_votes_voting_round_check
    check (voting_round in (1, 2)),
  constraint round_votes_no_self_vote_check
    check (voter_player_id <> target_player_id),
  constraint round_votes_round_fkey
    foreign key (round_id, game_session_id, group_id)
    references public.rounds (id, game_session_id, group_id)
    on delete cascade,
  constraint round_votes_voter_session_player_fkey
    foreign key (game_session_id, voter_player_id)
    references public.session_players (game_session_id, player_id),
  constraint round_votes_target_session_player_fkey
    foreign key (game_session_id, target_player_id)
    references public.session_players (game_session_id, player_id)
);

alter table public.round_votes enable row level security;

revoke all on table public.round_votes from anon, authenticated, public;

create or replace function public.start_round_voting()
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
    raise exception 'Se necesita una AuthIdentity valida para ir a votacion.'
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
    raise exception 'No tenes una sala activa para ir a votacion.'
      using errcode = 'P0017';
  end if;

  if active_room_status <> 'playing' then
    raise exception 'La sala no esta disponible para ir a votacion.'
      using errcode = 'P0018';
  end if;

  select game_sessions.id, game_sessions.state
    into current_game_session_id, current_game_session_state
  from public.game_sessions
  where game_sessions.room_id = active_room_id
    and game_sessions.group_id = current_group_id
  for update;

  if current_game_session_id is null then
    raise exception 'La sala no tiene una tanda consistente para ir a votacion.'
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
    raise exception 'La tanda no tiene una ronda consistente para votar.'
      using errcode = 'P0022';
  end if;

  if current_game_session_state not in ('discussion', 'voting_first') then
    raise exception 'La tanda no esta disponible para ir a votacion.'
      using errcode = 'P0018';
  end if;

  if active_room_host_player_id <> current_player_id then
    raise exception 'Solo el host actual puede ir a votacion.'
      using errcode = 'P0019';
  end if;

  if current_game_session_state = 'voting_first' then
    advanced := false;
    already_in_phase := true;
    state := 'voting_first';
    round_number := current_round_number;
    return next;
    return;
  end if;

  update public.game_sessions
  set state = 'voting_first'
  where game_sessions.id = current_game_session_id
    and game_sessions.group_id = current_group_id
    and game_sessions.state = 'discussion';

  get diagnostics updated_session_count = row_count;

  if updated_session_count <> 1 then
    raise exception 'No se pudo ir a votacion de forma consistente.'
      using errcode = 'P0018';
  end if;

  advanced := true;
  already_in_phase := false;
  state := 'voting_first';
  round_number := current_round_number;
  return next;
end;
$$;

revoke all on function public.start_round_voting() from public;
grant execute on function public.start_round_voting() to authenticated;
