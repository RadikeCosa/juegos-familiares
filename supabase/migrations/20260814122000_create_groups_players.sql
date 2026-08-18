create extension if not exists pgcrypto with schema extensions;

create table public.groups (
  id uuid primary key,
  name text not null,
  admin_player_id uuid not null,
  created_at timestamptz not null default now(),
  constraint groups_name_length_check
    check (char_length(name) between 1 and 80),
  constraint groups_name_trimmed_check
    check (name = btrim(name))
);

create table public.players (
  id uuid primary key,
  group_id uuid not null,
  auth_user_id uuid not null,
  nickname text not null,
  created_at timestamptz not null default now(),
  constraint players_nickname_length_check
    check (char_length(nickname) between 1 and 32),
  constraint players_nickname_trimmed_check
    check (nickname = btrim(nickname)),
  constraint players_auth_user_id_key
    unique (auth_user_id),
  constraint players_group_id_id_key
    unique (group_id, id),
  constraint players_auth_user_id_fkey
    foreign key (auth_user_id)
    references auth.users (id)
);

alter table public.players
  add constraint players_group_id_fkey
  foreign key (group_id)
  references public.groups (id)
  deferrable initially deferred;

alter table public.groups
  add constraint groups_admin_player_same_group_fkey
  foreign key (id, admin_player_id)
  references public.players (group_id, id)
  deferrable initially deferred;

alter table public.groups enable row level security;
alter table public.players enable row level security;

create or replace function public.is_group_player(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where players.group_id = target_group_id
      and players.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.is_group_player(uuid) from public;
grant execute on function public.is_group_player(uuid) to authenticated;

create policy "Players can read their groups"
on public.groups
for select
to authenticated
using (public.is_group_player(id));

create policy "Players can read players in their group"
on public.players
for select
to authenticated
using (public.is_group_player(group_id));

create or replace function public.create_group_with_admin_player(
  group_name text,
  player_nickname text
)
returns table (
  group_id uuid,
  created_group_name text,
  group_created_at timestamptz,
  admin_player_id uuid,
  player_id uuid,
  created_player_nickname text,
  player_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  new_group_id uuid;
  new_player_id uuid;
  trimmed_group_name text;
  trimmed_player_nickname text;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para crear un grupo.'
      using errcode = '28000';
  end if;

  trimmed_group_name := btrim(group_name);
  trimmed_player_nickname := btrim(player_nickname);

  if trimmed_group_name is null
    or char_length(trimmed_group_name) < 1
    or char_length(trimmed_group_name) > 80 then
    raise exception 'El nombre del grupo debe tener entre 1 y 80 caracteres.'
      using errcode = '22023';
  end if;

  if trimmed_player_nickname is null
    or char_length(trimmed_player_nickname) < 1
    or char_length(trimmed_player_nickname) > 32 then
    raise exception 'Tu nombre debe tener entre 1 y 32 caracteres.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.players
    where auth_user_id = current_auth_user_id
  ) then
    raise exception 'Esta AuthIdentity ya tiene un Player asociado.'
      using errcode = '23505';
  end if;

  new_group_id := extensions.gen_random_uuid();
  new_player_id := extensions.gen_random_uuid();

  insert into public.groups (id, name, admin_player_id)
  values (new_group_id, trimmed_group_name, new_player_id);

  insert into public.players (id, group_id, auth_user_id, nickname)
  values (
    new_player_id,
    new_group_id,
    current_auth_user_id,
    trimmed_player_nickname
  );

  return query
  select
    groups.id,
    groups.name,
    groups.created_at,
    groups.admin_player_id,
    players.id,
    players.nickname,
    players.created_at
  from public.groups
  join public.players
    on players.id = groups.admin_player_id
   and players.group_id = groups.id
  where groups.id = new_group_id;
end;
$$;

revoke all on table public.groups from anon, authenticated;
revoke all on table public.players from anon, authenticated;
grant select on table public.groups to authenticated;
grant select on table public.players to authenticated;

revoke all on function public.create_group_with_admin_player(text, text)
  from public;
grant execute on function public.create_group_with_admin_player(text, text)
  to authenticated;
