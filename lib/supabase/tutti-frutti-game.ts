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
  startedByPlayerId: string;
  roundCount: 3 | 5 | 10;
  categories: TuttiFruttiGameCategory[];
  participants: TuttiFruttiGameParticipant[];
  round: {
    number: number;
    phase: "LETTER_PENDING";
    letter: string;
  };
};

export const TUTTI_FRUTTI_START_ERROR_MESSAGES: Record<string, string> = {
  P0031: "No pudimos confirmar tu identidad. Volvé a ingresar a la sala.",
  P0032: "La partida de Tutti Frutti no está disponible para tu cuenta.",
  P0033: "Solo el anfitrión puede iniciar la partida.",
  P0034: "La partida ya empezó o la sala dejó de estar disponible.",
  P0037: "Se necesitan al menos dos participantes para iniciar.",
  P0038: "No pudimos preparar la partida. Revisá la configuración e intentá de nuevo."
};

type RpcResult = { data: unknown; error: unknown };
export type TuttiFruttiGameClient = {
  rpc: (
    fn: "get_tutti_frutti_game_state" | "start_tutti_frutti_session",
    params: { target_room_id: string }
  ) => PromiseLike<RpcResult>;
};

function codeOf(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function operationError(error: unknown): Error {
  const message = TUTTI_FRUTTI_START_ERROR_MESSAGES[codeOf(error)]
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
    || typeof game.startedByPlayerId !== "string"
    || ![3, 5, 10].includes(game.roundCount ?? 0)
    || !Array.isArray(game.categories)
    || !Array.isArray(game.participants)
    || typeof game.round !== "object"
    || game.round === null
    || game.round.phase !== "LETTER_PENDING"
    || !Number.isInteger(game.round.number)
    || typeof game.round.letter !== "string"
    || !/^[A-Z]$/.test(game.round.letter)
  ) {
    throw new Error("No pudimos reconstruir la partida de Tutti Frutti.");
  }
  return game as TuttiFruttiStartedGame;
}

async function callGameRpc(
  client: TuttiFruttiGameClient,
  fn: "get_tutti_frutti_game_state" | "start_tutti_frutti_session",
  roomId: string
): Promise<TuttiFruttiStartedGame> {
  const { data, error } = await client.rpc(fn, { target_room_id: roomId });
  if (error) throw operationError(error);
  return parseStartedGame(data);
}

export function getTuttiFruttiGameState(client: TuttiFruttiGameClient, roomId: string) {
  return callGameRpc(client, "get_tutti_frutti_game_state", roomId);
}

export function startTuttiFruttiSession(client: TuttiFruttiGameClient, roomId: string) {
  return callGameRpc(client, "start_tutti_frutti_session", roomId);
}
