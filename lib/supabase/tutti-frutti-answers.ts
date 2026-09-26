export type TuttiFruttiMyAnswer = {
  categoryPosition: number;
  answerText: string;
  updatedAt: string | null;
};

export type TuttiFruttiMyAnswers = {
  roomId: string;
  sessionId: string;
  roundId: string;
  roundNumber: number;
  phase: string;
  normalizationVersion: number;
  answers: TuttiFruttiMyAnswer[];
};

export type SavedTuttiFruttiAnswer = {
  roomId: string;
  sessionId: string;
  roundId: string;
  roundNumber: number;
  categoryPosition: number;
  answerText: string;
  updatedAt: string;
};

type RpcResult = { data: unknown; error: unknown };
type RealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

type TuttiFruttiAnswerChannel = {
  on: (
    event: "postgres_changes",
    filter: {
      event: "*";
      schema: "public";
      table: "tutti_frutti_answer_signals";
      filter: string;
    },
    callback: (payload: unknown) => void
  ) => TuttiFruttiAnswerChannel;
  subscribe: (callback?: (status: RealtimeStatus, error?: unknown) => void) => TuttiFruttiAnswerChannel;
  unsubscribe: () => PromiseLike<unknown>;
};

export type TuttiFruttiAnswerClient = {
  rpc: (
    fn: "get_tutti_frutti_my_answers" | "save_tutti_frutti_answer",
    params: { target_room_id: string; target_category_position?: number; target_answer_text?: string }
  ) => PromiseLike<RpcResult>;
  channel: (name: string) => TuttiFruttiAnswerChannel;
};

export function countAnswerCodePoints(value: string) {
  return Array.from(value.normalize("NFC")).length;
}

const ANSWER_ERROR_MESSAGES: Record<string, string> = {
  P0031: "No pudimos confirmar tu identidad. Volvé a ingresar a la sala.",
  P0032: "La partida de Tutti Frutti no está disponible para tu cuenta.",
  P0041: "Usá hasta 200 caracteres en esta respuesta.",
  P0042: "La ronda ya no acepta cambios.",
  P0043: "No encontramos esa categoría en esta ronda. Actualizá la partida."
};

function operationError(error: unknown, fallback: string) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return Object.assign(new Error(ANSWER_ERROR_MESSAGES[code] ?? fallback), { code });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseAnswers(value: unknown): TuttiFruttiMyAnswers {
  if (!isRecord(value) || !Array.isArray(value.answers)) {
    throw new Error("No pudimos recuperar tus respuestas.");
  }

  const answers = value.answers.map((item): TuttiFruttiMyAnswer => {
    if (
      !isRecord(item)
      || !Number.isInteger(item.categoryPosition)
      || typeof item.answerText !== "string"
      || (item.updatedAt !== null && !isTimestamp(item.updatedAt))
    ) {
      throw new Error("No pudimos recuperar tus respuestas.");
    }
    return {
      categoryPosition: item.categoryPosition as number,
      answerText: item.answerText,
      updatedAt: item.updatedAt as string | null
    };
  });

  if (
    typeof value.roomId !== "string"
    || typeof value.sessionId !== "string"
    || typeof value.roundId !== "string"
    || !Number.isInteger(value.roundNumber)
    || typeof value.phase !== "string"
    || !Number.isInteger(value.normalizationVersion)
    || new Set(answers.map((answer) => answer.categoryPosition)).size !== answers.length
  ) {
    throw new Error("No pudimos recuperar tus respuestas.");
  }

  return {
    roomId: value.roomId,
    sessionId: value.sessionId,
    roundId: value.roundId,
    roundNumber: value.roundNumber as number,
    phase: value.phase,
    normalizationVersion: value.normalizationVersion as number,
    answers
  };
}

function parseSavedAnswer(value: unknown): SavedTuttiFruttiAnswer {
  if (
    !isRecord(value)
    || typeof value.roomId !== "string"
    || typeof value.sessionId !== "string"
    || typeof value.roundId !== "string"
    || !Number.isInteger(value.roundNumber)
    || !Number.isInteger(value.categoryPosition)
    || typeof value.answerText !== "string"
    || !isTimestamp(value.updatedAt)
  ) {
    throw new Error("No pudimos confirmar la respuesta guardada.");
  }
  return {
    roomId: value.roomId,
    sessionId: value.sessionId,
    roundId: value.roundId,
    roundNumber: value.roundNumber as number,
    categoryPosition: value.categoryPosition as number,
    answerText: value.answerText,
    updatedAt: value.updatedAt
  };
}

export async function getTuttiFruttiMyAnswers(
  client: TuttiFruttiAnswerClient,
  roomId: string
) {
  const { data, error } = await client.rpc("get_tutti_frutti_my_answers", {
    target_room_id: roomId
  });
  if (error) throw operationError(error, "No pudimos recuperar tus respuestas.");
  return parseAnswers(data);
}

export async function saveTuttiFruttiAnswer(
  client: TuttiFruttiAnswerClient,
  roomId: string,
  categoryPosition: number,
  answerText: string
) {
  const { data, error } = await client.rpc("save_tutti_frutti_answer", {
    target_room_id: roomId,
    target_category_position: categoryPosition,
    target_answer_text: answerText
  });
  if (error) throw operationError(error, "No pudimos guardar esta respuesta. Reintentá.");
  return parseSavedAnswer(data);
}

export function subscribeToTuttiFruttiAnswerInvalidations(
  client: TuttiFruttiAnswerClient,
  playerId: string,
  onInvalidated: () => void
) {
  const channel = client
    .channel(`tutti-frutti-answer-signals:${playerId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tutti_frutti_answer_signals",
        filter: `player_id=eq.${playerId}`
      },
      () => onInvalidated()
    )
    .subscribe();

  return {
    async unsubscribe() {
      await channel.unsubscribe();
    }
  };
}
