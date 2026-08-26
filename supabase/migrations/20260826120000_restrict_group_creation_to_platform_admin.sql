create table public.platform_admins (
  auth_user_id uuid primary key,
  created_at timestamptz not null default now(),
  constraint platform_admins_auth_user_id_fkey
    foreign key (auth_user_id)
    references auth.users (id)
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins
    where platform_admins.auth_user_id = auth.uid()
  );
$$;

create or replace function public.get_my_platform_permissions()
returns table (
  can_create_groups boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin();
$$;

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
  player_created_at timestamptz,
  invitation_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  new_group_id uuid;
  new_player_id uuid;
  new_invitation_code text;
  trimmed_group_name text;
  trimmed_player_nickname text;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para crear un grupo.'
      using errcode = '28000';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Solo el admin de plataforma puede crear grupos en esta etapa.'
      using errcode = '42501';
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

  new_invitation_code := public.create_group_invitation(new_group_id);

  return query
  select
    groups.id,
    groups.name,
    groups.created_at,
    groups.admin_player_id,
    players.id,
    players.nickname,
    players.created_at,
    new_invitation_code
  from public.groups
  join public.players
    on players.id = groups.admin_player_id
   and players.group_id = groups.id
  where groups.id = new_group_id;
end;
$$;

revoke all on table public.platform_admins from anon, authenticated;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

revoke all on function public.get_my_platform_permissions() from public;
grant execute on function public.get_my_platform_permissions() to authenticated;
