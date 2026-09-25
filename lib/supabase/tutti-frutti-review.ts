export type TuttiFruttiReviewEntry = {
  playerId: string;
  nickname: string;
  answerText: string;
  isEmpty: boolean;
  duplicateGroupId: number | null;
  duplicateCount: number;
};

export type TuttiFruttiReview = {
  roomId: string;
  sessionId: string;
  roundId: string;
  roundNumber: number;
  phase: "REVIEWING";
  categories: { position: number; label: string; entries: TuttiFruttiReviewEntry[] }[];
};

export type TuttiFruttiReviewClient = {
  rpc: (fn: "get_tutti_frutti_review", params: { target_room_id: string }) => PromiseLike<{
    data: unknown; error: unknown;
  }>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseReview(value: unknown): TuttiFruttiReview {
  if (!record(value) || typeof value.roomId !== "string"
    || typeof value.sessionId !== "string" || typeof value.roundId !== "string"
    || !Number.isInteger(value.roundNumber) || value.phase !== "REVIEWING"
    || !Array.isArray(value.categories)) {
    throw new Error("No pudimos reconstruir la revisión de Tutti Frutti.");
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
        || players.has(entry.playerId)) {
        throw new Error("No pudimos reconstruir la revisión de Tutti Frutti.");
      }
      players.add(entry.playerId);
    }
  }
  return value as TuttiFruttiReview;
}

const messages: Record<string, string> = {
  P0031: "No pudimos confirmar tu identidad. Volvé a ingresar a la sala.",
  P0032: "La partida de Tutti Frutti no está disponible para tu cuenta.",
  P0038: "No pudimos recuperar la ronda activa.",
  P0042: "La revisión todavía no está disponible."
};

export async function getTuttiFruttiReview(client: TuttiFruttiReviewClient, roomId: string) {
  const { data, error } = await client.rpc("get_tutti_frutti_review", { target_room_id: roomId });
  if (error) {
    const code = record(error) && typeof error.code === "string" ? error.code : "";
    throw Object.assign(new Error(messages[code] ?? "No pudimos recuperar la revisión."), { code });
  }
  return parseReview(data);
}
