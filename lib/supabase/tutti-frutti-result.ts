export type TuttiFruttiRoundResult = {
  roomId: string;
  sessionId: string;
  roundId: string;
  roundNumber: number;
  phase: "RESULT";
  scoredAt: string;
  serverNow: string;
  categories: { position: number; label: string; entries: {
    playerId: string; nickname: string; answerText: string; isEmpty: boolean;
    isValid: boolean; points: 0 | 5 | 10;
  }[] }[];
  totals: { playerId: string; nickname: string; roundPoints: number;
    totalPoints: number; rank: number }[];
};

type ResultChannel = {
  on: (event: "postgres_changes", filter: { event: "*"; schema: "public";
    table: "tutti_frutti_review_signals"; filter: string }, callback: (payload: unknown) => void) => ResultChannel;
  subscribe: () => ResultChannel;
  unsubscribe: () => PromiseLike<unknown>;
};

export type TuttiFruttiResultClient = {
  rpc: (fn: "get_tutti_frutti_round_result" | "score_tutti_frutti_round",
    params: { target_room_id: string; target_round_id: string | null }) => PromiseLike<{ data: unknown; error: unknown }>;
  channel: (name: string) => ResultChannel;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseResult(value: unknown): TuttiFruttiRoundResult {
  if (!record(value) || typeof value.roomId !== "string" || typeof value.sessionId !== "string"
    || typeof value.roundId !== "string" || !Number.isInteger(value.roundNumber)
    || value.phase !== "RESULT" || typeof value.scoredAt !== "string"
    || Number.isNaN(Date.parse(value.scoredAt)) || typeof value.serverNow !== "string"
    || Number.isNaN(Date.parse(value.serverNow)) || !Array.isArray(value.categories)
    || !Array.isArray(value.totals)) throw new Error("No pudimos recuperar el resultado de la ronda.");
  const players = new Set<string>();
  for (const total of value.totals) {
    if (!record(total) || typeof total.playerId !== "string" || typeof total.nickname !== "string"
      || !Number.isInteger(total.roundPoints) || (total.roundPoints as number) < 0
      || !Number.isInteger(total.totalPoints) || (total.totalPoints as number) < (total.roundPoints as number)
      || !Number.isInteger(total.rank) || (total.rank as number) < 1 || players.has(total.playerId)) {
      throw new Error("No pudimos recuperar el resultado de la ronda.");
    }
    players.add(total.playerId);
  }
  const positions = new Set<number>();
  for (const category of value.categories) {
    if (!record(category) || !Number.isInteger(category.position) || typeof category.label !== "string"
      || !Array.isArray(category.entries) || positions.has(category.position as number)) {
      throw new Error("No pudimos recuperar el resultado de la ronda.");
    }
    positions.add(category.position as number);
    const entries = new Set<string>();
    for (const entry of category.entries) {
      if (!record(entry) || typeof entry.playerId !== "string" || typeof entry.nickname !== "string"
        || typeof entry.answerText !== "string" || typeof entry.isEmpty !== "boolean"
        || typeof entry.isValid !== "boolean" || ![0, 5, 10].includes(entry.points as number)
        || entries.has(entry.playerId) || !players.has(entry.playerId)) {
        throw new Error("No pudimos recuperar el resultado de la ronda.");
      }
      entries.add(entry.playerId);
    }
    if (entries.size !== players.size) throw new Error("No pudimos recuperar el resultado de la ronda.");
  }
  return value as TuttiFruttiRoundResult;
}

async function resultRpc(client: TuttiFruttiResultClient, name: "get_tutti_frutti_round_result" | "score_tutti_frutti_round",
  roomId: string, roundId: string | null) {
  const { data, error } = await client.rpc(name, { target_room_id: roomId, target_round_id: roundId });
  if (error) {
    const code = record(error) && typeof error.code === "string" ? error.code : "";
    const messages: Record<string, string> = {
      P0031: "No pudimos confirmar tu identidad. Volvé a ingresar a la sala.",
      P0032: "La partida de Tutti Frutti no está disponible para tu cuenta.",
      P0033: "Solo el anfitrión puede cerrar la revisión.",
      P0042: "La revisión no está disponible para puntuar.",
      P0049: "Hay una impugnación pendiente. Resolvámosla antes de puntuar."
    };
    throw Object.assign(new Error(messages[code] ?? "No pudimos recuperar el resultado de la ronda."), { code });
  }
  return parseResult(data);
}

export function getTuttiFruttiRoundResult(client: TuttiFruttiResultClient, roomId: string, roundId?: string) {
  return resultRpc(client, "get_tutti_frutti_round_result", roomId, roundId ?? null);
}

export function scoreTuttiFruttiRound(client: TuttiFruttiResultClient, roomId: string, roundId: string) {
  return resultRpc(client, "score_tutti_frutti_round", roomId, roundId);
}

export function subscribeToTuttiFruttiResultInvalidations(client: TuttiFruttiResultClient,
  sessionId: string, onInvalidated: () => void) {
  const channel = client.channel(`tutti-frutti-result-signals:${sessionId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tutti_frutti_review_signals",
      filter: `session_id=eq.${sessionId}` }, () => onInvalidated()).subscribe();
  return { async unsubscribe() { await channel.unsubscribe(); } };
}
