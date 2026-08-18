import {
  clearLocalIdentity,
  readLocalIdentity,
  writeLocalIdentity,
  type LocalIdentity
} from "../platform/local-identity";

type ExistingAuthUser = {
  id: string;
};

type ExistingAuthSession = {
  user: ExistingAuthUser;
};

type SupabaseAuthResult = {
  data: { session: ExistingAuthSession | null };
  error: unknown;
};

type SupabaseSelectResult = {
  data: unknown[] | null;
  error: unknown;
};

type QueryBuilder = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      limit: (count: number) => PromiseLike<SupabaseSelectResult>;
    };
  };
};

export type PlatformBootstrapClient = {
  auth: {
    getSession: () => PromiseLike<SupabaseAuthResult>;
  };
  from: (table: "players" | "groups") => QueryBuilder;
};

export type PlatformPlayer = {
  id: string;
  groupId: string;
  nickname: string;
  createdAt: string;
};

export type PlatformGroup = {
  id: string;
  name: string;
  adminPlayerId: string;
  createdAt: string;
};

export type RecognizedPlatformContext = {
  player: PlatformPlayer;
  group: PlatformGroup;
};

export type PlatformBootstrapState =
  | { status: "loading" }
  | {
      status: "unrecognized";
      reason: "no-auth" | "no-player";
      localIdentity?: LocalIdentity;
    }
  | ({
      status: "recognized";
    } & RecognizedPlatformContext)
  | {
      status: "inconsistent";
      reason: "player-without-group";
    }
  | {
      status: "connection-error";
      localIdentity?: LocalIdentity;
    };

type PlayerRow = {
  id: string;
  group_id: string;
  nickname: string;
  created_at: string;
};

type GroupRow = {
  id: string;
  name: string;
  admin_player_id: string;
  created_at: string;
};

function isPlayerRow(value: unknown): value is PlayerRow {
  const row = value as Partial<PlayerRow>;

  return (
    typeof row.id === "string" &&
    typeof row.group_id === "string" &&
    typeof row.nickname === "string" &&
    typeof row.created_at === "string"
  );
}

function isGroupRow(value: unknown): value is GroupRow {
  const row = value as Partial<GroupRow>;

  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.admin_player_id === "string" &&
    typeof row.created_at === "string"
  );
}

function toPlatformPlayer(row: PlayerRow): PlatformPlayer {
  return {
    id: row.id,
    groupId: row.group_id,
    nickname: row.nickname,
    createdAt: row.created_at
  };
}

function toPlatformGroup(row: GroupRow): PlatformGroup {
  return {
    id: row.id,
    name: row.name,
    adminPlayerId: row.admin_player_id,
    createdAt: row.created_at
  };
}

export function writeLocalIdentityFromContext({
  group,
  player
}: RecognizedPlatformContext) {
  writeLocalIdentity({
    playerId: player.id,
    groupId: group.id,
    nickname: player.nickname,
    groupName: group.name
  });
}

export async function bootstrapPlatformContext(
  supabase: PlatformBootstrapClient
): Promise<PlatformBootstrapState> {
  const localIdentity = readLocalIdentity() ?? undefined;

  try {
    const authSession = await supabase.auth.getSession();

    if (authSession.error) {
      return { status: "connection-error", localIdentity };
    }

    const authUser = authSession.data.session?.user;

    if (!authUser) {
      return { status: "unrecognized", reason: "no-auth", localIdentity };
    }

    const playerResult = await supabase
      .from("players")
      .select("id, group_id, nickname, created_at")
      .eq("auth_user_id", authUser.id)
      .limit(2);

    if (playerResult.error || !Array.isArray(playerResult.data)) {
      return { status: "connection-error", localIdentity };
    }

    const playerRow = playerResult.data[0];

    if (!playerRow) {
      clearLocalIdentity();

      return { status: "unrecognized", reason: "no-player" };
    }

    if (!isPlayerRow(playerRow)) {
      return { status: "connection-error", localIdentity };
    }

    const player = toPlatformPlayer(playerRow);
    const groupResult = await supabase
      .from("groups")
      .select("id, name, admin_player_id, created_at")
      .eq("id", player.groupId)
      .limit(1);

    if (groupResult.error || !Array.isArray(groupResult.data)) {
      return { status: "connection-error", localIdentity };
    }

    const groupRow = groupResult.data[0];

    if (!groupRow) {
      return { status: "inconsistent", reason: "player-without-group" };
    }

    if (!isGroupRow(groupRow)) {
      return { status: "connection-error", localIdentity };
    }

    const group = toPlatformGroup(groupRow);

    writeLocalIdentityFromContext({ player, group });

    return {
      status: "recognized",
      player,
      group
    };
  } catch {
    return { status: "connection-error", localIdentity };
  }
}
