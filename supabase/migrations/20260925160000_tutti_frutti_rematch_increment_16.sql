-- Increment 16: a Room may host sequential immutable Tutti Frutti sessions.

create or replace function public.start_tutti_frutti_session(target_room_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  current_auth_user_id uuid := auth.uid();
  current_player_id uuid;
  target_group_id uuid;
  target_host_player_id uuid;
  target_game_type text;
  target_status text;
  active_session_id uuid;
  stored_starter_id uuid;
  saved_configuration jsonb;
  configuration_result jsonb;
  category_item record;
  category_label text;
  selected_pool constant text[] := array[
    'A','B','C','D','E','F','G','H','I','J','L','M','N','O','P','R','S','T','U','V'
  ];
  new_session_id uuid;
  new_round_id uuid;
  new_candidate_id uuid;
  selected_letter text;
  participant_count integer;
  category_count integer;
  configured_round_count integer;
begin
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;
  select players.id into current_player_id
  from public.players where players.auth_user_id = current_auth_user_id;
  if current_player_id is null then
    raise exception 'La identidad no tiene un jugador asociado.' using errcode = 'P0031';
  end if;

  select rooms.group_id, rooms.host_player_id, rooms.game_type, rooms.status
    into target_group_id, target_host_player_id, target_game_type, target_status
  from public.rooms
  where rooms.id = target_room_id
  for update;
  if not found or target_game_type is distinct from 'tutti_frutti' then
    raise exception 'La sala Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  if target_status = 'playing' then
    select room_sessions.id, tutti_frutti_sessions.started_by_player_id
      into active_session_id, stored_starter_id
    from public.room_sessions
    join public.tutti_frutti_sessions on tutti_frutti_sessions.id = room_sessions.id
    where room_sessions.room_id = target_room_id
      and room_sessions.group_id = target_group_id
      and room_sessions.game_type = 'tutti_frutti'
      and room_sessions.finished_at is null;
    if active_session_id is null then
      raise exception 'La sala no tiene una partida Tutti Frutti activa.' using errcode = 'P0056';
    end if;
    if not public.is_current_player_tutti_frutti_session_participant(active_session_id) then
      raise exception 'La sala Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
    end if;
    if current_player_id is distinct from stored_starter_id
      and current_player_id is distinct from target_host_player_id then
      raise exception 'Solo el anfitrion actual o quien inicio la partida puede recuperar este inicio.'
        using errcode = 'P0033';
    end if;
    return public.get_tutti_frutti_game_state(target_room_id);
  end if;

  if not exists (
    select 1 from public.room_participants
    where room_participants.room_id = target_room_id
      and room_participants.group_id = target_group_id
      and room_participants.player_id = current_player_id
  ) then
    raise exception 'La sala Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;
  if current_player_id <> target_host_player_id then
    raise exception 'Solo el anfitrion puede iniciar la partida.' using errcode = 'P0033';
  end if;
  if target_status <> 'lobby' then
    raise exception 'La sala no esta en el lobby.' using errcode = 'P0034';
  end if;

  -- Room in lobby with any unfinished Tutti Frutti session violates the
  -- lifecycle invariant. Finished sessions are trusted to have passed the
  -- atomic Increment 15 scoring checks and are not rescanned on this path.
  if exists (
    select 1 from public.room_sessions
    where room_sessions.room_id = target_room_id
      and room_sessions.game_type = 'tutti_frutti'
      and room_sessions.finished_at is null
  ) then
    raise exception 'La sala tiene una partida anterior sin finalizar correctamente.'
      using errcode = 'P0056';
  end if;

  select count(*) into participant_count
  from public.room_participants
  where room_participants.room_id = target_room_id
    and room_participants.group_id = target_group_id;
  if participant_count < 2 then
    raise exception 'Se necesitan al menos dos participantes.' using errcode = 'P0037';
  end if;

  configuration_result := public.get_tutti_frutti_room_setup(target_room_id);
  saved_configuration := configuration_result -> 'configuration';
  if jsonb_typeof(saved_configuration) is distinct from 'object'
    or (saved_configuration ->> 'version') is distinct from '1'
    or (saved_configuration ->> 'roundCount') !~ '^(3|5|10)$'
    or jsonb_typeof(saved_configuration -> 'categories') is distinct from 'array' then
    raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
  end if;
  configured_round_count := (saved_configuration ->> 'roundCount')::integer;
  select jsonb_array_length(saved_configuration -> 'categories') into category_count;
  if category_count < 3 or category_count > 6 then
    raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
  end if;

  new_session_id := extensions.gen_random_uuid();
  insert into public.room_sessions (
    id, room_id, group_id, game_type, started_at, impostor_game_session_id
  ) values (
    new_session_id, target_room_id, target_group_id, 'tutti_frutti', now(), null
  );
  insert into public.room_session_participants (session_id, group_id, player_id)
  select new_session_id, target_group_id, room_participants.player_id
  from public.room_participants
  where room_participants.room_id = target_room_id
    and room_participants.group_id = target_group_id
  order by room_participants.joined_at, room_participants.player_id;
  insert into public.tutti_frutti_sessions (
    id, round_count, letter_pool, started_by_player_id
  ) values (
    new_session_id, configured_round_count, selected_pool, current_player_id
  );

  for category_item in
    select categories.value, categories.ordinality
    from jsonb_array_elements(saved_configuration -> 'categories')
      with ordinality as categories(value, ordinality)
    order by categories.ordinality
  loop
    if category_item.value ->> 'kind' = 'preset' then
      category_label := case category_item.value ->> 'key'
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
      if category_label is null then
        raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
      end if;
      insert into public.tutti_frutti_session_categories (
        session_id, position, category_kind, preset_key, label
      ) values (
        new_session_id, category_item.ordinality::integer,
        'preset', category_item.value ->> 'key', category_label
      );
    elsif category_item.value ->> 'kind' = 'custom'
      and jsonb_typeof(category_item.value -> 'label') = 'string' then
      category_label := normalize(category_item.value ->> 'label', NFC);
      if char_length(category_label) < 1 or char_length(category_label) > 40 then
        raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
      end if;
      insert into public.tutti_frutti_session_categories (
        session_id, position, category_kind, preset_key, label
      ) values (
        new_session_id, category_item.ordinality::integer,
        'custom', null, category_label
      );
    else
      raise exception 'La configuracion de Tutti Frutti no es valida.' using errcode = 'P0038';
    end if;
  end loop;

  new_round_id := extensions.gen_random_uuid();
  new_candidate_id := extensions.gen_random_uuid();
  selected_letter := selected_pool[1 + floor(random() * cardinality(selected_pool))::integer];
  insert into public.tutti_frutti_rounds (id, session_id, round_number, phase)
  values (new_round_id, new_session_id, 1, 'LETTER_PENDING');
  insert into public.tutti_frutti_letter_candidates (
    id, session_id, round_id, letter, status
  ) values (
    new_candidate_id, new_session_id, new_round_id, selected_letter, 'pending'
  );
  update public.rooms set status = 'playing'
  where rooms.id = target_room_id and rooms.status = 'lobby';
  if not found then
    raise exception 'La sala ya no esta en el lobby.' using errcode = 'P0034';
  end if;
  return public.get_tutti_frutti_game_state(target_room_id);
end;
$$;

revoke all on function public.start_tutti_frutti_session(uuid) from public, anon;
grant execute on function public.start_tutti_frutti_session(uuid) to authenticated;
