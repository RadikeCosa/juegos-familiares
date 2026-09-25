export type TuttiFruttiGameCategory = {
  position: number;
  kind: "preset" | "custom";
  key: string | null;
  label: string;
};

export type TuttiFruttiGameParticipant = {
  playerId: string;
  nickname: string;
};

export type TuttiFruttiStartedGame = {
  roomId: string;
  roomStatus: "playing";
  sessionId: string;
  serverNow: string;
  startedByPlayerId: string;
  roundCount: 3 | 5 | 10;
  categories: TuttiFruttiGameCategory[];
  participants: TuttiFruttiGameParticipant[];
  round: {
    number: number;
    phase: "LETTER_PENDING" | "PLAYING" | "FINAL_COUNTDOWN" | "REVIEWING" | "RESULT";
    letter: string;
    countdownEndsAt: string | null;
    calledByPlayerId: string | null;
    lockedAt: string | null;
    letterDecision: {
      candidateId: string;
      deadlineAt: string;
      votes: number;
      votesRequired: number;
      hasVoted: boolean;
      canSkip: boolean;
    } | null;
  };
};

export const TUTTI_FRUTTI_GAME_ERROR_MESSAGES: Record<string, string> = {
  P0031: "No pudimos confirmar tu identidad. Volvé a ingresar a la sala.",
  P0032: "La partida de Tutti Frutti no está disponible para tu cuenta.",
  P0033: "Solo el anfitrión puede iniciar la partida.",
  P0034: "La partida ya empezó o la sala dejó de estar disponible.",
  P0037: "Se necesitan al menos dos participantes para iniciar.",
  P0038: "No pudimos preparar la partida. Revisá la configuración e intentá de nuevo.",
  P0039: "La letra cambió en otro dispositivo. Actualizamos la partida.",
  P0040: "No se puede saltar esta letra y conservar las rondas restantes.",
  P0044: "Completá y guardá todas las categorías antes de llamar Tutti Frutti."
};
export const TUTTI_FRUTTI_START_ERROR_MESSAGES = TUTTI_FRUTTI_GAME_ERROR_MESSAGES;

type RpcResult = { data: unknown; error: unknown };
export type TuttiFruttiGameClient = {
  rpc: (
    fn: "get_tutti_frutti_game_state" | "start_tutti_frutti_session" | "submit_tutti_frutti_letter_skip_vote" | "call_tutti_frutti",
    params: { target_room_id: string; target_candidate_id?: string }
  ) => PromiseLike<RpcResult>;
};

function codeOf(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function operationError(error: unknown): Error {
  const message = TUTTI_FRUTTI_GAME_ERROR_MESSAGES[codeOf(error)]
    ?? "No pudimos recuperar la partida de Tutti Frutti. Intentá de nuevo.";
  return Object.assign(new Error(message), { code: codeOf(error) });
}

function parseStartedGame(value: unknown): TuttiFruttiStartedGame {
  if (typeof value !== "object" || value === null) {
    throw new Error("No pudimos reconstruir la partida de Tutti Frutti.");
  }
  const game = value as Partial<TuttiFruttiStartedGame>;
  if (
    typeof game.roomId !== "string"
    || game.roomStatus !== "playing"
    || typeof game.sessionId !== "string"
    || typeof game.serverNow !== "string"
    || Number.isNaN(Date.parse(game.serverNow))
    || typeof game.startedByPlayerId !== "string"
    || ![3, 5, 10].includes(game.roundCount ?? 0)
    || !Array.isArray(game.categories)
    || !Array.isArray(game.participants)
    || typeof game.round !== "object"
    || game.round === null
    || !["LETTER_PENDING", "PLAYING", "FINAL_COUNTDOWN", "REVIEWING", "RESULT"].includes(game.round.phase ?? "")
    || !Number.isInteger(game.round.number)
    || typeof game.round.letter !== "string"
    || !/^[A-Z]$/.test(game.round.letter)
    || (game.round.countdownEndsAt != null && (typeof game.round.countdownEndsAt !== "string" || Number.isNaN(Date.parse(game.round.countdownEndsAt))))
    || (game.round.calledByPlayerId != null && typeof game.round.calledByPlayerId !== "string")
    || (game.round.lockedAt != null && (typeof game.round.lockedAt !== "string" || Number.isNaN(Date.parse(game.round.lockedAt))))
  ) {
    throw new Error("No pudimos reconstruir la partida de Tutti Frutti.");
  }
  if (game.round.phase === "LETTER_PENDING") {
    const decision = game.round.letterDecision;
    if (
      !decision || typeof decision.candidateId !== "string"
      || typeof decision.deadlineAt !== "string" || Number.isNaN(Date.parse(decision.deadlineAt))
      || !Number.isInteger(decision.votes) || !Number.isInteger(decision.votesRequired)
      || typeof decision.hasVoted !== "boolean" || typeof decision.canSkip !== "boolean"
    ) throw new Error("No pudimos reconstruir la partida de Tutti Frutti.");
  } else if (game.round.letterDecision !== null) {
    throw new Error("No pudimos reconstruir la partida de Tutti Frutti.");
  }
  if ((game.round.phase === "FINAL_COUNTDOWN" || game.round.phase === "REVIEWING" || game.round.phase === "RESULT")
    && (!game.round.countdownEndsAt || !game.round.calledByPlayerId
      || game.round.phase === "REVIEWING" && !game.round.lockedAt)) {
    throw new Error("No pudimos reconstruir la cuenta de Tutti Frutti.");
  }
  return { ...game, round: {
    ...game.round,
    countdownEndsAt: game.round.countdownEndsAt ?? null,
    calledByPlayerId: game.round.calledByPlayerId ?? null,
    lockedAt: game.round.lockedAt ?? null
  } } as TuttiFruttiStartedGame;
}

async function callGameRpc(
  client: TuttiFruttiGameClient,
  fn: "get_tutti_frutti_game_state" | "start_tutti_frutti_session" | "submit_tutti_frutti_letter_skip_vote" | "call_tutti_frutti",
  roomId: string,
  candidateId?: string
): Promise<TuttiFruttiStartedGame> {
  const { data, error } = await client.rpc(fn, {
    target_room_id: roomId,
    ...(candidateId ? { target_candidate_id: candidateId } : {})
  });
  if (error) throw operationError(error);
  return parseStartedGame(data);
}

export function getTuttiFruttiGameState(client: TuttiFruttiGameClient, roomId: string) {
  return callGameRpc(client, "get_tutti_frutti_game_state", roomId);
}

export function startTuttiFruttiSession(client: TuttiFruttiGameClient, roomId: string) {
  return callGameRpc(client, "start_tutti_frutti_session", roomId);
}

export function callTuttiFrutti(client: TuttiFruttiGameClient, roomId: string) {
  return callGameRpc(client, "call_tutti_frutti", roomId);
}

export function submitTuttiFruttiLetterSkipVote(
  client: TuttiFruttiGameClient,
  roomId: string,
  candidateId: string
) {
  return callGameRpc(client, "submit_tutti_frutti_letter_skip_vote", roomId, candidateId);
}
