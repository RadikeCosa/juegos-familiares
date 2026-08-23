import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlatformBootstrapState } from "../../../../lib/supabase/platform-bootstrap";
import type { RoomLobby } from "../../../../lib/supabase/impostor-rooms";
import {
    formatPlayerCount,
    renderRoomLobbyContent
} from "./room-lobby-shell";

vi.mock("../../../../lib/supabase/browser-client", () => ({
    createBrowserSupabaseClient: vi.fn()
}));

const recognizedState: PlatformBootstrapState = {
    status: "recognized",
    player: {
        id: "player-1",
        groupId: "group-1",
        nickname: "Ramiro",
        createdAt: "2026-08-19T12:00:00.000Z"
    },
    group: {
        id: "group-1",
        name: "Familia",
        adminPlayerId: "player-1",
        createdAt: "2026-08-19T12:00:00.000Z"
    }
};

const singlePlayerLobby: RoomLobby = {
    room: { code: "AB7KQ2M4", status: "lobby" },
    participants: [{ playerId: "player-1", nickname: "Ramiro", isHost: true, isSelf: true, joinedAt: "2026-08-19T12:00:00.000Z" }]
};

const twoPlayerLobby: RoomLobby = {
    room: { code: "AB7KQ2M4", status: "lobby" },
    participants: [
        { playerId: "player-1", nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" },
        { playerId: "player-2", nickname: "Pedro", isHost: false, isSelf: true, joinedAt: "2026-08-19T12:05:00.000Z" }
    ]
};

describe("formatPlayerCount", () => {
    it("uses singular for exactly one player", () => {
        expect(formatPlayerCount(1)).toBe("1 jugador");
    });

    it("uses plural otherwise", () => {
        expect(formatPlayerCount(0)).toBe("0 jugadores");
        expect(formatPlayerCount(3)).toBe("3 jugadores");
    });
});

describe("renderRoomLobbyContent", () => {
    it("offers an explicit join action on a direct visit without Auth, without creating one by rendering", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                { status: "unrecognized", reason: "no-auth" },
                { status: "idle" },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Te invitaron a una sala de Impostor");
        expect(markup).toContain("Continuar para unirme");
    });

    it("guides Auth without Player to the group flow instead of the Room", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                { status: "unrecognized", reason: "no-player" },
                { status: "idle" },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Primero necesitás unirte a un grupo");
        expect(markup).toContain("/impostor");
        expect(markup).not.toContain("Continuar para unirme");
    });

    it("shows a loading state referencing the room code while creating/fetching", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(recognizedState, { status: "loading" }, {
                roomCode: "AB7KQ2M4"
            })
        );

        expect(markup).toContain("Preparando sala AB7KQ2M4");
    });

    it("renders the code, host badge and player count without technical IDs", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: singlePlayerLobby },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Sala AB7KQ2M4");
        expect(markup).toContain("Ramiro");
        expect(markup).toContain("Host");
        expect(markup).toContain("Vos");
        expect(markup).toContain("1 jugador");
        expect(markup).toContain("Cerrar sala");
        expect(markup).toContain("termina este lobby para todos");
        expect(markup).not.toContain("player-1");
        expect(markup).not.toContain("group-1");
        expect(markup).not.toContain("auth_user_id");
    });

    it("shows both host and joined participant after B joins, without technical IDs", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: twoPlayerLobby },
                {
                    roomCode: "AB7KQ2M4",
                    connectedPlayerIds: new Set(["player-1", "player-2"])
                }
            )
        );

        expect(markup).toContain("Ramiro");
        expect(markup).toContain("Host");
        expect(markup).toContain("Pedro");
        expect(markup).toContain("Vos");
        expect(markup).toContain("conectado");
        expect(markup).toContain("2 jugadores");
        expect(markup).toContain("Salir de la sala");
        expect(markup).not.toContain("Cerrar sala");
        expect(markup).not.toMatch(/player-\d|group-\d/);
    });

    it("shows disconnected participants without removing them from the lobby", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: twoPlayerLobby },
                {
                    roomCode: "AB7KQ2M4",
                    connectedPlayerIds: new Set(["player-1"])
                }
            )
        );

        expect(markup).toContain("Ramiro");
        expect(markup).toContain("Pedro");
        expect(markup).toContain("conectado");
        expect(markup).toContain("desconectado");
        expect(markup).toContain("2 jugadores");
    });

    it("does not add unknown Presence entries as lobby participants", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: twoPlayerLobby },
                {
                    roomCode: "AB7KQ2M4",
                    connectedPlayerIds: new Set(["player-1", "player-404"])
                }
            )
        );

        expect(markup).toContain("Ramiro");
        expect(markup).toContain("Pedro");
        expect(markup).not.toContain("player-404");
        expect(markup).toContain("2 jugadores");
    });

    it("keeps a disconnected host as host during Presence-only 5.1", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: twoPlayerLobby },
                {
                    roomCode: "AB7KQ2M4",
                    connectedPlayerIds: new Set(["player-2"])
                }
            )
        );

        expect(markup).toContain("Ramiro");
        expect(markup).toContain("Host");
        expect(markup).toContain("desconectado");
        expect(markup).not.toMatch(/nuevo host|ahora es host|reasign/i);
    });

    it("disables the explicit host close action while it is in flight", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: singlePlayerLobby },
                {
                    roomCode: "AB7KQ2M4",
                    lifecycleActionState: { status: "closing" }
                }
            )
        );

        expect(markup).toContain("Cerrando sala...");
        expect(markup).toContain("disabled=\"\"");
    });

    it("disables the non-host leave action while it is in flight", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: twoPlayerLobby },
                {
                    roomCode: "AB7KQ2M4",
                    lifecycleActionState: { status: "leaving" }
                }
            )
        );

        expect(markup).toContain("Saliendo...");
        expect(markup).toContain("disabled=\"\"");
    });

    it("shows product-level feedback on data errors", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "error", message: "No pudimos crear la sala. Intentá de nuevo." },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("No pudimos crear la sala. Intentá de nuevo.");
        expect(markup).not.toMatch(/SQL|constraint|Postgres/i);
    });

    it("offers an explicit join action for a recognized Player on a direct visit, without auto-joining", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "awaiting-join" },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Sala AB7KQ2M4");
        expect(markup).toContain("Continuar para unirme");
        expect(markup).not.toMatch(/SQL|constraint|Postgres/i);
    });

    it("shows product-level feedback next to the join action on error, without abandoning the button", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "awaiting-join", error: "Ya estás en otra sala." },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Ya estás en otra sala.");
        expect(markup).toContain("Continuar para unirme");
    });

    it("disables the join action while the request is in flight", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "joining" },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Uniéndote...");
        expect(markup).toContain("disabled=\"\"");
    });

    it("reconstructs the active Room without consulting one-shot create or join intents", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("getMyActiveRoom(createImpostorRoomsClient())");
        expect(source).not.toContain("hasRoomCreationIntent(roomCode)");
        expect(source).not.toContain("hasRoomJoinIntent(roomCode)");
        expect(source).not.toContain("await createRoom(");
        expect(source).not.toContain("await joinRoomByCode(");
    });

    it("redirects to the authoritative active Room code instead of showing a mismatched URL lobby", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("activeLobby.room.code !== roomCode");
        expect(source).toContain("router.replace(");
        expect(source).toContain("encodeURIComponent(activeLobby.room.code)");
    });

    it("keeps the Realtime subscription stable across lobby refetches for the same Room", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("const activeRoomId =");
        expect(source).toContain("subscribeToRoomChanges(");
        expect(source).toContain("activeRoomId,");
        expect(source).toContain("[bootstrapState.status, activeRoomId, roomCode, router]");
        expect(source).not.toContain("[bootstrapState.status, dataState, roomCode, router]");
    });

    it("leaves the lobby route when an authoritative Realtime refetch returns no active Room", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("if (snapshot.status === \"absent\")");
        expect(source).toContain("router.replace(\"/impostor/grupo\")");
    });

    it("starts liveness heartbeat only when the active Room and current participant are known", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("startRoomLivenessHeartbeat({");
        expect(source).toContain("refresh: () => refreshMyRoomLiveness(createImpostorRoomsClient())");
        expect(source).toContain("heartbeat.dispose()");
        expect(source).toContain("!activeRoomId");
        expect(source).toContain("!currentRoomPlayerId");
    });

    it("refreshes liveness after Presence is established without changing connected/disconnected UX", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("onSubscribed: () =>");
        expect(source).toContain("refreshMyRoomLiveness(createImpostorRoomsClient())");
        expect(source).toContain("onError: logRoomLivenessError");
        expect(source).toContain("getConnectedRoomParticipantIds(");
        expect(source).not.toMatch(/last_seen_at|stale/i);
    });
});
