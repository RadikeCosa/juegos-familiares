import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createCreateRoomController,
    createCloseRoomController,
    createHostSuccessionController,
    createJoinRoomByCodeController,
    createLeaveRoomController,
    createLobbySyncController,
    createStartSessionController,
    clearRoomCreationIntent,
    clearRoomJoinIntent,
    closeRoom,
    createRoom,
    getConnectedRoomParticipantIds,
    getMyActiveRoom,
    getMyGameState,
    hasRoomCreationIntent,
    hasRoomJoinIntent,
    joinRoomByCode,
    leaveRoom,
    normalizeRoomJoinCode,
    recordRoomCreationIntent,
    recordRoomJoinIntent,
    reassignRoomHostIfStale,
    ROOM_HOST_SUCCESSION_RECHECK_MS,
    refreshMyRoomLiveness,
    ROOM_LIVENESS_HEARTBEAT_MS,
    startRoomHostSuccessionRecheck,
    startRoomLivenessHeartbeat,
    startRoundDiscussion,
    startRoundVoting,
    startSecondRoundVoting,
    startSession,
    submitImpostorGuess,
    submitRoundVote,
    subscribeToRoomPresence,
    subscribeToRoomChanges
} from "./impostor-rooms";

const singleParticipantRow = {
    room_id: "11111111-1111-4111-8111-111111111111",
    room_join_code: "AB7KQ2M4",
    room_status: "lobby",
    participant_player_id: "player-1",
    participant_nickname: "Ramiro",
    participant_is_host: true,
    participant_joined_at: "2026-08-19T12:00:00.000Z"
};

const startSessionRow = {
    started: true,
    already_started: false,
    room_status: "playing",
    game_session_state: "role_reveal",
    round_number: 1,
    participant_count: 3
};

const gameStatePlayerRow = {
    state: "role_reveal",
    round_number: 1,
    role: "player",
    word: "Tesoro Azul",
    candidates: null,
    my_vote_target_player_id: null,
    has_voted: false,
    vote_results: null
};

const gameStateDiscussionPlayerRow = {
    ...gameStatePlayerRow,
    state: "discussion"
};

const gameStateImpostorRow = {
    state: "role_reveal",
    round_number: 1,
    role: "impostor",
    word: null,
    candidates: null,
    my_vote_target_player_id: null,
    has_voted: false,
    vote_results: null
};

const gameStateVotingRow = {
    state: "voting_first",
    round_number: 1,
    role: "player",
    word: "Tesoro Azul",
    candidates: [
        { player_id: "player-2", nickname: "Pedro" },
        { player_id: "player-3", nickname: "Ana" }
    ],
    my_vote_target_player_id: null,
    has_voted: false,
    vote_results: null
};

const gameStateVotedRow = {
    ...gameStateVotingRow,
    my_vote_target_player_id: "player-2",
    has_voted: true
};

const gameStateTieDiscussionRow = {
    state: "tie_discussion",
    round_number: 1,
    role: "player",
    word: "Tesoro Azul",
    candidates: [
        { player_id: "player-2", nickname: "Pedro" },
        { player_id: "player-3", nickname: "Ana" }
    ],
    my_vote_target_player_id: "player-2",
    has_voted: true,
    vote_results: [
        { player_id: "player-2", nickname: "Pedro", vote_count: 2 },
        { player_id: "player-3", nickname: "Ana", vote_count: 2 }
    ]
};

const gameStateSecondVotingRow = {
    state: "voting_second",
    round_number: 1,
    role: "player",
    word: "Tesoro Azul",
    candidates: [
        { player_id: "player-3", nickname: "Ana" }
    ],
    my_vote_target_player_id: null,
    has_voted: false,
    vote_results: null
};

const gameStateImpostorGuessRow = {
    state: "impostor_guess",
    round_number: 1,
    role: "impostor",
    word: null,
    candidates: null,
    my_vote_target_player_id: "player-1",
    has_voted: true,
    vote_results: [{ player_id: "player-2", nickname: "Pedro", vote_count: 3 }],
    can_submit_impostor_guess: true,
    winner: null,
    impostor_guess_text: null,
    impostor_guess_correct: null
};

const gameStateWaitingForImpostorGuessRow = {
    ...gameStateImpostorGuessRow,
    role: "player",
    word: null,
    can_submit_impostor_guess: false
};

const gameStateRoundResultWithGuessRow = {
    state: "round_result",
    round_number: 1,
    role: "impostor",
    word: "Tesoro Azul",
    candidates: null,
    my_vote_target_player_id: "player-1",
    has_voted: true,
    vote_results: [{ player_id: "player-2", nickname: "Pedro", vote_count: 3 }],
    can_submit_impostor_guess: false,
    winner: "group",
    impostor_guess_text: "Mapa Verde",
    impostor_guess_correct: false
};

const gameStateRoundResultWithoutGuessRow = {
    ...gameStateRoundResultWithGuessRow,
    role: "player",
    word: "Tesoro Azul",
    winner: "impostor",
    impostor_guess_text: null,
    impostor_guess_correct: null
};

const startRoundDiscussionRow = {
    advanced: true,
    already_in_phase: false,
    state: "discussion",
    round_number: 1
};

const startRoundVotingRow = {
    advanced: true,
    already_in_phase: false,
    state: "voting_first",
    round_number: 1
};

const startSecondRoundVotingRow = {
    advanced: true,
    already_in_phase: false,
    state: "voting_second",
    round_number: 1
};

const submitRoundVoteRow = {
    accepted: true,
    already_recorded: false,
    state: "voting_first",
    round_number: 1
};

const submitSecondRoundVoteRow = {
    ...submitRoundVoteRow,
    state: "voting_second"
};

const submitImpostorGuessRow = {
    accepted: true,
    already_recorded: false,
    state: "round_result",
    round_number: 1,
    is_correct: true,
    winner: "impostor"
};

describe("createRoom", () => {
    it("calls the authoritative RPC without ownership arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return {
                    data: [singleParticipantRow],
                    error: null
                };
            })
        };

        await expect(createRoom(supabase)).resolves.toEqual({
            room: {
                id: "11111111-1111-4111-8111-111111111111",
                code: "AB7KQ2M4",
                status: "lobby"
            },
            participants: [{ playerId: "player-1", nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" }]
        });

        expect(supabase.rpc).toHaveBeenCalledWith("create_room");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("does not expose internal identifiers in the returned lobby", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [singleParticipantRow],
                error: null
            }))
        };

        const lobby = await createRoom(supabase);

        expect(lobby.participants[0].playerId).toBe("player-1");
        expect(JSON.stringify(lobby)).not.toMatch(/player_id|group_id|auth_user_id|host_player_id/);
    });

    it("surfaces unauthenticated calls with safe product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: null,
                error: { code: "28000" }
            }))
        };

        await expect(createRoom(supabase)).rejects.toThrow(
            "Necesitás entrar a tu grupo antes de crear una sala."
        );
    });

    it("surfaces missing execute grants (anon) as the same unauthenticated feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: null,
                error: { code: "42501" }
            }))
        };

        await expect(createRoom(supabase)).rejects.toThrow(
            "Necesitás entrar a tu grupo antes de crear una sala."
        );
    });

    it("surfaces missing Player context with safe product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: null,
                error: { code: "P0002" }
            }))
        };

        await expect(createRoom(supabase)).rejects.toThrow(
            "No pudimos reconocer tu jugador para crear la sala."
        );
    });

    it("keeps unexpected failures generic", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: null,
                error: new Error("network")
            }))
        };

        await expect(createRoom(supabase)).rejects.toThrow(
            "No pudimos crear la sala. Intentá de nuevo."
        );
    });

    it("rejects empty RPC results explicitly", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [],
                error: null
            }))
        };

        await expect(createRoom(supabase)).rejects.toThrow(
            "No pudimos confirmar que la sala fue creada."
        );
    });
});

describe("createCreateRoomController", () => {
    it("collapses concurrent submissions into a single in-flight RPC call", async () => {
        let resolveRpc: (value: { data: unknown; error: unknown }) => void = () => { };
        const rpcPromise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
            resolveRpc = resolve;
        });
        const supabase = {
            rpc: vi.fn(() => rpcPromise)
        };

        const controller = createCreateRoomController();
        const firstSubmit = controller.submit(supabase);
        const secondSubmit = controller.submit(supabase);

        resolveRpc({ data: [singleParticipantRow], error: null });

        const [firstResult, secondResult] = await Promise.all([firstSubmit, secondSubmit]);

        expect(supabase.rpc).toHaveBeenCalledTimes(1);
        expect(firstResult).toEqual(secondResult);
    });

    it("allows a new submission after the previous one settles", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [singleParticipantRow],
                error: null
            }))
        };

        const controller = createCreateRoomController();

        await controller.submit(supabase);
        await controller.submit(supabase);

        expect(supabase.rpc).toHaveBeenCalledTimes(2);
    });
});

function createSessionStorage() {
    const values = new Map<string, string>();

    return {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
            values.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
            values.delete(key);
        })
    };
}

function useSessionStorage() {
    const sessionStorage = createSessionStorage();

    vi.stubGlobal("window", { sessionStorage });

    return sessionStorage;
}

describe("room creation intent", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("has no intent before a Room is created", () => {
        useSessionStorage();

        expect(hasRoomCreationIntent("AB7KQ2M4")).toBe(false);
    });

    it("recognizes intent only for the exact code that was just created", () => {
        useSessionStorage();

        recordRoomCreationIntent("AB7KQ2M4");

        expect(hasRoomCreationIntent("AB7KQ2M4")).toBe(true);
        expect(hasRoomCreationIntent("ZZZZZZZZ")).toBe(false);
    });

    it("has no intent when there is no browser storage available", () => {
        vi.stubGlobal("window", undefined);

        expect(() => recordRoomCreationIntent("AB7KQ2M4")).not.toThrow();
        expect(hasRoomCreationIntent("AB7KQ2M4")).toBe(false);
    });
});

describe("normalizeRoomJoinCode", () => {
    it("trims whitespace and uppercases the code", () => {
        expect(normalizeRoomJoinCode("  ab7kq2m4  ")).toBe("AB7KQ2M4");
    });
});

describe("one-shot room intents", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("clears a creation intent only for the matching code", () => {
        useSessionStorage();

        recordRoomCreationIntent("AB7KQ2M4");
        clearRoomCreationIntent("ZZZZZZZZ");
        expect(hasRoomCreationIntent("AB7KQ2M4")).toBe(true);

        clearRoomCreationIntent("AB7KQ2M4");
        expect(hasRoomCreationIntent("AB7KQ2M4")).toBe(false);
    });

    it("clears a join intent only for the matching code", () => {
        useSessionStorage();

        recordRoomJoinIntent("AB7KQ2M4");
        clearRoomJoinIntent("ZZZZZZZZ");
        expect(hasRoomJoinIntent("AB7KQ2M4")).toBe(true);

        clearRoomJoinIntent("AB7KQ2M4");
        expect(hasRoomJoinIntent("AB7KQ2M4")).toBe(false);
    });
});

describe("joinRoomByCode", () => {
    it("sends only the normalized room_code as product input", async () => {
        const supabase = {
            rpc: vi.fn(async (
                _fn: string,
                _params?: { room_code: string } | { target_player_id: string } | { guess_text: string }
            ) => {
                void _fn;
                void _params;

                return {
                    data: [singleParticipantRow],
                    error: null
                };
            })
        };

        await expect(joinRoomByCode(supabase, " ab7kq2m4 ")).resolves.toEqual({
            room: {
                id: "11111111-1111-4111-8111-111111111111",
                code: "AB7KQ2M4",
                status: "lobby"
            },
            participants: [{ playerId: "player-1", nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" }]
        });

        expect(supabase.rpc).toHaveBeenCalledWith("join_room_by_code", {
            room_code: "AB7KQ2M4"
        });
    });

    it("does not expose internal identifiers in the returned lobby", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [singleParticipantRow],
                error: null
            }))
        };

        const lobby = await joinRoomByCode(supabase, "AB7KQ2M4");

        expect(JSON.stringify(lobby)).not.toMatch(/player_id|group_id|auth_user_id|host_player_id/);
    });

    it("surfaces unauthenticated calls with safe product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "28000" } }))
        };

        await expect(joinRoomByCode(supabase, "AB7KQ2M4")).rejects.toThrow(
            "Necesitás entrar a tu grupo antes de unirte a una sala."
        );
    });

    it("surfaces missing Player context with safe product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0002" } }))
        };

        await expect(joinRoomByCode(supabase, "AB7KQ2M4")).rejects.toThrow(
            "No pudimos reconocer tu jugador para unirte a la sala."
        );
    });

    it("does not distinguish a nonexistent code from a code of another Group", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0010" } }))
        };

        await expect(joinRoomByCode(supabase, "AB7KQ2M4")).rejects.toThrow(
            "No encontramos esa sala. Revisá el código e intentá de nuevo."
        );
    });

    it("surfaces a closed Room with safe product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0011" } }))
        };

        await expect(joinRoomByCode(supabase, "AB7KQ2M4")).rejects.toThrow(
            "Esta sala ya no está disponible."
        );
    });

    it("surfaces an existing active Room elsewhere with safe product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0012" } }))
        };

        await expect(joinRoomByCode(supabase, "AB7KQ2M4")).rejects.toThrow(
            "Ya estás en otra sala."
        );
    });

    it("keeps unexpected failures generic", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: new Error("network") }))
        };

        await expect(joinRoomByCode(supabase, "AB7KQ2M4")).rejects.toThrow(
            "No pudimos unirte a la sala. Intentá de nuevo."
        );
    });
});

describe("getMyActiveRoom", () => {
    it("calls the authoritative RPC without room, player or group arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return {
                    data: [singleParticipantRow],
                    error: null
                };
            })
        };

        await expect(getMyActiveRoom(supabase)).resolves.toEqual({
            room: {
                id: "11111111-1111-4111-8111-111111111111",
                code: "AB7KQ2M4",
                status: "lobby"
            },
            participants: [{ playerId: "player-1", nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" }]
        });

        expect(supabase.rpc).toHaveBeenCalledWith("get_my_active_room");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("returns null when the recognized Player has no active Room", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [],
                error: null
            }))
        };

        await expect(getMyActiveRoom(supabase)).resolves.toBeNull();
    });

    it("does not expose internal identifiers in the returned lobby", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [singleParticipantRow],
                error: null
            }))
        };

        const lobby = await getMyActiveRoom(supabase);

        expect(JSON.stringify(lobby)).not.toMatch(/player_id|group_id|auth_user_id|host_player_id/);
    });

    it("surfaces missing Player context with safe product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0002" } }))
        };

        await expect(getMyActiveRoom(supabase)).rejects.toThrow(
            "No pudimos reconocer tu jugador para recuperar la sala."
        );
    });

    it("surfaces inconsistent remote Room state distinctly from no active Room", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0014" } }))
        };

        await expect(getMyActiveRoom(supabase)).rejects.toThrow(
            "No pudimos reconstruir tu sala activa. Volvé a intentar más tarde."
        );
    });

    it("rejects malformed non-empty RPC results explicitly", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{ room_join_code: "AB7KQ2M4" }],
                error: null
            }))
        };

        await expect(getMyActiveRoom(supabase)).rejects.toThrow(
            "No pudimos confirmar tu sala activa."
        );
    });
});

describe("createJoinRoomByCodeController", () => {
    it("collapses concurrent submissions into a single in-flight RPC call", async () => {
        let resolveRpc: (value: { data: unknown; error: unknown }) => void = () => { };
        const rpcPromise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
            resolveRpc = resolve;
        });
        const supabase = {
            rpc: vi.fn(() => rpcPromise)
        };

        const controller = createJoinRoomByCodeController();
        const firstSubmit = controller.submit(supabase, "AB7KQ2M4");
        const secondSubmit = controller.submit(supabase, "AB7KQ2M4");

        resolveRpc({ data: [singleParticipantRow], error: null });

        const [firstResult, secondResult] = await Promise.all([firstSubmit, secondSubmit]);

        expect(supabase.rpc).toHaveBeenCalledTimes(1);
        expect(firstResult).toEqual(secondResult);
    });

    it("allows a new submission after the previous one settles", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: [singleParticipantRow], error: null }))
        };

        const controller = createJoinRoomByCodeController();

        await controller.submit(supabase, "AB7KQ2M4");
        await controller.submit(supabase, "AB7KQ2M4");

        expect(supabase.rpc).toHaveBeenCalledTimes(2);
    });
});

describe("room join intent", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("has no intent before a Room is joined", () => {
        useSessionStorage();

        expect(hasRoomJoinIntent("AB7KQ2M4")).toBe(false);
    });

    it("recognizes intent only for the exact code that was just joined", () => {
        useSessionStorage();

        recordRoomJoinIntent("AB7KQ2M4");

        expect(hasRoomJoinIntent("AB7KQ2M4")).toBe(true);
        expect(hasRoomJoinIntent("ZZZZZZZZ")).toBe(false);
    });

    it("has no intent when there is no browser storage available", () => {
        vi.stubGlobal("window", undefined);

        expect(() => recordRoomJoinIntent("AB7KQ2M4")).not.toThrow();
        expect(hasRoomJoinIntent("AB7KQ2M4")).toBe(false);
    });
});

function createDeferred<T>() {
    let resolve: (value: T) => void = () => { };
    let reject: (error: unknown) => void = () => { };
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });

    return { promise, resolve, reject };
}

describe("subscribeToRoomChanges", () => {
    it("subscribes only to the current Room membership inserts/deletes and Room updates", () => {
        const callbacks: Array<(payload: unknown) => void> = [];
        const channel = {
            on: vi.fn((_type, _filter, callback) => {
                callbacks.push(callback);
                return channel;
            }),
            subscribe: vi.fn(() => channel)
        };
        const supabase = {
            channel: vi.fn(() => channel),
            removeChannel: vi.fn(async () => "ok")
        };
        const onInvalidate = vi.fn();

        subscribeToRoomChanges(
            supabase,
            "11111111-1111-4111-8111-111111111111",
            onInvalidate
        );

        expect(supabase.channel).toHaveBeenCalledWith(
            "impostor-room:11111111-1111-4111-8111-111111111111"
        );
        expect(channel.on).toHaveBeenCalledWith(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "room_participants",
                filter: "room_id=eq.11111111-1111-4111-8111-111111111111"
            },
            expect.any(Function)
        );
        expect(channel.on).toHaveBeenCalledWith(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "room_participants",
                filter: "room_id=eq.11111111-1111-4111-8111-111111111111"
            },
            expect.any(Function)
        );
        expect(channel.on).toHaveBeenCalledWith(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "rooms",
                filter: "id=eq.11111111-1111-4111-8111-111111111111"
            },
            expect.any(Function)
        );

        callbacks[0]({ new: { participant_nickname: "Pedro" } });
        callbacks[1]({ old: { room_id: "11111111-1111-4111-8111-111111111111" } });

        expect(onInvalidate).toHaveBeenCalledTimes(2);
    });

    it("invalidates on reconnect and removes the channel on cleanup", async () => {
        let subscribeCallback: ((status: "SUBSCRIBED" | "TIMED_OUT") => void) | undefined;
        const channel = {
            on: vi.fn(() => channel),
            subscribe: vi.fn((callback) => {
                subscribeCallback = callback;
                return channel;
            })
        };
        const supabase = {
            channel: vi.fn(() => channel),
            removeChannel: vi.fn(async () => "ok")
        };
        const onInvalidate = vi.fn();

        const subscription = subscribeToRoomChanges(
            supabase,
            "11111111-1111-4111-8111-111111111111",
            onInvalidate
        );

        subscribeCallback?.("SUBSCRIBED");
        subscribeCallback?.("TIMED_OUT");
        subscribeCallback?.("SUBSCRIBED");
        await subscription.unsubscribe();

        expect(onInvalidate).toHaveBeenCalledTimes(1);
        expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });
});

describe("leaveRoom", () => {
    it("calls the authoritative RPC without room, player or group arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return { data: null, error: null };
            })
        };

        await expect(leaveRoom(supabase)).resolves.toBeUndefined();

        expect(supabase.rpc).toHaveBeenCalledWith("leave_room");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("maps leave failures to product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0002" } }))
        };

        await expect(leaveRoom(supabase)).rejects.toThrow(
            "No pudimos reconocer tu jugador para salir de la sala."
        );
    });
});

describe("closeRoom", () => {
    it("calls the authoritative RPC without room, player or group arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return { data: null, error: null };
            })
        };

        await expect(closeRoom(supabase)).resolves.toBeUndefined();

        expect(supabase.rpc).toHaveBeenCalledWith("close_room");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("maps non-host close to product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0016" } }))
        };

        await expect(closeRoom(supabase)).rejects.toThrow(
            "Solo el host puede cerrar la sala."
        );
    });

    it("maps missing active Room close to product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0015" } }))
        };

        await expect(closeRoom(supabase)).rejects.toThrow(
            "Ya no tenés una sala activa para cerrar."
        );
    });
});

describe("startSession", () => {
    it("calls the authoritative RPC without room, player, host or word arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return { data: [startSessionRow], error: null };
            })
        };

        await expect(startSession(supabase)).resolves.toEqual({
            started: true,
            alreadyStarted: false,
            roomStatus: "playing",
            gameSessionState: "role_reveal",
            roundNumber: 1,
            participantCount: 3
        });

        expect(supabase.rpc).toHaveBeenCalledWith("start_session");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("does not expose secret-bearing fields in the returned result", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...startSessionRow,
                    secret_word: "Tesoro",
                    normalized_secret_word: "tesoro",
                    impostor_player_id: "player-1"
                }],
                error: null
            }))
        };

        const result = await startSession(supabase);

        expect(JSON.stringify(result)).not.toMatch(/secret_word|normalized_secret_word|impostor_player_id|Tesoro/);
    });

    it("maps idempotent start responses", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...startSessionRow,
                    started: false,
                    already_started: true
                }],
                error: null
            }))
        };

        await expect(startSession(supabase)).resolves.toEqual({
            started: false,
            alreadyStarted: true,
            roomStatus: "playing",
            gameSessionState: "role_reveal",
            roundNumber: 1,
            participantCount: 3
        });
    });

    it("maps start failures to product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0020" } }))
        };

        await expect(startSession(supabase)).rejects.toThrow(
            "Necesitás al menos 3 participantes activos para iniciar."
        );
    });

    it("rejects malformed RPC results explicitly", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{ started: true }],
                error: null
            }))
        };

        await expect(startSession(supabase)).rejects.toThrow(
            "No pudimos confirmar el inicio de la tanda."
        );
    });
});

describe("createStartSessionController", () => {
    it("collapses concurrent submissions into a single in-flight RPC call", async () => {
        let resolveRpc: (value: { data: unknown; error: unknown }) => void = () => { };
        const rpcPromise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
            resolveRpc = resolve;
        });
        const supabase = {
            rpc: vi.fn(() => rpcPromise)
        };

        const controller = createStartSessionController();
        const firstSubmit = controller.submit(supabase);
        const secondSubmit = controller.submit(supabase);

        resolveRpc({ data: [startSessionRow], error: null });

        const [firstResult, secondResult] = await Promise.all([firstSubmit, secondSubmit]);

        expect(supabase.rpc).toHaveBeenCalledTimes(1);
        expect(firstResult).toEqual(secondResult);
    });
});

describe("getMyGameState", () => {
    it("calls the authoritative RPC without room, session, player or round arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return { data: [gameStatePlayerRow], error: null };
            })
        };

        await expect(getMyGameState(supabase)).resolves.toEqual({
            state: "role_reveal",
            roundNumber: 1,
            privateView: { role: "player", word: "Tesoro Azul" },
            candidates: null,
            voting: null,
            voteResults: null
        });

        expect(supabase.rpc).toHaveBeenCalledWith("get_my_game_state");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("returns null when gameplay has not started for the caller", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: [], error: null }))
        };

        await expect(getMyGameState(supabase)).resolves.toBeNull();
    });

    it("maps an impostor private view without a word", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: [gameStateImpostorRow], error: null }))
        };

        await expect(getMyGameState(supabase)).resolves.toEqual({
            state: "role_reveal",
            roundNumber: 1,
            privateView: { role: "impostor", word: null },
            candidates: null,
            voting: null,
            voteResults: null
        });
    });

    it("maps discussion state without changing the private view contract", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [gameStateDiscussionPlayerRow],
                error: null
            }))
        };

        await expect(getMyGameState(supabase)).resolves.toEqual({
            state: "discussion",
            roundNumber: 1,
            privateView: { role: "player", word: "Tesoro Azul" },
            candidates: null,
            voting: null,
            voteResults: null
        });
    });

    it("maps voting_first candidates and only the caller vote status", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: [gameStateVotingRow], error: null }))
        };

        await expect(getMyGameState(supabase)).resolves.toEqual({
            state: "voting_first",
            roundNumber: 1,
            privateView: { role: "player", word: "Tesoro Azul" },
            candidates: [
                { playerId: "player-2", nickname: "Pedro" },
                { playerId: "player-3", nickname: "Ana" }
            ],
            voting: {
                candidates: [
                    { playerId: "player-2", nickname: "Pedro" },
                    { playerId: "player-3", nickname: "Ana" }
                ],
                myVoteTargetPlayerId: null,
                hasVoted: false
            },
            voteResults: null
        });
    });

    it("maps the caller's registered vote without exposing partial counts", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: [gameStateVotedRow], error: null }))
        };

        const state = await getMyGameState(supabase);

        expect(state?.voting).toEqual({
            candidates: [
                { playerId: "player-2", nickname: "Pedro" },
                { playerId: "player-3", nickname: "Ana" }
            ],
            myVoteTargetPlayerId: "player-2",
            hasVoted: true
        });
        expect(state?.candidates).toEqual([
            { playerId: "player-2", nickname: "Pedro" },
            { playerId: "player-3", nickname: "Ana" }
        ]);
        expect(state?.voteResults).toBeNull();
    });

    it("maps aggregate post-resolution vote results", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: [gameStateTieDiscussionRow], error: null }))
        };

        await expect(getMyGameState(supabase)).resolves.toMatchObject({
            state: "tie_discussion",
            candidates: [
                { playerId: "player-2", nickname: "Pedro" },
                { playerId: "player-3", nickname: "Ana" }
            ],
            voting: null,
            voteResults: [
                { playerId: "player-2", nickname: "Pedro", voteCount: 2 },
                { playerId: "player-3", nickname: "Ana", voteCount: 2 }
            ]
        });
    });

    it("maps voting_second candidates and only the caller second-round vote status", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: [gameStateSecondVotingRow], error: null }))
        };

        await expect(getMyGameState(supabase)).resolves.toEqual({
            state: "voting_second",
            roundNumber: 1,
            privateView: { role: "player", word: "Tesoro Azul" },
            candidates: [{ playerId: "player-3", nickname: "Ana" }],
            voting: {
                candidates: [{ playerId: "player-3", nickname: "Ana" }],
                myVoteTargetPlayerId: null,
                hasVoted: false
            },
            voteResults: null
        });
    });

    it("maps impostor_guess without a secret word", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: [gameStateImpostorGuessRow], error: null }))
        };

        await expect(getMyGameState(supabase)).resolves.toMatchObject({
            state: "impostor_guess",
            privateView: { role: "impostor", word: null },
            voteResults: [{ playerId: "player-2", nickname: "Pedro", voteCount: 3 }],
            impostorGuess: { canSubmit: true }
        });
    });

    it("maps non-impostor waiting state without revealing the secret word", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [gameStateWaitingForImpostorGuessRow],
                error: null
            }))
        };

        await expect(getMyGameState(supabase)).resolves.toMatchObject({
            state: "impostor_guess",
            privateView: { role: "player", word: null },
            impostorGuess: { canSubmit: false }
        });
    });

    it("maps round_result with revealed word and impostor guess outcome", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [gameStateRoundResultWithGuessRow],
                error: null
            }))
        };

        await expect(getMyGameState(supabase)).resolves.toMatchObject({
            state: "round_result",
            privateView: { role: "impostor", word: "Tesoro Azul" },
            roundResult: {
                winner: "group",
                impostorGuessText: "Mapa Verde",
                impostorGuessCorrect: false
            }
        });
    });

    it("maps round_result without guess for incorrect accusation paths", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [gameStateRoundResultWithoutGuessRow],
                error: null
            }))
        };

        await expect(getMyGameState(supabase)).resolves.toMatchObject({
            state: "round_result",
            privateView: { role: "player", word: "Tesoro Azul" },
            roundResult: {
                winner: "impostor",
                impostorGuessText: null,
                impostorGuessCorrect: null
            }
        });
    });

    it("maps game-state domain failures to product-level feedback", async () => {
        const inconsistent = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0022" } }))
        };
        const excluded = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0023" } }))
        };

        await expect(getMyGameState(inconsistent)).rejects.toThrow(
            "No pudimos reconstruir la tanda. Volvé a intentar más tarde."
        );
        await expect(getMyGameState(excluded)).rejects.toThrow(
            "No participás de la tanda actual."
        );
    });

    it("rejects malformed private views explicitly", async () => {
        const impostorWithWord = {
            rpc: vi.fn(async () => ({
                data: [{ ...gameStateImpostorRow, word: "Tesoro Azul" }],
                error: null
            }))
        };
        const playerWithoutWord = {
            rpc: vi.fn(async () => ({
                data: [{ ...gameStatePlayerRow, word: null }],
                error: null
            }))
        };
        const unknownRole = {
            rpc: vi.fn(async () => ({
                data: [{ ...gameStatePlayerRow, role: "spectator" }],
                error: null
            }))
        };
        const invalidRoundNumber = {
            rpc: vi.fn(async () => ({
                data: [{ ...gameStatePlayerRow, round_number: 0 }],
                error: null
            }))
        };
        const unknownState = {
            rpc: vi.fn(async () => ({
                data: [{ ...gameStatePlayerRow, state: "scoreboard" }],
                error: null
            }))
        };
        const votingWithoutCandidates = {
            rpc: vi.fn(async () => ({
                data: [{ ...gameStateVotingRow, candidates: null }],
                error: null
            }))
        };
        const votingWithVoteResults = {
            rpc: vi.fn(async () => ({
                data: [{ ...gameStateVotingRow, vote_results: [{ player_id: "player-2", nickname: "Pedro", vote_count: 1 }] }],
                error: null
            }))
        };

        await expect(getMyGameState(impostorWithWord)).rejects.toThrow(
            "No pudimos confirmar el estado de la tanda."
        );
        await expect(getMyGameState(playerWithoutWord)).rejects.toThrow(
            "No pudimos confirmar el estado de la tanda."
        );
        await expect(getMyGameState(unknownRole)).rejects.toThrow(
            "No pudimos confirmar el estado de la tanda."
        );
        await expect(getMyGameState(invalidRoundNumber)).rejects.toThrow(
            "No pudimos confirmar el estado de la tanda."
        );
        await expect(getMyGameState(unknownState)).rejects.toThrow(
            "No pudimos confirmar el estado de la tanda."
        );
        await expect(getMyGameState(votingWithoutCandidates)).rejects.toThrow(
            "No pudimos confirmar el estado de la tanda."
        );
        await expect(getMyGameState(votingWithVoteResults)).rejects.toThrow(
            "No pudimos confirmar el estado de la tanda."
        );
    });

    it("does not expose secret internals in mapped results", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...gameStatePlayerRow,
                    normalized_secret_word: "tesoro azul",
                    impostor_player_id: "player-3"
                }],
                error: null
            }))
        };

        const result = await getMyGameState(supabase);

        expect(JSON.stringify(result)).not.toMatch(/normalized_secret_word|impostor_player_id|player-3/);
    });
});

describe("startRoundDiscussion", () => {
    it("calls the authoritative RPC without room, session, host or round arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return { data: [startRoundDiscussionRow], error: null };
            })
        };

        await expect(startRoundDiscussion(supabase)).resolves.toEqual({
            advanced: true,
            alreadyInPhase: false,
            state: "discussion",
            roundNumber: 1
        });

        expect(supabase.rpc).toHaveBeenCalledWith("start_round_discussion");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("maps idempotent discussion responses", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...startRoundDiscussionRow,
                    advanced: false,
                    already_in_phase: true
                }],
                error: null
            }))
        };

        await expect(startRoundDiscussion(supabase)).resolves.toEqual({
            advanced: false,
            alreadyInPhase: true,
            state: "discussion",
            roundNumber: 1
        });
    });

    it("maps start discussion failures to product-level feedback", async () => {
        const notHost = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0019" } }))
        };
        const excluded = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0023" } }))
        };

        await expect(startRoundDiscussion(notHost)).rejects.toThrow(
            "Solo el host actual puede empezar la ronda."
        );
        await expect(startRoundDiscussion(excluded)).rejects.toThrow(
            "No participás de la tanda actual."
        );
    });

    it("rejects malformed transition responses explicitly", async () => {
        const wrongState = {
            rpc: vi.fn(async () => ({
                data: [{ ...startRoundDiscussionRow, state: "role_reveal" }],
                error: null
            }))
        };
        const invalidRoundNumber = {
            rpc: vi.fn(async () => ({
                data: [{ ...startRoundDiscussionRow, round_number: 0 }],
                error: null
            }))
        };

        await expect(startRoundDiscussion(wrongState)).rejects.toThrow(
            "No pudimos confirmar el comienzo de la ronda."
        );
        await expect(startRoundDiscussion(invalidRoundNumber)).rejects.toThrow(
            "No pudimos confirmar el comienzo de la ronda."
        );
    });

    it("does not expose secret internals in mapped results", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...startRoundDiscussionRow,
                    secret_word: "Tesoro",
                    normalized_secret_word: "tesoro",
                    impostor_player_id: "player-1"
                }],
                error: null
            }))
        };

        const result = await startRoundDiscussion(supabase);

        expect(JSON.stringify(result)).not.toMatch(/secret_word|normalized_secret_word|impostor_player_id|Tesoro/);
    });
});

describe("startRoundVoting", () => {
    it("calls the authoritative RPC without room, session, host, round or player arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return { data: [startRoundVotingRow], error: null };
            })
        };

        await expect(startRoundVoting(supabase)).resolves.toEqual({
            advanced: true,
            alreadyInPhase: false,
            state: "voting_first",
            roundNumber: 1
        });

        expect(supabase.rpc).toHaveBeenCalledWith("start_round_voting");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("maps idempotent voting responses", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...startRoundVotingRow,
                    advanced: false,
                    already_in_phase: true
                }],
                error: null
            }))
        };

        await expect(startRoundVoting(supabase)).resolves.toEqual({
            advanced: false,
            alreadyInPhase: true,
            state: "voting_first",
            roundNumber: 1
        });
    });

    it("maps start voting failures to product-level feedback", async () => {
        const notHost = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0019" } }))
        };
        const excluded = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0023" } }))
        };
        const invalidPhase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0018" } }))
        };

        await expect(startRoundVoting(notHost)).rejects.toThrow(
            "Solo el host actual puede ir a votación."
        );
        await expect(startRoundVoting(excluded)).rejects.toThrow(
            "No participás de la tanda actual."
        );
        await expect(startRoundVoting(invalidPhase)).rejects.toThrow(
            "Esta ronda no se puede votar ahora."
        );
    });

    it("rejects malformed voting transition responses explicitly", async () => {
        const wrongState = {
            rpc: vi.fn(async () => ({
                data: [{ ...startRoundVotingRow, state: "discussion" }],
                error: null
            }))
        };
        const invalidRoundNumber = {
            rpc: vi.fn(async () => ({
                data: [{ ...startRoundVotingRow, round_number: 0 }],
                error: null
            }))
        };

        await expect(startRoundVoting(wrongState)).rejects.toThrow(
            "No pudimos confirmar el inicio de la votación."
        );
        await expect(startRoundVoting(invalidRoundNumber)).rejects.toThrow(
            "No pudimos confirmar el inicio de la votación."
        );
    });

    it("does not expose secret internals in mapped results", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...startRoundVotingRow,
                    secret_word: "Tesoro",
                    normalized_secret_word: "tesoro",
                    impostor_player_id: "player-1",
                    round_votes: [{ voter_player_id: "player-1" }]
                }],
                error: null
            }))
        };

        const result = await startRoundVoting(supabase);

        expect(JSON.stringify(result)).not.toMatch(/secret_word|normalized_secret_word|impostor_player_id|round_votes|Tesoro|player-1/);
    });
});

describe("startSecondRoundVoting", () => {
    it("calls the authoritative RPC without room, session, host, round or player arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return { data: [startSecondRoundVotingRow], error: null };
            })
        };

        await expect(startSecondRoundVoting(supabase)).resolves.toEqual({
            advanced: true,
            alreadyInPhase: false,
            state: "voting_second",
            roundNumber: 1
        });

        expect(supabase.rpc).toHaveBeenCalledWith("start_second_round_voting");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("maps idempotent second voting responses", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...startSecondRoundVotingRow,
                    advanced: false,
                    already_in_phase: true
                }],
                error: null
            }))
        };

        await expect(startSecondRoundVoting(supabase)).resolves.toEqual({
            advanced: false,
            alreadyInPhase: true,
            state: "voting_second",
            roundNumber: 1
        });
    });

    it("maps start second voting failures to product-level feedback", async () => {
        const notHost = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0019" } }))
        };
        const excluded = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0023" } }))
        };
        const invalidPhase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0018" } }))
        };

        await expect(startSecondRoundVoting(notHost)).rejects.toThrow(
            "Solo el host actual puede ir a segunda votación."
        );
        await expect(startSecondRoundVoting(excluded)).rejects.toThrow(
            "No participás de la tanda actual."
        );
        await expect(startSecondRoundVoting(invalidPhase)).rejects.toThrow(
            "Esta ronda no se puede llevar a segunda votación ahora."
        );
    });

    it("rejects malformed second voting transition responses explicitly", async () => {
        const wrongState = {
            rpc: vi.fn(async () => ({
                data: [{ ...startSecondRoundVotingRow, state: "tie_discussion" }],
                error: null
            }))
        };
        const invalidRoundNumber = {
            rpc: vi.fn(async () => ({
                data: [{ ...startSecondRoundVotingRow, round_number: 0 }],
                error: null
            }))
        };

        await expect(startSecondRoundVoting(wrongState)).rejects.toThrow(
            "No pudimos confirmar el inicio de la segunda votación."
        );
        await expect(startSecondRoundVoting(invalidRoundNumber)).rejects.toThrow(
            "No pudimos confirmar el inicio de la segunda votación."
        );
    });

    it("does not expose secret internals in mapped results", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...startSecondRoundVotingRow,
                    secret_word: "Tesoro",
                    normalized_secret_word: "tesoro",
                    impostor_player_id: "player-1",
                    round_votes: [{ voter_player_id: "player-1" }]
                }],
                error: null
            }))
        };

        const result = await startSecondRoundVoting(supabase);

        expect(JSON.stringify(result)).not.toMatch(/secret_word|normalized_secret_word|impostor_player_id|round_votes|Tesoro|player-1/);
    });
});

describe("submitRoundVote", () => {
    it("calls the authoritative RPC with only target_player_id", async () => {
        const supabase = {
            rpc: vi.fn(async (
                _fn: string,
                _params?: { room_code: string } | { target_player_id: string } | { guess_text: string }
            ) => {
                void _fn;
                void _params;

                return { data: [submitRoundVoteRow], error: null };
            })
        };

        await expect(submitRoundVote(supabase, "player-2")).resolves.toEqual({
            accepted: true,
            alreadyRecorded: false,
            state: "voting_first",
            roundNumber: 1
        });

        expect(supabase.rpc).toHaveBeenCalledWith("submit_round_vote", {
            target_player_id: "player-2"
        });
        expect(supabase.rpc.mock.calls[0]).toHaveLength(2);
        expect(JSON.stringify(supabase.rpc.mock.calls[0][1])).not.toMatch(
            /room_id|game_session_id|round_id|voter_player_id|group_id|auth_user_id|voting_round/
        );
    });

    it("maps idempotent and resolved vote responses", async () => {
        const idempotent = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...submitRoundVoteRow,
                    already_recorded: true,
                    state: "impostor_guess"
                }],
                error: null
            }))
        };
        const tie = {
            rpc: vi.fn(async () => ({
                data: [{ ...submitRoundVoteRow, state: "tie_discussion" }],
                error: null
            }))
        };
        const roundResult = {
            rpc: vi.fn(async () => ({
                data: [{ ...submitRoundVoteRow, state: "round_result" }],
                error: null
            }))
        };
        const secondVoting = {
            rpc: vi.fn(async () => ({
                data: [submitSecondRoundVoteRow],
                error: null
            }))
        };

        await expect(submitRoundVote(idempotent, "player-2")).resolves.toEqual({
            accepted: true,
            alreadyRecorded: true,
            state: "impostor_guess",
            roundNumber: 1
        });
        await expect(submitRoundVote(tie, "player-2")).resolves.toMatchObject({
            state: "tie_discussion"
        });
        await expect(submitRoundVote(roundResult, "player-2")).resolves.toMatchObject({
            state: "round_result"
        });
        await expect(submitRoundVote(secondVoting, "player-2")).resolves.toEqual({
            accepted: true,
            alreadyRecorded: false,
            state: "voting_second",
            roundNumber: 1
        });
    });

    it("maps submit vote failures to product-level feedback", async () => {
        const invalidTarget = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0024" } }))
        };
        const alreadyVoted = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0025" } }))
        };
        const invalidPhase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0018" } }))
        };
        const excluded = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0023" } }))
        };

        await expect(submitRoundVote(invalidTarget, "player-2")).rejects.toThrow(
            "Elegí otro jugador válido para votar."
        );
        await expect(submitRoundVote(alreadyVoted, "player-2")).rejects.toThrow(
            "Tu voto ya fue registrado y no se puede cambiar."
        );
        await expect(submitRoundVote(invalidPhase, "player-2")).rejects.toThrow(
            "Esta ronda no está recibiendo votos ahora."
        );
        await expect(submitRoundVote(excluded, "player-2")).rejects.toThrow(
            "No participás de la tanda actual."
        );
    });

    it("rejects malformed vote responses explicitly", async () => {
        const wrongState = {
            rpc: vi.fn(async () => ({
                data: [{ ...submitRoundVoteRow, state: "discussion" }],
                error: null
            }))
        };
        const invalidRoundNumber = {
            rpc: vi.fn(async () => ({
                data: [{ ...submitRoundVoteRow, round_number: 0 }],
                error: null
            }))
        };

        await expect(submitRoundVote(wrongState, "player-2")).rejects.toThrow(
            "No pudimos confirmar tu voto."
        );
        await expect(submitRoundVote(invalidRoundNumber, "player-2")).rejects.toThrow(
            "No pudimos confirmar tu voto."
        );
    });

    it("does not expose secret internals in mapped results", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...submitRoundVoteRow,
                    secret_word: "Tesoro",
                    normalized_secret_word: "tesoro",
                    impostor_player_id: "player-1",
                    target_player_id: "player-2",
                    vote_count: 2
                }],
                error: null
            }))
        };

        const result = await submitRoundVote(supabase, "player-2");

        expect(JSON.stringify(result)).not.toMatch(/secret_word|normalized_secret_word|impostor_player_id|target_player_id|vote_count|Tesoro|player-1|player-2/);
    });
});

describe("submitImpostorGuess", () => {
    it("calls the authoritative RPC with only guess_text", async () => {
        const supabase = {
            rpc: vi.fn(async (
                _fn: string,
                _params?: { room_code: string } | { target_player_id: string } | { guess_text: string }
            ) => {
                void _fn;
                void _params;

                return { data: [submitImpostorGuessRow], error: null };
            })
        };

        await expect(submitImpostorGuess(supabase, "Milanesa")).resolves.toEqual({
            accepted: true,
            alreadyRecorded: false,
            state: "round_result",
            roundNumber: 1,
            isCorrect: true,
            winner: "impostor"
        });

        expect(supabase.rpc).toHaveBeenCalledWith("submit_impostor_guess", {
            guess_text: "Milanesa"
        });
        expect(supabase.rpc.mock.calls[0]).toHaveLength(2);
        expect(JSON.stringify(supabase.rpc.mock.calls[0][1])).not.toMatch(
            /room_id|game_session_id|round_id|player_id|group_id|auth_user_id|is_correct|winner/
        );
    });

    it("maps idempotent and incorrect guess responses", async () => {
        const idempotent = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...submitImpostorGuessRow,
                    already_recorded: true
                }],
                error: null
            }))
        };
        const incorrect = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...submitImpostorGuessRow,
                    is_correct: false,
                    winner: "group"
                }],
                error: null
            }))
        };

        await expect(submitImpostorGuess(idempotent, "Milanesa")).resolves.toMatchObject({
            alreadyRecorded: true,
            isCorrect: true,
            winner: "impostor"
        });
        await expect(submitImpostorGuess(incorrect, "Ravioles")).resolves.toMatchObject({
            alreadyRecorded: false,
            isCorrect: false,
            winner: "group"
        });
    });

    it("maps submit guess failures to product-level feedback", async () => {
        const invalidPhase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0018" } }))
        };
        const notImpostor = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0023" } }))
        };
        const emptyGuess = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "22023" } }))
        };
        const alreadySubmitted = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0025" } }))
        };
        const inconsistent = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0022" } }))
        };

        await expect(submitImpostorGuess(invalidPhase, "Milanesa")).rejects.toThrow(
            "Esta ronda no está esperando el intento final."
        );
        await expect(submitImpostorGuess(notImpostor, "Milanesa")).rejects.toThrow(
            "Solo el impostor puede enviar el intento final."
        );
        await expect(submitImpostorGuess(emptyGuess, "   ")).rejects.toThrow(
            "Escribí una palabra para enviar tu intento."
        );
        await expect(submitImpostorGuess(alreadySubmitted, "Ravioles")).rejects.toThrow(
            "El intento final ya fue registrado y no se puede cambiar."
        );
        await expect(submitImpostorGuess(inconsistent, "Milanesa")).rejects.toThrow(
            "No pudimos reconstruir la tanda para intentar adivinar."
        );
    });

    it("rejects malformed guess responses explicitly", async () => {
        const wrongState = {
            rpc: vi.fn(async () => ({
                data: [{ ...submitImpostorGuessRow, state: "impostor_guess" }],
                error: null
            }))
        };
        const missingWinner = {
            rpc: vi.fn(async () => ({
                data: [{ ...submitImpostorGuessRow, winner: null }],
                error: null
            }))
        };

        await expect(submitImpostorGuess(wrongState, "Milanesa")).rejects.toThrow(
            "No pudimos confirmar el intento final."
        );
        await expect(submitImpostorGuess(missingWinner, "Milanesa")).rejects.toThrow(
            "No pudimos confirmar el intento final."
        );
    });

    it("does not expose secret internals in mapped guess results", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    ...submitImpostorGuessRow,
                    secret_word: "Milanesa",
                    normalized_secret_word: "milanesa",
                    impostor_player_id: "player-2",
                    game_session_id: "session-1"
                }],
                error: null
            }))
        };

        const result = await submitImpostorGuess(supabase, "Milanesa");

        expect(JSON.stringify(result)).not.toMatch(
            /secret_word|normalized_secret_word|impostor_player_id|game_session_id|Milanesa|player-2|session-1/
        );
    });
});

describe("refreshMyRoomLiveness", () => {
    it("calls the authoritative RPC without room, player or timestamp arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return { data: null, error: null };
            })
        };

        await expect(refreshMyRoomLiveness(supabase)).resolves.toBeUndefined();

        expect(supabase.rpc).toHaveBeenCalledWith("refresh_my_room_liveness");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("maps missing Player context to product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0002" } }))
        };

        await expect(refreshMyRoomLiveness(supabase)).rejects.toThrow(
            "No pudimos reconocer tu jugador para mantener activa la sala."
        );
    });

    it("keeps unexpected liveness failures generic", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: new Error("network") }))
        };

        await expect(refreshMyRoomLiveness(supabase)).rejects.toThrow(
            "No pudimos mantener activa la sala. Intentá de nuevo."
        );
    });
});

describe("reassignRoomHostIfStale", () => {
    it("calls the authoritative RPC without room, host, candidate or timestamp arguments", async () => {
        const supabase = {
            rpc: vi.fn(async (_fn: string) => {
                void _fn;

                return {
                    data: [{
                        host_changed: true,
                        current_host_player_id: "player-2"
                    }],
                    error: null
                };
            })
        };

        await expect(reassignRoomHostIfStale(supabase)).resolves.toEqual({
            hostChanged: true,
            currentHostPlayerId: "player-2"
        });

        expect(supabase.rpc).toHaveBeenCalledWith("reassign_room_host_if_stale");
        expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
    });

    it("accepts a no-op result when there is no active Room or no eligible candidate", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({
                data: [{
                    host_changed: false,
                    current_host_player_id: null
                }],
                error: null
            }))
        };

        await expect(reassignRoomHostIfStale(supabase)).resolves.toEqual({
            hostChanged: false,
            currentHostPlayerId: null
        });
    });

    it("maps missing Player context to product-level feedback", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: { code: "P0002" } }))
        };

        await expect(reassignRoomHostIfStale(supabase)).rejects.toThrow(
            "No pudimos reconocer tu jugador para revisar el host."
        );
    });

    it("keeps unexpected host succession failures generic", async () => {
        const supabase = {
            rpc: vi.fn(async () => ({ data: null, error: new Error("network") }))
        };

        await expect(reassignRoomHostIfStale(supabase)).rejects.toThrow(
            "No pudimos revisar quién debería ser host. Intentá de nuevo."
        );
    });
});

describe("startRoomLivenessHeartbeat", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("refreshes immediately and then every 30 seconds", async () => {
        vi.useFakeTimers();
        const refresh = vi.fn(async () => undefined);

        const heartbeat = startRoomLivenessHeartbeat({ refresh });

        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
        expect(ROOM_LIVENESS_HEARTBEAT_MS).toBe(30_000);

        await vi.advanceTimersByTimeAsync(ROOM_LIVENESS_HEARTBEAT_MS);
        expect(refresh).toHaveBeenCalledTimes(2);

        heartbeat.dispose();
    });

    it("cleans up the interval on disposal", async () => {
        vi.useFakeTimers();
        const refresh = vi.fn(async () => undefined);
        const heartbeat = startRoomLivenessHeartbeat({ refresh });

        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
        heartbeat.dispose();

        await vi.advanceTimersByTimeAsync(ROOM_LIVENESS_HEARTBEAT_MS);

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("refreshes when the document returns to foreground but not when hidden", async () => {
        vi.useFakeTimers();
        let visibilityListener: (() => void) | undefined;
        const targetDocument = {
            visibilityState: "hidden" as DocumentVisibilityState,
            addEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => {
                visibilityListener = listener;
            }),
            removeEventListener: vi.fn()
        };
        const refresh = vi.fn(async () => undefined);

        const heartbeat = startRoomLivenessHeartbeat({
            refresh,
            document: targetDocument
        });

        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

        visibilityListener?.();
        expect(refresh).toHaveBeenCalledTimes(1);

        targetDocument.visibilityState = "visible";
        visibilityListener?.();
        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

        heartbeat.dispose();
        expect(targetDocument.removeEventListener).toHaveBeenCalledWith(
            "visibilitychange",
            visibilityListener
        );
    });

    it("reports a transient failure without stopping future heartbeats", async () => {
        vi.useFakeTimers();
        const refresh = vi
            .fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValue(undefined);
        const onError = vi.fn();

        const heartbeat = startRoomLivenessHeartbeat({ refresh, onError });

        await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

        await vi.advanceTimersByTimeAsync(ROOM_LIVENESS_HEARTBEAT_MS);
        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

        heartbeat.dispose();
    });
});

describe("startRoomHostSuccessionRecheck", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("requests evaluation immediately without selecting a successor", async () => {
        vi.useFakeTimers();
        const evaluate = vi.fn(async () => ({
            hostChanged: false,
            currentHostPlayerId: "player-1"
        }));

        const recheck = startRoomHostSuccessionRecheck({
            evaluate,
            isHostMissing: () => false
        });

        await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(1));
        expect(ROOM_HOST_SUCCESSION_RECHECK_MS).toBe(30_000);

        recheck.dispose();
    });

    it("rechecks slowly while the host remains absent from Presence", async () => {
        vi.useFakeTimers();
        const evaluate = vi.fn(async () => ({
            hostChanged: false,
            currentHostPlayerId: "player-1"
        }));
        let hostMissing = true;

        const recheck = startRoomHostSuccessionRecheck({
            evaluate,
            isHostMissing: () => hostMissing
        });

        await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(1));

        await vi.advanceTimersByTimeAsync(ROOM_HOST_SUCCESSION_RECHECK_MS);
        await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));

        hostMissing = false;
        await vi.advanceTimersByTimeAsync(ROOM_HOST_SUCCESSION_RECHECK_MS);
        expect(evaluate).toHaveBeenCalledTimes(2);

        recheck.dispose();
    });

    it("collapses overlapping evaluations in the same browser instance", async () => {
        vi.useFakeTimers();
        let resolveEvaluate: (value: {
            hostChanged: boolean;
            currentHostPlayerId: string;
        }) => void = () => { };
        const evaluatePromise = new Promise<{
            hostChanged: boolean;
            currentHostPlayerId: string;
        }>((resolve) => {
            resolveEvaluate = resolve;
        });
        const evaluate = vi.fn(() => evaluatePromise);

        const recheck = startRoomHostSuccessionRecheck({
            evaluate,
            isHostMissing: () => true
        });

        recheck.requestNow();
        await vi.advanceTimersByTimeAsync(ROOM_HOST_SUCCESSION_RECHECK_MS);

        expect(evaluate).toHaveBeenCalledTimes(1);

        resolveEvaluate({ hostChanged: false, currentHostPlayerId: "player-1" });
        await evaluatePromise;
        await Promise.resolve();

        recheck.requestNow();
        await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));

        recheck.dispose();
    });

    it("requests evaluation on foreground and cleans up timers/listeners", async () => {
        vi.useFakeTimers();
        let visibilityListener: (() => void) | undefined;
        const targetDocument = {
            visibilityState: "hidden" as DocumentVisibilityState,
            addEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => {
                visibilityListener = listener;
            }),
            removeEventListener: vi.fn()
        };
        const evaluate = vi.fn(async () => ({
            hostChanged: false,
            currentHostPlayerId: "player-1"
        }));

        const recheck = startRoomHostSuccessionRecheck({
            evaluate,
            isHostMissing: () => false,
            document: targetDocument
        });

        await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(1));
        await Promise.resolve();

        visibilityListener?.();
        expect(evaluate).toHaveBeenCalledTimes(1);

        targetDocument.visibilityState = "visible";
        visibilityListener?.();
        await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));

        recheck.dispose();
        expect(targetDocument.removeEventListener).toHaveBeenCalledWith(
            "visibilitychange",
            visibilityListener
        );

        await vi.advanceTimersByTimeAsync(ROOM_HOST_SUCCESSION_RECHECK_MS);
        expect(evaluate).toHaveBeenCalledTimes(2);
    });

    it("reports transient errors without stopping future rechecks", async () => {
        vi.useFakeTimers();
        const evaluate = vi
            .fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValue({ hostChanged: false, currentHostPlayerId: "player-1" });
        const onError = vi.fn();

        const recheck = startRoomHostSuccessionRecheck({
            evaluate,
            isHostMissing: () => true,
            onError
        });

        await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

        await vi.advanceTimersByTimeAsync(ROOM_HOST_SUCCESSION_RECHECK_MS);
        await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));

        recheck.dispose();
    });
});

describe("room lifecycle controllers", () => {
    it("collapses concurrent host succession submissions into a single in-flight RPC call", async () => {
        let resolveRpc: (value: { data: unknown; error: unknown }) => void = () => { };
        const rpcPromise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
            resolveRpc = resolve;
        });
        const supabase = {
            rpc: vi.fn(() => rpcPromise)
        };

        const controller = createHostSuccessionController();
        const firstSubmit = controller.submit(supabase);
        const secondSubmit = controller.submit(supabase);

        resolveRpc({
            data: [{
                host_changed: false,
                current_host_player_id: "player-1"
            }],
            error: null
        });

        const [firstResult, secondResult] = await Promise.all([
            firstSubmit,
            secondSubmit
        ]);

        expect(supabase.rpc).toHaveBeenCalledTimes(1);
        expect(firstResult).toEqual(secondResult);
    });

    it("releases the host succession single-flight guard after errors", async () => {
        const supabase = {
            rpc: vi
                .fn()
                .mockResolvedValueOnce({ data: null, error: new Error("network") })
                .mockResolvedValueOnce({
                    data: [{
                        host_changed: false,
                        current_host_player_id: "player-1"
                    }],
                    error: null
                })
        };

        const controller = createHostSuccessionController();

        await expect(controller.submit(supabase)).rejects.toThrow(
            "No pudimos revisar quién debería ser host. Intentá de nuevo."
        );
        await expect(controller.submit(supabase)).resolves.toEqual({
            hostChanged: false,
            currentHostPlayerId: "player-1"
        });

        expect(supabase.rpc).toHaveBeenCalledTimes(2);
    });

    it("collapses concurrent leave submissions into a single in-flight RPC call", async () => {
        let resolveRpc: (value: { data: unknown; error: unknown }) => void = () => { };
        const rpcPromise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
            resolveRpc = resolve;
        });
        const supabase = {
            rpc: vi.fn(() => rpcPromise)
        };

        const controller = createLeaveRoomController();
        const firstSubmit = controller.submit(supabase);
        const secondSubmit = controller.submit(supabase);

        resolveRpc({ data: null, error: null });

        await Promise.all([firstSubmit, secondSubmit]);

        expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });

    it("collapses concurrent close submissions into a single in-flight RPC call", async () => {
        let resolveRpc: (value: { data: unknown; error: unknown }) => void = () => { };
        const rpcPromise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
            resolveRpc = resolve;
        });
        const supabase = {
            rpc: vi.fn(() => rpcPromise)
        };

        const controller = createCloseRoomController();
        const firstSubmit = controller.submit(supabase);
        const secondSubmit = controller.submit(supabase);

        resolveRpc({ data: null, error: null });

        await Promise.all([firstSubmit, secondSubmit]);

        expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });
});

describe("createLobbySyncController", () => {
    it("refetches authoritatively on invalidation without reading from the realtime payload", async () => {
        const readLobby = vi.fn(async () => ({
            room: { id: "11111111-1111-4111-8111-111111111111", code: "AB7KQ2M4", status: "lobby" },
            participants: [
                { playerId: "player-1", nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" },
                { playerId: "player-2", nickname: "Pedro", isHost: false, joinedAt: "2026-08-19T12:05:00.000Z" }
            ]
        }));
        const onSnapshot = vi.fn();
        const controller = createLobbySyncController({ readLobby, onSnapshot });

        controller.invalidate();
        await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));

        expect(readLobby).toHaveBeenCalledTimes(1);
        expect(onSnapshot).toHaveBeenCalledWith({
            status: "success",
            lobby: {
                room: { id: "11111111-1111-4111-8111-111111111111", code: "AB7KQ2M4", status: "lobby" },
                participants: [
                    { playerId: "player-1", nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" },
                    { playerId: "player-2", nickname: "Pedro", isHost: false, joinedAt: "2026-08-19T12:05:00.000Z" }
                ]
            }
        });
    });

    it("serializes bursts with single-flight plus one pending invalidation", async () => {
        const first = createDeferred<null>();
        const readLobby = vi
            .fn()
            .mockReturnValueOnce(first.promise)
            .mockResolvedValue(null);
        const onSnapshot = vi.fn();
        const controller = createLobbySyncController({ readLobby, onSnapshot });

        controller.invalidate();
        controller.invalidate();
        controller.invalidate();

        expect(readLobby).toHaveBeenCalledTimes(1);

        first.resolve(null);
        await vi.waitFor(() => expect(readLobby).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(2));
    });

    it("reports transient refetch errors without inventing absence", async () => {
        const readLobby = vi.fn(async () => {
            throw new Error("No pudimos recuperar tu sala activa. Intentá de nuevo.");
        });
        const onSnapshot = vi.fn();
        const onError = vi.fn();
        const controller = createLobbySyncController({ readLobby, onSnapshot, onError });

        controller.invalidate();
        await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

        expect(onSnapshot).toHaveBeenCalledWith({
            status: "error",
            message: "No pudimos recuperar tu sala activa. Intentá de nuevo."
        });
    });

    it("treats an authoritative null as no active Room", async () => {
        const readLobby = vi.fn(async () => null);
        const onSnapshot = vi.fn();
        const controller = createLobbySyncController({ readLobby, onSnapshot });

        controller.invalidate();
        await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledWith({ status: "absent" }));
    });

    it("does not update after disposal", async () => {
        const deferred = createDeferred<null>();
        const readLobby = vi.fn(() => deferred.promise);
        const onSnapshot = vi.fn();
        const controller = createLobbySyncController({ readLobby, onSnapshot });

        controller.invalidate();
        controller.dispose();
        deferred.resolve(null);

        await Promise.resolve();

        expect(onSnapshot).not.toHaveBeenCalled();
    });
});

describe("getConnectedRoomParticipantIds", () => {
    const participants = [
        {
            playerId: "player-1",
            nickname: "Ramiro",
            isHost: true,
            joinedAt: "2026-08-19T12:00:00.000Z"
        },
        {
            playerId: "player-2",
            nickname: "Pedro",
            isHost: false,
            joinedAt: "2026-08-19T12:05:00.000Z"
        }
    ];

    it("marks a RoomParticipant with Presence as connected", () => {
        const connected = getConnectedRoomParticipantIds(participants, {
            connectionA: [{ playerId: "player-1" }]
        });

        expect([...connected]).toEqual(["player-1"]);
    });

    it("leaves a RoomParticipant without Presence disconnected", () => {
        const connected = getConnectedRoomParticipantIds(participants, {});

        expect(connected.has("player-1")).toBe(false);
        expect(connected.has("player-2")).toBe(false);
    });

    it("ignores Presence that does not match visible RoomParticipants", () => {
        const connected = getConnectedRoomParticipantIds(participants, {
            connectionA: [{ playerId: "player-404" }]
        });

        expect([...connected]).toEqual([]);
    });

    it("deduplicates multiple Presence entries for the same Player", () => {
        const connected = getConnectedRoomParticipantIds(participants, {
            tabA: [{ playerId: "player-2" }],
            tabB: [{ playerId: "player-2" }]
        });

        expect([...connected]).toEqual(["player-2"]);
    });
});

describe("subscribeToRoomPresence", () => {
    it("uses a private Presence channel scoped by roomId and tracks only the current player id", async () => {
        const callbacks: Array<() => void> = [];
        const channel = {
            on: vi.fn((_type: string, _filter: { event: string }, callback: () => void) => {
                callbacks.push(callback);
                return channel;
            }),
            presenceState: vi.fn(() => ({
                tabA: [{ playerId: "player-1" }]
            })),
            subscribe: vi.fn((callback?: (status: "SUBSCRIBED") => void) => {
                callback?.("SUBSCRIBED");
                return channel;
            }),
            track: vi.fn(async () => "ok"),
            untrack: vi.fn(async () => "ok")
        };
        const supabase = {
            channel: vi.fn(() => channel),
            removeChannel: vi.fn(async () => "ok")
        };
        const onSync = vi.fn();

        const subscription = subscribeToRoomPresence(supabase, {
            roomId: "11111111-1111-4111-8111-111111111111",
            currentPlayerId: "player-1",
            onSync
        });

        await vi.waitFor(() =>
            expect(channel.track).toHaveBeenCalledWith({ playerId: "player-1" })
        );

        expect(supabase.channel).toHaveBeenCalledWith(
            "impostor-room-presence:11111111-1111-4111-8111-111111111111",
            {
                config: {
                    private: true,
                    presence: {
                        enabled: true,
                        key: expect.stringMatching(/^player-1:/)
                    }
                }
            }
        );
        expect(channel.on).toHaveBeenCalledWith(
            "presence",
            { event: "sync" },
            expect.any(Function)
        );
        expect(channel.on).toHaveBeenCalledWith(
            "presence",
            { event: "join" },
            expect.any(Function)
        );
        expect(channel.on).toHaveBeenCalledWith(
            "presence",
            { event: "leave" },
            expect.any(Function)
        );

        callbacks[0]();

        expect(onSync).toHaveBeenCalledWith({
            tabA: [{ playerId: "player-1" }]
        });

        await subscription.unsubscribe();

        expect(channel.untrack).toHaveBeenCalledTimes(1);
        expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });

    it("notifies when Presence is successfully established so liveness can refresh", async () => {
        const channel = {
            on: vi.fn(() => channel),
            presenceState: vi.fn(() => ({})),
            subscribe: vi.fn((callback?: (status: "SUBSCRIBED") => void) => {
                callback?.("SUBSCRIBED");
                return channel;
            }),
            track: vi.fn(async () => "ok"),
            untrack: vi.fn(async () => "ok")
        };
        const supabase = {
            channel: vi.fn(() => channel),
            removeChannel: vi.fn(async () => "ok")
        };
        const onSubscribed = vi.fn();

        subscribeToRoomPresence(supabase, {
            roomId: "11111111-1111-4111-8111-111111111111",
            currentPlayerId: "player-1",
            onSync: vi.fn(),
            onSubscribed
        });

        await vi.waitFor(() => expect(onSubscribed).toHaveBeenCalledTimes(1));
        expect(channel.track).toHaveBeenCalledWith({ playerId: "player-1" });
    });

    it("does not emit Presence updates after unsubscribe cleanup", async () => {
        const callbacks: Array<() => void> = [];
        const channel = {
            on: vi.fn((_type: string, _filter: { event: string }, callback: () => void) => {
                callbacks.push(callback);
                return channel;
            }),
            presenceState: vi.fn(() => ({
                tabA: [{ playerId: "player-1" }]
            })),
            subscribe: vi.fn(() => channel),
            track: vi.fn(async () => "ok"),
            untrack: vi.fn(async () => "ok")
        };
        const supabase = {
            channel: vi.fn(() => channel),
            removeChannel: vi.fn(async () => "ok")
        };
        const onSync = vi.fn();

        const subscription = subscribeToRoomPresence(supabase, {
            roomId: "11111111-1111-4111-8111-111111111111",
            currentPlayerId: "player-1",
            onSync
        });

        await subscription.unsubscribe();
        callbacks[0]();

        expect(onSync).not.toHaveBeenCalled();
    });
});
