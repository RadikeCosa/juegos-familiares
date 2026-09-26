-- Increment 2: authorize a separate Tutti Frutti Presence topic for lobby members.
-- Presence is an ephemeral indicator; Room membership and host remain in Postgres.
create or replace function public.is_current_player_room_presence_participant(target_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_room_id uuid;
  target_game_type text;
begin
  if target_topic ~ '^impostor-room-presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_room_id := replace(target_topic, 'impostor-room-presence:', '')::uuid;
    target_game_type := 'impostor';
  elsif target_topic ~ '^tutti-frutti-room-presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_room_id := replace(target_topic, 'tutti-frutti-room-presence:', '')::uuid;
    target_game_type := 'tutti_frutti';
  else
    return false;
  end if;

  return exists (
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
      and rooms.game_type = target_game_type
      and rooms.status in ('lobby', 'playing')
  );
end;
$$;

revoke all on function public.is_current_player_room_presence_participant(text) from public;
grant execute on function public.is_current_player_room_presence_participant(text) to authenticated;
