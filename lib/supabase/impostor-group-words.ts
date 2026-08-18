type SupabaseRpcResult<TData> = {
  data: TData | null;
  error: unknown;
};

type ImpostorGroupWordsClient = {
  rpc: (
    fn: "add_group_word",
    args: { word_text: string }
  ) => PromiseLike<SupabaseRpcResult<unknown>>;
};

type SupabaseErrorLike = {
  code?: string;
};

const DUPLICATE_GROUP_WORD_ERROR = "Esa palabra ya está en el banco.";
const INVALID_GROUP_WORD_ERROR =
  "La palabra debe tener entre 2 y 40 caracteres y no puede incluir emojis.";
const UNAUTHENTICATED_GROUP_WORD_ERROR =
  "Necesitás entrar a tu grupo antes de agregar palabras.";
const MISSING_PLAYER_GROUP_WORD_ERROR =
  "No pudimos reconocer tu jugador para agregar la palabra.";
const GENERIC_GROUP_WORD_ERROR =
  "No pudimos agregar la palabra. Revisá el texto e intentá de nuevo.";

type AddedGroupWordRow = {
  id: string;
  group_id: string;
  text: string;
  normalized_text: string;
  author_player_id: string;
  created_at: string;
};

export type AddedGroupWord = {
  id: string;
  groupId: string;
  text: string;
  normalizedText: string;
  authorPlayerId: string;
  createdAt: string;
};

function getSingleRow<TRow>(data: unknown): TRow | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return (data as TRow | null) ?? null;
}

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
  return typeof error === "object" && error !== null;
}

function getAddGroupWordErrorMessage(error: unknown) {
  if (isSupabaseErrorLike(error)) {
    if (error.code === "23505") {
      return DUPLICATE_GROUP_WORD_ERROR;
    }

    if (error.code === "22023") {
      return INVALID_GROUP_WORD_ERROR;
    }

    if (error.code === "28000" || error.code === "42501") {
      return UNAUTHENTICATED_GROUP_WORD_ERROR;
    }

    if (error.code === "P0002") {
      return MISSING_PLAYER_GROUP_WORD_ERROR;
    }
  }

  return GENERIC_GROUP_WORD_ERROR;
}

function toAddedGroupWord(row: AddedGroupWordRow): AddedGroupWord {
  return {
    id: row.id,
    groupId: row.group_id,
    text: row.text,
    normalizedText: row.normalized_text,
    authorPlayerId: row.author_player_id,
    createdAt: row.created_at
  };
}

export async function addGroupWord(
  supabase: ImpostorGroupWordsClient,
  wordText: string
): Promise<AddedGroupWord> {
  const result = await supabase.rpc("add_group_word", {
    word_text: wordText
  });

  if (result.error) {
    throw new Error(getAddGroupWordErrorMessage(result.error));
  }

  const row = getSingleRow<AddedGroupWordRow>(result.data);

  if (!row) {
    throw new Error("No pudimos confirmar que la palabra fue agregada.");
  }

  return toAddedGroupWord(row);
}
