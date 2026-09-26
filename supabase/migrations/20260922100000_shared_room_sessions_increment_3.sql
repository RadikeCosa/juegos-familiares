-- Increment 3: neutral Room session identity and Impostor backfill.
--
-- This migration is a compatibility snapshot. New Impostor writes continue to
-- use game_sessions/session_players until Increment 4 mirrors them atomically.
-- No client-facing read model or gameplay state is introduced here.

alter table public.rooms
  add constraint rooms_group_id_id_game_type_key
  unique (group_id, id, game_type);

create table public.room_sessions (
  id uuid primary key,
  room_id uuid not null,
  group_id uuid not null,
  game_type text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  impostor_game_session_id uuid,
  constraint room_sessions_game_type_check
    check (game_type in ('impostor', 'tutti_frutti')),
  constraint room_sessions_finished_at_check
    check (finished_at is null or finished_at >= started_at),
  constraint room_sessions_impostor_link_check
    check (
      (game_type = 'impostor'
        and impostor_game_session_id is not null
        and impostor_game_session_id = id)
      or (game_type = 'tutti_frutti' and impostor_game_session_id is null)
    ),
  constraint room_sessions_id_group_key
    unique (id, group_id),
  constraint room_sessions_room_group_game_type_fkey
    foreign key (group_id, room_id, game_type)
    references public.rooms (group_id, id, game_type),
  constraint room_sessions_impostor_game_session_fkey
    foreign key (impostor_game_session_id, group_id)
    references public.game_sessions (id, group_id)
);

create unique index room_sessions_one_unfinished_per_room_key
  on public.room_sessions (room_id)
  where finished_at is null;

comment on table public.room_sessions is
  'Neutral session identity. Increment 3 backfill snapshot; new writes are mirrored in Increment 4.';

create table public.room_session_participants (
  session_id uuid not null,
  group_id uuid not null,
  player_id uuid not null,
  constraint room_session_participants_pkey
    primary key (session_id, player_id),
  constraint room_session_participants_session_group_fkey
    foreign key (session_id, group_id)
    references public.room_sessions (id, group_id)
    on delete cascade,
  constraint room_session_participants_player_group_fkey
    foreign key (group_id, player_id)
    references public.players (group_id, id)
);

comment on table public.room_session_participants is
  'Frozen neutral roster snapshot. No temporal or ordinal metadata is stored until separately justified.';

alter table public.room_sessions enable row level security;
alter table public.room_session_participants enable row level security;

revoke all on table public.room_sessions from anon, authenticated, public;
revoke all on table public.room_session_participants from anon, authenticated, public;

do $$
begin
  if exists (
    select 1
    from public.game_sessions
    join public.rooms
      on rooms.id = game_sessions.room_id
     and rooms.group_id = game_sessions.group_id
    where game_sessions.finished_at is null
      and rooms.status = 'closed'
  ) then
    raise exception 'El preflight encontro sesiones Impostor abiertas en Rooms cerradas.';
  end if;

  if exists (
    select 1
    from public.game_sessions
    join public.rooms
      on rooms.id = game_sessions.room_id
     and rooms.group_id = game_sessions.group_id
    where game_sessions.finished_at is not null
      and rooms.status = 'playing'
  ) then
    raise exception 'El preflight encontro sesiones finalizadas en Rooms playing.';
  end if;
end;
$$;

-- Backfill is atomic with the migration transaction. Existing identical rows
-- are no-ops; divergent rows raise after the insert attempt and roll back all
-- changes. No UPDATE is used for retry reconciliation.
insert into public.room_sessions (
  id,
  room_id,
  group_id,
  game_type,
  started_at,
  finished_at,
  impostor_game_session_id
)
select
  game_sessions.id,
  game_sessions.room_id,
  game_sessions.group_id,
  'impostor',
  game_sessions.started_at,
  game_sessions.finished_at,
  game_sessions.id
from public.game_sessions
join public.rooms
  on rooms.id = game_sessions.room_id
 and rooms.group_id = game_sessions.group_id
where rooms.game_type = 'impostor'
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from public.room_sessions
    join public.game_sessions
      on game_sessions.id = room_sessions.id
    where room_sessions.game_type <> 'impostor'
       or room_sessions.room_id <> game_sessions.room_id
       or room_sessions.group_id <> game_sessions.group_id
       or room_sessions.started_at <> game_sessions.started_at
       or room_sessions.finished_at is distinct from game_sessions.finished_at
       or room_sessions.impostor_game_session_id is distinct from game_sessions.id
  ) then
    raise exception 'El backfill de room_sessions encontro una fila divergente.';
  end if;

  if exists (
    select 1
    from public.game_sessions
    join public.rooms
      on rooms.id = game_sessions.room_id
     and rooms.group_id = game_sessions.group_id
    where rooms.game_type = 'impostor'
      and not exists (
        select 1
        from public.room_sessions
        where room_sessions.id = game_sessions.id
      )
  ) then
    raise exception 'El backfill de room_sessions dejo una sesion Impostor sin mapear.';
  end if;
end;
$$;

insert into public.room_session_participants (session_id, group_id, player_id)
select
  session_players.game_session_id,
  session_players.group_id,
  session_players.player_id
from public.session_players
on conflict (session_id, player_id) do nothing;

do $$
begin
  if exists (
    select 1
    from public.room_session_participants
    join public.session_players
      on session_players.game_session_id = room_session_participants.session_id
     and session_players.player_id = room_session_participants.player_id
    where room_session_participants.group_id <> session_players.group_id
  ) then
    raise exception 'El backfill del roster neutral encontro una fila divergente.';
  end if;

  if exists (
    select 1
    from public.session_players
    where not exists (
      select 1
      from public.room_session_participants
      where room_session_participants.session_id = session_players.game_session_id
        and room_session_participants.player_id = session_players.player_id
    )
  ) then
    raise exception 'El backfill del roster neutral dejo un participante sin mapear.';
  end if;
end;
$$;
