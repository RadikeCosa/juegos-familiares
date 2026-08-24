-- Incremento 6.1 — persistencia minima de GameSession + SessionPlayer.
--
-- GameSession representa una tanda concreta de Impostor para una Room.
-- SessionPlayer representa el roster congelado de esa tanda.
--
-- No se implementa START_SESSION, Room.status = playing, Round, seleccion de
-- palabra/impostor, Realtime de gameplay ni UI.

create table public.game_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id uuid not null,
  group_id uuid not null,
  started_at timestamptz not null default now(),
  constraint game_sessions_room_id_key
    unique (room_id),
  constraint game_sessions_id_group_id_key
    unique (id, group_id),
  constraint game_sessions_room_group_fkey
    foreign key (group_id, room_id)
    references public.rooms (group_id, id)
);

alter table public.game_sessions enable row level security;

create table public.session_players (
  game_session_id uuid not null,
  group_id uuid not null,
  player_id uuid not null,
  constraint session_players_pkey
    primary key (game_session_id, player_id),
  constraint session_players_game_session_group_fkey
    foreign key (game_session_id, group_id)
    references public.game_sessions (id, group_id)
    on delete cascade,
  constraint session_players_player_group_fkey
    foreign key (group_id, player_id)
    references public.players (group_id, id)
);

alter table public.session_players enable row level security;

revoke all on table public.game_sessions from anon, authenticated;
revoke all on table public.session_players from anon, authenticated;
