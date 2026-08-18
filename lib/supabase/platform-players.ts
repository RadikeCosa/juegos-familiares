type SupabaseSelectResult = {
  data: unknown[] | null;
  error: unknown;
};

type PlayersQueryBuilder = {
  select: (columns: string) => {
    eq: (column: "group_id", value: string) => {
      order: (
        column: "created_at",
        options: { ascending: true }
      ) => PromiseLike<SupabaseSelectResult>;
    };
  };
};

export type PlatformPlayersClient = {
  from: (table: "players") => PlayersQueryBuilder;
};

type GroupPlayerRow = {
  id: string;
  nickname: string;
  created_at: string;
};

export type GroupPlayer = {
  id: string;
  nickname: string;
  createdAt: string;
};

function isGroupPlayerRow(value: unknown): value is GroupPlayerRow {
  const row = value as Partial<GroupPlayerRow>;

  return (
    typeof row.id === "string" &&
    typeof row.nickname === "string" &&
    typeof row.created_at === "string"
  );
}

function toGroupPlayer(row: GroupPlayerRow): GroupPlayer {
  return {
    id: row.id,
    nickname: row.nickname,
    createdAt: row.created_at
  };
}

export async function listGroupPlayers(
  supabase: PlatformPlayersClient,
  groupId: string
): Promise<GroupPlayer[]> {
  const result = await supabase
    .from("players")
    .select("id, nickname, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (result.error || !Array.isArray(result.data)) {
    throw new Error("No pudimos cargar los integrantes. Intentá de nuevo.");
  }

  if (!result.data.every(isGroupPlayerRow)) {
    throw new Error("No pudimos cargar los integrantes. Intentá de nuevo.");
  }

  return result.data.map(toGroupPlayer);
}
