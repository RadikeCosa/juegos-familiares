alter table public.players
  add column nickname_normalized text
  generated always as (lower(btrim(nickname))) stored;

alter table public.players
  add constraint players_group_id_nickname_normalized_key
  unique (group_id, nickname_normalized);

create table public.group_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  group_id uuid not null,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint group_invitations_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  constraint group_invitations_group_id_fkey
    foreign key (group_id)
    references public.groups (id)
);

create unique index group_invitations_active_group_id_key
  on public.group_invitations (group_id)
  where active;

create unique index group_invitations_code_key
  on public.group_invitations (code);

alter table public.group_invitations enable row level security;

create or replace function public.generate_group_invitation_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated_code text := '';
  random_bytes bytea;
  byte_index integer;
begin
  random_bytes := extensions.gen_random_bytes(8);

  for byte_index in 0..7 loop
    generated_code := generated_code ||
      substr(alphabet, (get_byte(random_bytes, byte_index) % length(alphabet)) + 1, 1);
  end loop;

  return generated_code;
end;
$$;

create or replace function public.create_group_invitation(target_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
  attempt integer;
begin
  for attempt in 1..8 loop
    generated_code := public.generate_group_invitation_code();

    begin
      insert into public.group_invitations (group_id, code)
      values (target_group_id, generated_code);

      return generated_code;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  raise exception 'No se pudo generar una invitacion unica para el grupo.'
    using errcode = '23505';
end;
$$;

drop function public.create_group_with_admin_player(text, text);

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

create or replace function public.resolve_group_invitation(invitation_code text)
returns table (
  group_name text,
  canonical_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  normalized_invitation_code text;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para resolver una invitacion.'
      using errcode = '28000';
  end if;

  normalized_invitation_code := upper(btrim(invitation_code));

  if normalized_invitation_code is null
    or normalized_invitation_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'La invitacion no es valida.'
      using errcode = '22023';
  end if;

  return query
  select groups.name, group_invitations.code
  from public.group_invitations
  join public.groups
    on groups.id = group_invitations.group_id
  where group_invitations.code = normalized_invitation_code
    and group_invitations.active = true;

  if not found then
    raise exception 'La invitacion no es valida.'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.join_group_with_invitation(
  invitation_code text,
  player_nickname text
)
returns table (
  group_name text,
  joined_player_nickname text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  normalized_invitation_code text;
  trimmed_player_nickname text;
  target_group_id uuid;
  new_player_id uuid;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para unirse a un grupo.'
      using errcode = '28000';
  end if;

  normalized_invitation_code := upper(btrim(invitation_code));
  trimmed_player_nickname := btrim(player_nickname);

  if normalized_invitation_code is null
    or normalized_invitation_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'La invitacion no es valida.'
      using errcode = '22023';
  end if;

  if trimmed_player_nickname is null
    or char_length(trimmed_player_nickname) < 1
    or char_length(trimmed_player_nickname) > 32 then
    raise exception 'Tu nombre debe tener entre 1 y 32 caracteres.'
      using errcode = '22023';
  end if;

  select group_invitations.group_id
    into target_group_id
  from public.group_invitations
  where group_invitations.code = normalized_invitation_code
    and group_invitations.active = true;

  if target_group_id is null then
    raise exception 'La invitacion no es valida.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.players
    where auth_user_id = current_auth_user_id
  ) then
    raise exception 'Esta AuthIdentity ya tiene un Player asociado.'
      using errcode = '23505';
  end if;

  new_player_id := extensions.gen_random_uuid();

  insert into public.players (id, group_id, auth_user_id, nickname)
  values (
    new_player_id,
    target_group_id,
    current_auth_user_id,
    trimmed_player_nickname
  );

  return query
  select groups.name, players.nickname, false
  from public.groups
  join public.players
    on players.group_id = groups.id
   and players.id = new_player_id
  where groups.id = target_group_id;
end;
$$;

revoke all on table public.group_invitations from anon, authenticated;

revoke all on function public.generate_group_invitation_code() from public;
revoke all on function public.create_group_invitation(uuid) from public;
revoke all on function public.create_group_with_admin_player(text, text) from public;
revoke all on function public.resolve_group_invitation(text) from public;
revoke all on function public.join_group_with_invitation(text, text) from public;

grant execute on function public.create_group_with_admin_player(text, text) to authenticated;
grant execute on function public.resolve_group_invitation(text) to authenticated;
grant execute on function public.join_group_with_invitation(text, text) to authenticated;
