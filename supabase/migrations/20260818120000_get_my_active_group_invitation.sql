create or replace function public.get_my_active_group_invitation()
returns table (
  code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para recuperar una invitacion.'
      using errcode = '28000';
  end if;

  return query
  select group_invitations.code
  from public.players
  join public.groups
    on groups.id = players.group_id
   and groups.admin_player_id = players.id
  join public.group_invitations
    on group_invitations.group_id = groups.id
   and group_invitations.active = true
  where players.auth_user_id = current_auth_user_id;

  if not found then
    raise exception 'No hay una invitacion activa disponible.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.get_my_active_group_invitation() from public;
grant execute on function public.get_my_active_group_invitation() to authenticated;
