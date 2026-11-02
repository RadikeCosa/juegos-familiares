-- Codes remain globally reserved, including closed rooms. 512 * 511 = 261632
-- ordered pairs; exhaustion requires a separately authorized format expansion.
-- Catalog v1 is fixed here. Lookups validate the format, not catalog membership,
-- so retiring a word in a future generator never invalidates an issued code.
alter table public.rooms drop constraint rooms_join_code_format_check;
alter table public.rooms add constraint rooms_join_code_format_check check (
  join_code = upper(btrim(join_code)) and (
    join_code ~ '^[A-HJ-NP-Z2-9]{8}$'
    or (join_code ~ '^[A-Z]{3,7}-[A-Z]{3,7}$'
        and split_part(join_code, '-', 1) <> split_part(join_code, '-', 2))
  )
);

-- Internal helpers are not callable through the Data API.
create or replace function public.normalize_room_join_code(raw_code text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized text := upper(regexp_replace(coalesce(raw_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'));
begin
  -- Legacy codes must take precedence: preserve their exact stored alphabet.
  if normalized ~ '^[A-HJ-NP-Z2-9]{8}$' then
    return normalized;
  end if;
  normalized := translate(normalized, 'ÁÉÍÓÚÜ', 'AEIOUU');
  if normalized !~ '^[A-Z]{3,7}[[:space:]-]+[A-Z]{3,7}$' then
    return null;
  end if;
  normalized := regexp_replace(normalized, '[[:space:]-]+', '-', 'g');
  if split_part(normalized, '-', 1) = split_part(normalized, '-', 2) then
    return null;
  end if;
  return normalized;
end;
$$;
revoke all on function public.normalize_room_join_code(text) from public, anon, authenticated;

create or replace function public.generate_room_join_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  words constant text[] := array[
    'ABEJA', 'ABETO', 'ABRIGO', 'ABUELA', 'ABUELO', 'ACACIA', 'ACUARIO', 'ADORNO',
    'AGENDA', 'AGUILA', 'AGUJA', 'ALAMO', 'ALETA', 'ALGA', 'ALPACA', 'ALUBIA',
    'ALUMNO', 'ANCLA', 'ANILLO', 'ANTENA', 'ARBOL', 'ARISTA', 'AROMA', 'ARPA',
    'ARTE', 'ASADO', 'ASPA', 'ATAJO', 'AULA', 'AURORA', 'AVENA', 'AZAFRAN',
    'AZULEJO', 'BAHIA', 'BAILE', 'BAJADA', 'BALADA', 'BALANZA', 'BALLENA', 'BANANA',
    'BANDEJA', 'BANJO', 'BASTON', 'BATATA', 'BATIDO', 'BAUL', 'BEBIDA', 'BENGALA',
    'BIGOTE', 'BILLETE', 'BINGO', 'BLUSA', 'BOBINA', 'BOCINA', 'BOLERO', 'BOMBON',
    'BOSQUE', 'BOTON', 'BRISA', 'BROCOLI', 'BRONCE', 'BROTE', 'BUCLE', 'BUHO',
    'BUQUE', 'BURBUJA', 'BUTACA', 'CABALLO', 'CABELLO', 'CABLE', 'CACAO', 'CADENA',
    'CADERA', 'CAFE', 'CAJON', 'CALDERA', 'CALMA', 'CALOR', 'CAMISA', 'CAMPANA',
    'CAMPO', 'CANARIO', 'CANELA', 'CANGURO', 'CANICA', 'CANOA', 'CANTO', 'CARACOL',
    'CARGA', 'CARRERA', 'CARRO', 'CARTA', 'CASCADA', 'CASCO', 'CASTOR', 'CAUCE',
    'CELESTE', 'CELULA', 'CENA', 'CENEFA', 'CENTRO', 'CEREZA', 'CERRO', 'CHARCO',
    'CHISPA', 'CHOCLO', 'CHOZA', 'CIERVO', 'CINE', 'CIRUELA', 'CISNE', 'CIUDAD',
    'CLAVEL', 'CLAVO', 'CLIMA', 'COBRE', 'COCINA', 'COCO', 'COLCHON', 'COLIBRI',
    'COLLAR', 'COLMENA', 'COLUMNA', 'COMIDA', 'CONGA', 'COPETE', 'COPO', 'CORAL',
    'CORCHO', 'CORDEL', 'CORONA', 'CORREA', 'CORVINA', 'COSTA', 'CRESTA', 'CRISTAL',
    'CUBETA', 'CUBITO', 'CUBO', 'CUELLO', 'CUENTO', 'CUERDA', 'CUERO', 'CUEVA',
    'CULTIVO', 'CURCUMA', 'CURSO', 'CURVA', 'DADO', 'DALIA', 'DAMA', 'DELICIA',
    'DEPORTE', 'DIBUJO', 'DIENTE', 'DISCO', 'DISFRAZ', 'DIVAN', 'DOMINGO', 'DONA',
    'DRAGON', 'DUENDE', 'DULCE', 'DURAZNO', 'ELOTE', 'EMBUDO', 'ENCAJE', 'ENCINA',
    'EQUIPO', 'ERIZO', 'ESPEJO', 'ESQUINA', 'ESTANTE', 'ESTEPA', 'FALDA', 'FARO',
    'FAROL', 'FELINO', 'FERIA', 'FIDEO', 'FIGURA', 'FILTRO', 'FLECHA', 'FLOR',
    'FLOTA', 'FOCO', 'FOGATA', 'FOGON', 'FOLIO', 'FOTO', 'FRASCO', 'FRESA',
    'FRUTA', 'FUNDA', 'GACELA', 'GAITA', 'GAJO', 'GALLINA', 'GAMUZA', 'GARZA',
    'GATO', 'GAVIOTA', 'GEMA', 'GEMELO', 'GIRASOL', 'GLOBO', 'GORILA', 'GORRA',
    'GOTA', 'GRANO', 'GRIS', 'GRULLA', 'GUANTE', 'GUISO', 'HAMACA', 'HARINA',
    'HEBILLA', 'HIGO', 'HILERA', 'HILO', 'HINOJO', 'HOGAR', 'HOJA', 'HOTEL',
    'HUELLA', 'HUERTA', 'HUMO', 'HURON', 'IGLU', 'IGUANA', 'IMAN', 'INSECTO',
    'ISLA', 'JABALI', 'JABON', 'JAGUAR', 'JARRA', 'JAZMIN', 'JIRAFA', 'JOYA',
    'JUEGO', 'JUEVES', 'JUGO', 'JUNCO', 'KIMONO', 'KIWI', 'KOALA', 'LABIO',
    'LAGARTO', 'LAGO', 'LAGUNA', 'LAMPARA', 'LANA', 'LANCHA', 'LAPIZ', 'LAUREL',
    'LECHUGA', 'LENTE', 'LENTEJA', 'LEON', 'LETRA', 'LIEBRE', 'LIENZO', 'LIMA',
    'LIMON', 'LINO', 'LLAMA', 'LLAVE', 'LLUVIA', 'LOBO', 'LOMITA', 'LONA',
    'LOTO', 'LUNA', 'LUPA', 'LUZ', 'MAIZ', 'MALETA', 'MANADA', 'MANGA',
    'MANGO', 'MANI', 'MANTA', 'MANTEL', 'MARCO', 'MARFIL', 'MARMOL', 'MASA',
    'MATE', 'MEDALLA', 'MEDIA', 'MEDUSA', 'MENTA', 'MERCADO', 'MESA', 'METAL',
    'MIEL', 'MIGAJA', 'MIMBRE', 'MOCHILA', 'MOLDE', 'MONEDA', 'MONTE', 'MORERA',
    'MORRON', 'MOSCA', 'MUELLE', 'MURAL', 'MUSGO', 'MUSICA', 'NABO', 'NATA',
    'NEVADO', 'NIDO', 'NIEBLA', 'NOCHE', 'NOGAL', 'NORIA', 'NORTE', 'NUBE',
    'NUCLEO', 'NUEZ', 'NUTRIA', 'OCARINA', 'OCRE', 'OLIVO', 'OREGANO', 'OREJA',
    'ORIGAMI', 'ORILLA', 'ORUGA', 'OVEJA', 'OVILLO', 'PAJARO', 'PALACIO', 'PALETA',
    'PALMA', 'PALOMA', 'PALTA', 'PANAL', 'PANEL', 'PAPEL', 'PAQUETE', 'PARQUE',
    'PASEO', 'PASTEL', 'PATA', 'PATIN', 'PATIO', 'PAVO', 'PEAJE', 'PECERA',
    'PECHO', 'PEINE', 'PELAJE', 'PELOTA', 'PEPINO', 'PERCHA', 'PEREJIL', 'PERRO',
    'PESEBRE', 'PEZ', 'PIANO', 'PICO', 'PIEDRA', 'PIJAMA', 'PILAR', 'PILOTO',
    'PINO', 'PINTURA', 'PIPA', 'PISTA', 'PIZZA', 'PLACA', 'PLANETA', 'PLANTA',
    'PLATA', 'PLATO', 'PLAZA', 'PLIEGO', 'PLUMA', 'POLEA', 'POLEN', 'POLLERA',
    'PONCHO', 'POPA', 'POROTO', 'PORTAL', 'POSTE', 'POTRO', 'PRADO', 'PUENTE',
    'PULGAR', 'PULPO', 'PULSERA', 'PUMA', 'PUNTO', 'PURE', 'QUESO', 'QUINUA',
    'RACIMO', 'RADAR', 'RAIZ', 'RAMO', 'RANA', 'RAQUETA', 'RAVIOL', 'RED',
    'REGATA', 'REGLA', 'REMO', 'RENO', 'REPTIL', 'RETAZO', 'RETRATO', 'RIACHO',
    'RINCON', 'RIO', 'RISA', 'RITMO', 'RIZO', 'ROCA', 'RODAJA', 'RODILLO',
    'ROJO', 'ROLLO', 'ROMERO', 'RONDA', 'ROPA', 'ROPERO', 'ROSA', 'RUBI',
    'RULO', 'RUTA', 'SABOR', 'SACO', 'SAFARI', 'SALMON', 'SALSA', 'SALTO',
    'SANDIA', 'SAXOFON', 'SELVA', 'SEMILLA', 'SILLA', 'SODA', 'SOFA', 'SOL',
    'SOLAPA', 'SOMBRA', 'SONAJA', 'SOPA', 'SOPLO', 'SORBETE', 'SUELO', 'SUETER',
    'SUR', 'SURCO', 'TABLA', 'TACO', 'TALLER', 'TAMBOR', 'TAPIZ', 'TARRO',
    'TEATRO', 'TECHO', 'TECLA', 'TEJIDO', 'TELA', 'TELAR', 'TENIS', 'TERMO',
    'TIERRA', 'TIGRE', 'TIMBAL', 'TIMBRE', 'TINA', 'TINTA', 'TIRA', 'TOALLA',
    'TOBILLO', 'TOMATE', 'TOMILLO', 'TORRE', 'TORTA', 'TORTUGA', 'TREBOL', 'TREN',
    'TRIGO', 'TRONCO', 'TRUCHA', 'TUCAN', 'TULIPAN', 'TUNEL', 'UMBRAL', 'UVA',
    'VAJILLA', 'VAPOR', 'VARA', 'VASIJA', 'VELA', 'VELERO', 'VENTANA', 'VERDE',
    'VIAJE', 'VIENTO', 'VIOLIN', 'YATE', 'YERBA', 'ZAFIRO', 'ZANCO', 'ZORZAL'
  ];
  random_bytes bytea := extensions.gen_random_bytes(4);
  first_index integer := (get_byte(random_bytes, 0) * 256 + get_byte(random_bytes, 1)) % 512;
  second_sample integer := get_byte(random_bytes, 2) * 256 + get_byte(random_bytes, 3);
  second_index integer;
begin
  -- Rejection sampling avoids modulo bias over the other 511 words.
  while second_sample >= 65408 loop
    random_bytes := extensions.gen_random_bytes(2);
    second_sample := get_byte(random_bytes, 0) * 256 + get_byte(random_bytes, 1);
  end loop;
  second_index := second_sample % 511;
  if second_index >= first_index then
    second_index := second_index + 1;
  end if;
  return words[first_index + 1] || '-' || words[second_index + 1];
end;
$$;
revoke all on function public.generate_room_join_code() from public, anon, authenticated;

create or replace function public.create_room(requested_game_type text)
returns table (
  room_id uuid,
  room_join_code text,
  room_status text,
  participant_player_id uuid,
  participant_nickname text,
  participant_is_host boolean,
  participant_is_self boolean,
  participant_joined_at timestamptz
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
  new_room_id uuid;
  new_join_code text;
  attempt integer;
  active_game_type text;
begin
  if requested_game_type is null or requested_game_type not in ('impostor', 'tutti_frutti') then
    raise exception 'Juego de sala invalido.' using errcode = 'P0028';
  end if;

  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para crear una sala.'
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

  select player_active_room_slots.room_id
    into active_room_id
  from public.player_active_room_slots
  where player_active_room_slots.player_id = current_player_id;

  if active_room_id is null then
    for attempt in 1..8 loop
      new_join_code := public.generate_room_join_code();
      new_room_id := extensions.gen_random_uuid();

      begin
        insert into public.rooms (id, group_id, join_code, host_player_id, game_type)
        values (new_room_id, current_group_id, new_join_code, current_player_id, requested_game_type);

        insert into public.room_participants (room_id, player_id, group_id)
        values (new_room_id, current_player_id, current_group_id);

        active_room_id := new_room_id;
        exit;
      exception
        when unique_violation then
          select player_active_room_slots.room_id
            into active_room_id
          from public.player_active_room_slots
          where player_active_room_slots.player_id = current_player_id;

          if active_room_id is not null then
            exit;
          end if;
      end;
    end loop;

    if active_room_id is null then
      raise exception 'No pudimos generar un código disponible. Intentá crear la sala de nuevo'
        using errcode = 'P0057';
    end if;
  end if;

  select rooms.game_type into active_game_type
  from public.rooms
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing');

  if active_game_type is null then
    raise exception 'El slot activo no permite reconstruir una Room activa consistente.' using errcode = 'P0014';
  end if;

  if active_game_type <> requested_game_type then
    raise exception 'Ya estas en una sala activa de otro juego.' using errcode = 'P0029';
  end if;

  return query
  select
    rooms.id,
    rooms.join_code,
    rooms.status,
    room_participants.player_id,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    (room_participants.player_id = current_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
   and players.group_id = rooms.group_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing')
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

create or replace function public.join_room_by_code(room_code text, expected_game_type text)
returns table (
  room_id uuid,
  room_join_code text,
  room_status text,
  participant_player_id uuid,
  participant_nickname text,
  participant_is_host boolean,
  participant_is_self boolean,
  participant_joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  normalized_code text;
  target_room_id uuid;
  target_room_group_id uuid;
  target_room_status text;
  target_room_game_type text;
  existing_active_room_id uuid;
  active_room_id uuid;
begin
  if expected_game_type is null or expected_game_type not in ('impostor', 'tutti_frutti') then
    raise exception 'Juego de sala invalido.' using errcode = 'P0028';
  end if;

  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para unirse a una sala.'
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

  normalized_code := public.normalize_room_join_code(room_code);

  select rooms.id, rooms.group_id, rooms.status, rooms.game_type
    into target_room_id, target_room_group_id, target_room_status, target_room_game_type
  from public.rooms
  where rooms.join_code = normalized_code
  for update;

  if target_room_id is null or target_room_group_id <> current_group_id then
    raise exception 'No encontramos esa sala.'
      using errcode = 'P0010';
  end if;

  if target_room_game_type <> expected_game_type then
    raise exception 'El codigo pertenece a otro juego.' using errcode = 'P0030';
  end if;

  if target_room_status <> 'lobby' then
    raise exception 'Esta sala ya no esta disponible.'
      using errcode = 'P0011';
  end if;

  if exists (
    select 1
    from public.room_participants
    where room_participants.room_id = target_room_id
      and room_participants.player_id = current_player_id
  ) then
    active_room_id := target_room_id;
  else
    select player_active_room_slots.room_id
      into existing_active_room_id
    from public.player_active_room_slots
    where player_active_room_slots.player_id = current_player_id;

    if existing_active_room_id is not null and existing_active_room_id <> target_room_id then
      raise exception 'Ya estas en otra sala.'
        using errcode = 'P0012';
    end if;

    begin
      insert into public.room_participants (room_id, player_id, group_id)
      values (target_room_id, current_player_id, current_group_id);
    exception
      when unique_violation then
        select player_active_room_slots.room_id
          into existing_active_room_id
        from public.player_active_room_slots
        where player_active_room_slots.player_id = current_player_id;

        if existing_active_room_id is not null and existing_active_room_id <> target_room_id then
          raise exception 'Ya estas en otra sala.'
            using errcode = 'P0012';
        end if;
    end;

    active_room_id := target_room_id;
  end if;

  return query
  select
    rooms.id,
    rooms.join_code,
    rooms.status,
    room_participants.player_id,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    (room_participants.player_id = current_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
   and players.group_id = rooms.group_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status = 'lobby'
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

revoke all on function public.create_room(text) from public, anon;
revoke all on function public.join_room_by_code(text, text) from public, anon;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room_by_code(text, text) to authenticated;
