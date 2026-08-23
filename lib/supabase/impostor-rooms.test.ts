import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createCreateRoomController,
    createJoinRoomByCodeController,
    createLobbySyncController,
    clearRoomCreationIntent,
    clearRoomJoinIntent,
    createRoom,
    getMyActiveRoom,
    hasRoomCreationIntent,
    hasRoomJoinIntent,
    joinRoomByCode,
    normalizeRoomJoinCode,
    recordRoomCreationIntent,
    recordRoomJoinIntent,
    subscribeToRoomChanges
} from "./impostor-rooms";

const singleParticipantRow = {
    room_id: "11111111-1111-4111-8111-111111111111",
    room_join_code: "AB7KQ2M4",
    room_status: "lobby",
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
            participants: [{ nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" }]
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
            participants: [{ nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" }]
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
            participants: [{ nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" }]
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
    it("subscribes only to the current Room membership inserts and Room updates", () => {
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
                event: "UPDATE",
                schema: "public",
                table: "rooms",
                filter: "id=eq.11111111-1111-4111-8111-111111111111"
            },
            expect.any(Function)
        );

        callbacks[0]({ new: { participant_nickname: "Pedro" } });

        expect(onInvalidate).toHaveBeenCalledTimes(1);
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

describe("createLobbySyncController", () => {
    it("refetches authoritatively on invalidation without reading from the realtime payload", async () => {
        const readLobby = vi.fn(async () => ({
            room: { id: "11111111-1111-4111-8111-111111111111", code: "AB7KQ2M4", status: "lobby" },
            participants: [
                { nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" },
                { nickname: "Pedro", isHost: false, joinedAt: "2026-08-19T12:05:00.000Z" }
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
                    { nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" },
                    { nickname: "Pedro", isHost: false, joinedAt: "2026-08-19T12:05:00.000Z" }
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
