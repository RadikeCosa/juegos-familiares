export function markPlatformAdmin(authUserId, psql, sqlString) {
  psql(`
    insert into public.platform_admins (auth_user_id)
    values (${sqlString(authUserId)}::uuid)
    on conflict (auth_user_id) do nothing;
  `);
}

export async function markClientAsPlatformAdmin(client, psql, sqlString) {
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error("Cannot mark platform admin fixture without an authenticated user.");
  }

  markPlatformAdmin(data.user.id, psql, sqlString);
}
