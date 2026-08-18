create or replace function public.delete_my_group_word(word_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  deleted_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para borrar una palabra.'
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

  delete from public.group_words
  where group_words.id = word_id
    and group_words.group_id = current_group_id
    and group_words.author_player_id = current_player_id;

  get diagnostics deleted_count = row_count;

  return deleted_count = 1;
end;
$$;

revoke all on function public.delete_my_group_word(uuid) from public;
grant execute on function public.delete_my_group_word(uuid) to authenticated;
