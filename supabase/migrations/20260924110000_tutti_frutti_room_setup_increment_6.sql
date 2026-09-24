-- Incremento 6 — borrador compartido de configuración para Tutti Frutti.
-- Una única fila JSONB por Room hace que cada guardado reemplace el borrador
-- atómicamente. La Room se bloquea para serializar escrituras con su lifecycle.

create table public.tutti_frutti_room_setup (
  room_id uuid primary key
    references public.rooms (id)
    on delete cascade,
  configuration jsonb not null,
  updated_at timestamptz not null default now(),
  constraint tutti_frutti_room_setup_configuration_object_check
    check (jsonb_typeof(configuration) = 'object')
);

alter table public.tutti_frutti_room_setup enable row level security;
revoke all on table public.tutti_frutti_room_setup from public, anon, authenticated;
grant select on table public.tutti_frutti_room_setup to authenticated;

create or replace function public.is_current_player_tutti_frutti_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    join public.room_participants
      on room_participants.player_id = players.id
     and room_participants.group_id = players.group_id
    join public.rooms
      on rooms.id = room_participants.room_id
     and rooms.group_id = room_participants.group_id
    where players.auth_user_id = auth.uid()
      and room_participants.room_id = target_room_id
      and rooms.game_type = 'tutti_frutti'
  );
$$;

revoke all on function public.is_current_player_tutti_frutti_room_member(uuid) from public, anon;
grant execute on function public.is_current_player_tutti_frutti_room_member(uuid) to authenticated;

create policy "Tutti Frutti room members can read their setup"
  on public.tutti_frutti_room_setup
  for select
  to authenticated
  using (public.is_current_player_tutti_frutti_room_member(room_id));

alter publication supabase_realtime add table public.tutti_frutti_room_setup;

create or replace function public.get_tutti_frutti_room_setup(target_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  saved_configuration jsonb;
  saved_at timestamptz;
begin
  current_auth_user_id := auth.uid();
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  if not public.is_current_player_tutti_frutti_room_member(target_room_id) then
    raise exception 'La sala Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  select setup.configuration, setup.updated_at
    into saved_configuration, saved_at
  from public.tutti_frutti_room_setup as setup
  where setup.room_id = target_room_id;

  if not found then
    return jsonb_build_object(
      'configuration', jsonb_build_object(
        'version', 1,
        'roundCount', 5,
        'categories', jsonb_build_array(
          jsonb_build_object('kind', 'preset', 'key', 'name'),
          jsonb_build_object('kind', 'preset', 'key', 'animal'),
          jsonb_build_object('kind', 'preset', 'key', 'food'),
          jsonb_build_object('kind', 'preset', 'key', 'place'),
          jsonb_build_object('kind', 'preset', 'key', 'object')
        )
      ),
      'updatedAt', null
    );
  end if;

  return jsonb_build_object(
    'configuration', saved_configuration,
    'updatedAt', saved_at
  );
end;
$$;

revoke all on function public.get_tutti_frutti_room_setup(uuid) from public, anon;
grant execute on function public.get_tutti_frutti_room_setup(uuid) to authenticated;

create or replace function public.save_tutti_frutti_room_setup(
  target_room_id uuid,
  requested_configuration jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  room_group_id uuid;
  room_host_player_id uuid;
  room_status text;
  room_game_type text;
  rounds_text text;
  rounds_value integer;
  category_count integer;
  category_item record;
  category_kind text;
  category_key text;
  category_label text;
  canonical_label text;
  seen_labels text[] := array[]::text[];
  normalized_categories jsonb := '[]'::jsonb;
  normalized_configuration jsonb;
  saved_configuration jsonb;
  saved_at timestamptz;
begin
  current_auth_user_id := auth.uid();
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  select players.id
    into current_player_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null then
    raise exception 'La identidad no tiene un jugador asociado.' using errcode = 'P0031';
  end if;

  select rooms.group_id, rooms.host_player_id, rooms.status, rooms.game_type
    into room_group_id, room_host_player_id, room_status, room_game_type
  from public.rooms
  where rooms.id = target_room_id
  for update;

  if not found
    or room_game_type is distinct from 'tutti_frutti'
    or not exists (
      select 1
      from public.room_participants
      where room_participants.room_id = target_room_id
        and room_participants.group_id = room_group_id
        and room_participants.player_id = current_player_id
    ) then
    raise exception 'La sala Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  if current_player_id <> room_host_player_id then
    raise exception 'Solo el anfitrion puede editar esta configuracion.' using errcode = 'P0033';
  end if;

  if room_status <> 'lobby' then
    raise exception 'La configuracion solo se puede editar en el lobby.' using errcode = 'P0034';
  end if;

  if jsonb_typeof(requested_configuration) is distinct from 'object'
    or jsonb_typeof(requested_configuration -> 'version') is distinct from 'number'
    or requested_configuration ->> 'version' is distinct from '1' then
    raise exception 'La configuracion no tiene un formato valido.' using errcode = 'P0035';
  end if;

  if jsonb_typeof(requested_configuration -> 'roundCount') is distinct from 'number' then
    raise exception 'La cantidad de rondas no es valida.' using errcode = 'P0035';
  end if;

  rounds_text := requested_configuration ->> 'roundCount';
  if rounds_text is null or rounds_text !~ '^(3|5|10)$' then
    raise exception 'La cantidad de rondas no es valida.' using errcode = 'P0035';
  end if;
  rounds_value := rounds_text::integer;

  if jsonb_typeof(requested_configuration -> 'categories') is distinct from 'array' then
    raise exception 'La lista de categorias no es valida.' using errcode = 'P0035';
  end if;

  select jsonb_array_length(requested_configuration -> 'categories')
    into category_count;
  if category_count < 3 or category_count > 6 then
    raise exception 'La configuracion requiere entre 3 y 6 categorias.' using errcode = 'P0035';
  end if;

  for category_item in
    select categories.value, categories.ordinality
    from jsonb_array_elements(requested_configuration -> 'categories') with ordinality as categories(value, ordinality)
    order by categories.ordinality
  loop
    if jsonb_typeof(category_item.value) is distinct from 'object' then
      raise exception 'Una categoria no tiene un formato valido.' using errcode = 'P0035';
    end if;

    category_kind := category_item.value ->> 'kind';
    if category_kind = 'preset' then
      if jsonb_typeof(category_item.value -> 'key') is distinct from 'string' then
        raise exception 'La categoria predefinida no es valida.' using errcode = 'P0035';
      end if;
      category_key := category_item.value ->> 'key';
      canonical_label := case category_key
        when 'name' then 'Nombre'
        when 'animal' then 'Animal'
        when 'food' then 'Comida'
        when 'place' then 'Lugar'
        when 'object' then 'Objeto'
        when 'country' then 'País'
        when 'city' then 'Ciudad'
        when 'profession' then 'Profesión'
        when 'famous_person' then 'Persona famosa'
        when 'movie_or_series' then 'Película o serie'
        else null
      end;

      if canonical_label is null then
        raise exception 'La categoria predefinida no es valida.' using errcode = 'P0035';
      end if;
      category_label := canonical_label;
    elsif category_kind = 'custom' then
      if jsonb_typeof(category_item.value -> 'label') is distinct from 'string' then
        raise exception 'El nombre de categoria no es valido.' using errcode = 'P0035';
      end if;
      category_label := normalize(
        regexp_replace(coalesce(category_item.value ->> 'label', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
        NFC
      );

      if char_length(category_label) < 1
        or char_length(category_label) > 40
        or category_label ~ '[[:cntrl:]]' then
        raise exception 'Cada categoria personalizada debe tener entre 1 y 40 caracteres imprimibles.' using errcode = 'P0035';
      end if;

      if lower(category_label) = any (array[
        lower('Nombre'), lower('Animal'), lower('Comida'), lower('Lugar'), lower('Objeto'),
        lower('País'), lower('Ciudad'), lower('Profesión'), lower('Persona famosa'), lower('Película o serie')
      ]) or lower(category_label) = any (seen_labels) then
        raise exception 'El nombre de categoria ya esta en uso.' using errcode = 'P0036';
      end if;
    else
      raise exception 'El tipo de categoria no es valido.' using errcode = 'P0035';
    end if;

    if lower(category_label) = any (seen_labels) then
      raise exception 'El nombre de categoria ya esta en uso.' using errcode = 'P0036';
    end if;

    seen_labels := array_append(seen_labels, lower(category_label));
    if category_kind = 'preset' then
      normalized_categories := normalized_categories || jsonb_build_array(
        jsonb_build_object('kind', 'preset', 'key', category_key)
      );
    else
      normalized_categories := normalized_categories || jsonb_build_array(
        jsonb_build_object('kind', 'custom', 'label', category_label)
      );
    end if;
  end loop;

  normalized_configuration := jsonb_build_object(
    'version', 1,
    'roundCount', rounds_value,
    'categories', normalized_categories
  );

  insert into public.tutti_frutti_room_setup (room_id, configuration, updated_at)
  values (target_room_id, normalized_configuration, now())
  on conflict (room_id) do update
    set configuration = excluded.configuration,
        updated_at = excluded.updated_at
  returning configuration, updated_at into saved_configuration, saved_at;

  return jsonb_build_object(
    'configuration', saved_configuration,
    'updatedAt', saved_at
  );
end;
$$;

revoke all on function public.save_tutti_frutti_room_setup(uuid, jsonb) from public, anon;
grant execute on function public.save_tutti_frutti_room_setup(uuid, jsonb) to authenticated;
