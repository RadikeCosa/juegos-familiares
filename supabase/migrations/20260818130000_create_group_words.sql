create or replace function public.canonicalize_group_word_text(word_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(coalesce(word_text, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    '[[:space:]]+',
    ' ',
    'g'
  );
$$;

create or replace function public.group_word_text_has_emoji(word_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(word_text, '') ~ (
    '[' ||
    U&'\+01F300' || '-' || U&'\+01FAFF' ||
    U&'\2600' || '-' || U&'\27BF' ||
    ']'
  );
$$;

create table public.group_words (
  id uuid primary key default extensions.gen_random_uuid(),
  group_id uuid not null,
  text text not null,
  normalized_text text generated always as (lower(text)) stored,
  author_player_id uuid not null,
  created_at timestamptz not null default now(),
  constraint group_words_text_length_check
    check (char_length(text) between 2 and 40),
  constraint group_words_text_canonical_check
    check (text = public.canonicalize_group_word_text(text)),
  constraint group_words_text_no_emoji_check
    check (not public.group_word_text_has_emoji(text)),
  constraint group_words_group_id_fkey
    foreign key (group_id)
    references public.groups (id),
  constraint group_words_author_player_same_group_fkey
    foreign key (group_id, author_player_id)
    references public.players (group_id, id)
);

create unique index group_words_group_id_normalized_text_key
  on public.group_words (group_id, normalized_text);

alter table public.group_words enable row level security;

create or replace function public.add_group_word(word_text text)
returns table (
  id uuid,
  group_id uuid,
  text text,
  normalized_text text,
  author_player_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  canonical_word_text text;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para agregar una palabra.'
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

  canonical_word_text := public.canonicalize_group_word_text(word_text);

  if char_length(canonical_word_text) < 2
    or char_length(canonical_word_text) > 40 then
    raise exception 'La palabra debe tener entre 2 y 40 caracteres.'
      using errcode = '22023';
  end if;

  if public.group_word_text_has_emoji(canonical_word_text) then
    raise exception 'La palabra no puede incluir emojis.'
      using errcode = '22023';
  end if;

  return query
  insert into public.group_words (group_id, text, author_player_id)
  values (current_group_id, canonical_word_text, current_player_id)
  returning
    group_words.id,
    group_words.group_id,
    group_words.text,
    group_words.normalized_text,
    group_words.author_player_id,
    group_words.created_at;
exception
  when unique_violation then
    raise exception 'Esa palabra ya esta en el banco.'
      using errcode = '23505';
end;
$$;

revoke all on table public.group_words from anon, authenticated;

revoke all on function public.canonicalize_group_word_text(text) from public;
revoke all on function public.group_word_text_has_emoji(text) from public;
revoke all on function public.add_group_word(text) from public;

grant execute on function public.add_group_word(text) to authenticated;
