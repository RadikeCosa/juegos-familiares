export type DictionaryParticipant = {
    playerId: string;
    nickname: string;
    isSelf: boolean;
    isHost: boolean;
    hasSubmitted?: boolean;
    hasVoted?: boolean;
};
export type DictionaryOption = {
    id: string;
    position: number;
    text: string;
    canVote: boolean;
    isReal?: boolean;
    author?: string | null;
    votes?: number;
};
export type DictionaryRound = {
    id: string;
    number: number;
    word: string;
    phase: "WRITING" | "VOTING" | "RESULT";
    ownDefinition: string | null;
    ownVote: string | null;
    options: DictionaryOption[];
};
export type DictionaryState = {
    roomId: string;
    code: string;
    roomStatus: "lobby" | "playing" | "closed";
    isHost: boolean;
    configuration: 3 | 5 | 10;
    enabled: boolean;
    availableRounds: number[];
    participants: DictionaryParticipant[];
    lobbyParticipants: DictionaryParticipant[];
    sessionId: string | null;
    roundCount: number | null;
    endedReason: "completed" | "host_ended" | "inactivity" | "duration" | null;
    closedReason: "inactivity" | "duration" | "host_closed" | null;
    deadlineAt: string | null;
    inactivityDeadlineAt: string;
    round: DictionaryRound | null;
    totals: {
        playerId: string;
        nickname: string;
        totalPoints: number;
        roundPoints: number;
    }[];
    resolvedRounds: number;
};
export type DictionaryOperation = "get_dictionary_state" | "save_dictionary_configuration" | "start_dictionary_session" | "submit_dictionary_definition" | "submit_dictionary_vote" | "advance_dictionary_round" | "finish_dictionary_session" | "heartbeat_dictionary_room";
type RpcResult = { data: unknown; error: unknown };
type RpcRequest = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
export type DictionaryClient = { rpc: (fn: string, args?: Record<string, unknown>) => RpcRequest };

async function boundedRpc(client: DictionaryClient, fn: string, args?: Record<string, unknown>): Promise<RpcResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const query = client.rpc(fn, args);
        return await (query.abortSignal ? query.abortSignal(controller.signal) : query);
    } finally {
        clearTimeout(timer);
    }
}
const messages: Record<string, string> = {
    D0001: "Revisá el texto (entre 1 y 300 caracteres) o la cantidad de rondas.",
    D0002: "Diccionario todavía no está habilitado. Estamos preparando el catálogo.",
    D0003: "Esta sala o partida no está disponible para tu cuenta.",
    D0004: "Esta acción corresponde al anfitrión en la etapa indicada.",
    D0005: "Se necesitan al menos 3 jugadores para empezar.",
    D0006: "No alcanzan las palabras nuevas. Elegí menos rondas o esperá una ampliación del catálogo.",
    D0007: "La ronda cambió. Actualizamos la partida; revisá su estado antes de continuar.",
    D0008: "Elegí una definición ajena para votar."
};
export function dictionaryError(error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return new Error(messages[code] ?? "No pudimos confirmar la acción. Reintentá para recuperar su resultado.");
}
export async function dictionaryAvailable(client: DictionaryClient): Promise<boolean> {
    const { data, error } = await boundedRpc(client, "get_dictionary_availability");
    if (error)
        throw dictionaryError(error);
    return data === true;
}
export function parseDictionaryState(data: unknown): DictionaryState {
    if (!data || typeof data !== "object")
        throw new Error("No pudimos reconstruir la partida.");
    const value = data as DictionaryState;
    if (typeof value.roomId !== "string" || typeof value.code !== "string"
        || !["lobby", "playing", "closed"].includes(value.roomStatus)
        || !Array.isArray(value.participants) || !Array.isArray(value.lobbyParticipants)
        || !Array.isArray(value.totals) || !Array.isArray(value.availableRounds)
        || typeof value.isHost !== "boolean" || ![3, 5, 10].includes(value.configuration)
        || (value.round !== null && (!value.round || !["WRITING", "VOTING", "RESULT"].includes(value.round.phase)
            || !Array.isArray(value.round.options))))
        throw new Error("No pudimos reconstruir la partida.");
    return value;
}
export async function dictionaryRpc(client: DictionaryClient, operation: DictionaryOperation, args: Record<string, unknown>): Promise<DictionaryState> {
    const { data, error } = await boundedRpc(client, operation, args);
    if (error)
        throw dictionaryError(error);
    return parseDictionaryState(data);
}
/** Preview only. Postgres normalizes and validates every submitted definition. */
export function normalizeDictionaryDefinition(raw: string): string {
    let value = raw.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (!value)
        return "";
    value = value.replace(/^([^\p{L}]*)(\p{L})/u, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("es"));
    if (!/[.!?…]$/u.test(value))
        value += ".";
    return value;
}

export async function leaveDictionaryRoom(client: DictionaryClient, roomId: string): Promise<void> {
    const { error } = await boundedRpc(client, "leave_dictionary_room", {target_room_id: roomId});
    if (error) throw dictionaryError(error);
}
