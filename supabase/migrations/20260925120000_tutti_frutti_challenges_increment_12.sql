-- Increment 12: one private, time-bounded challenge at a time during review.

create table public.tutti_frutti_challenges (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null,
  round_id uuid not null,
  answer_player_id uuid not null,
  category_position integer not null,
  challenger_player_id uuid not null,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'RESOLVED_VALID', 'RESOLVED_INVALID')),
  opened_at timestamptz not null default clock_timestamp(),
  deadline_at timestamptz not null,
  resolved_at timestamptz,
  constraint tutti_frutti_challenges_session_id_id_key unique (session_id, id),
  constraint tutti_frutti_challenges_round_fkey
    foreign key (session_id, round_id)
    references public.tutti_frutti_rounds(session_id, id) on delete cascade,
  constraint tutti_frutti_challenges_answer_fkey
    foreign key (round_id, answer_player_id, category_position)
    references public.tutti_frutti_answers(round_id, player_id, category_position) on delete cascade,
  constraint tutti_frutti_challenges_answer_roster_fkey
    foreign key (session_id, answer_player_id)
    references public.room_session_participants(session_id, player_id),
  constraint tutti_frutti_challenges_challenger_roster_fkey
    foreign key (session_id, challenger_player_id)
    references public.room_session_participants(session_id, player_id),
  constraint tutti_frutti_challenges_category_fkey
    foreign key (session_id, category_position)
    references public.tutti_frutti_session_categories(session_id, position),
  constraint tutti_frutti_challenges_distinct_players_check
    check (answer_player_id <> challenger_player_id),
  constraint tutti_frutti_challenges_deadline_check
    check (deadline_at = opened_at + interval '30 seconds'),
  constraint tutti_frutti_challenges_resolution_check
    check ((status = 'OPEN' and resolved_at is null)
      or (status <> 'OPEN' and resolved_at is not null))
);
create unique index tutti_frutti_challenges_one_open_per_round_key
  on public.tutti_frutti_challenges(round_id) where status = 'OPEN';
create unique index tutti_frutti_challenges_one_per_answer_key
  on public.tutti_frutti_challenges(round_id, answer_player_id, category_position);
create index tutti_frutti_challenges_due_idx
  on public.tutti_frutti_challenges(deadline_at, id) where status = 'OPEN';

create table public.tutti_frutti_challenge_votes (
  session_id uuid not null,
  challenge_id uuid not null,
  voter_player_id uuid not null,
  choice text not null check (choice in ('VALID', 'INVALID')),
  created_at timestamptz not null default clock_timestamp(),
  constraint tutti_frutti_challenge_votes_pkey primary key (challenge_id, voter_player_id),
  constraint tutti_frutti_challenge_votes_challenge_fkey
    foreign key (session_id, challenge_id)
    references public.tutti_frutti_challenges(session_id, id) on delete cascade,
  constraint tutti_frutti_challenge_votes_roster_fkey
    foreign key (session_id, voter_player_id)
    references public.room_session_participants(session_id, player_id)
);

create table public.tutti_frutti_review_signals (
  session_id uuid not null,
  round_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint tutti_frutti_review_signals_pkey primary key (session_id, round_id),
  constraint tutti_frutti_review_signals_round_fkey
    foreign key (session_id, round_id)
    references public.tutti_frutti_rounds(session_id, id) on delete cascade
);

alter table public.tutti_frutti_challenges enable row level security;
alter table public.tutti_frutti_challenge_votes enable row level security;
alter table public.tutti_frutti_review_signals enable row level security;
revoke all on table public.tutti_frutti_challenges from public, anon, authenticated;
revoke all on table public.tutti_frutti_challenge_votes from public, anon, authenticated;
grant select on table public.tutti_frutti_review_signals to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.tutti_frutti_review_signals from public, anon, authenticated;

create function public.can_read_tutti_frutti_review_signal(target_session_id uuid, target_round_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_current_player_tutti_frutti_session_participant(target_session_id)
    and exists (select 1 from public.tutti_frutti_rounds as rounds
      where rounds.id = target_round_id and rounds.session_id = target_session_id
        and rounds.phase = 'REVIEWING' and rounds.locked_at is not null);
$$;
revoke all on function public.can_read_tutti_frutti_review_signal(uuid, uuid) from public, anon;
grant execute on function public.can_read_tutti_frutti_review_signal(uuid, uuid) to authenticated;

create policy "Roster can read review invalidations"
  on public.tutti_frutti_review_signals for select to authenticated
  using (public.can_read_tutti_frutti_review_signal(session_id, round_id));
alter publication supabase_realtime add table public.tutti_frutti_review_signals;

create function public.touch_tutti_frutti_review_signal(target_session_id uuid, target_round_id uuid)
returns void language sql volatile security definer set search_path = ''
as $$
  insert into public.tutti_frutti_review_signals as signals(session_id, round_id, revision, updated_at)
  values (target_session_id, target_round_id, 1, clock_timestamp())
  on conflict (session_id, round_id) do update
    set revision = signals.revision + 1, updated_at = clock_timestamp();
$$;
revoke all on function public.touch_tutti_frutti_review_signal(uuid, uuid) from public, anon, authenticated;

create function public.resolve_tutti_frutti_challenge_locked(target_challenge_id uuid)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_challenge public.tutti_frutti_challenges%rowtype;
  v_roster_count integer;
  v_eligible_count integer;
  v_vote_count integer;
  v_invalid_count integer;
  v_invalid_required integer;
  v_author_choice text;
  v_new_status text;
begin
  select * into v_challenge from public.tutti_frutti_challenges
  where id = target_challenge_id for update;
  if not found then return null; end if;
  if v_challenge.status <> 'OPEN' then return v_challenge.status; end if;

  select count(*)::integer into v_roster_count from public.room_session_participants
  where session_id = v_challenge.session_id;
  if v_roster_count = 2 then
    select votes.choice into v_author_choice from public.tutti_frutti_challenge_votes as votes
    where votes.challenge_id = v_challenge.id and votes.voter_player_id = v_challenge.answer_player_id;
    if v_author_choice = 'INVALID' then v_new_status := 'RESOLVED_INVALID';
    elsif v_author_choice = 'VALID' or clock_timestamp() >= v_challenge.deadline_at then
      v_new_status := 'RESOLVED_VALID';
    end if;
  else
    v_eligible_count := v_roster_count - 1;
    v_invalid_required := (v_eligible_count / 2) + 1;
    select count(*)::integer, count(*) filter (where votes.choice = 'INVALID')::integer
      into v_vote_count, v_invalid_count
    from public.tutti_frutti_challenge_votes as votes
    where votes.challenge_id = v_challenge.id;
    if v_invalid_count >= v_invalid_required then v_new_status := 'RESOLVED_INVALID';
    elsif v_invalid_count + (v_eligible_count - v_vote_count) < v_invalid_required
      or clock_timestamp() >= v_challenge.deadline_at then
      v_new_status := 'RESOLVED_VALID';
    end if;
  end if;

  if v_new_status is not null then
    update public.tutti_frutti_challenges
      set status = v_new_status, resolved_at = clock_timestamp()
      where id = v_challenge.id and status = 'OPEN';
    if found then
      perform public.touch_tutti_frutti_review_signal(v_challenge.session_id, v_challenge.round_id);
    end if;
  end if;
  return coalesce(v_new_status, 'OPEN');
end;
$$;
revoke all on function public.resolve_tutti_frutti_challenge_locked(uuid) from public, anon, authenticated;

create function public.open_tutti_frutti_challenge(
  target_room_id uuid,
  target_answer_player_id uuid,
  target_category_position integer
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_session_id uuid;
  v_round_id uuid;
  v_round_phase text;
  v_locked_at timestamptz;
  v_roster_count integer;
  v_answer_normalized text;
  v_existing public.tutti_frutti_challenges%rowtype;
  v_challenge_id uuid;
  v_opened_at timestamptz;
begin
  select players.id into v_actor_id from public.players where auth_user_id = auth.uid();
  if v_actor_id is null then raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031'; end if;
  perform 1 from public.rooms
    where id = target_room_id and game_type = 'tutti_frutti' and status = 'playing' for update;
  if not found then raise exception 'La partida no esta disponible.' using errcode = 'P0032'; end if;
  select sessions.id into v_session_id from public.room_sessions as sessions
    where sessions.room_id = target_room_id and sessions.game_type = 'tutti_frutti'
      and sessions.finished_at is null for update;
  if v_session_id is null or not exists (
    select 1 from public.room_session_participants as roster
    where roster.session_id = v_session_id and roster.player_id = v_actor_id
  ) then raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032'; end if;
  perform 1 from public.tutti_frutti_sessions where id = v_session_id for update;
  select rounds.id, rounds.phase, rounds.locked_at into v_round_id, v_round_phase, v_locked_at
    from public.tutti_frutti_rounds as rounds where rounds.session_id = v_session_id
    order by rounds.round_number desc limit 1 for update;
  if v_round_id is null or v_round_phase <> 'REVIEWING' or v_locked_at is null then
    raise exception 'La ronda no admite impugnaciones.' using errcode = 'P0042';
  end if;
  if target_answer_player_id = v_actor_id then
    raise exception 'No podes impugnar tu propia respuesta.' using errcode = 'P0045';
  end if;
  select answers.normalized_value into v_answer_normalized from public.tutti_frutti_answers as answers
    where answers.round_id = v_round_id and answers.player_id = target_answer_player_id
      and answers.category_position = target_category_position;
  if not found or v_answer_normalized = '' then
    raise exception 'Esa respuesta no puede impugnarse.' using errcode = 'P0045';
  end if;

  select challenges.* into v_existing from public.tutti_frutti_challenges as challenges
    where challenges.round_id = v_round_id and challenges.answer_player_id = target_answer_player_id
      and challenges.category_position = target_category_position;
  if found then
    if v_existing.challenger_player_id = v_actor_id then
      return jsonb_build_object('challengeId', v_existing.id, 'status', v_existing.status,
        'deadlineAt', v_existing.deadline_at, 'idempotent', true);
    end if;
    raise exception 'Esa respuesta ya fue impugnada.' using errcode = 'P0046';
  end if;
  if exists (select 1 from public.tutti_frutti_challenges as challenges
      where challenges.round_id = v_round_id and challenges.status = 'OPEN') then
    raise exception 'Ya hay otra impugnacion abierta en esta ronda.' using errcode = 'P0047';
  end if;
  select count(*)::integer into v_roster_count from public.room_session_participants as roster
    where roster.session_id = v_session_id;
  if v_roster_count < 2 then raise exception 'El roster de la partida no es valido.' using errcode = 'P0038'; end if;

  v_opened_at := clock_timestamp();
  insert into public.tutti_frutti_challenges(
    session_id, round_id, answer_player_id, category_position, challenger_player_id, opened_at, deadline_at
  ) values (v_session_id, v_round_id, target_answer_player_id, target_category_position,
    v_actor_id, v_opened_at, v_opened_at + interval '30 seconds') returning id into v_challenge_id;
  insert into public.tutti_frutti_challenge_votes(session_id, challenge_id, voter_player_id, choice)
    values (v_session_id, v_challenge_id, v_actor_id, 'INVALID');
  perform public.touch_tutti_frutti_review_signal(v_session_id, v_round_id);
  return jsonb_build_object('challengeId', v_challenge_id, 'status', 'OPEN',
    'deadlineAt', v_opened_at + interval '30 seconds', 'idempotent', false);
end;
$$;
revoke all on function public.open_tutti_frutti_challenge(uuid, uuid, integer) from public, anon;
grant execute on function public.open_tutti_frutti_challenge(uuid, uuid, integer) to authenticated;

create function public.vote_tutti_frutti_challenge(
  target_room_id uuid,
  target_challenge_id uuid,
  target_choice text
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_session_id uuid;
  v_round_id uuid;
  v_round_phase text;
  v_locked_at timestamptz;
  v_roster_count integer;
  v_challenge public.tutti_frutti_challenges%rowtype;
  v_existing_choice text;
  v_resolved_status text;
begin
  select players.id into v_actor_id from public.players where auth_user_id = auth.uid();
  if v_actor_id is null then raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031'; end if;
  if target_choice is null or target_choice not in ('VALID', 'INVALID') then
    raise exception 'El voto no es valido.' using errcode = 'P0045';
  end if;
  perform 1 from public.rooms
    where id = target_room_id and game_type = 'tutti_frutti' and status = 'playing' for update;
  if not found then raise exception 'La partida no esta disponible.' using errcode = 'P0032'; end if;
  select sessions.id into v_session_id from public.room_sessions as sessions
    where sessions.room_id = target_room_id and sessions.game_type = 'tutti_frutti'
      and sessions.finished_at is null for update;
  if v_session_id is null or not exists (
    select 1 from public.room_session_participants as roster
    where roster.session_id = v_session_id and roster.player_id = v_actor_id
  ) then raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032'; end if;
  perform 1 from public.tutti_frutti_sessions where id = v_session_id for update;
  select rounds.id, rounds.phase, rounds.locked_at into v_round_id, v_round_phase, v_locked_at
    from public.tutti_frutti_rounds as rounds where rounds.session_id = v_session_id
    order by rounds.round_number desc limit 1 for update;
  if v_round_id is null or v_round_phase <> 'REVIEWING' or v_locked_at is null then
    raise exception 'La ronda no admite votos.' using errcode = 'P0042';
  end if;
  select challenges.* into v_challenge from public.tutti_frutti_challenges as challenges
    where challenges.id = target_challenge_id and challenges.session_id = v_session_id
      and challenges.round_id = v_round_id for update;
  if not found then raise exception 'La impugnacion ya no esta disponible.' using errcode = 'P0046'; end if;
  select votes.choice into v_existing_choice from public.tutti_frutti_challenge_votes as votes
    where votes.challenge_id = v_challenge.id and votes.voter_player_id = v_actor_id;
  if found then
    if v_existing_choice <> target_choice then
      raise exception 'El voto ya fue registrado y no puede cambiarse.' using errcode = 'P0045';
    end if;
    return jsonb_build_object('challengeId', v_challenge.id, 'status', v_challenge.status,
      'choice', v_existing_choice, 'accepted', true);
  end if;
  if v_challenge.status <> 'OPEN' then
    return jsonb_build_object('challengeId', v_challenge.id, 'status', v_challenge.status,
      'choice', null, 'accepted', false);
  end if;
  if clock_timestamp() >= v_challenge.deadline_at then
    v_resolved_status := public.resolve_tutti_frutti_challenge_locked(v_challenge.id);
    return jsonb_build_object('challengeId', v_challenge.id, 'status', v_resolved_status,
      'choice', null, 'accepted', false);
  end if;

  select count(*)::integer into v_roster_count from public.room_session_participants as roster
    where roster.session_id = v_session_id;
  if v_roster_count = 2 then
    if v_actor_id <> v_challenge.answer_player_id then
      raise exception 'Solo quien respondio puede aceptar o rechazar esta impugnacion.' using errcode = 'P0045';
    end if;
  elsif v_actor_id = v_challenge.answer_player_id then
    raise exception 'Quien respondio no puede votar su propia impugnacion.' using errcode = 'P0045';
  end if;

  insert into public.tutti_frutti_challenge_votes(session_id, challenge_id, voter_player_id, choice)
    values (v_session_id, v_challenge.id, v_actor_id, target_choice);
  v_resolved_status := public.resolve_tutti_frutti_challenge_locked(v_challenge.id);
  return jsonb_build_object('challengeId', v_challenge.id, 'status', v_resolved_status,
    'choice', target_choice, 'accepted', true);
end;
$$;
revoke all on function public.vote_tutti_frutti_challenge(uuid, uuid, text) from public, anon;
grant execute on function public.vote_tutti_frutti_challenge(uuid, uuid, text) to authenticated;

create or replace function public.lock_expired_tutti_frutti_rounds()
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare
  candidate record;
  v_processed integer := 0;
  v_session_id uuid;
  v_round_id uuid;
begin
  if not pg_try_advisory_xact_lock(74112012) then return 0; end if;

  -- One job handles both deadlines. Every path keeps Room -> Session -> Game Session -> Round -> Challenge.
  for candidate in
    select challenges.id as challenge_id, challenges.session_id, challenges.round_id, sessions.room_id
    from public.tutti_frutti_challenges as challenges
    join public.room_sessions as sessions on sessions.id = challenges.session_id
    where challenges.status = 'OPEN' and challenges.deadline_at <= clock_timestamp()
    order by challenges.deadline_at, challenges.id limit 16
  loop
    perform 1 from public.rooms
      where id = candidate.room_id and game_type = 'tutti_frutti' and status = 'playing'
      for update skip locked;
    if not found then continue; end if;
    select sessions.id into v_session_id from public.room_sessions as sessions
      where sessions.room_id = candidate.room_id and sessions.game_type = 'tutti_frutti'
        and sessions.finished_at is null for update;
    if v_session_id is null or v_session_id <> candidate.session_id then continue; end if;
    perform 1 from public.tutti_frutti_sessions where id = v_session_id for update;
    select rounds.id into v_round_id from public.tutti_frutti_rounds as rounds
      where rounds.id = candidate.round_id and rounds.session_id = v_session_id
      for update;
    if v_round_id is null then continue; end if;
    if public.resolve_tutti_frutti_challenge_locked(candidate.challenge_id) <> 'OPEN' then
      v_processed := v_processed + 1;
    end if;
  end loop;

  for candidate in
    select rounds.id as round_id, sessions.room_id
    from public.tutti_frutti_rounds as rounds
    join public.room_sessions as sessions on sessions.id = rounds.session_id
    where rounds.phase = 'FINAL_COUNTDOWN'
      and rounds.countdown_ends_at <= clock_timestamp()
    order by rounds.countdown_ends_at, rounds.id limit 16
  loop
    perform 1 from public.rooms
      where id = candidate.room_id and game_type = 'tutti_frutti' and status = 'playing'
      for update skip locked;
    if not found then continue; end if;
    select sessions.id into v_session_id from public.room_sessions as sessions
      where sessions.room_id = candidate.room_id and sessions.game_type = 'tutti_frutti'
        and sessions.finished_at is null for update;
    if v_session_id is null then continue; end if;
    perform 1 from public.tutti_frutti_sessions where id = v_session_id for update;
    update public.tutti_frutti_rounds as rounds
      set phase = 'REVIEWING', locked_at = clock_timestamp()
      where rounds.id = candidate.round_id and rounds.session_id = v_session_id
        and rounds.phase = 'FINAL_COUNTDOWN'
        and rounds.countdown_ends_at <= clock_timestamp();
    if found then v_processed := v_processed + 1; end if;
  end loop;
  return v_processed;
end;
$$;
revoke all on function public.lock_expired_tutti_frutti_rounds() from public, anon, authenticated;

do $$
declare existing_job record;
begin
  for existing_job in select jobid from cron.job where jobname = 'tutti-frutti-lock-expired-rounds' loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;
select cron.schedule(
  'tutti-frutti-lock-expired-rounds', '1 second',
  $$set statement_timeout = '750ms'; select public.lock_expired_tutti_frutti_rounds()$$
);

create or replace function public.get_tutti_frutti_review(target_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_session_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_phase text;
  v_locked_at timestamptz;
  v_categories jsonb;
  v_active_challenge jsonb;
begin
  select players.id into v_actor_id from public.players where players.auth_user_id = auth.uid();
  if v_actor_id is null then raise exception 'Se necesita una identidad autenticada.' using errcode = 'P0031'; end if;
  if not exists (select 1 from public.rooms where id = target_room_id
      and game_type = 'tutti_frutti' and status = 'playing') then
    raise exception 'La partida de Tutti Frutti no esta disponible.' using errcode = 'P0032';
  end if;
  select sessions.id into v_session_id from public.room_sessions as sessions
    where sessions.room_id = target_room_id and sessions.game_type = 'tutti_frutti'
      and sessions.finished_at is null;
  if v_session_id is null or not exists (
    select 1 from public.room_session_participants as roster
    where roster.session_id = v_session_id and roster.player_id = v_actor_id
  ) then raise exception 'La partida no esta disponible para tu cuenta.' using errcode = 'P0032'; end if;
  select rounds.id, rounds.round_number, rounds.phase, rounds.locked_at
    into v_round_id, v_round_number, v_phase, v_locked_at
    from public.tutti_frutti_rounds as rounds where rounds.session_id = v_session_id
    order by rounds.round_number desc limit 1;
  if v_round_id is null then raise exception 'No se pudo recuperar la ronda activa.' using errcode = 'P0038'; end if;
  if v_phase <> 'REVIEWING' or v_locked_at is null then
    raise exception 'La revision aun no esta disponible.' using errcode = 'P0042';
  end if;

  with answer_rows as (
    select categories.position, categories.label, roster.player_id, players.nickname,
      coalesce(answers.original_text, '') as answer_text,
      coalesce(answers.normalized_value, '') as normalized_value,
      challenges.status as challenge_status
    from public.tutti_frutti_session_categories as categories
    cross join public.room_session_participants as roster
    join public.players on players.id = roster.player_id
    left join public.tutti_frutti_answers as answers
      on answers.session_id = categories.session_id and answers.round_id = v_round_id
      and answers.player_id = roster.player_id and answers.category_position = categories.position
    left join public.tutti_frutti_challenges as challenges
      on challenges.round_id = v_round_id and challenges.answer_player_id = roster.player_id
      and challenges.category_position = categories.position
    where categories.session_id = v_session_id and roster.session_id = v_session_id
  ), marked as (
    select answer_rows.*,
      count(*) over (partition by position, normalized_value)::integer as match_count,
      dense_rank() over (partition by position order by normalized_value)::integer as match_group
    from answer_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'position', categories.position,
    'label', categories.label,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', marked.player_id,
        'nickname', marked.nickname,
        'answerText', marked.answer_text,
        'isEmpty', marked.normalized_value = '',
        'duplicateGroupId', case when marked.normalized_value <> '' and marked.match_count > 1
          then marked.match_group else null end,
        'duplicateCount', case when marked.normalized_value <> '' and marked.match_count > 1
          then marked.match_count else 0 end,
        'challengeStatus', marked.challenge_status,
        'canChallenge', marked.normalized_value <> '' and marked.challenge_status is null
          and not exists (select 1 from public.tutti_frutti_challenges as open_challenge
            where open_challenge.round_id = v_round_id and open_challenge.status = 'OPEN')
          and marked.player_id <> v_actor_id
      ) order by lower(marked.nickname), marked.player_id)
      from marked where marked.position = categories.position
    ), '[]'::jsonb)
  ) order by categories.position), '[]'::jsonb)
  into v_categories from public.tutti_frutti_session_categories as categories
  where categories.session_id = v_session_id;

  select case when challenges.id is null then null else jsonb_build_object(
    'id', challenges.id,
    'targetPlayerId', challenges.answer_player_id,
    'categoryPosition', challenges.category_position,
    'deadlineAt', challenges.deadline_at,
    'myVote', (select votes.choice from public.tutti_frutti_challenge_votes as votes
      where votes.challenge_id = challenges.id and votes.voter_player_id = v_actor_id),
    'canVote', challenges.status = 'OPEN'
      and clock_timestamp() < challenges.deadline_at
      and not exists (select 1 from public.tutti_frutti_challenge_votes as votes
        where votes.challenge_id = challenges.id and votes.voter_player_id = v_actor_id)
      and ((select count(*) from public.room_session_participants as roster
          where roster.session_id = v_session_id) = 2 and v_actor_id = challenges.answer_player_id
        or (select count(*) from public.room_session_participants as roster
          where roster.session_id = v_session_id) > 2 and v_actor_id <> challenges.answer_player_id)
  ) end into v_active_challenge
  from public.tutti_frutti_challenges as challenges
  where challenges.round_id = v_round_id and challenges.status = 'OPEN';

  return jsonb_build_object(
    'roomId', target_room_id, 'sessionId', v_session_id, 'roundId', v_round_id,
    'roundNumber', v_round_number, 'phase', 'REVIEWING', 'serverNow', clock_timestamp(),
    'activeChallenge', v_active_challenge, 'categories', v_categories
  );
end;
$$;
revoke all on function public.get_tutti_frutti_review(uuid) from public, anon;
grant execute on function public.get_tutti_frutti_review(uuid) to authenticated;
