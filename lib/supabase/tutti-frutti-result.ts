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

export type TuttiFruttiFinalResult = {
  roomId: string;
  roomCode: string | null;
  sessionId: string;
  finishedAt: string;
  serverNow: string;
  roundCount: number;
  totals: { playerId: string; nickname: string; totalPoints: number; rank: number }[];
  winnerPlayerIds: string[];
  isTie: boolean;
  canReturnToRoom: boolean;
};

export type TuttiFruttiPostgameState = {
  hasFinishedSession: boolean;
  latestFinishedSessionId: string | null;
};

type ResultChannel = {
  on: (event: "postgres_changes", filter: { event: "*"; schema: "public";
    table: "tutti_frutti_review_signals"; filter: string }, callback: (payload: unknown) => void) => ResultChannel;
  subscribe: () => ResultChannel;
  unsubscribe: () => PromiseLike<unknown>;
};

export type TuttiFruttiResultClient = {
  rpc: (fn: "get_tutti_frutti_round_result" | "score_tutti_frutti_round"
    | "get_tutti_frutti_final_result" | "get_tutti_frutti_postgame_state",
    params: { target_room_id?: string; target_round_id?: string | null;
      target_session_id?: string }) => PromiseLike<{ data: unknown; error: unknown }>;
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

function parseFinalResult(value: unknown): TuttiFruttiFinalResult {
  if (!record(value) || typeof value.roomId !== "string"
    || !(value.roomCode === null || typeof value.roomCode === "string")
    || typeof value.sessionId !== "string" || typeof value.finishedAt !== "string"
    || Number.isNaN(Date.parse(value.finishedAt)) || typeof value.serverNow !== "string"
    || Number.isNaN(Date.parse(value.serverNow)) || !Number.isInteger(value.roundCount)
    || (value.roundCount as number) < 1 || !Array.isArray(value.totals)
    || !Array.isArray(value.winnerPlayerIds) || typeof value.isTie !== "boolean"
    || typeof value.canReturnToRoom !== "boolean") {
    throw new Error("No pudimos recuperar el resultado final.");
  }
  const players = new Set<string>();
  for (const total of value.totals) {
    if (!record(total) || typeof total.playerId !== "string" || typeof total.nickname !== "string"
      || !Number.isInteger(total.totalPoints) || (total.totalPoints as number) < 0
      || !Number.isInteger(total.rank) || (total.rank as number) < 1
      || players.has(total.playerId)) throw new Error("No pudimos recuperar el resultado final.");
    players.add(total.playerId);
  }
  if (value.totals.length < 1 || value.winnerPlayerIds.length < 1
    || value.winnerPlayerIds.some(id => typeof id !== "string" || !players.has(id))
    || new Set(value.winnerPlayerIds).size !== value.winnerPlayerIds.length
    || value.isTie !== (value.winnerPlayerIds.length > 1)
    || value.canReturnToRoom !== (value.roomCode !== null)) {
    throw new Error("No pudimos recuperar el resultado final.");
  }
  const rankOne = value.totals.filter(total => record(total) && total.rank === 1)
    .map(total => total.playerId).sort();
  if (rankOne.join(",") !== [...value.winnerPlayerIds].sort().join(",")) {
    throw new Error("No pudimos recuperar el resultado final.");
  }
  return value as TuttiFruttiFinalResult;
}

function parsePostgameState(value: unknown): TuttiFruttiPostgameState {
  if (!record(value) || typeof value.hasFinishedSession !== "boolean"
    || !(value.latestFinishedSessionId === null || typeof value.latestFinishedSessionId === "string")
    || (!value.hasFinishedSession && value.latestFinishedSessionId !== null)) {
    throw new Error("No pudimos recuperar el estado de la sala.");
  }
  return value as TuttiFruttiPostgameState;
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
      P0049: "Hay una impugnación pendiente. Resolvámosla antes de puntuar.",
      P0056: "La partida tiene un estado inconsistente y no puede mostrar un resultado."
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

export async function getTuttiFruttiFinalResult(
  client: TuttiFruttiResultClient, sessionId: string
): Promise<TuttiFruttiFinalResult> {
  const { data, error } = await client.rpc("get_tutti_frutti_final_result", {
    target_session_id: sessionId
  });
  if (error) {
    const code = record(error) && typeof error.code === "string" ? error.code : "";
    const messages: Record<string, string> = {
      P0031: "No pudimos confirmar tu identidad. Volvé a ingresar.",
      P0032: "El resultado final no está disponible para tu cuenta.",
      P0056: "La partida tiene un estado inconsistente y no puede mostrar un resultado."
    };
    throw Object.assign(new Error(messages[code] ?? "No pudimos recuperar el resultado final."), { code });
  }
  return parseFinalResult(data);
}

export async function getTuttiFruttiPostgameState(
  client: TuttiFruttiResultClient, roomId: string
): Promise<TuttiFruttiPostgameState> {
  const { data, error } = await client.rpc("get_tutti_frutti_postgame_state", {
    target_room_id: roomId
  });
  if (error) throw new Error("No pudimos recuperar el estado de la sala.");
  return parsePostgameState(data);
}

export function subscribeToTuttiFruttiResultInvalidations(client: TuttiFruttiResultClient,
  sessionId: string, onInvalidated: () => void) {
  const channel = client.channel(`tutti-frutti-result-signals:${sessionId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tutti_frutti_review_signals",
      filter: `session_id=eq.${sessionId}` }, () => onInvalidated()).subscribe();
  return { async unsubscribe() { await channel.unsubscribe(); } };
}
