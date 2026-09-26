-- Increment 9: private, durable answers for the active Tutti Frutti round.

alter table public.tutti_frutti_sessions
  add column answer_normalization_version smallint not null default 1
  check (answer_normalization_version > 0);

alter table public.tutti_frutti_rounds
  add constraint tutti_frutti_rounds_session_id_id_key unique (session_id, id);

create table public.tutti_frutti_answers (
  session_id uuid not null,
  round_id uuid not null,
  player_id uuid not null,
  category_position integer not null check (category_position between 1 and 6),
  original_text text not null default '',
  normalized_value text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  constraint tutti_frutti_answers_pkey primary key (round_id, player_id, category_position),
  constraint tutti_frutti_answers_round_fkey
    foreign key (session_id, round_id)
    references public.tutti_frutti_rounds(session_id, id) on delete cascade,
  constraint tutti_frutti_answers_roster_fkey
    foreign key (session_id, player_id)
    references public.room_session_participants(session_id, player_id) on delete cascade,
  constraint tutti_frutti_answers_category_fkey
    foreign key (session_id, category_position)
    references public.tutti_frutti_session_categories(session_id, position) on delete cascade
);

alter table public.tutti_frutti_answers enable row level security;
revoke all on table public.tutti_frutti_answers from public, anon, authenticated;

create table public.tutti_frutti_answer_signals (
  session_id uuid not null,
  player_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint tutti_frutti_answer_signals_pkey primary key (session_id, player_id),
  constraint tutti_frutti_answer_signals_roster_fkey
    foreign key (session_id, player_id)
    references public.room_session_participants(session_id, player_id) on delete cascade
);

alter table public.tutti_frutti_answer_signals enable row level security;
grant select on table public.tutti_frutti_answer_signals to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.tutti_frutti_answer_signals from public, anon, authenticated;

create policy "Players can read only their Tutti answer invalidation"
  on public.tutti_frutti_answer_signals
  for select to authenticated
  using (
    exists (
      select 1
      from public.players
      where players.id = tutti_frutti_answer_signals.player_id
        and players.auth_user_id = auth.uid()
    )
    and public.is_current_player_tutti_frutti_session_participant(session_id)
  );

alter publication supabase_realtime add table public.tutti_frutti_answer_signals;

create or replace function public.normalize_tutti_frutti_answer_v1(input_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(
    normalize(input_value, NFC),
    chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || chr(133)
      || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195)
      || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
      || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288)
      || chr(65279)
  ));
$$;

revoke all on function public.normalize_tutti_frutti_answer_v1(text) from public, anon, authenticated;

create or replace function public.get_tutti_frutti_my_answers(target_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := auth.uid();
  current_player_id uuid;
  current_session_id uuid;
  current_round_id uuid;
  current_round_number integer;
  current_round_phase text;
  result jsonb;
begin
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  select players.id into current_player_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null then
    raise exception 'La identidad no tiene un jugador asociado.' using errcode = 'P0031';
  end if;

  if not exists (
    select 1 from public.rooms
    where rooms.id = target_room_id
      and rooms.game_type = 'tutti_frutti'
      and rooms.status = 'playing'
  ) then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  select room_sessions.id into current_session_id
  from public.room_sessions
  where room_sessions.room_id = target_room_id
    and room_sessions.game_type = 'tutti_frutti'
    and room_sessions.finished_at is null;

  if current_session_id is null
    or not exists (
      select 1 from public.room_session_participants
      where room_session_participants.session_id = current_session_id
        and room_session_participants.player_id = current_player_id
    ) then
    raise exception 'La partida de Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;

  select rounds.id, rounds.round_number, rounds.phase
    into current_round_id, current_round_number, current_round_phase
  from public.tutti_frutti_rounds as rounds
  where rounds.session_id = current_session_id
  order by rounds.round_number desc
  limit 1;

  if current_round_id is null then
    raise exception 'No se pudo recuperar la ronda activa.' using errcode = 'P0038';
  end if;

  select jsonb_build_object(
    'roomId', target_room_id,
    'sessionId', current_session_id,
    'normalizationVersion', (
      select sessions.answer_normalization_version
      from public.tutti_frutti_sessions as sessions
      where sessions.id = current_session_id
    ),
    'roundId', current_round_id,
    'roundNumber', current_round_number,
    'phase', current_round_phase,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'categoryPosition', categories.position,
        'answerText', coalesce(answers.original_text, ''),
        'updatedAt', answers.updated_at
      ) order by categories.position)
      from public.tutti_frutti_session_categories as categories
      left join public.tutti_frutti_answers as answers
        on answers.session_id = categories.session_id
       and answers.round_id = current_round_id
       and answers.player_id = current_player_id
       and answers.category_position = categories.position
      where categories.session_id = current_session_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_tutti_frutti_my_answers(uuid) from public, anon;
grant execute on function public.get_tutti_frutti_my_answers(uuid) to authenticated;

create or replace function public.save_tutti_frutti_answer(
  target_room_id uuid,
  target_category_position integer,
  target_answer_text text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := auth.uid();
  current_player_id uuid;
  current_session_id uuid;
  current_room_status text;
  current_round_id uuid;
  current_round_number integer;
  current_round_phase text;
  current_answer text;
  current_normalized_answer text;
  saved_answer public.tutti_frutti_answers%rowtype;
  answer_changed boolean := false;
begin
  if current_auth_user_id is null then
    raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031';
  end if;

  if target_answer_text is null
    or char_length(normalize(target_answer_text, NFC)) > 200 then
    raise exception 'La respuesta debe tener como maximo 200 puntos de codigo Unicode.' using errcode = 'P0041';
  end if;

  select players.id into current_player_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null then
    raise exception 'La identidad no tiene un jugador asociado.' using errcode = 'P0031';
  end if;

  select rooms.status into current_room_status
  from public.rooms
  where rooms.id = target_room_id
    and rooms.game_type = 'tutti_frutti'
  for update;

  if not found then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;

  if current_room_status <> 'playing' then
    raise exception 'La sala ya no esta en juego.' using errcode = 'P0042';
  end if;

  select room_sessions.id into current_session_id
  from public.room_sessions
  where room_sessions.room_id = target_room_id
    and room_sessions.game_type = 'tutti_frutti'
    and room_sessions.finished_at is null
  for update;

  if current_session_id is null
    or not exists (
      select 1 from public.room_session_participants
      where room_session_participants.session_id = current_session_id
        and room_session_participants.player_id = current_player_id
    ) then
    raise exception 'La partida de Tutti Frutti no esta disponible para tu cuenta.' using errcode = 'P0032';
  end if;

  select rounds.id, rounds.round_number, rounds.phase
    into current_round_id, current_round_number, current_round_phase
  from public.tutti_frutti_rounds as rounds
  where rounds.session_id = current_session_id
  order by rounds.round_number desc
  limit 1
  for update;

  if current_round_id is null or current_round_phase <> 'PLAYING' then
    raise exception 'Las respuestas solo se pueden editar durante PLAYING.' using errcode = 'P0042';
  end if;

  if target_category_position is null or not exists (
    select 1 from public.tutti_frutti_session_categories as categories
    where categories.session_id = current_session_id
      and categories.position = target_category_position
  ) then
    raise exception 'La categoria no pertenece a la sesion activa.' using errcode = 'P0043';
  end if;

  current_normalized_answer := public.normalize_tutti_frutti_answer_v1(target_answer_text);
  current_answer := case when current_normalized_answer = '' then '' else target_answer_text end;

  insert into public.tutti_frutti_answers as answers (
    session_id, round_id, player_id, category_position,
    original_text, normalized_value, updated_at
  ) values (
    current_session_id, current_round_id, current_player_id, target_category_position,
    current_answer, current_normalized_answer, clock_timestamp()
  )
  on conflict (round_id, player_id, category_position) do update
    set original_text = excluded.original_text,
        normalized_value = excluded.normalized_value,
        updated_at = clock_timestamp()
    where answers.original_text is distinct from excluded.original_text
       or answers.normalized_value is distinct from excluded.normalized_value
  returning answers.* into saved_answer;

  if found then
    answer_changed := true;
  else
    select answers.* into saved_answer
    from public.tutti_frutti_answers as answers
    where answers.round_id = current_round_id
      and answers.player_id = current_player_id
      and answers.category_position = target_category_position;
  end if;

  if answer_changed then
    insert into public.tutti_frutti_answer_signals as signals (
      session_id, player_id, revision, updated_at
    ) values (
      current_session_id, current_player_id, 1, clock_timestamp()
    )
    on conflict (session_id, player_id) do update
      set revision = signals.revision + 1,
          updated_at = clock_timestamp();
  end if;

  return jsonb_build_object(
    'roomId', target_room_id,
    'sessionId', current_session_id,
    'roundId', current_round_id,
    'roundNumber', current_round_number,
    'categoryPosition', target_category_position,
    'answerText', saved_answer.original_text,
    'updatedAt', saved_answer.updated_at
  );
end;
$$;

revoke all on function public.save_tutti_frutti_answer(uuid, integer, text) from public, anon;
grant execute on function public.save_tutti_frutti_answer(uuid, integer, text) to authenticated;
