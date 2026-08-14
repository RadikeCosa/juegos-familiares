import { ensureAnonymousAuthIdentity } from "./anonymous-auth";

type SupabaseRpcResult<TData> = {
  data: TData | null;
  error: unknown;
};

type PlatformGroupsClient = {
  rpc: (
    fn:
      | "create_group_with_admin_player"
      | "resolve_group_invitation"
      | "join_group_with_invitation",
    args: Record<string, string>
  ) => PromiseLike<SupabaseRpcResult<unknown>>;
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
  invitation_code: string;
};

type ResolvedGroupInvitationRow = {
  group_name: string;
  canonical_code: string;
};

type JoinedGroupWithInvitationRow = {
  group_name: string;
  joined_player_nickname: string;
  is_admin: boolean;
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
  invitation: {
    code: string;
    path: string;
  };
};

export type CreateGroupWithAdminPlayerInput = {
  groupName: string;
  playerNickname: string;
};

export type ResolvedGroupInvitation = {
  groupName: string;
  canonicalCode: string;
};

export type JoinGroupWithInvitationInput = {
  invitationCode: string;
  playerNickname: string;
};

export type JoinedGroupWithInvitation = {
  group: {
    name: string;
  };
  player: {
    nickname: string;
  };
  isAdmin: boolean;
};

function getSingleRow<TRow>(data: unknown): TRow | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return (data as TRow | null) ?? null;
}

function getInvitationPath(code: string) {
  return `/impostor/join/${encodeURIComponent(code)}`;
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
    },
    invitation: {
      code: row.invitation_code,
      path: getInvitationPath(row.invitation_code)
    }
  };
}

function toResolvedGroupInvitation(
  row: ResolvedGroupInvitationRow
): ResolvedGroupInvitation {
  return {
    groupName: row.group_name,
    canonicalCode: row.canonical_code
  };
}

function toJoinedGroupWithInvitation(
  row: JoinedGroupWithInvitationRow
): JoinedGroupWithInvitation {
  return {
    group: {
      name: row.group_name
    },
    player: {
      nickname: row.joined_player_nickname
    },
    isAdmin: row.is_admin
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

  const row = getSingleRow<CreatedGroupWithAdminPlayerRow>(result.data);

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

export async function resolveGroupInvitation(
  supabase: PlatformGroupsClient,
  invitationCode: string
): Promise<ResolvedGroupInvitation> {
  const result = await supabase.rpc("resolve_group_invitation", {
    invitation_code: invitationCode
  });

  if (result.error) {
    throw new Error("No pudimos encontrar ese grupo. Revisá el código e intentá de nuevo.");
  }

  const row = getSingleRow<ResolvedGroupInvitationRow>(result.data);

  if (!row) {
    throw new Error("No pudimos confirmar la invitación.");
  }

  return toResolvedGroupInvitation(row);
}

export async function resolveGroupInvitationFromIntent(
  supabase: CreateGroupClient,
  invitationCode: string
): Promise<ResolvedGroupInvitation> {
  await ensureAnonymousAuthIdentity(supabase);

  return resolveGroupInvitation(supabase, invitationCode);
}

export async function joinGroupWithInvitation(
  supabase: PlatformGroupsClient,
  input: JoinGroupWithInvitationInput
): Promise<JoinedGroupWithInvitation> {
  const result = await supabase.rpc("join_group_with_invitation", {
    invitation_code: input.invitationCode,
    player_nickname: input.playerNickname
  });

  if (result.error) {
    throw new Error("No pudimos unirte al grupo. Revisá tu nombre e intentá de nuevo.");
  }

  const row = getSingleRow<JoinedGroupWithInvitationRow>(result.data);

  if (!row) {
    throw new Error("No pudimos confirmar que te uniste al grupo.");
  }

  return toJoinedGroupWithInvitation(row);
}

export async function joinGroupWithInvitationFromIntent(
  supabase: CreateGroupClient,
  input: JoinGroupWithInvitationInput
): Promise<JoinedGroupWithInvitation> {
  await ensureAnonymousAuthIdentity(supabase);

  return joinGroupWithInvitation(supabase, input);
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

export function createResolveGroupInvitationController() {
  let activeRequest: Promise<ResolvedGroupInvitation> | null = null;

  return {
    submit(
      supabase: CreateGroupClient,
      invitationCode: string
    ): Promise<ResolvedGroupInvitation> {
      if (activeRequest) {
        return activeRequest;
      }

      activeRequest = resolveGroupInvitationFromIntent(supabase, invitationCode);

      void activeRequest.finally(() => {
        activeRequest = null;
      });

      return activeRequest;
    }
  };
}

export function createJoinGroupSubmitController() {
  let activeRequest: Promise<JoinedGroupWithInvitation> | null = null;

  return {
    submit(
      supabase: CreateGroupClient,
      input: JoinGroupWithInvitationInput
    ): Promise<JoinedGroupWithInvitation> {
      if (activeRequest) {
        return activeRequest;
      }

      activeRequest = joinGroupWithInvitationFromIntent(supabase, input);

      void activeRequest.finally(() => {
        activeRequest = null;
      });

      return activeRequest;
    }
  };
}
