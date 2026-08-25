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
            | "get_my_game_state",
        params?: { room_code: string }
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
    participant_is_self?: boolean;
    participant_joined_at: string;
};

export type RoomLobbyParticipant = {
    playerId: string;
    nickname: string;
    isHost: boolean;
    isSelf?: boolean;
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

export type StartRoundDiscussionResult = {
    advanced: boolean;
    alreadyInPhase: boolean;
    state: "discussion";
    roundNumber: number;
};

export type GameSessionState = "role_reveal" | "discussion";

type MyGameStateRow = {
    state: GameSessionState;
    round_number: number;
} & (
    | {
        role: "player";
        word: string;
    }
    | {
        role: "impostor";
        word: null;
    }
);

export type MyPrivateRoundView =
    | {
        role: "player";
        word: string;
    }
    | {
        role: "impostor";
        word: null;
    };

export type MyGameState = {
    state: GameSessionState;
    roundNumber: number;
    privateView: MyPrivateRoundView;
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

function isMyGameStateRow(value: unknown): value is MyGameStateRow {
    const row = value as Partial<MyGameStateRow>;

    if (
        (row.state !== "role_reveal" && row.state !== "discussion") ||
        typeof row.round_number !== "number" ||
        !Number.isInteger(row.round_number) ||
        row.round_number < 1
    ) {
        return false;
    }

    if (row.role === "player") {
        return typeof row.word === "string";
    }

    return row.role === "impostor" && row.word === null;
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

function toMyGameState(row: MyGameStateRow): MyGameState {
    if (row.role === "player") {
        return {
            state: row.state,
            roundNumber: row.round_number,
            privateView: { role: "player", word: row.word }
        };
    }

    return {
        state: row.state,
        roundNumber: row.round_number,
        privateView: { role: "impostor", word: null }
    };
}

function toRoomLobby(rows: RoomLobbyRow[]): RoomLobby {
    const [firstRow] = rows;

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
                joinedAt: row.participant_joined_at
            };

            if (typeof row.participant_is_self === "boolean") {
                participant.isSelf = row.participant_is_self;
            }

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

    channel.subscribe((status, error) => {
        if (isDisposed) {
            return;
        }

        if (status === "SUBSCRIBED") {
            void Promise.resolve(
                channel.track({ playerId: options.currentPlayerId })
            )
                .then(() => {
                    if (!isDisposed) {
                        options.onSubscribed?.();
                    }
                })
                .catch((trackError) => options.onError?.(trackError));
        }

        if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
            options.onError?.(error ?? status);
        }
    });

    return {
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

    return toRoomLobby(rows);
}

export function createCreateRoomController() {
    let activeRequest: Promise<RoomLobby> | null = null;

    return {
        submit(supabase: ImpostorRoomsClient): Promise<RoomLobby> {
            if (activeRequest) {
                return activeRequest;
            }

            activeRequest = createRoom(supabase);

            void activeRequest.finally(() => {
                activeRequest = null;
            });

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

    return toRoomLobby(rows);
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

    return toRoomLobby(rows);
}

export function createJoinRoomByCodeController() {
    let activeRequest: Promise<RoomLobby> | null = null;

    return {
        submit(supabase: ImpostorRoomsClient, roomCode: string): Promise<RoomLobby> {
            if (activeRequest) {
                return activeRequest;
            }

            activeRequest = joinRoomByCode(supabase, roomCode);

            void activeRequest.finally(() => {
                activeRequest = null;
            });

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
