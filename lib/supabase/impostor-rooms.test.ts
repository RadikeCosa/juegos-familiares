import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createCreateRoomController,
    createCloseRoomController,
    createHostSuccessionController,
    createJoinRoomByCodeController,
    createLeaveRoomController,
    createLobbySyncController,
    clearRoomCreationIntent,
    clearRoomJoinIntent,
    closeRoom,
    createRoom,
    getConnectedRoomParticipantIds,
    getMyActiveRoom,
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
            rpc: vi.fn(async (_fn: string, _params?: { room_code: string }) => {
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
