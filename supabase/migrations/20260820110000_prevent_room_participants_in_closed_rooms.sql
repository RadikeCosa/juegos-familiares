-- Incremento 4.2 — cierre correctivo.
--
-- El slot activo representa participacion en una Room activa. Por eso ninguna
-- via interna o futura debe poder insertar RoomParticipant en una Room cerrada:
-- si el INSERT se rechaza aca, tampoco puede reclamarse un slot stale.
create or replace function public.room_participants_claim_active_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room_status text;
begin
  select rooms.status
    into target_room_status
  from public.rooms
  where rooms.id = new.room_id
    and rooms.group_id = new.group_id;

  if target_room_status <> 'lobby' then
    raise exception 'No se puede agregar participantes a una sala cerrada.'
      using errcode = 'P0014';
  end if;

  insert into public.player_active_room_slots (player_id, room_id, group_id)
  values (new.player_id, new.room_id, new.group_id);

  return new;
end;
$$;

revoke all on function public.room_participants_claim_active_slot() from public;
