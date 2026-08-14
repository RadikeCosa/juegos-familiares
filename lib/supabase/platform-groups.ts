import { ensureAnonymousAuthIdentity } from "./anonymous-auth";

type SupabaseRpcResult<TData> = {
  data: TData | null;
  error: unknown;
};

type PlatformGroupsClient = {
  rpc: (
    fn: "create_group_with_admin_player",
    args: {
      group_name: string;
      player_nickname: string;
    }
  ) => PromiseLike<
    SupabaseRpcResult<CreatedGroupWithAdminPlayerRow[] | CreatedGroupWithAdminPlayerRow>
  >;
};

type AnonymousAuthClient = Parameters<typeof ensureAnonymousAuthIdentity>[0];

type CreateGroupClient = AnonymousAuthClient & PlatformGroupsClient;

type CreatedGroupWithAdminPlayerRow = {
  group_id: string;
  created_group_name: string;
  group_created_at: string;
  admin_player_id: string;
  player_id: string;
  created_player_nickname: string;
  player_created_at: string;
};

export type CreatedGroupWithAdminPlayer = {
  group: {
    id: string;
    name: string;
    adminPlayerId: string;
    createdAt: string;
  };
  player: {
    id: string;
    groupId: string;
    nickname: string;
    createdAt: string;
  };
};

export type CreateGroupWithAdminPlayerInput = {
  groupName: string;
  playerNickname: string;
};

function getCreatedRow(
  data: CreatedGroupWithAdminPlayerRow[] | CreatedGroupWithAdminPlayerRow | null
) {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data;
}

function toCreatedGroupWithAdminPlayer(
  row: CreatedGroupWithAdminPlayerRow
): CreatedGroupWithAdminPlayer {
  return {
    group: {
      id: row.group_id,
      name: row.created_group_name,
      adminPlayerId: row.admin_player_id,
      createdAt: row.group_created_at
    },
    player: {
      id: row.player_id,
      groupId: row.group_id,
      nickname: row.created_player_nickname,
      createdAt: row.player_created_at
    }
  };
}

export async function createGroupWithAdminPlayer(
  supabase: PlatformGroupsClient,
  input: CreateGroupWithAdminPlayerInput
): Promise<CreatedGroupWithAdminPlayer> {
  const result = await supabase.rpc("create_group_with_admin_player", {
    group_name: input.groupName,
    player_nickname: input.playerNickname
  });

  if (result.error) {
    throw new Error("No se pudo crear el grupo. Revisá los datos e intentá de nuevo.");
  }

  const row = getCreatedRow(result.data);

  if (!row) {
    throw new Error("No se pudo confirmar la creación del grupo.");
  }

  return toCreatedGroupWithAdminPlayer(row);
}

export async function createGroupWithAdminPlayerFromIntent(
  supabase: CreateGroupClient,
  input: CreateGroupWithAdminPlayerInput
): Promise<CreatedGroupWithAdminPlayer> {
  await ensureAnonymousAuthIdentity(supabase);

  return createGroupWithAdminPlayer(supabase, input);
}

export function createCreateGroupSubmitController() {
  let activeRequest: Promise<CreatedGroupWithAdminPlayer> | null = null;

  return {
    submit(
      supabase: CreateGroupClient,
      input: CreateGroupWithAdminPlayerInput
    ): Promise<CreatedGroupWithAdminPlayer> {
      if (activeRequest) {
        return activeRequest;
      }

      activeRequest = createGroupWithAdminPlayerFromIntent(supabase, input);

      void activeRequest.finally(() => {
        activeRequest = null;
      });

      return activeRequest;
    }
  };
}
