create or replace function public.get_my_group_word_count()
returns table (
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para consultar palabras.'
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

  return query
  select count(*)::bigint
  from public.group_words
  where group_words.group_id = current_group_id;
end;
$$;

create or replace function public.list_my_group_words()
returns table (
  id uuid,
  text text,
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
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para consultar palabras.'
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

  return query
  select group_words.id, group_words.text, group_words.created_at
  from public.group_words
  where group_words.group_id = current_group_id
    and group_words.author_player_id = current_player_id
  order by group_words.created_at desc, group_words.id desc;
end;
$$;

revoke all on function public.get_my_group_word_count() from public;
revoke all on function public.list_my_group_words() from public;

grant execute on function public.get_my_group_word_count() to authenticated;
grant execute on function public.list_my_group_words() to authenticated;
