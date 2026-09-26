export type TuttiFruttiReviewEntry = {
  playerId: string;
  nickname: string;
  answerText: string;
  isEmpty: boolean;
  duplicateGroupId: number | null;
  duplicateCount: number;
  canChallenge: boolean;
  challengeStatus: "OPEN" | "RESOLVED_VALID" | "RESOLVED_INVALID" | null;
};

export type TuttiFruttiReviewChallenge = {
  id: string;
  targetPlayerId: string;
  categoryPosition: number;
  deadlineAt: string;
  myVote: "VALID" | "INVALID" | null;
  canVote: boolean;
};

export type TuttiFruttiReview = {
  roomId: string;
  sessionId: string;
  roundId: string;
  roundNumber: number;
  phase: "REVIEWING";
  serverNow: string;
  activeChallenge: TuttiFruttiReviewChallenge | null;
  categories: { position: number; label: string; entries: TuttiFruttiReviewEntry[] }[];
};

type ReviewChannel = {
  on: (event: "postgres_changes", filter: { event: "*"; schema: "public";
    table: "tutti_frutti_review_signals"; filter: string }, callback: (payload: unknown) => void) => ReviewChannel;
  subscribe: () => ReviewChannel;
  unsubscribe: () => PromiseLike<unknown>;
};
export type TuttiFruttiReviewClient = {
  rpc: (fn: "get_tutti_frutti_review" | "open_tutti_frutti_challenge" | "vote_tutti_frutti_challenge",
    params: { target_room_id: string; target_answer_player_id?: string; target_category_position?: number;
      target_challenge_id?: string; target_choice?: "VALID" | "INVALID" }) => PromiseLike<{
    data: unknown; error: unknown;
  }>;
  channel: (name: string) => ReviewChannel;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseReview(value: unknown): TuttiFruttiReview {
  if (!record(value) || typeof value.roomId !== "string"
    || typeof value.sessionId !== "string" || typeof value.roundId !== "string"
    || !Number.isInteger(value.roundNumber) || value.phase !== "REVIEWING"
    || typeof value.serverNow !== "string" || Number.isNaN(Date.parse(value.serverNow))
    || !Array.isArray(value.categories)) {
    throw new Error("No pudimos reconstruir la revisión de Tutti Frutti.");
  }
  let activeChallenge: TuttiFruttiReviewChallenge | null = null;
  if (value.activeChallenge !== null) {
    const challenge = value.activeChallenge;
    if (!record(challenge) || typeof challenge.id !== "string"
      || typeof challenge.targetPlayerId !== "string" || !Number.isInteger(challenge.categoryPosition)
      || typeof challenge.deadlineAt !== "string" || Number.isNaN(Date.parse(challenge.deadlineAt))
      || (challenge.myVote !== null && challenge.myVote !== "VALID" && challenge.myVote !== "INVALID")
      || typeof challenge.canVote !== "boolean") {
      throw new Error("No pudimos reconstruir la revisión de Tutti Frutti.");
    }
    activeChallenge = challenge as TuttiFruttiReviewChallenge;
  }
  const positions = new Set<number>();
  for (const category of value.categories) {
    if (!record(category) || !Number.isInteger(category.position)
      || typeof category.label !== "string" || !Array.isArray(category.entries)
      || positions.has(category.position as number)) {
      throw new Error("No pudimos reconstruir la revisión de Tutti Frutti.");
    }
    positions.add(category.position as number);
    const players = new Set<string>();
    for (const entry of category.entries) {
      if (!record(entry) || typeof entry.playerId !== "string"
        || typeof entry.nickname !== "string" || typeof entry.answerText !== "string"
        || typeof entry.isEmpty !== "boolean"
        || (entry.duplicateGroupId !== null && !Number.isInteger(entry.duplicateGroupId))
        || !Number.isInteger(entry.duplicateCount) || (entry.duplicateCount as number) < 0
        || (entry.duplicateGroupId === null ? entry.duplicateCount !== 0 : (entry.duplicateCount as number) < 2)
        || typeof entry.canChallenge !== "boolean"
        || (entry.challengeStatus !== null && !["OPEN", "RESOLVED_VALID", "RESOLVED_INVALID"].includes(String(entry.challengeStatus)))
        || players.has(entry.playerId)) {
        throw new Error("No pudimos reconstruir la revisión de Tutti Frutti.");
      }
      players.add(entry.playerId);
    }
  }
  return { ...value, activeChallenge, serverNow: value.serverNow } as TuttiFruttiReview;
}

const messages: Record<string, string> = {
  P0031: "No pudimos confirmar tu identidad. Volvé a ingresar a la sala.",
  P0032: "La partida de Tutti Frutti no está disponible para tu cuenta.",
  P0038: "No pudimos recuperar la ronda activa.",
  P0042: "La revisión todavía no está disponible.",
  P0045: "No podés impugnar esta respuesta o cambiar un voto ya registrado.",
  P0046: "Esta respuesta ya fue impugnada o la disputa no está disponible.",
  P0047: "Ya hay otra impugnación abierta en esta ronda. Actualizamos la revisión."
};

export async function getTuttiFruttiReview(client: TuttiFruttiReviewClient, roomId: string) {
  const { data, error } = await client.rpc("get_tutti_frutti_review", { target_room_id: roomId });
  if (error) {
    const code = record(error) && typeof error.code === "string" ? error.code : "";
    throw Object.assign(new Error(messages[code] ?? "No pudimos recuperar la revisión."), { code });
  }
  return parseReview(data);
}

export async function openTuttiFruttiChallenge(client: TuttiFruttiReviewClient, roomId: string,
  playerId: string, categoryPosition: number) {
  const { data, error } = await client.rpc("open_tutti_frutti_challenge", {
    target_room_id: roomId, target_answer_player_id: playerId, target_category_position: categoryPosition
  });
  if (error) throw challengeOperationError(error);
  return data;
}

export async function voteTuttiFruttiChallenge(client: TuttiFruttiReviewClient, roomId: string,
  challengeId: string, choice: "VALID" | "INVALID") {
  const { data, error } = await client.rpc("vote_tutti_frutti_challenge", {
    target_room_id: roomId, target_challenge_id: challengeId, target_choice: choice
  });
  if (error) throw challengeOperationError(error);
  return data;
}

function challengeOperationError(error: unknown) {
  const code = record(error) && typeof error.code === "string" ? error.code : "";
  return Object.assign(new Error(messages[code] ?? "No pudimos actualizar la impugnación. Reintentá."), { code });
}

export function subscribeToTuttiFruttiReviewInvalidations(client: TuttiFruttiReviewClient,
  sessionId: string, onInvalidated: () => void) {
  const channel = client.channel(`tutti-frutti-review-signals:${sessionId}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "tutti_frutti_review_signals", filter: `session_id=eq.${sessionId}`
    }, () => onInvalidated()).subscribe();
  return { async unsubscribe() { await channel.unsubscribe(); } };
}
