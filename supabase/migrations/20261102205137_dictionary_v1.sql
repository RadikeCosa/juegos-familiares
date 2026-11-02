-- Diccionario v1. Disabled until an authorized migration activates a reviewed catalogue.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create schema if not exists dictionary_private;
revoke all on schema dictionary_private from public, anon, authenticated;

alter table public.rooms drop constraint rooms_game_type_check;
alter table public.rooms add constraint rooms_game_type_check check (game_type in ('impostor','tutti_frutti','dictionary'));
alter table public.room_sessions drop constraint room_sessions_game_type_check;
alter table public.room_sessions add constraint room_sessions_game_type_check check (game_type in ('impostor','tutti_frutti','dictionary'));
alter table public.room_sessions drop constraint room_sessions_impostor_link_check;
alter table public.room_sessions add constraint room_sessions_impostor_link_check check (
 (game_type='impostor' and impostor_game_session_id is not null and impostor_game_session_id=id) or
 (game_type in ('tutti_frutti','dictionary') and impostor_game_session_id is null));

create function dictionary_private.normalize_definition(raw text) returns text
language plpgsql immutable set search_path='' as $$
declare t text; parts text[];
begin
 t := btrim(regexp_replace(normalize(coalesce(raw,''), NFC), '[[:space:]]+', ' ', 'g'));
 if t='' then raise exception 'Escribí una definición.' using errcode='D0001'; end if;
 parts := regexp_match(t,'^([^[:alpha:]]*)([[:alpha:]])(.*)$');
 if parts is not null then t:=parts[1]||upper(parts[2])||parts[3]; end if;
 if right(t,1) not in ('.','!','?','…') then t:=t||'.'; end if;
 if char_length(t)>300 then raise exception 'La definición debe tener hasta 300 caracteres.' using errcode='D0001'; end if;
 return t;
end $$;

create table dictionary_private.cards (
 id uuid primary key default gen_random_uuid(), word text not null,
 normalized_word text generated always as (lower(btrim(normalize(word, NFC)))) stored unique,
 sense text not null, definition text not null,
 difficulty text not null check(difficulty in ('easy','medium','hard')),
 verification_reference text not null, status text not null default 'draft' check(status in ('draft','reviewed')),
 reviewed_by text, reviewed_at timestamptz,
 check(btrim(word)<>'' and btrim(sense)<>'' and btrim(verification_reference)<>''),
 check(definition=dictionary_private.normalize_definition(definition)),
 check(status<>'reviewed' or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null))
);
create table dictionary_private.settings (singleton boolean primary key default true check(singleton), enabled boolean not null default false);
insert into dictionary_private.settings default values;
create table dictionary_private.rooms (
 room_id uuid primary key references public.rooms(id), round_count integer not null default 5 check(round_count in (3,5,10)),
 last_activity_at timestamptz not null default now(), closed_reason text check(closed_reason in ('inactivity','duration','host_closed'))
);
create index dictionary_rooms_activity on dictionary_private.rooms(last_activity_at);
create table dictionary_private.sessions (
 id uuid primary key references public.room_sessions(id), round_count integer not null check(round_count in (3,5,10)),
 current_round integer not null default 1, ended_reason text check(ended_reason in ('completed','host_ended','inactivity','duration'))
);
create table dictionary_private.rounds (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references dictionary_private.sessions(id),
 number integer not null, card_id uuid not null references dictionary_private.cards(id),
 word text not null, true_definition text not null,
 phase text not null default 'WRITING' check(phase in ('WRITING','VOTING','RESULT')),
 unique(session_id,number), unique(session_id,card_id)
);
create table dictionary_private.word_usage (
 group_id uuid not null references public.groups(id), card_id uuid not null references dictionary_private.cards(id),
 session_id uuid not null references dictionary_private.sessions(id), presented boolean not null default false,
 primary key(group_id,card_id)
);
create index dictionary_usage_session on dictionary_private.word_usage(session_id);
create table dictionary_private.definitions (
 round_id uuid not null references dictionary_private.rounds(id), player_id uuid not null references public.players(id),
 definition text not null check(definition=dictionary_private.normalize_definition(definition)), primary key(round_id,player_id)
);
create table dictionary_private.options (
 id uuid primary key default gen_random_uuid(), round_id uuid not null references dictionary_private.rounds(id),
 position integer not null, definition text not null, author_id uuid references public.players(id), is_real boolean not null,
 unique(round_id,position), unique(round_id,author_id), unique(round_id,id),
 check((is_real and author_id is null) or (not is_real and author_id is not null))
);
create unique index dictionary_one_real_option on dictionary_private.options(round_id) where is_real;
create table dictionary_private.votes (
 round_id uuid not null references dictionary_private.rounds(id), player_id uuid not null references public.players(id),
 option_id uuid not null, primary key(round_id,player_id), foreign key(round_id,option_id) references dictionary_private.options(round_id,id)
);
create table dictionary_private.points (
 round_id uuid not null references dictionary_private.rounds(id), player_id uuid not null references public.players(id),
 points integer not null check(points>=0), primary key(round_id,player_id)
);

-- The only published table carries a generic revision, never content or authors.
create table public.dictionary_signals (room_id uuid primary key references public.rooms(id), revision uuid not null default gen_random_uuid());
alter table public.dictionary_signals enable row level security;
grant select on public.dictionary_signals to authenticated;
create function dictionary_private.can_read_room(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rooms r join public.room_participants rp on rp.room_id=r.id
 join public.players p on p.id=rp.player_id and p.group_id=r.group_id
 where r.id=rid and r.game_type='dictionary' and p.auth_user_id=auth.uid());
$$;
create policy dictionary_signal_member on public.dictionary_signals for select to authenticated
 using(dictionary_private.can_read_room(room_id));
-- Policy functions require schema usage but all other private functions stay revoked.
grant usage on schema dictionary_private to authenticated;
grant execute on function dictionary_private.can_read_room(uuid) to authenticated;
alter publication supabase_realtime add table public.dictionary_signals;

create function dictionary_private.signal(rid uuid) returns void language sql security definer set search_path='' as $$
 insert into public.dictionary_signals(room_id) values(rid) on conflict(room_id) do update set revision=gen_random_uuid();
$$;
create function dictionary_private.set_enabled(value boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 lock table dictionary_private.cards in share mode;
 if value and (select count(*) from dictionary_private.cards where status='reviewed')<300 then
  raise exception 'Se necesitan 300 entradas revisadas.' using errcode='D0002';
 end if;
 update dictionary_private.settings set enabled=value;
end $$;
create function public.get_dictionary_availability() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from dictionary_private.settings where singleton),false);
$$;

-- Close only Diccionario state. Caller holds the Room row lock.
create function dictionary_private.finish(rid uuid, reason text, close_room boolean) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 perform 1 from public.groups where id=(select group_id from public.rooms where id=rid) for update;
 select id into sid from public.room_sessions where room_id=rid and game_type='dictionary' and finished_at is null;
 if sid is not null then
  update dictionary_private.sessions set ended_reason=reason where id=sid and ended_reason is null;
  update public.room_sessions set finished_at=clock_timestamp() where id=sid;
  delete from dictionary_private.word_usage where session_id=sid and not presented;
 end if;
 update public.rooms set status=case when close_room then 'closed' else 'lobby' end where id=rid;
 if close_room then
  update dictionary_private.rooms set closed_reason=reason where room_id=rid;
  delete from public.player_active_room_slots where room_id=rid;
 end if;
 perform dictionary_private.signal(rid);
end $$;
create function dictionary_private.expire(rid uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; activity timestamptz; started timestamptz; reason text;
begin
 select * into r from public.rooms where id=rid and game_type='dictionary' for update;
 if not found or r.status='closed' then return r.status='closed'; end if;
 select last_activity_at into activity from dictionary_private.rooms where room_id=rid;
 select started_at into started from public.room_sessions where room_id=rid and finished_at is null;
 if started is not null and started+interval '72 hours'<=clock_timestamp() then reason:='duration';
 elsif activity+interval '24 hours'<=clock_timestamp() then reason:='inactivity'; end if;
 if reason is not null then perform dictionary_private.finish(rid,reason,true); return true; end if;
 return false;
end $$;
create function dictionary_private.assert_actor(rid uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 select p.id into pid from public.players p join public.room_participants rp on rp.player_id=p.id
 join public.rooms r on r.id=rp.room_id and r.group_id=p.group_id
 where p.auth_user_id=auth.uid() and r.id=rid and r.game_type='dictionary';
 if pid is null then raise exception 'La sala no está disponible para tu cuenta.' using errcode='D0003'; end if;
 return pid;
end $$;
create function dictionary_private.touch(rid uuid) returns void language sql security definer set search_path='' as $$
 update dictionary_private.rooms set last_activity_at=clock_timestamp() where room_id=rid;
$$;
create function dictionary_private.initialize_room() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.game_type='dictionary' then
  insert into dictionary_private.rooms(room_id) values(new.id);
  perform dictionary_private.signal(new.id);
 end if;
 return new;
end $$;
create trigger dictionary_initialize_room after insert on public.rooms for each row execute function dictionary_private.initialize_room();

-- Increment 1: game-aware Room entry. Legacy signatures remain Impostor-only.
-- All writes and guards remain in the typed RPCs; wrappers preserve old callers.

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
  if requested_game_type is null or requested_game_type not in ('impostor', 'tutti_frutti', 'dictionary') then
    raise exception 'Juego de sala invalido.' using errcode = 'P0028';
  end if;

  if requested_game_type='dictionary' and not public.get_dictionary_availability() then
    raise exception 'Diccionario todavía no está habilitado.' using errcode='D0002';
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

  if requested_game_type='dictionary' and active_room_id is not null
    and dictionary_private.expire(active_room_id) then active_room_id:=null; end if;
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

create or replace function public.create_room()
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
begin
  return query select * from public.create_room('impostor'::text);
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
  if expected_game_type is null or expected_game_type not in ('impostor', 'tutti_frutti', 'dictionary') then
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

  if target_room_game_type='dictionary' and dictionary_private.expire(target_room_id) then return; end if;
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

  if target_room_game_type='dictionary' then perform dictionary_private.touch(target_room_id); end if;
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

create or replace function public.join_room_by_code(room_code text)
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
begin
  return query select * from public.join_room_by_code(room_code, 'impostor'::text);
end;
$$;

revoke all on function public.create_room(text) from public;
revoke all on function public.create_room() from public;
revoke all on function public.join_room_by_code(text, text) from public;
revoke all on function public.join_room_by_code(text) from public;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.create_room() to authenticated;
grant execute on function public.join_room_by_code(text, text) to authenticated;
grant execute on function public.join_room_by_code(text) to authenticated;

-- One authorized state reader serves recovery and stable session result URLs.
create function public.get_dictionary_state(target_room_id uuid default null, target_session_id uuid default null, room_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid; pid uuid; sid uuid; r public.rooms%rowtype; s dictionary_private.sessions%rowtype;
 rd dictionary_private.rounds%rowtype; result jsonb; roster jsonb; opts jsonb; totals jsonb; activity timestamptz;
begin
 if target_session_id is not null then
  select rs.room_id into rid from public.room_sessions rs join public.room_session_participants rp on rp.session_id=rs.id
  join public.players p on p.id=rp.player_id and p.group_id=rs.group_id
  where rs.id=target_session_id and rs.game_type='dictionary' and p.auth_user_id=auth.uid();
 else
  select rm.id into rid from public.rooms rm join public.room_participants rp on rp.room_id=rm.id
  join public.players p on p.id=rp.player_id and p.group_id=rm.group_id
  where rm.game_type='dictionary' and p.auth_user_id=auth.uid()
   and ((target_room_id is not null and rm.id=target_room_id) or (target_room_id is null and rm.join_code=public.normalize_room_join_code(room_code)));
 end if;
 if rid is null then raise exception 'La partida no está disponible para tu cuenta.' using errcode='D0003'; end if;
 select id into pid from public.players where auth_user_id=auth.uid();
 perform dictionary_private.expire(rid);
 select * into r from public.rooms where id=rid;
 if target_session_id is not null then sid:=target_session_id;
 else select id into sid from public.room_sessions where room_id=rid order by started_at desc,id desc limit 1; end if;
 if sid is not null and not exists(select 1 from public.room_session_participants where session_id=sid and player_id=pid) then sid:=null; end if;
 if sid is not null then
  select * into s from dictionary_private.sessions where id=sid;
  select * into rd from dictionary_private.rounds where session_id=sid and number=s.current_round;
 end if;
 select last_activity_at into activity from dictionary_private.rooms where room_id=rid;
 select coalesce(jsonb_agg(jsonb_build_object('playerId',p.id,'nickname',p.nickname,'isSelf',p.id=pid,'isHost',p.id=r.host_player_id,
  'hasSubmitted',exists(select 1 from dictionary_private.definitions d where d.round_id=rd.id and d.player_id=p.id),
  'hasVoted',exists(select 1 from dictionary_private.votes v where v.round_id=rd.id and v.player_id=p.id)) order by p.nickname,p.id),'[]')
 into roster from public.players p where (sid is not null and exists(select 1 from public.room_session_participants rp where rp.session_id=sid and rp.player_id=p.id))
 or (sid is null and exists(select 1 from public.room_participants rp where rp.room_id=rid and rp.player_id=p.id));
 -- A rematch lobby uses current Room membership, not a historical session roster.
 select coalesce(jsonb_agg(jsonb_build_object('playerId',p.id,'nickname',p.nickname,'isSelf',p.id=pid,'isHost',p.id=r.host_player_id) order by rp.joined_at,p.id),'[]')
 into result from public.room_participants rp join public.players p on p.id=rp.player_id where rp.room_id=rid;
 if rd.phase in ('VOTING','RESULT') and (s.ended_reason is null or rd.phase='RESULT') then
  select jsonb_agg(jsonb_build_object('id',o.id,'position',o.position,'text',o.definition,'canVote',o.author_id is distinct from pid)
   ||case when rd.phase='RESULT' then jsonb_build_object('isReal',o.is_real,'author',p.nickname,
    'votes',(select count(*) from dictionary_private.votes v where v.option_id=o.id)) else '{}'::jsonb end order by o.position)
  into opts from dictionary_private.options o left join public.players p on p.id=o.author_id where o.round_id=rd.id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('playerId',q.player_id,'nickname',q.nickname,'totalPoints',q.total_points,'roundPoints',q.round_points)
 order by q.total_points desc,q.nickname,q.player_id),'[]') into totals from (
  select p.id player_id,p.nickname,coalesce(sum(pt.points),0) total_points,
   coalesce(sum(pt.points) filter(where pt.round_id=rd.id),0) round_points
  from public.room_session_participants rp join public.players p on p.id=rp.player_id
  left join dictionary_private.rounds rr on rr.session_id=rp.session_id
  left join dictionary_private.points pt on pt.round_id=rr.id and pt.player_id=p.id
  where rp.session_id=sid group by p.id,p.nickname) q;
 return jsonb_build_object('roomId',rid,'code',r.join_code,'roomStatus',r.status,'isHost',r.host_player_id=pid,
 'configuration',(select round_count from dictionary_private.rooms where room_id=rid),'enabled',public.get_dictionary_availability(),
 'availableRounds',(select coalesce(jsonb_agg(n),'[]') from unnest(array[3,5,10]) n where n <= (
  select count(*) from dictionary_private.cards c where c.status='reviewed' and not exists(select 1 from dictionary_private.word_usage u where u.group_id=r.group_id and u.card_id=c.id))),
 'participants',roster,'lobbyParticipants',result,'sessionId',sid,'roundCount',s.round_count,'endedReason',s.ended_reason,
 'closedReason',(select closed_reason from dictionary_private.rooms where room_id=rid),
 'deadlineAt',(select started_at+interval '72 hours' from public.room_sessions where id=sid),'inactivityDeadlineAt',activity+interval '24 hours',
 'round',case when rd.id is not null and (s.ended_reason is null or rd.phase='RESULT') then jsonb_build_object('id',rd.id,'number',rd.number,'word',rd.word,'phase',rd.phase,
  'ownDefinition',(select definition from dictionary_private.definitions where round_id=rd.id and player_id=pid),
  'ownVote',(select option_id from dictionary_private.votes where round_id=rd.id and player_id=pid),'options',coalesce(opts,'[]')) else null end,
 'totals',totals,'resolvedRounds',(select count(*) from dictionary_private.rounds where session_id=sid and phase='RESULT'));
end $$;

create function public.save_dictionary_configuration(target_room_id uuid, requested_round_count integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; r public.rooms%rowtype;
begin
 pid:=dictionary_private.assert_actor(target_room_id);
 if dictionary_private.expire(target_room_id) then return public.get_dictionary_state(target_room_id); end if;
 select * into r from public.rooms where id=target_room_id;
 if r.host_player_id<>pid or r.status<>'lobby' then raise exception 'Sólo el anfitrión puede configurar en el lobby.' using errcode='D0004'; end if;
 if requested_round_count is null or requested_round_count not in (3,5,10) then raise exception 'Elegí 3, 5 o 10 rondas.' using errcode='D0001'; end if;
 update dictionary_private.rooms set round_count=requested_round_count where room_id=target_room_id;
 perform dictionary_private.touch(target_room_id); perform dictionary_private.signal(target_room_id);
 return public.get_dictionary_state(target_room_id);
end $$;

create function public.start_dictionary_session(target_room_id uuid, request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; r public.rooms%rowtype; sid uuid; cnt integer; selected_card record; pos integer:=0;
begin
 pid:=dictionary_private.assert_actor(target_room_id);
 if dictionary_private.expire(target_room_id) then return public.get_dictionary_state(target_room_id); end if;
 select * into r from public.rooms where id=target_room_id;
 -- Request UUID is an idempotency key, never an authority or a chosen actor.
 if exists(select 1 from public.room_sessions where id=request_id and room_id=r.id and game_type='dictionary') then
  return public.get_dictionary_state(target_room_id,request_id);
 end if;
 if r.host_player_id<>pid or r.status<>'lobby' then raise exception 'Sólo el anfitrión puede iniciar desde el lobby.' using errcode='D0004'; end if;
 if request_id is null then raise exception 'Falta identificador de reintento.' using errcode='D0001'; end if;
 lock table dictionary_private.cards in share mode;
 if not public.get_dictionary_availability() or (select count(*) from dictionary_private.cards where status='reviewed')<300 then
  raise exception 'Diccionario todavía no está habilitado.' using errcode='D0002'; end if;
 if (select count(*) from public.room_participants where room_id=r.id)<3 then raise exception 'Se necesitan al menos 3 jugadores.' using errcode='D0005'; end if;
 -- Every reservation-changing path locks Room -> Group -> round, in that order.
 perform 1 from public.groups where id=r.group_id for update;
 select round_count into cnt from dictionary_private.rooms where room_id=r.id;
 if (select count(*) from dictionary_private.cards c where status='reviewed' and not exists(select 1 from dictionary_private.word_usage u where u.group_id=r.group_id and u.card_id=c.id))<cnt then
  raise exception 'No alcanzan las palabras nuevas. Elegí menos rondas o esperá una ampliación del catálogo.' using errcode='D0006'; end if;
 sid:=request_id;
 insert into public.room_sessions(id,room_id,group_id,game_type,started_at) values(sid,r.id,r.group_id,'dictionary',clock_timestamp());
 insert into public.room_session_participants(session_id,group_id,player_id) select sid,r.group_id,player_id from public.room_participants where room_id=r.id;
 insert into dictionary_private.sessions(id,round_count) values(sid,cnt);
 for selected_card in select * from dictionary_private.cards c where status='reviewed' and not exists(select 1 from dictionary_private.word_usage u where u.group_id=r.group_id and u.card_id=c.id) order by random() limit cnt loop
  pos:=pos+1;
  insert into dictionary_private.rounds(session_id,number,card_id,word,true_definition) values(sid,pos,selected_card.id,selected_card.word,selected_card.definition);
  insert into dictionary_private.word_usage(group_id,card_id,session_id,presented) values(r.group_id,selected_card.id,sid,pos=1);
 end loop;
 update public.rooms set status='playing' where id=r.id;
 perform dictionary_private.touch(r.id); perform dictionary_private.signal(r.id);
 return public.get_dictionary_state(r.id);
end $$;

create function dictionary_private.lock_round(rid uuid, round_id uuid, pid uuid) returns dictionary_private.rounds
language plpgsql security definer set search_path='' as $$
declare rd dictionary_private.rounds%rowtype;
begin
 select rr.* into rd from dictionary_private.rounds rr join public.room_sessions rs on rs.id=rr.session_id
 join dictionary_private.sessions ds on ds.id=rs.id
 where rs.room_id=rid and rr.id=round_id and exists(select 1 from public.room_session_participants rp where rp.session_id=rs.id and rp.player_id=pid)
 for update of rr;
 if not found then raise exception 'La ronda no está disponible.' using errcode='D0003'; end if;
 return rd;
end $$;
create function public.submit_dictionary_definition(target_room_id uuid,target_round_id uuid,definition_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; rd dictionary_private.rounds%rowtype; t text;
begin
 pid:=dictionary_private.assert_actor(target_room_id);
 if dictionary_private.expire(target_room_id) then return public.get_dictionary_state(target_room_id); end if;
 rd:=dictionary_private.lock_round(target_room_id,target_round_id,pid);
 if exists(select 1 from dictionary_private.definitions where round_id=rd.id and player_id=pid) then return public.get_dictionary_state(target_room_id); end if;
 if rd.phase<>'WRITING' or exists(select 1 from dictionary_private.sessions where id=rd.session_id and (ended_reason is not null or current_round<>rd.number)) then
  raise exception 'La etapa de escritura ya terminó.' using errcode='D0007'; end if;
 t:=dictionary_private.normalize_definition(definition_text);
 insert into dictionary_private.definitions values(rd.id,pid,t);
 if (select count(*) from dictionary_private.definitions where round_id=rd.id)=(select count(*) from public.room_session_participants where session_id=rd.session_id) then
  insert into dictionary_private.options(round_id,position,definition,author_id,is_real)
  select rd.id,row_number() over(order by random()),x.definition,x.author_id,x.is_real from (
   select definition,player_id author_id,false is_real from dictionary_private.definitions where round_id=rd.id
   union all select rd.true_definition,null::uuid,true) x;
  update dictionary_private.rounds set phase='VOTING' where id=rd.id;
 end if;
 perform dictionary_private.touch(target_room_id); perform dictionary_private.signal(target_room_id);
 return public.get_dictionary_state(target_room_id);
end $$;
create function public.submit_dictionary_vote(target_room_id uuid,target_round_id uuid,target_option_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; rd dictionary_private.rounds%rowtype; opt dictionary_private.options%rowtype; gid uuid;
begin
 pid:=dictionary_private.assert_actor(target_room_id);
 if dictionary_private.expire(target_room_id) then return public.get_dictionary_state(target_room_id); end if;
 -- Acquire Group before round because the last vote can finish and release reserves.
 select group_id into gid from public.rooms where id=target_room_id;
 perform 1 from public.groups where id=gid for update;
 rd:=dictionary_private.lock_round(target_room_id,target_round_id,pid);
 if exists(select 1 from dictionary_private.votes where round_id=rd.id and player_id=pid) then return public.get_dictionary_state(target_room_id); end if;
 if rd.phase<>'VOTING' or exists(select 1 from dictionary_private.sessions where id=rd.session_id and (ended_reason is not null or current_round<>rd.number)) then
  raise exception 'La votación ya terminó.' using errcode='D0007'; end if;
 select * into opt from dictionary_private.options where id=target_option_id and round_id=rd.id;
 if not found or opt.author_id=pid then raise exception 'Elegí una definición ajena.' using errcode='D0008'; end if;
 insert into dictionary_private.votes values(rd.id,pid,opt.id);
 if (select count(*) from dictionary_private.votes where round_id=rd.id)=(select count(*) from public.room_session_participants where session_id=rd.session_id) then
  insert into dictionary_private.points(round_id,player_id,points)
  select rd.id,rp.player_id,
   (select count(*) from dictionary_private.votes v join dictionary_private.options o on o.id=v.option_id where v.round_id=rd.id and ((v.player_id=rp.player_id and o.is_real) or o.author_id=rp.player_id))::integer
  from public.room_session_participants rp where rp.session_id=rd.session_id;
  update dictionary_private.rounds set phase='RESULT' where id=rd.id;
  if rd.number=(select round_count from dictionary_private.sessions where id=rd.session_id) then
   perform dictionary_private.finish(target_room_id,'completed',false);
  end if;
 end if;
 perform dictionary_private.touch(target_room_id); perform dictionary_private.signal(target_room_id);
 return public.get_dictionary_state(target_room_id);
end $$;
create function public.advance_dictionary_round(target_room_id uuid,target_round_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; rd dictionary_private.rounds%rowtype; r public.rooms%rowtype; current_num integer;
begin
 pid:=dictionary_private.assert_actor(target_room_id);
 if dictionary_private.expire(target_room_id) then return public.get_dictionary_state(target_room_id); end if;
 select * into r from public.rooms where id=target_room_id;
 if r.host_player_id<>pid then raise exception 'Sólo el anfitrión puede avanzar.' using errcode='D0004'; end if;
 perform 1 from public.groups where id=r.group_id for update;
 rd:=dictionary_private.lock_round(target_room_id,target_round_id,pid);
 select current_round into current_num from dictionary_private.sessions where id=rd.session_id;
 if current_num>rd.number then return public.get_dictionary_state(target_room_id); end if;
 if rd.phase<>'RESULT' or exists(select 1 from dictionary_private.sessions where id=rd.session_id and (ended_reason is not null or current_round>=round_count)) then
  raise exception 'No se puede avanzar esta ronda.' using errcode='D0007'; end if;
 update dictionary_private.sessions set current_round=current_round+1 where id=rd.session_id;
 update dictionary_private.word_usage set presented=true where session_id=rd.session_id and card_id=(select card_id from dictionary_private.rounds where session_id=rd.session_id and number=current_num+1);
 perform dictionary_private.touch(r.id); perform dictionary_private.signal(r.id);
 return public.get_dictionary_state(r.id);
end $$;
create function public.finish_dictionary_session(target_room_id uuid,target_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; r public.rooms%rowtype;
begin
 pid:=dictionary_private.assert_actor(target_room_id);
 if dictionary_private.expire(target_room_id) then return public.get_dictionary_state(target_room_id); end if;
 select * into r from public.rooms where id=target_room_id;
 if r.host_player_id<>pid then raise exception 'Sólo el anfitrión puede finalizar.' using errcode='D0004'; end if;
 if not exists(select 1 from public.room_sessions where id=target_session_id and room_id=r.id and game_type='dictionary') then raise exception 'Partida no disponible.' using errcode='D0003'; end if;
 if exists(select 1 from public.room_sessions where id=target_session_id and finished_at is null) then
  perform 1 from public.groups where id=r.group_id for update;
  perform dictionary_private.finish(r.id,'host_ended',false);
  perform dictionary_private.touch(r.id);
 end if;
 return public.get_dictionary_state(r.id,target_session_id);
end $$;
create function public.heartbeat_dictionary_room(target_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 pid:=dictionary_private.assert_actor(target_room_id);
 if not dictionary_private.expire(target_room_id) then
  update public.room_participants set last_seen_at=clock_timestamp() where room_id=target_room_id and player_id=pid;
  perform dictionary_private.touch(target_room_id);
  perform public.reassign_room_host_if_stale();
 end if;
 return public.get_dictionary_state(target_room_id);
end $$;
create function dictionary_private.sweep_expired() returns integer language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0;
begin
 for r in select rm.id from public.rooms rm join dictionary_private.rooms dr on dr.room_id=rm.id
 where rm.status in ('lobby','playing') and (dr.last_activity_at<=clock_timestamp()-interval '24 hours' or exists(
 select 1 from public.room_sessions rs where rs.room_id=rm.id and rs.finished_at is null and rs.started_at<=clock_timestamp()-interval '72 hours'))
 order by rm.id for update of rm skip locked loop
  if dictionary_private.expire(r.id) then n:=n+1; end if;
 end loop;
 return n;
end $$;
select cron.schedule('dictionary-expire-rooms','*/15 * * * *','select dictionary_private.sweep_expired()');

-- Deny all private-table access and default PUBLIC function execution.
do $$ declare obj record; begin
 for obj in select tablename from pg_tables where schemaname='dictionary_private' loop
  execute format('alter table dictionary_private.%I enable row level security',obj.tablename);
  execute format('revoke all on table dictionary_private.%I from public,anon,authenticated',obj.tablename);
 end loop;
end $$;
revoke all on all functions in schema dictionary_private from public,anon,authenticated;
grant execute on function dictionary_private.can_read_room(uuid) to authenticated;
revoke all on function public.get_dictionary_availability() from public;
grant execute on function public.get_dictionary_availability() to anon, authenticated;
revoke all on function public.get_dictionary_state(uuid,uuid,text),public.save_dictionary_configuration(uuid,integer),
 public.start_dictionary_session(uuid,uuid),public.submit_dictionary_definition(uuid,uuid,text),public.submit_dictionary_vote(uuid,uuid,uuid),
 public.advance_dictionary_round(uuid,uuid),public.finish_dictionary_session(uuid,uuid),public.heartbeat_dictionary_room(uuid) from public,anon;
grant execute on function public.get_dictionary_state(uuid,uuid,text),public.save_dictionary_configuration(uuid,integer),
 public.start_dictionary_session(uuid,uuid),public.submit_dictionary_definition(uuid,uuid,text),public.submit_dictionary_vote(uuid,uuid,uuid),
 public.advance_dictionary_round(uuid,uuid),public.finish_dictionary_session(uuid,uuid),public.heartbeat_dictionary_room(uuid) to authenticated;

-- Recovering an active Room must not resurrect an expired Diccionario slot.
create or replace function public.get_my_active_room()
returns table (
  room_id uuid,
  room_join_code text,
  room_status text,
  room_game_type text,
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
  active_room_status text;
  returned_participant_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para recuperar la sala activa.'
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

  if active_room_id is null then return; end if;
  if exists(select 1 from public.rooms where id=active_room_id and game_type='dictionary')
    and dictionary_private.expire(active_room_id) then return; end if;

  select rooms.status
    into active_room_status
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
   and room_participants.player_id = current_player_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id;

  if active_room_status is null
    or active_room_status not in ('lobby', 'playing') then
    raise exception 'El slot activo no permite reconstruir una Room activa consistente.'
      using errcode = 'P0014';
  end if;

  return query
  select
    rooms.id,
    rooms.join_code,
    rooms.status,
    rooms.game_type,
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

  get diagnostics returned_participant_count = row_count;

  if returned_participant_count = 0 then
    raise exception 'El slot activo no devolvio participantes para la Room.'
      using errcode = 'P0014';
  end if;
end;
$$;

revoke all on function public.get_my_active_room() from public;
grant execute on function public.get_my_active_room() to authenticated;

create function dictionary_private.record_host_close() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.game_type='dictionary' and new.status='closed' and old.status<>'closed' then
  update dictionary_private.rooms set closed_reason=coalesce(closed_reason,'host_closed') where room_id=new.id;
 end if;
 return new;
end $$;
create trigger dictionary_record_host_close after update of status on public.rooms for each row execute function dictionary_private.record_host_close();
revoke all on function dictionary_private.record_host_close() from public,anon,authenticated;

create function public.leave_dictionary_room(target_room_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare pid uuid; r public.rooms%rowtype;
begin
 pid:=dictionary_private.assert_actor(target_room_id);
 if dictionary_private.expire(target_room_id) then return; end if;
 select * into r from public.rooms where id=target_room_id;
 if r.status<>'lobby' then raise exception 'La partida está en curso.' using errcode='D0007'; end if;
 perform dictionary_private.touch(r.id);
 if r.host_player_id=pid then perform public.close_room();
 else perform public.leave_room(); end if;
 perform dictionary_private.signal(r.id);
end $$;
revoke all on function public.leave_dictionary_room(uuid) from public,anon;
grant execute on function public.leave_dictionary_room(uuid) to authenticated;
