type SupabaseRpcResult<TData> = {
    data: TData | null;
    error: unknown;
};

export type ImpostorRoomsClient = {
    rpc: (
        fn:
            | "create_room"
            | "join_room_by_code"
            | "get_my_active_room"
            | "leave_room"
            | "close_room"
            | "refresh_my_room_liveness"
            | "reassign_room_host_if_stale"
            | "start_session"
            | "start_round_discussion"
            | "start_round_voting"
            | "start_second_round_voting"
            | "submit_round_vote"
            | "submit_impostor_guess"
            | "advance_round_result_to_scoreboard"
            | "start_next_round"
            | "end_session"
            | "get_my_game_state",
        params?: { room_code: string } | { target_player_id: string } | { guess_text: string }
    ) => PromiseLike<SupabaseRpcResult<unknown>>;
};

type RealtimeChannelStatus =
    | "SUBSCRIBED"
    | "TIMED_OUT"
    | "CLOSED"
    | "CHANNEL_ERROR";

type RealtimeChannel = {
    on: (
        type: "postgres_changes",
        filter: {
            event: "INSERT" | "UPDATE" | "DELETE";
            schema: "public";
            table: "room_participants" | "rooms";
            filter: string;
        },
        callback: (payload: unknown) => void
    ) => RealtimeChannel;
    subscribe: (
        callback?: (status: RealtimeChannelStatus, error?: unknown) => void
    ) => RealtimeChannel;
};

export type ImpostorRoomChangesClient = {
    channel: (name: string) => RealtimeChannel;
    removeChannel: (channel: RealtimeChannel) => PromiseLike<unknown>;
};

type RealtimePresenceChannelStatus =
    | "SUBSCRIBED"
    | "TIMED_OUT"
    | "CLOSED"
    | "CHANNEL_ERROR";

export type RoomPresencePayload = {
    playerId?: string;
};

export type RoomPresenceState = Record<
    string,
    Array<RoomPresencePayload & { presence_ref?: string }>
>;

type RealtimePresenceChannel = {
    on: (
        type: "presence",
        filter: { event: "sync" | "join" | "leave" },
        callback: () => void
    ) => RealtimePresenceChannel;
    presenceState: () => RoomPresenceState;
    subscribe: (
        callback?: (status: RealtimePresenceChannelStatus, error?: unknown) => void
    ) => RealtimePresenceChannel;
    track: (payload: RoomPresencePayload) => PromiseLike<unknown>;
    untrack: () => PromiseLike<unknown>;
};

export type ImpostorRoomPresenceClient = {
    channel: (
        name: string,
        options: {
            config: {
                private: true;
                presence: {
                    enabled: true;
                    key: string;
                };
            };
        }
    ) => RealtimePresenceChannel;
    removeChannel: (channel: RealtimePresenceChannel) => PromiseLike<unknown>;
};

type SupabaseErrorLike = {
    code?: string;
};

const ROOM_CREATION_INTENT_KEY = "juegos-familia.room-creation-intent";

function getBrowserSessionStorage(): Storage | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

// Marks that this device just asked to create the given Room, so the room
// page can distinguish "just created it" from an unrelated direct visit.
export function recordRoomCreationIntent(code: string) {
    const storage = getBrowserSessionStorage();

    if (!storage) {
        return;
    }

    try {
        storage.setItem(ROOM_CREATION_INTENT_KEY, code);
    } catch {
        // Ignore storage failures; the room page will treat it as no intent.
    }
}

export function hasRoomCreationIntent(code: string) {
    const storage = getBrowserSessionStorage();

    if (!storage) {
        return false;
    }

    try {
        return storage.getItem(ROOM_CREATION_INTENT_KEY) === code;
    } catch {
        return false;
    }
}

export function clearRoomCreationIntent(code: string) {
    const storage = getBrowserSessionStorage();

    if (!storage) {
        return;
    }

    try {
        if (storage.getItem(ROOM_CREATION_INTENT_KEY) === code) {
            storage.removeItem(ROOM_CREATION_INTENT_KEY);
        }
    } catch {
        // Ignore storage failures; the intent is only a navigation hint.
    }
}

const ROOM_JOIN_INTENT_KEY = "juegos-familia.room-join-intent";

// Marks that this device just asked to join the given Room, so the room page
// can reuse the RPC result instead of asking again for an explicit tap.
export function recordRoomJoinIntent(code: string) {
    const storage = getBrowserSessionStorage();

    if (!storage) {
        return;
    }

    try {
        storage.setItem(ROOM_JOIN_INTENT_KEY, code);
    } catch {
        // Ignore storage failures; the room page will ask for an explicit tap.
    }
}

export function hasRoomJoinIntent(code: string) {
    const storage = getBrowserSessionStorage();

    if (!storage) {
        return false;
    }

    try {
        return storage.getItem(ROOM_JOIN_INTENT_KEY) === code;
    } catch {
        return false;
    }
}

export function clearRoomJoinIntent(code: string) {
    const storage = getBrowserSessionStorage();

    if (!storage) {
        return;
    }

    try {
        if (storage.getItem(ROOM_JOIN_INTENT_KEY) === code) {
            storage.removeItem(ROOM_JOIN_INTENT_KEY);
        }
    } catch {
        // Ignore storage failures; the intent is only a navigation hint.
    }
}

const UNAUTHENTICATED_ROOM_ERROR =
    "Necesitás entrar a tu grupo antes de crear una sala.";
const MISSING_PLAYER_ROOM_ERROR =
    "No pudimos reconocer tu jugador para crear la sala.";
const GENERIC_CREATE_ROOM_ERROR =
    "No pudimos crear la sala. Intentá de nuevo.";

const UNAUTHENTICATED_JOIN_ROOM_ERROR =
    "Necesitás entrar a tu grupo antes de unirte a una sala.";
const MISSING_PLAYER_JOIN_ROOM_ERROR =
    "No pudimos reconocer tu jugador para unirte a la sala.";
const ROOM_NOT_FOUND_ERROR =
    "No encontramos esa sala. Revisá el código e intentá de nuevo.";
const ROOM_CLOSED_ERROR = "Esta sala ya no está disponible.";
const ALREADY_IN_ANOTHER_ROOM_ERROR = "Ya estás en otra sala.";
const GENERIC_JOIN_ROOM_ERROR =
    "No pudimos unirte a la sala. Intentá de nuevo.";
const MISSING_PLAYER_ACTIVE_ROOM_ERROR =
    "No pudimos reconocer tu jugador para recuperar la sala.";
const INCONSISTENT_ACTIVE_ROOM_ERROR =
    "No pudimos reconstruir tu sala activa. Volvé a intentar más tarde.";
const GENERIC_ACTIVE_ROOM_ERROR =
    "No pudimos recuperar tu sala activa. Intentá de nuevo.";
const UNAUTHENTICATED_LEAVE_ROOM_ERROR =
    "Necesitás entrar a tu grupo antes de salir de una sala.";
const MISSING_PLAYER_LEAVE_ROOM_ERROR =
    "No pudimos reconocer tu jugador para salir de la sala.";
const GENERIC_LEAVE_ROOM_ERROR =
    "No pudimos salir de la sala. Intentá de nuevo.";
const UNAUTHENTICATED_CLOSE_ROOM_ERROR =
    "Necesitás entrar a tu grupo antes de cerrar una sala.";
const MISSING_PLAYER_CLOSE_ROOM_ERROR =
    "No pudimos reconocer tu jugador para cerrar la sala.";
const NO_ACTIVE_ROOM_TO_CLOSE_ERROR = "Ya no tenés una sala activa para cerrar.";
const NOT_ROOM_HOST_ERROR = "Solo el host puede cerrar la sala.";
const GENERIC_CLOSE_ROOM_ERROR =
    "No pudimos cerrar la sala. Intentá de nuevo.";
const UNAUTHENTICATED_LIVENESS_ERROR =
    "Necesitás entrar a tu grupo antes de mantener activa la sala.";
const MISSING_PLAYER_LIVENESS_ERROR =
    "No pudimos reconocer tu jugador para mantener activa la sala.";
const GENERIC_LIVENESS_ERROR =
    "No pudimos mantener activa la sala. Intentá de nuevo.";
const UNAUTHENTICATED_HOST_SUCCESSION_ERROR =
    "Necesitás entrar a tu grupo antes de revisar el host.";
const MISSING_PLAYER_HOST_SUCCESSION_ERROR =
    "No pudimos reconocer tu jugador para revisar el host.";
const GENERIC_HOST_SUCCESSION_ERROR =
    "No pudimos revisar quién debería ser host. Intentá de nuevo.";
const UNAUTHENTICATED_START_SESSION_ERROR =
    "Necesitás entrar a tu grupo antes de iniciar la tanda.";
const MISSING_PLAYER_START_SESSION_ERROR =
    "No pudimos reconocer tu jugador para iniciar la tanda.";
const NO_ACTIVE_ROOM_START_SESSION_ERROR =
    "No tenés una sala activa para iniciar.";
const ROOM_NOT_STARTABLE_ERROR = "Esta sala no se puede iniciar ahora.";
const NOT_ROOM_HOST_START_SESSION_ERROR =
    "Solo el host actual puede iniciar la tanda.";
const NOT_ENOUGH_ACTIVE_PLAYERS_ERROR =
    "Necesitás al menos 3 participantes activos para iniciar.";
const NO_ELIGIBLE_WORDS_ERROR =
    "Agregá al menos una palabra al banco antes de iniciar.";
const GENERIC_START_SESSION_ERROR =
    "No pudimos iniciar la tanda. Intentá de nuevo.";
const UNAUTHENTICATED_START_DISCUSSION_ERROR =
    "Necesitás entrar a tu grupo antes de empezar la ronda.";
const MISSING_PLAYER_START_DISCUSSION_ERROR =
    "No pudimos reconocer tu jugador para empezar la ronda.";
const NO_ACTIVE_ROOM_START_DISCUSSION_ERROR =
    "No tenés una sala activa para empezar la ronda.";
const ROOM_NOT_DISCUSSABLE_ERROR =
    "Esta ronda no se puede empezar ahora.";
const NOT_ROOM_HOST_START_DISCUSSION_ERROR =
    "Solo el host actual puede empezar la ronda.";
const INCONSISTENT_START_DISCUSSION_ERROR =
    "No pudimos reconstruir la tanda para empezar la ronda.";
const NOT_SESSION_PLAYER_START_DISCUSSION_ERROR =
    "No participás de la tanda actual.";
const GENERIC_START_DISCUSSION_ERROR =
    "No pudimos empezar la ronda. Intentá de nuevo.";
const UNAUTHENTICATED_START_VOTING_ERROR =
    "Necesitás entrar a tu grupo antes de ir a votación.";
const MISSING_PLAYER_START_VOTING_ERROR =
    "No pudimos reconocer tu jugador para ir a votación.";
const NO_ACTIVE_ROOM_START_VOTING_ERROR =
    "No tenés una sala activa para ir a votación.";
const ROOM_NOT_VOTABLE_ERROR =
    "Esta ronda no se puede votar ahora.";
const NOT_ROOM_HOST_START_VOTING_ERROR =
    "Solo el host actual puede ir a votación.";
const INCONSISTENT_START_VOTING_ERROR =
    "No pudimos reconstruir la tanda para ir a votación.";
const NOT_SESSION_PLAYER_START_VOTING_ERROR =
    "No participás de la tanda actual.";
const GENERIC_START_VOTING_ERROR =
    "No pudimos ir a votación. Intentá de nuevo.";
const UNAUTHENTICATED_START_SECOND_VOTING_ERROR =
    "Necesitás entrar a tu grupo antes de ir a segunda votación.";
const MISSING_PLAYER_START_SECOND_VOTING_ERROR =
    "No pudimos reconocer tu jugador para ir a segunda votación.";
const NO_ACTIVE_ROOM_START_SECOND_VOTING_ERROR =
    "No tenés una sala activa para ir a segunda votación.";
const ROOM_NOT_SECOND_VOTABLE_ERROR =
    "Esta ronda no se puede llevar a segunda votación ahora.";
const NOT_ROOM_HOST_START_SECOND_VOTING_ERROR =
    "Solo el host actual puede ir a segunda votación.";
const INCONSISTENT_START_SECOND_VOTING_ERROR =
    "No pudimos reconstruir la tanda para ir a segunda votación.";
const NOT_SESSION_PLAYER_START_SECOND_VOTING_ERROR =
    "No participás de la tanda actual.";
const GENERIC_START_SECOND_VOTING_ERROR =
    "No pudimos ir a segunda votación. Intentá de nuevo.";
const UNAUTHENTICATED_SUBMIT_VOTE_ERROR =
    "Necesitás entrar a tu grupo antes de votar.";
const MISSING_PLAYER_SUBMIT_VOTE_ERROR =
    "No pudimos reconocer tu jugador para votar.";
const NO_ACTIVE_ROOM_SUBMIT_VOTE_ERROR =
    "No tenés una sala activa para votar.";
const ROOM_NOT_VOTING_ERROR =
    "Esta ronda no está recibiendo votos ahora.";
const INVALID_VOTE_TARGET_ERROR =
    "Elegí otro jugador válido para votar.";
const ALREADY_VOTED_ERROR =
    "Tu voto ya fue registrado y no se puede cambiar.";
const INCONSISTENT_SUBMIT_VOTE_ERROR =
    "No pudimos reconstruir la tanda para votar.";
const NOT_SESSION_PLAYER_SUBMIT_VOTE_ERROR =
    "No participás de la tanda actual.";
const GENERIC_SUBMIT_VOTE_ERROR =
    "No pudimos registrar tu voto. Intentá de nuevo.";
const UNAUTHENTICATED_SUBMIT_GUESS_ERROR =
    "Necesitás entrar a tu grupo antes de intentar adivinar.";
const MISSING_PLAYER_SUBMIT_GUESS_ERROR =
    "No pudimos reconocer tu jugador para intentar adivinar.";
const NO_ACTIVE_ROOM_SUBMIT_GUESS_ERROR =
    "No tenés una sala activa para intentar adivinar.";
const ROOM_NOT_GUESSABLE_ERROR =
    "Esta ronda no está esperando el intento final.";
const INCONSISTENT_SUBMIT_GUESS_ERROR =
    "No pudimos reconstruir la tanda para intentar adivinar.";
const NOT_IMPOSTOR_SUBMIT_GUESS_ERROR =
    "Solo el impostor puede enviar el intento final.";
const EMPTY_SUBMIT_GUESS_ERROR =
    "Escribí una palabra para enviar tu intento.";
const ALREADY_SUBMITTED_GUESS_ERROR =
    "El intento final ya fue registrado y no se puede cambiar.";
const GENERIC_SUBMIT_GUESS_ERROR =
    "No pudimos enviar el intento. Intentá de nuevo.";
const UNAUTHENTICATED_ADVANCE_SCOREBOARD_ERROR =
    "Necesitás entrar a tu grupo antes de cerrar la ronda.";
const MISSING_PLAYER_ADVANCE_SCOREBOARD_ERROR =
    "No pudimos reconocer tu jugador para cerrar la ronda.";
const NO_ACTIVE_ROOM_ADVANCE_SCOREBOARD_ERROR =
    "No tenés una sala activa para cerrar la ronda.";
const ROOM_NOT_SCOREABLE_ERROR =
    "Esta ronda no está lista para mostrar el marcador.";
const INCONSISTENT_ADVANCE_SCOREBOARD_ERROR =
    "No pudimos reconstruir la tanda para mostrar el marcador.";
const NOT_SESSION_PLAYER_ADVANCE_SCOREBOARD_ERROR =
    "No participás de la tanda actual.";
const GENERIC_ADVANCE_SCOREBOARD_ERROR =
    "No pudimos mostrar el marcador. Intentá de nuevo.";
const UNAUTHENTICATED_START_NEXT_ROUND_ERROR =
    "Necesitás entrar a tu grupo antes de iniciar otra ronda.";
const MISSING_PLAYER_START_NEXT_ROUND_ERROR =
    "No pudimos reconocer tu jugador para iniciar otra ronda.";
const NO_ACTIVE_ROOM_START_NEXT_ROUND_ERROR =
    "No tenés una sala activa para iniciar otra ronda.";
const ROOM_NOT_NEXT_ROUND_READY_ERROR =
    "Esta tanda no está lista para iniciar otra ronda.";
const NOT_ROOM_HOST_START_NEXT_ROUND_ERROR =
    "Solo el host actual puede iniciar otra ronda.";
const NO_ELIGIBLE_WORDS_NEXT_ROUND_ERROR =
    "No quedan palabras nuevas para iniciar otra ronda.";
const INCONSISTENT_START_NEXT_ROUND_ERROR =
    "No pudimos reconstruir la tanda para iniciar otra ronda.";
const NOT_SESSION_PLAYER_START_NEXT_ROUND_ERROR =
    "No participás de la tanda actual.";
const GENERIC_START_NEXT_ROUND_ERROR =
    "No pudimos iniciar otra ronda. Intentá de nuevo.";
const UNAUTHENTICATED_END_SESSION_ERROR =
    "Necesitás entrar a tu grupo antes de terminar la tanda.";
const MISSING_PLAYER_END_SESSION_ERROR =
    "No pudimos reconocer tu jugador para terminar la tanda.";
const NO_ACTIVE_ROOM_END_SESSION_ERROR =
    "No tenés una sala activa para terminar la tanda.";
const ROOM_NOT_ENDABLE_ERROR =
    "Esta tanda no está lista para terminar.";
const NOT_ROOM_HOST_END_SESSION_ERROR =
    "Solo el host actual puede terminar la tanda.";
const INCONSISTENT_END_SESSION_ERROR =
    "No pudimos reconstruir la tanda para terminarla.";
const NOT_SESSION_PLAYER_END_SESSION_ERROR =
    "No participás de la tanda actual.";
const GENERIC_END_SESSION_ERROR =
    "No pudimos terminar la tanda. Intentá de nuevo.";
const UNAUTHENTICATED_GAME_STATE_ERROR =
    "Necesitás entrar a tu grupo antes de recuperar la tanda.";
const MISSING_PLAYER_GAME_STATE_ERROR =
    "No pudimos reconocer tu jugador para recuperar la tanda.";
const INCONSISTENT_GAME_STATE_ERROR =
    "No pudimos reconstruir la tanda. Volvé a intentar más tarde.";
const NOT_SESSION_PLAYER_GAME_STATE_ERROR =
    "No participás de la tanda actual.";
const GENERIC_GAME_STATE_ERROR =
    "No pudimos recuperar la tanda. Intentá de nuevo.";

export const ROOM_LIVENESS_HEARTBEAT_MS = 30_000;
export const ROOM_HOST_SUCCESSION_RECHECK_MS = 30_000;

type RoomLobbyRow = {
    room_id?: string;
    room_join_code: string;
    room_status: string;
    participant_player_id: string;
    participant_nickname: string;
    participant_is_host: boolean;
    participant_is_self: boolean;
    participant_joined_at: string;
};

export type RoomLobbyParticipant = {
    playerId: string;
    nickname: string;
    isHost: boolean;
    isSelf: boolean;
    joinedAt: string;
};

export type RoomLobby = {
    room: {
        id?: string;
        code: string;
        status: string;
    };
    participants: RoomLobbyParticipant[];
};

type StartSessionRow = {
    started: boolean;
    already_started: boolean;
    room_status: string;
    game_session_state: string;
    round_number: number;
    participant_count: number;
};

export type StartSessionResult = {
    started: boolean;
    alreadyStarted: boolean;
    roomStatus: string;
    gameSessionState: string;
    roundNumber: number;
    participantCount: number;
};

type StartRoundDiscussionRow = {
    advanced: boolean;
    already_in_phase: boolean;
    state: "discussion";
    round_number: number;
};

type StartRoundVotingRow = {
    advanced: boolean;
    already_in_phase: boolean;
    state: "voting_first";
    round_number: number;
};

type StartSecondRoundVotingRow = {
    advanced: boolean;
    already_in_phase: boolean;
    state: "voting_second";
    round_number: number;
};

type SubmitRoundVoteRow = {
    accepted: boolean;
    already_recorded: boolean;
    state:
        | "voting_first"
        | "tie_discussion"
        | "voting_second"
        | "impostor_guess"
        | "round_result";
    round_number: number;
};

type SubmitImpostorGuessRow = {
    accepted: boolean;
    already_recorded: boolean;
    state: "round_result";
    round_number: number;
    is_correct: boolean;
    winner: "impostor" | "group";
};

type AdvanceRoundResultToScoreboardRow = {
    advanced: boolean;
    already_scored: boolean;
    state: "scoreboard";
    round_number: number;
};

type StartNextRoundRow = {
    started: boolean;
    already_started: boolean;
    state: "role_reveal";
    round_number: number;
};

type EndSessionRow = {
    ended: boolean;
    already_ended: boolean;
    state: "finished";
    round_count: number;
    winner_player_ids: string[];
};

export type StartRoundDiscussionResult = {
    advanced: boolean;
    alreadyInPhase: boolean;
    state: "discussion";
    roundNumber: number;
};

export type StartRoundVotingResult = {
    advanced: boolean;
    alreadyInPhase: boolean;
    state: "voting_first";
    roundNumber: number;
};

export type StartSecondRoundVotingResult = {
    advanced: boolean;
    alreadyInPhase: boolean;
    state: "voting_second";
    roundNumber: number;
};

export type SubmitRoundVoteResult = {
    accepted: boolean;
    alreadyRecorded: boolean;
    state:
        | "voting_first"
        | "tie_discussion"
        | "voting_second"
        | "impostor_guess"
        | "round_result";
    roundNumber: number;
};

export type SubmitImpostorGuessResult = {
    accepted: boolean;
    alreadyRecorded: boolean;
    state: "round_result";
    roundNumber: number;
    isCorrect: boolean;
    winner: "impostor" | "group";
};

export type AdvanceRoundResultToScoreboardResult = {
    advanced: boolean;
    alreadyScored: boolean;
    state: "scoreboard";
    roundNumber: number;
};

export type StartNextRoundResult = {
    started: boolean;
    alreadyStarted: boolean;
    state: "role_reveal";
    roundNumber: number;
};

export type EndSessionResult = {
    ended: boolean;
    alreadyEnded: boolean;
    state: "finished";
    roundCount: number;
    winnerPlayerIds: string[];
};

export type GameSessionState =
    | "role_reveal"
    | "discussion"
    | "voting_first"
    | "tie_discussion"
    | "voting_second"
    | "impostor_guess"
    | "round_result"
    | "scoreboard"
    | "finished";

type VoteCandidateRow = {
    player_id: string;
    nickname: string;
};

type VoteResultRow = VoteCandidateRow & {
    vote_count: number;
};

type ScoreboardPlayerRow = VoteCandidateRow & {
    score: number;
    is_self?: boolean;
};

type FinalScoreRow = VoteCandidateRow & {
    score: number;
};

type RoundSummaryRow = {
    number: number;
    round_winner: "impostor" | "group";
    discovered_by_vote: boolean;
    impostor_guess_text: string | null;
    impostor_guess_correct: boolean | null;
    scoring_summary: Record<string, unknown>;
};

type RoundImpostorRow = VoteCandidateRow;

type NextRoundBlockReason =
    | "not_host"
    | "no_words"
    | "session_not_ready"
    | "unknown";

type MyGameStateRow = {
    state: GameSessionState;
    round_number: number;
    candidates?: unknown;
    my_vote_target_player_id?: string | null;
    has_voted?: boolean;
    vote_results?: unknown;
    can_submit_impostor_guess?: boolean;
    winner?: "impostor" | "group" | null;
    impostor_guess_text?: string | null;
    impostor_guess_correct?: boolean | null;
    scoreboard_players?: unknown;
    round_impostor?: unknown;
    can_start_next_round?: boolean;
    can_end_session?: boolean;
    available_unused_words_count?: number | null;
    next_round_block_reason?: NextRoundBlockReason | null;
    finished_at?: string | null;
    round_count?: number | null;
    final_scores?: unknown;
    winner_player_ids?: unknown;
    winners?: unknown;
    rounds_summary?: unknown;
} & (
    | {
        role: "player";
        word: string | null;
    }
    | {
        role: "impostor";
        word: string | null;
    }
    | {
        role: null;
        word: null;
    }
);

export type MyPrivateRoundView =
    | {
        role: "player";
        word: string | null;
    }
    | {
        role: "impostor";
        word: string | null;
    };

export type VoteCandidate = {
    playerId: string;
    nickname: string;
};

export type VoteResult = VoteCandidate & {
    voteCount: number;
};

export type ScoreboardPlayer = VoteCandidate & {
    score: number;
    isSelf: boolean;
};

export type FinalScore = VoteCandidate & {
    score: number;
};

export type RoundSummary = {
    number: number;
    winner: "impostor" | "group";
    discoveredByVote: boolean;
    impostorGuessText: string | null;
    impostorGuessCorrect: boolean | null;
    scoringSummary: Record<string, unknown>;
};

export type RoundImpostor = VoteCandidate;

export type ScoreboardState = {
    players: ScoreboardPlayer[];
    roundImpostor: RoundImpostor | null;
    canStartNextRound: boolean;
    canEndSession: boolean;
    availableUnusedWordsCount: number;
    nextRoundBlockReason: NextRoundBlockReason | null;
};

export type FinishedState = {
    finishedAt: string;
    roundCount: number;
    finalScores: FinalScore[];
    winnerPlayerIds: string[];
    winners: FinalScore[];
    roundsSummary: RoundSummary[];
    canStartNextRound: false;
    canEndSession: false;
};

export type MyGameState = {
    state: GameSessionState;
    roundNumber: number;
    privateView: MyPrivateRoundView;
    candidates: VoteCandidate[] | null;
    voting: {
        candidates: VoteCandidate[];
        myVoteTargetPlayerId: string | null;
        hasVoted: boolean;
    } | null;
    voteResults: VoteResult[] | null;
    impostorGuess?: {
        canSubmit: boolean;
    };
    roundResult?: {
        winner: "impostor" | "group";
        impostorGuessText: string | null;
        impostorGuessCorrect: boolean | null;
    };
    scoreboard?: ScoreboardState;
    finished?: FinishedState;
};

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
    return typeof error === "object" && error !== null;
}

function getCreateRoomErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_ROOM_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_ROOM_ERROR;
        }
    }

    return GENERIC_CREATE_ROOM_ERROR;
}

function getJoinRoomErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_JOIN_ROOM_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_JOIN_ROOM_ERROR;
        }

        if (error.code === "P0010") {
            return ROOM_NOT_FOUND_ERROR;
        }

        if (error.code === "P0011") {
            return ROOM_CLOSED_ERROR;
        }

        if (error.code === "P0012") {
            return ALREADY_IN_ANOTHER_ROOM_ERROR;
        }
    }

    return GENERIC_JOIN_ROOM_ERROR;
}

// 8 opaque chars, but forgiving of stray whitespace/case from manual typing.
export function normalizeRoomJoinCode(rawCode: string) {
    return rawCode.trim().toUpperCase();
}

function getActiveRoomErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "P0002") {
            return MISSING_PLAYER_ACTIVE_ROOM_ERROR;
        }

        if (error.code === "P0014") {
            return INCONSISTENT_ACTIVE_ROOM_ERROR;
        }
    }

    return GENERIC_ACTIVE_ROOM_ERROR;
}

function getLeaveRoomErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_LEAVE_ROOM_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_LEAVE_ROOM_ERROR;
        }
    }

    return GENERIC_LEAVE_ROOM_ERROR;
}

function getCloseRoomErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_CLOSE_ROOM_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_CLOSE_ROOM_ERROR;
        }

        if (error.code === "P0015") {
            return NO_ACTIVE_ROOM_TO_CLOSE_ERROR;
        }

        if (error.code === "P0016") {
            return NOT_ROOM_HOST_ERROR;
        }
    }

    return GENERIC_CLOSE_ROOM_ERROR;
}

function getLivenessErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_LIVENESS_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_LIVENESS_ERROR;
        }
    }

    return GENERIC_LIVENESS_ERROR;
}

function getHostSuccessionErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_HOST_SUCCESSION_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_HOST_SUCCESSION_ERROR;
        }
    }

    return GENERIC_HOST_SUCCESSION_ERROR;
}

function getStartSessionErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_START_SESSION_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_START_SESSION_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_START_SESSION_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_STARTABLE_ERROR;
        }

        if (error.code === "P0019") {
            return NOT_ROOM_HOST_START_SESSION_ERROR;
        }

        if (error.code === "P0020") {
            return NOT_ENOUGH_ACTIVE_PLAYERS_ERROR;
        }

        if (error.code === "P0021") {
            return NO_ELIGIBLE_WORDS_ERROR;
        }
    }

    return GENERIC_START_SESSION_ERROR;
}

function getStartDiscussionErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_START_DISCUSSION_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_START_DISCUSSION_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_START_DISCUSSION_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_DISCUSSABLE_ERROR;
        }

        if (error.code === "P0019") {
            return NOT_ROOM_HOST_START_DISCUSSION_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_START_DISCUSSION_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_SESSION_PLAYER_START_DISCUSSION_ERROR;
        }
    }

    return GENERIC_START_DISCUSSION_ERROR;
}

function getStartVotingErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_START_VOTING_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_START_VOTING_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_START_VOTING_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_VOTABLE_ERROR;
        }

        if (error.code === "P0019") {
            return NOT_ROOM_HOST_START_VOTING_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_START_VOTING_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_SESSION_PLAYER_START_VOTING_ERROR;
        }
    }

    return GENERIC_START_VOTING_ERROR;
}

function getStartSecondVotingErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_START_SECOND_VOTING_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_START_SECOND_VOTING_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_START_SECOND_VOTING_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_SECOND_VOTABLE_ERROR;
        }

        if (error.code === "P0019") {
            return NOT_ROOM_HOST_START_SECOND_VOTING_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_START_SECOND_VOTING_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_SESSION_PLAYER_START_SECOND_VOTING_ERROR;
        }
    }

    return GENERIC_START_SECOND_VOTING_ERROR;
}

function getSubmitVoteErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_SUBMIT_VOTE_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_SUBMIT_VOTE_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_SUBMIT_VOTE_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_VOTING_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_SUBMIT_VOTE_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_SESSION_PLAYER_SUBMIT_VOTE_ERROR;
        }

        if (error.code === "P0024") {
            return INVALID_VOTE_TARGET_ERROR;
        }

        if (error.code === "P0025") {
            return ALREADY_VOTED_ERROR;
        }
    }

    return GENERIC_SUBMIT_VOTE_ERROR;
}

function getSubmitGuessErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_SUBMIT_GUESS_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_SUBMIT_GUESS_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_SUBMIT_GUESS_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_GUESSABLE_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_SUBMIT_GUESS_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_IMPOSTOR_SUBMIT_GUESS_ERROR;
        }

        if (error.code === "22023") {
            return EMPTY_SUBMIT_GUESS_ERROR;
        }

        if (error.code === "P0025") {
            return ALREADY_SUBMITTED_GUESS_ERROR;
        }
    }

    return GENERIC_SUBMIT_GUESS_ERROR;
}

function getAdvanceScoreboardErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_ADVANCE_SCOREBOARD_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_ADVANCE_SCOREBOARD_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_ADVANCE_SCOREBOARD_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_SCOREABLE_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_ADVANCE_SCOREBOARD_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_SESSION_PLAYER_ADVANCE_SCOREBOARD_ERROR;
        }
    }

    return GENERIC_ADVANCE_SCOREBOARD_ERROR;
}

function getStartNextRoundErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_START_NEXT_ROUND_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_START_NEXT_ROUND_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_START_NEXT_ROUND_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_NEXT_ROUND_READY_ERROR;
        }

        if (error.code === "P0019") {
            return NOT_ROOM_HOST_START_NEXT_ROUND_ERROR;
        }

        if (error.code === "P0021") {
            return NO_ELIGIBLE_WORDS_NEXT_ROUND_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_START_NEXT_ROUND_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_SESSION_PLAYER_START_NEXT_ROUND_ERROR;
        }
    }

    return GENERIC_START_NEXT_ROUND_ERROR;
}

function getEndSessionErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_END_SESSION_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_END_SESSION_ERROR;
        }

        if (error.code === "P0017") {
            return NO_ACTIVE_ROOM_END_SESSION_ERROR;
        }

        if (error.code === "P0018") {
            return ROOM_NOT_ENDABLE_ERROR;
        }

        if (error.code === "P0019") {
            return NOT_ROOM_HOST_END_SESSION_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_END_SESSION_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_SESSION_PLAYER_END_SESSION_ERROR;
        }
    }

    return GENERIC_END_SESSION_ERROR;
}

function getGameStateErrorMessage(error: unknown) {
    if (isSupabaseErrorLike(error)) {
        if (error.code === "28000" || error.code === "42501") {
            return UNAUTHENTICATED_GAME_STATE_ERROR;
        }

        if (error.code === "P0002") {
            return MISSING_PLAYER_GAME_STATE_ERROR;
        }

        if (error.code === "P0022") {
            return INCONSISTENT_GAME_STATE_ERROR;
        }

        if (error.code === "P0023") {
            return NOT_SESSION_PLAYER_GAME_STATE_ERROR;
        }
    }

    return GENERIC_GAME_STATE_ERROR;
}

function isRoomLobbyRow(value: unknown): value is RoomLobbyRow {
    const row = value as Partial<RoomLobbyRow>;

    return (
        typeof row.participant_player_id === "string" &&
        typeof row.room_join_code === "string" &&
        typeof row.room_status === "string" &&
        typeof row.participant_nickname === "string" &&
        typeof row.participant_is_host === "boolean" &&
        typeof row.participant_is_self === "boolean" &&
        typeof row.participant_joined_at === "string"
    );
}

function isStartSessionRow(value: unknown): value is StartSessionRow {
    const row = value as Partial<StartSessionRow>;

    return (
        typeof row.started === "boolean" &&
        typeof row.already_started === "boolean" &&
        typeof row.room_status === "string" &&
        typeof row.game_session_state === "string" &&
        typeof row.round_number === "number" &&
        typeof row.participant_count === "number"
    );
}

function isStartRoundDiscussionRow(
    value: unknown
): value is StartRoundDiscussionRow {
    const row = value as Partial<StartRoundDiscussionRow>;

    return (
        typeof row.advanced === "boolean" &&
        typeof row.already_in_phase === "boolean" &&
        row.state === "discussion" &&
        typeof row.round_number === "number" &&
        Number.isInteger(row.round_number) &&
        row.round_number >= 1
    );
}

function isStartRoundVotingRow(value: unknown): value is StartRoundVotingRow {
    const row = value as Partial<StartRoundVotingRow>;

    return (
        typeof row.advanced === "boolean" &&
        typeof row.already_in_phase === "boolean" &&
        row.state === "voting_first" &&
        typeof row.round_number === "number" &&
        Number.isInteger(row.round_number) &&
        row.round_number >= 1
    );
}

function isStartSecondRoundVotingRow(
    value: unknown
): value is StartSecondRoundVotingRow {
    const row = value as Partial<StartSecondRoundVotingRow>;

    return (
        typeof row.advanced === "boolean" &&
        typeof row.already_in_phase === "boolean" &&
        row.state === "voting_second" &&
        typeof row.round_number === "number" &&
        Number.isInteger(row.round_number) &&
        row.round_number >= 1
    );
}

function isSubmitRoundVoteRow(value: unknown): value is SubmitRoundVoteRow {
    const row = value as Partial<SubmitRoundVoteRow>;

    return (
        typeof row.accepted === "boolean" &&
        typeof row.already_recorded === "boolean" &&
        (
            row.state === "voting_first" ||
            row.state === "tie_discussion" ||
            row.state === "voting_second" ||
            row.state === "impostor_guess" ||
            row.state === "round_result"
        ) &&
        typeof row.round_number === "number" &&
        Number.isInteger(row.round_number) &&
        row.round_number >= 1
    );
}

function isSubmitImpostorGuessRow(
    value: unknown
): value is SubmitImpostorGuessRow {
    const row = value as Partial<SubmitImpostorGuessRow>;

    return (
        typeof row.accepted === "boolean" &&
        typeof row.already_recorded === "boolean" &&
        row.state === "round_result" &&
        typeof row.round_number === "number" &&
        Number.isInteger(row.round_number) &&
        row.round_number >= 1 &&
        typeof row.is_correct === "boolean" &&
        (row.winner === "impostor" || row.winner === "group")
    );
}

function isAdvanceRoundResultToScoreboardRow(
    value: unknown
): value is AdvanceRoundResultToScoreboardRow {
    const row = value as Partial<AdvanceRoundResultToScoreboardRow>;

    return (
        typeof row.advanced === "boolean" &&
        typeof row.already_scored === "boolean" &&
        row.state === "scoreboard" &&
        typeof row.round_number === "number" &&
        Number.isInteger(row.round_number) &&
        row.round_number >= 1
    );
}

function isStartNextRoundRow(value: unknown): value is StartNextRoundRow {
    const row = value as Partial<StartNextRoundRow>;

    return (
        typeof row.started === "boolean" &&
        typeof row.already_started === "boolean" &&
        row.state === "role_reveal" &&
        typeof row.round_number === "number" &&
        Number.isInteger(row.round_number) &&
        row.round_number >= 2
    );
}

function isEndSessionRow(value: unknown): value is EndSessionRow {
    const row = value as Partial<EndSessionRow>;

    return (
        typeof row.ended === "boolean" &&
        typeof row.already_ended === "boolean" &&
        row.state === "finished" &&
        typeof row.round_count === "number" &&
        Number.isInteger(row.round_count) &&
        row.round_count >= 1 &&
        Array.isArray(row.winner_player_ids) &&
        row.winner_player_ids.length >= 1 &&
        row.winner_player_ids.every((playerId) => typeof playerId === "string")
    );
}

function isMyGameStateRow(value: unknown): value is MyGameStateRow {
    const row = value as Partial<MyGameStateRow>;

    if (
        (
            row.state !== "role_reveal" &&
            row.state !== "discussion" &&
            row.state !== "voting_first" &&
            row.state !== "tie_discussion" &&
            row.state !== "voting_second" &&
            row.state !== "impostor_guess" &&
            row.state !== "round_result" &&
            row.state !== "scoreboard" &&
            row.state !== "finished"
        ) ||
        typeof row.round_number !== "number" ||
        !Number.isInteger(row.round_number) ||
        row.round_number < 1
    ) {
        return false;
    }

    if (row.state === "finished") {
        return (
            row.role === null &&
            row.word === null &&
            (row.candidates === null || typeof row.candidates === "undefined") &&
            (row.my_vote_target_player_id === null ||
                typeof row.my_vote_target_player_id === "undefined") &&
            (row.has_voted === false || typeof row.has_voted === "undefined") &&
            (row.vote_results === null || typeof row.vote_results === "undefined") &&
            row.can_submit_impostor_guess === false &&
            (row.winner === null || typeof row.winner === "undefined") &&
            (row.impostor_guess_text === null ||
                typeof row.impostor_guess_text === "undefined") &&
            (row.impostor_guess_correct === null ||
                typeof row.impostor_guess_correct === "undefined") &&
            (row.scoreboard_players === null ||
                typeof row.scoreboard_players === "undefined") &&
            (row.round_impostor === null ||
                typeof row.round_impostor === "undefined") &&
            row.can_start_next_round === false &&
            row.can_end_session === false &&
            (row.available_unused_words_count === null ||
                typeof row.available_unused_words_count === "undefined") &&
            (row.next_round_block_reason === null ||
                typeof row.next_round_block_reason === "undefined") &&
            typeof row.finished_at === "string" &&
            row.finished_at.length > 0 &&
            typeof row.round_count === "number" &&
            Number.isInteger(row.round_count) &&
            row.round_count >= 1 &&
            row.round_number === row.round_count &&
            Array.isArray(row.final_scores) &&
            row.final_scores.length >= 1 &&
            row.final_scores.every(isFinalScoreRow) &&
            Array.isArray(row.winner_player_ids) &&
            row.winner_player_ids.length >= 1 &&
            row.winner_player_ids.every((playerId) => typeof playerId === "string") &&
            Array.isArray(row.winners) &&
            row.winners.length >= 1 &&
            row.winners.every(isFinalScoreRow) &&
            Array.isArray(row.rounds_summary) &&
            row.rounds_summary.length === row.round_count &&
            row.rounds_summary.every(isRoundSummaryRow)
        );
    }

    if (row.role === "player") {
        if (
            !(
                typeof row.word === "string" ||
                (row.state === "impostor_guess" && row.word === null)
            )
        ) {
            return false;
        }
    } else if (
        !(
            row.role === "impostor" &&
            (
                row.word === null ||
                (
                    (row.state === "round_result" || row.state === "scoreboard") &&
                    typeof row.word === "string"
                )
            )
        )
    ) {
        return false;
    }

    if (row.state === "voting_first" || row.state === "voting_second") {
        return (
            Array.isArray(row.candidates) &&
            row.candidates.every(isVoteCandidateRow) &&
            (
                typeof row.my_vote_target_player_id === "string" ||
                row.my_vote_target_player_id === null
            ) &&
            typeof row.has_voted === "boolean" &&
            (row.vote_results === null || typeof row.vote_results === "undefined")
        );
    }

    if (row.state === "tie_discussion") {
        return (
            Array.isArray(row.candidates) &&
            row.candidates.every(isVoteCandidateRow) &&
            (
                typeof row.my_vote_target_player_id === "string" ||
                row.my_vote_target_player_id === null
            ) &&
            typeof row.has_voted === "boolean" &&
            Array.isArray(row.vote_results) &&
            row.vote_results.every(isVoteResultRow)
        );
    }

    if (row.state === "impostor_guess") {
        return (
            (row.candidates === null || typeof row.candidates === "undefined") &&
            Array.isArray(row.vote_results) &&
            row.vote_results.every(isVoteResultRow) &&
            typeof row.can_submit_impostor_guess === "boolean" &&
            (row.winner === null || typeof row.winner === "undefined") &&
            (row.impostor_guess_text === null ||
                typeof row.impostor_guess_text === "undefined") &&
            (row.impostor_guess_correct === null ||
                typeof row.impostor_guess_correct === "undefined")
        );
    }

    if (row.state === "round_result") {
        return (
            (row.candidates === null || typeof row.candidates === "undefined") &&
            Array.isArray(row.vote_results) &&
            row.vote_results.every(isVoteResultRow) &&
            (row.can_submit_impostor_guess === false ||
                typeof row.can_submit_impostor_guess === "undefined") &&
            (row.winner === "impostor" || row.winner === "group") &&
            (typeof row.impostor_guess_text === "string" ||
                row.impostor_guess_text === null ||
                typeof row.impostor_guess_text === "undefined") &&
            (typeof row.impostor_guess_correct === "boolean" ||
                row.impostor_guess_correct === null ||
                typeof row.impostor_guess_correct === "undefined")
        );
    }

    if (row.state === "scoreboard") {
        return (
            (row.candidates === null || typeof row.candidates === "undefined") &&
            Array.isArray(row.vote_results) &&
            row.vote_results.every(isVoteResultRow) &&
            (row.can_submit_impostor_guess === false ||
                typeof row.can_submit_impostor_guess === "undefined") &&
            (row.winner === "impostor" || row.winner === "group") &&
            (typeof row.impostor_guess_text === "string" ||
                row.impostor_guess_text === null ||
                typeof row.impostor_guess_text === "undefined") &&
            (typeof row.impostor_guess_correct === "boolean" ||
                row.impostor_guess_correct === null ||
                typeof row.impostor_guess_correct === "undefined") &&
            Array.isArray(row.scoreboard_players) &&
            row.scoreboard_players.every(isScoreboardPlayerRow) &&
            (row.round_impostor === null || isRoundImpostorRow(row.round_impostor)) &&
            typeof row.can_start_next_round === "boolean" &&
            typeof row.can_end_session === "boolean" &&
            typeof row.available_unused_words_count === "number" &&
            Number.isInteger(row.available_unused_words_count) &&
            row.available_unused_words_count >= 0 &&
            isNextRoundBlockReason(row.next_round_block_reason)
        );
    }

    return (
        (row.candidates === null || typeof row.candidates === "undefined") &&
        (row.my_vote_target_player_id === null ||
            typeof row.my_vote_target_player_id === "undefined") &&
        (row.has_voted === false || typeof row.has_voted === "undefined") &&
        (row.vote_results === null || typeof row.vote_results === "undefined")
    );
}

function isVoteCandidateRow(value: unknown): value is VoteCandidateRow {
    const row = value as Partial<VoteCandidateRow>;

    return typeof row.player_id === "string" && typeof row.nickname === "string";
}

function isVoteResultRow(value: unknown): value is VoteResultRow {
    const row = value as Partial<VoteResultRow>;

    return (
        isVoteCandidateRow(value) &&
        typeof row.vote_count === "number" &&
        Number.isInteger(row.vote_count) &&
        row.vote_count >= 0
    );
}

function isScoreboardPlayerRow(value: unknown): value is ScoreboardPlayerRow {
    const row = value as Partial<ScoreboardPlayerRow>;

    return (
        isVoteCandidateRow(value) &&
        typeof row.score === "number" &&
        Number.isInteger(row.score) &&
        row.score >= 0 &&
        (typeof row.is_self === "boolean" || typeof row.is_self === "undefined")
    );
}

function isFinalScoreRow(value: unknown): value is FinalScoreRow {
    const row = value as Partial<FinalScoreRow>;

    return (
        isVoteCandidateRow(value) &&
        typeof row.score === "number" &&
        Number.isInteger(row.score) &&
        row.score >= 0
    );
}

function isRoundSummaryRow(value: unknown): value is RoundSummaryRow {
    const row = value as Partial<RoundSummaryRow>;

    return (
        typeof row.number === "number" &&
        Number.isInteger(row.number) &&
        row.number >= 1 &&
        (row.round_winner === "impostor" || row.round_winner === "group") &&
        typeof row.discovered_by_vote === "boolean" &&
        (
            typeof row.impostor_guess_text === "string" ||
            row.impostor_guess_text === null
        ) &&
        (
            typeof row.impostor_guess_correct === "boolean" ||
            row.impostor_guess_correct === null
        ) &&
        typeof row.scoring_summary === "object" &&
        row.scoring_summary !== null &&
        !Array.isArray(row.scoring_summary)
    );
}

function isRoundImpostorRow(value: unknown): value is RoundImpostorRow {
    return isVoteCandidateRow(value);
}

function isNextRoundBlockReason(
    value: unknown
): value is NextRoundBlockReason | null {
    return (
        value === null ||
        value === "not_host" ||
        value === "no_words" ||
        value === "session_not_ready" ||
        value === "unknown"
    );
}

function toVoteCandidates(value: unknown): VoteCandidate[] | null {
    if (value === null || typeof value === "undefined") {
        return null;
    }

    if (!Array.isArray(value) || !value.every(isVoteCandidateRow)) {
        return null;
    }

    return value.map((candidate) => ({
        playerId: candidate.player_id,
        nickname: candidate.nickname
    }));
}

function toScoreboardPlayers(value: unknown): ScoreboardPlayer[] | null {
    if (value === null || typeof value === "undefined") {
        return null;
    }

    if (!Array.isArray(value) || !value.every(isScoreboardPlayerRow)) {
        return null;
    }

    return value.map((player) => ({
        playerId: player.player_id,
        nickname: player.nickname,
        score: player.score,
        isSelf: player.is_self === true
    }));
}

function toFinalScores(value: unknown): FinalScore[] {
    if (!Array.isArray(value) || !value.every(isFinalScoreRow)) {
        return [];
    }

    return value.map((player) => ({
        playerId: player.player_id,
        nickname: player.nickname,
        score: player.score
    }));
}

function toRoundSummaries(value: unknown): RoundSummary[] {
    if (!Array.isArray(value) || !value.every(isRoundSummaryRow)) {
        return [];
    }

    return value.map((round) => ({
        number: round.number,
        winner: round.round_winner,
        discoveredByVote: round.discovered_by_vote,
        impostorGuessText: round.impostor_guess_text,
        impostorGuessCorrect: round.impostor_guess_correct,
        scoringSummary: round.scoring_summary
    }));
}

function toRoundImpostor(value: unknown): RoundImpostor | null {
    if (value === null || typeof value === "undefined") {
        return null;
    }

    if (!isRoundImpostorRow(value)) {
        return null;
    }

    return {
        playerId: value.player_id,
        nickname: value.nickname
    };
}

function toVoteResults(value: unknown): VoteResult[] | null {
    if (value === null || typeof value === "undefined") {
        return null;
    }

    if (!Array.isArray(value) || !value.every(isVoteResultRow)) {
        return null;
    }

    return value.map((result) => ({
        playerId: result.player_id,
        nickname: result.nickname,
        voteCount: result.vote_count
    }));
}

function toStartSessionResult(row: StartSessionRow): StartSessionResult {
    return {
        started: row.started,
        alreadyStarted: row.already_started,
        roomStatus: row.room_status,
        gameSessionState: row.game_session_state,
        roundNumber: row.round_number,
        participantCount: row.participant_count
    };
}

function toStartRoundDiscussionResult(
    row: StartRoundDiscussionRow
): StartRoundDiscussionResult {
    return {
        advanced: row.advanced,
        alreadyInPhase: row.already_in_phase,
        state: row.state,
        roundNumber: row.round_number
    };
}

function toStartRoundVotingResult(row: StartRoundVotingRow): StartRoundVotingResult {
    return {
        advanced: row.advanced,
        alreadyInPhase: row.already_in_phase,
        state: row.state,
        roundNumber: row.round_number
    };
}

function toStartSecondRoundVotingResult(
    row: StartSecondRoundVotingRow
): StartSecondRoundVotingResult {
    return {
        advanced: row.advanced,
        alreadyInPhase: row.already_in_phase,
        state: row.state,
        roundNumber: row.round_number
    };
}

function toSubmitRoundVoteResult(row: SubmitRoundVoteRow): SubmitRoundVoteResult {
    return {
        accepted: row.accepted,
        alreadyRecorded: row.already_recorded,
        state: row.state,
        roundNumber: row.round_number
    };
}

function toSubmitImpostorGuessResult(
    row: SubmitImpostorGuessRow
): SubmitImpostorGuessResult {
    return {
        accepted: row.accepted,
        alreadyRecorded: row.already_recorded,
        state: row.state,
        roundNumber: row.round_number,
        isCorrect: row.is_correct,
        winner: row.winner
    };
}

function toAdvanceRoundResultToScoreboardResult(
    row: AdvanceRoundResultToScoreboardRow
): AdvanceRoundResultToScoreboardResult {
    return {
        advanced: row.advanced,
        alreadyScored: row.already_scored,
        state: row.state,
        roundNumber: row.round_number
    };
}

function toStartNextRoundResult(row: StartNextRoundRow): StartNextRoundResult {
    return {
        started: row.started,
        alreadyStarted: row.already_started,
        state: row.state,
        roundNumber: row.round_number
    };
}

function toEndSessionResult(row: EndSessionRow): EndSessionResult {
    return {
        ended: row.ended,
        alreadyEnded: row.already_ended,
        state: row.state,
        roundCount: row.round_count,
        winnerPlayerIds: row.winner_player_ids
    };
}

function toMyGameState(row: MyGameStateRow): MyGameState {
    if (row.state === "finished") {
        return {
            state: "finished",
            roundNumber: row.round_number,
            privateView: { role: "player", word: null },
            candidates: null,
            voting: null,
            voteResults: null,
            finished: {
                finishedAt: row.finished_at as string,
                roundCount: row.round_count as number,
                finalScores: toFinalScores(row.final_scores),
                winnerPlayerIds: row.winner_player_ids as string[],
                winners: toFinalScores(row.winners),
                roundsSummary: toRoundSummaries(row.rounds_summary),
                canStartNextRound: false,
                canEndSession: false
            }
        };
    }

    const voteResults = toVoteResults(row.vote_results);
    const candidates = toVoteCandidates(row.candidates);
    const scoreboardPlayers = toScoreboardPlayers(row.scoreboard_players);
    const roundImpostor = toRoundImpostor(row.round_impostor);
    const voting =
        row.state === "voting_first" || row.state === "voting_second"
            ? {
                candidates: candidates ?? [],
                myVoteTargetPlayerId: row.my_vote_target_player_id ?? null,
                hasVoted: row.has_voted === true
            }
            : null;
    const impostorGuess = row.state === "impostor_guess"
        ? { canSubmit: row.can_submit_impostor_guess === true }
        : undefined;
    const roundResult =
        (row.state === "round_result" || row.state === "scoreboard") && row.winner
        ? {
            winner: row.winner,
            impostorGuessText: row.impostor_guess_text ?? null,
            impostorGuessCorrect: row.impostor_guess_correct ?? null
        }
        : undefined;
    const scoreboard =
        row.state === "scoreboard"
            ? {
                players: scoreboardPlayers ?? [],
                roundImpostor,
                canStartNextRound: row.can_start_next_round === true,
                canEndSession: row.can_end_session === true,
                availableUnusedWordsCount: row.available_unused_words_count ?? 0,
                nextRoundBlockReason: row.next_round_block_reason ?? null
            }
            : undefined;

    if (row.role === "player") {
        return {
            state: row.state,
            roundNumber: row.round_number,
            privateView: { role: "player", word: row.word },
            candidates,
            voting,
            voteResults,
            ...(impostorGuess ? { impostorGuess } : {}),
            ...(roundResult ? { roundResult } : {}),
            ...(scoreboard ? { scoreboard } : {})
        };
    }

    return {
        state: row.state,
        roundNumber: row.round_number,
        privateView: { role: "impostor", word: row.word },
        candidates,
        voting,
        voteResults,
        ...(impostorGuess ? { impostorGuess } : {}),
        ...(roundResult ? { roundResult } : {}),
        ...(scoreboard ? { scoreboard } : {})
    };
}

function toRoomLobby(rows: RoomLobbyRow[], invalidMessage: string): RoomLobby {
    const [firstRow] = rows;
    const selfCount = rows.filter((row) => row.participant_is_self).length;

    if (selfCount !== 1) {
        throw new Error(invalidMessage);
    }

    return {
        room: {
            id: firstRow.room_id,
            code: firstRow.room_join_code,
            status: firstRow.room_status
        },
        participants: rows.map((row) => {
            const participant: RoomLobbyParticipant = {
                playerId: row.participant_player_id,
                nickname: row.participant_nickname,
                isHost: row.participant_is_host,
                isSelf: row.participant_is_self,
                joinedAt: row.participant_joined_at
            };

            return participant;
        })
    };
}

export function getConnectedRoomParticipantIds(
    participants: RoomLobbyParticipant[],
    presenceState: RoomPresenceState
) {
    const participantIds = new Set(
        participants.map((participant) => participant.playerId)
    );
    const connectedPlayerIds = new Set<string>();

    for (const presences of Object.values(presenceState)) {
        for (const presence of presences) {
            if (
                typeof presence.playerId === "string" &&
                participantIds.has(presence.playerId)
            ) {
                connectedPlayerIds.add(presence.playerId);
            }
        }
    }

    return connectedPlayerIds;
}

function createRoomPresenceKey(playerId: string) {
    const randomUUID = globalThis.crypto?.randomUUID?.();
    const suffix = randomUUID ?? `${Date.now()}-${Math.random()}`;

    return `${playerId}:${suffix}`;
}

export type RoomPresenceSubscription = {
    recoverPresence: () => Promise<void>;
    unsubscribe: () => Promise<void>;
};

export function subscribeToRoomPresence(
    supabase: ImpostorRoomPresenceClient,
    options: {
        roomId: string;
        currentPlayerId: string;
        onSync: (presenceState: RoomPresenceState) => void;
        onSubscribed?: () => void;
        onError?: (error: unknown) => void;
    }
): RoomPresenceSubscription {
    let isDisposed = false;
    let activeTrackRequest: Promise<void> | null = null;
    const channel = supabase
        .channel(`impostor-room-presence:${options.roomId}`, {
            config: {
                private: true,
                presence: {
                    enabled: true,
                    key: createRoomPresenceKey(options.currentPlayerId)
                }
            }
        });

    channel
        .on("presence", { event: "sync" }, () => {
            if (!isDisposed) {
                options.onSync(channel.presenceState());
            }
        })
        .on("presence", { event: "join" }, () => {
            if (!isDisposed) {
                options.onSync(channel.presenceState());
            }
        })
        .on("presence", { event: "leave" }, () => {
            if (!isDisposed) {
                options.onSync(channel.presenceState());
            }
        });

    function trackPresence() {
        if (isDisposed) {
            return Promise.resolve();
        }

        if (activeTrackRequest) {
            return activeTrackRequest;
        }

        activeTrackRequest = Promise.resolve(
            channel.track({ playerId: options.currentPlayerId })
        )
            .then(() => {
                if (!isDisposed) {
                    options.onSubscribed?.();
                }
            })
            .catch((trackError) => {
                if (!isDisposed) {
                    options.onError?.(trackError);
                }
            })
            .finally(() => {
                activeTrackRequest = null;
            });

        return activeTrackRequest;
    }

    channel.subscribe((status, error) => {
        if (isDisposed) {
            return;
        }

        if (status === "SUBSCRIBED") {
            void trackPresence();
        }

        if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
            options.onError?.(error ?? status);
        }
    });

    return {
        recoverPresence() {
            return trackPresence();
        },
        async unsubscribe() {
            isDisposed = true;

            try {
                await channel.untrack();
            } finally {
                await supabase.removeChannel(channel);
            }
        }
    };
}

export async function refreshMyRoomLiveness(
    supabase: ImpostorRoomsClient
): Promise<void> {
    const result = await supabase.rpc("refresh_my_room_liveness");

    if (result.error) {
        throw new Error(getLivenessErrorMessage(result.error));
    }
}

type HostSuccessionRow = {
    host_changed: boolean;
    current_host_player_id: string | null;
};

export type HostSuccessionResult = {
    hostChanged: boolean;
    currentHostPlayerId: string | null;
};

function isHostSuccessionRow(value: unknown): value is HostSuccessionRow {
    const row = value as Partial<HostSuccessionRow>;

    return (
        typeof row.host_changed === "boolean" &&
        (typeof row.current_host_player_id === "string" ||
            row.current_host_player_id === null)
    );
}

export async function reassignRoomHostIfStale(
    supabase: ImpostorRoomsClient
): Promise<HostSuccessionResult> {
    const result = await supabase.rpc("reassign_room_host_if_stale");

    if (result.error) {
        throw new Error(getHostSuccessionErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    const [row] = rows;

    if (!row || !isHostSuccessionRow(row)) {
        throw new Error("No pudimos confirmar quién debería ser host.");
    }

    return {
        hostChanged: row.host_changed,
        currentHostPlayerId: row.current_host_player_id
    };
}

export function createHostSuccessionController() {
    let activeRequest: Promise<HostSuccessionResult> | null = null;

    return {
        submit(supabase: ImpostorRoomsClient): Promise<HostSuccessionResult> {
            if (activeRequest) {
                return activeRequest;
            }

            activeRequest = reassignRoomHostIfStale(supabase);

            void activeRequest.then(
                () => {
                    activeRequest = null;
                },
                () => {
                    activeRequest = null;
                }
            );

            return activeRequest;
        }
    };
}

type LivenessDocument = {
    visibilityState?: DocumentVisibilityState;
    addEventListener?: (
        type: "visibilitychange",
        listener: () => void
    ) => void;
    removeEventListener?: (
        type: "visibilitychange",
        listener: () => void
    ) => void;
};

type RoomLivenessHeartbeatOptions = {
    refresh: () => PromiseLike<void>;
    onError?: (error: unknown) => void;
    intervalMs?: number;
    document?: LivenessDocument | null;
    setIntervalFn?: typeof setInterval;
    clearIntervalFn?: typeof clearInterval;
};

export type RoomLivenessHeartbeat = {
    refreshNow: () => void;
    dispose: () => void;
};

export function startRoomLivenessHeartbeat(
    options: RoomLivenessHeartbeatOptions
): RoomLivenessHeartbeat {
    let isDisposed = false;
    const intervalMs = options.intervalMs ?? ROOM_LIVENESS_HEARTBEAT_MS;
    const setIntervalFn = options.setIntervalFn ?? globalThis.setInterval;
    const clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval;
    const targetDocument =
        options.document ?? (typeof document === "undefined" ? null : document);

    function refreshNow() {
        if (isDisposed) {
            return;
        }

        void Promise.resolve(options.refresh()).catch((error) => {
            if (!isDisposed) {
                options.onError?.(error);
            }
        });
    }

    function handleVisibilityChange() {
        if (targetDocument?.visibilityState === "visible") {
            refreshNow();
        }
    }

    const intervalId = setIntervalFn(refreshNow, intervalMs);
    targetDocument?.addEventListener?.("visibilitychange", handleVisibilityChange);
    refreshNow();

    return {
        refreshNow,
        dispose() {
            isDisposed = true;
            clearIntervalFn(intervalId);
            targetDocument?.removeEventListener?.(
                "visibilitychange",
                handleVisibilityChange
            );
        }
    };
}

type RoomHostSuccessionRecheckOptions = {
    evaluate: () => PromiseLike<HostSuccessionResult>;
    isHostMissing: () => boolean;
    onError?: (error: unknown) => void;
    intervalMs?: number;
    document?: LivenessDocument | null;
    setIntervalFn?: typeof setInterval;
    clearIntervalFn?: typeof clearInterval;
};

export type RoomHostSuccessionRecheck = {
    requestNow: () => void;
    dispose: () => void;
};

export function startRoomHostSuccessionRecheck(
    options: RoomHostSuccessionRecheckOptions
): RoomHostSuccessionRecheck {
    let isDisposed = false;
    let activeRequest: Promise<unknown> | null = null;
    const intervalMs = options.intervalMs ?? ROOM_HOST_SUCCESSION_RECHECK_MS;
    const setIntervalFn = options.setIntervalFn ?? globalThis.setInterval;
    const clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval;
    const targetDocument =
        options.document ?? (typeof document === "undefined" ? null : document);

    function requestNow() {
        if (isDisposed || activeRequest) {
            return;
        }

        activeRequest = Promise.resolve(options.evaluate())
            .catch((error) => {
                if (!isDisposed) {
                    options.onError?.(error);
                }
            })
            .finally(() => {
                activeRequest = null;
            });
    }

    function requestIfHostMissing() {
        if (options.isHostMissing()) {
            requestNow();
        }
    }

    function handleVisibilityChange() {
        if (targetDocument?.visibilityState === "visible") {
            requestNow();
        }
    }

    const intervalId = setIntervalFn(requestIfHostMissing, intervalMs);
    targetDocument?.addEventListener?.("visibilitychange", handleVisibilityChange);
    requestNow();

    return {
        requestNow,
        dispose() {
            isDisposed = true;
            clearIntervalFn(intervalId);
            targetDocument?.removeEventListener?.(
                "visibilitychange",
                handleVisibilityChange
            );
        }
    };
}

export async function createRoom(
    supabase: ImpostorRoomsClient
): Promise<RoomLobby> {
    const result = await supabase.rpc("create_room");

    if (result.error) {
        throw new Error(getCreateRoomErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length === 0 || !rows.every(isRoomLobbyRow)) {
        throw new Error("No pudimos confirmar que la sala fue creada.");
    }

    return toRoomLobby(rows, "No pudimos confirmar que la sala fue creada.");
}

export function createCreateRoomController() {
    let activeRequest: Promise<RoomLobby> | null = null;

    return {
        submit(supabase: ImpostorRoomsClient): Promise<RoomLobby> {
            if (activeRequest) {
                return activeRequest;
            }

            activeRequest = createRoom(supabase);

            activeRequest.then(
                () => {
                    activeRequest = null;
                },
                () => {
                    activeRequest = null;
                }
            );

            return activeRequest;
        }
    };
}

export async function joinRoomByCode(
    supabase: ImpostorRoomsClient,
    roomCode: string
): Promise<RoomLobby> {
    const result = await supabase.rpc("join_room_by_code", {
        room_code: normalizeRoomJoinCode(roomCode)
    });

    if (result.error) {
        throw new Error(getJoinRoomErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length === 0 || !rows.every(isRoomLobbyRow)) {
        throw new Error("No pudimos confirmar que te uniste a la sala.");
    }

    return toRoomLobby(rows, "No pudimos confirmar que te uniste a la sala.");
}

export async function getMyActiveRoom(
    supabase: ImpostorRoomsClient
): Promise<RoomLobby | null> {
    const result = await supabase.rpc("get_my_active_room");

    if (result.error) {
        throw new Error(getActiveRoomErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length === 0) {
        return null;
    }

    if (!rows.every(isRoomLobbyRow)) {
        throw new Error("No pudimos confirmar tu sala activa.");
    }

    return toRoomLobby(rows, "No pudimos confirmar tu sala activa.");
}

export function createJoinRoomByCodeController() {
    let activeRequest: Promise<RoomLobby> | null = null;

    return {
        submit(supabase: ImpostorRoomsClient, roomCode: string): Promise<RoomLobby> {
            if (activeRequest) {
                return activeRequest;
            }

            activeRequest = joinRoomByCode(supabase, roomCode);

            activeRequest.then(
                () => {
                    activeRequest = null;
                },
                () => {
                    activeRequest = null;
                }
            );

            return activeRequest;
        }
    };
}

export async function leaveRoom(supabase: ImpostorRoomsClient): Promise<void> {
    const result = await supabase.rpc("leave_room");

    if (result.error) {
        throw new Error(getLeaveRoomErrorMessage(result.error));
    }
}

export async function closeRoom(supabase: ImpostorRoomsClient): Promise<void> {
    const result = await supabase.rpc("close_room");

    if (result.error) {
        throw new Error(getCloseRoomErrorMessage(result.error));
    }
}

export async function startSession(
    supabase: ImpostorRoomsClient
): Promise<StartSessionResult> {
    const result = await supabase.rpc("start_session");

    if (result.error) {
        throw new Error(getStartSessionErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isStartSessionRow(rows[0])) {
        throw new Error("No pudimos confirmar el inicio de la tanda.");
    }

    return toStartSessionResult(rows[0]);
}

export async function startRoundDiscussion(
    supabase: ImpostorRoomsClient
): Promise<StartRoundDiscussionResult> {
    const result = await supabase.rpc("start_round_discussion");

    if (result.error) {
        throw new Error(getStartDiscussionErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isStartRoundDiscussionRow(rows[0])) {
        throw new Error("No pudimos confirmar el comienzo de la ronda.");
    }

    return toStartRoundDiscussionResult(rows[0]);
}

export async function startRoundVoting(
    supabase: ImpostorRoomsClient
): Promise<StartRoundVotingResult> {
    const result = await supabase.rpc("start_round_voting");

    if (result.error) {
        throw new Error(getStartVotingErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isStartRoundVotingRow(rows[0])) {
        throw new Error("No pudimos confirmar el inicio de la votación.");
    }

    return toStartRoundVotingResult(rows[0]);
}

export async function startSecondRoundVoting(
    supabase: ImpostorRoomsClient
): Promise<StartSecondRoundVotingResult> {
    const result = await supabase.rpc("start_second_round_voting");

    if (result.error) {
        throw new Error(getStartSecondVotingErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isStartSecondRoundVotingRow(rows[0])) {
        throw new Error("No pudimos confirmar el inicio de la segunda votación.");
    }

    return toStartSecondRoundVotingResult(rows[0]);
}

export async function submitRoundVote(
    supabase: ImpostorRoomsClient,
    targetPlayerId: string
): Promise<SubmitRoundVoteResult> {
    const result = await supabase.rpc("submit_round_vote", {
        target_player_id: targetPlayerId
    });

    if (result.error) {
        throw new Error(getSubmitVoteErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isSubmitRoundVoteRow(rows[0])) {
        throw new Error("No pudimos confirmar tu voto.");
    }

    return toSubmitRoundVoteResult(rows[0]);
}

export async function submitImpostorGuess(
    supabase: ImpostorRoomsClient,
    guessText: string
): Promise<SubmitImpostorGuessResult> {
    const result = await supabase.rpc("submit_impostor_guess", {
        guess_text: guessText
    });

    if (result.error) {
        throw new Error(getSubmitGuessErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isSubmitImpostorGuessRow(rows[0])) {
        throw new Error("No pudimos confirmar el intento final.");
    }

    return toSubmitImpostorGuessResult(rows[0]);
}

export async function advanceRoundResultToScoreboard(
    supabase: ImpostorRoomsClient
): Promise<AdvanceRoundResultToScoreboardResult> {
    const result = await supabase.rpc("advance_round_result_to_scoreboard");

    if (result.error) {
        throw new Error(getAdvanceScoreboardErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isAdvanceRoundResultToScoreboardRow(rows[0])) {
        throw new Error("No pudimos confirmar el marcador.");
    }

    return toAdvanceRoundResultToScoreboardResult(rows[0]);
}

export async function startNextRound(
    supabase: ImpostorRoomsClient
): Promise<StartNextRoundResult> {
    const result = await supabase.rpc("start_next_round");

    if (result.error) {
        throw new Error(getStartNextRoundErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isStartNextRoundRow(rows[0])) {
        throw new Error("No pudimos confirmar la nueva ronda.");
    }

    return toStartNextRoundResult(rows[0]);
}

export async function endSession(
    supabase: ImpostorRoomsClient
): Promise<EndSessionResult> {
    const result = await supabase.rpc("end_session");

    if (result.error) {
        throw new Error(getEndSessionErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length !== 1 || !isEndSessionRow(rows[0])) {
        throw new Error("No pudimos confirmar el cierre de la tanda.");
    }

    return toEndSessionResult(rows[0]);
}

export async function getMyGameState(
    supabase: ImpostorRoomsClient
): Promise<MyGameState | null> {
    const result = await supabase.rpc("get_my_game_state");

    if (result.error) {
        throw new Error(getGameStateErrorMessage(result.error));
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length === 0) {
        return null;
    }

    if (rows.length !== 1 || !isMyGameStateRow(rows[0])) {
        throw new Error("No pudimos confirmar el estado de la tanda.");
    }

    return toMyGameState(rows[0]);
}

export function createLeaveRoomController() {
    let activeRequest: Promise<void> | null = null;

    return {
        submit(supabase: ImpostorRoomsClient): Promise<void> {
            if (activeRequest) {
                return activeRequest;
            }

            activeRequest = leaveRoom(supabase);

            void activeRequest.finally(() => {
                activeRequest = null;
            });

            return activeRequest;
        }
    };
}

export function createCloseRoomController() {
    let activeRequest: Promise<void> | null = null;

    return {
        submit(supabase: ImpostorRoomsClient): Promise<void> {
            if (activeRequest) {
                return activeRequest;
            }

            activeRequest = closeRoom(supabase);

            void activeRequest.finally(() => {
                activeRequest = null;
            });

            return activeRequest;
        }
    };
}

export function createStartSessionController() {
    let activeRequest: Promise<StartSessionResult> | null = null;

    return {
        submit(supabase: ImpostorRoomsClient): Promise<StartSessionResult> {
            if (activeRequest) {
                return activeRequest;
            }

            activeRequest = startSession(supabase);

            void activeRequest.finally(() => {
                activeRequest = null;
            });

            return activeRequest;
        }
    };
}

export type RoomChangesSubscription = {
    unsubscribe: () => Promise<void>;
};

export function subscribeToRoomChanges(
    supabase: ImpostorRoomChangesClient,
    roomId: string,
    onInvalidate: () => void
): RoomChangesSubscription {
    let lastStatus: RealtimeChannelStatus | null = null;
    const encodedRoomId = roomId.replaceAll(",", "%2C");
    const channel = supabase
        .channel(`impostor-room:${roomId}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "room_participants",
                filter: `room_id=eq.${encodedRoomId}`
            },
            () => onInvalidate()
        )
        .on(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "room_participants",
                filter: `room_id=eq.${encodedRoomId}`
            },
            () => onInvalidate()
        )
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "rooms",
                filter: `id=eq.${encodedRoomId}`
            },
            () => onInvalidate()
        )
        .subscribe((status) => {
            if (status === "SUBSCRIBED" && lastStatus && lastStatus !== "SUBSCRIBED") {
                onInvalidate();
            }

            lastStatus = status;
        });

    return {
        async unsubscribe() {
            await supabase.removeChannel(channel);
        }
    };
}

export type LobbySyncSnapshot =
    | { status: "success"; lobby: RoomLobby }
    | { status: "absent" }
    | { status: "error"; message: string };

export function createLobbySyncController(options: {
    readLobby: () => Promise<RoomLobby | null>;
    onSnapshot: (snapshot: LobbySyncSnapshot) => void;
    onError?: (message: string) => void;
}) {
    let isDisposed = false;
    let activeRequest: Promise<void> | null = null;
    let hasPendingInvalidation = false;

    async function runRefetch() {
        try {
            const lobby = await options.readLobby();

            if (isDisposed) {
                return;
            }

            options.onSnapshot(lobby ? { status: "success", lobby } : { status: "absent" });
        } catch (error) {
            if (isDisposed) {
                return;
            }

            const message = error instanceof Error ? error.message : GENERIC_ACTIVE_ROOM_ERROR;
            options.onError?.(message);
            options.onSnapshot({ status: "error", message });
        }
    }

    function drain() {
        activeRequest = runRefetch().finally(() => {
            activeRequest = null;

            if (hasPendingInvalidation && !isDisposed) {
                hasPendingInvalidation = false;
                drain();
            }
        });
    }

    return {
        invalidate() {
            if (isDisposed) {
                return;
            }

            if (activeRequest) {
                hasPendingInvalidation = true;
                return;
            }

            drain();
        },
        dispose() {
            isDisposed = true;
            hasPendingInvalidation = false;
        }
    };
}
