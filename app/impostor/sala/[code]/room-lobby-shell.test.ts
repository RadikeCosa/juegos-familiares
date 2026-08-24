import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlatformBootstrapState } from "../../../../lib/supabase/platform-bootstrap";
import type { MyGameState, RoomLobby } from "../../../../lib/supabase/impostor-rooms";
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

const hostLobby: RoomLobby = {
    room: { id: "room-1", code: "AB7KQ2M4", status: "lobby" },
    participants: [
        { playerId: "player-1", nickname: "Ramiro", isHost: true, isSelf: true, joinedAt: "2026-08-19T12:00:00.000Z" },
        { playerId: "player-2", nickname: "Pedro", isHost: false, joinedAt: "2026-08-19T12:05:00.000Z" },
        { playerId: "player-3", nickname: "Ana", isHost: false, joinedAt: "2026-08-19T12:06:00.000Z" }
    ]
};

const nonHostLobby: RoomLobby = {
    ...hostLobby,
    participants: [
        { playerId: "player-1", nickname: "Ramiro", isHost: true, joinedAt: "2026-08-19T12:00:00.000Z" },
        { playerId: "player-2", nickname: "Pedro", isHost: false, isSelf: true, joinedAt: "2026-08-19T12:05:00.000Z" },
        { playerId: "player-3", nickname: "Ana", isHost: false, joinedAt: "2026-08-19T12:06:00.000Z" }
    ]
};

const playingHostLobby: RoomLobby = {
    ...hostLobby,
    room: { id: "room-1", code: "AB7KQ2M4", status: "playing" }
};

const playerGameState: MyGameState = {
    state: "role_reveal",
    roundNumber: 1,
    privateView: { role: "player", word: "Casa" }
};

const impostorGameState: MyGameState = {
    state: "role_reveal",
    roundNumber: 1,
    privateView: { role: "impostor", word: null }
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

    it("can show brief feedback when an authoritative refetch changes host", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: twoPlayerLobby },
                {
                    roomCode: "AB7KQ2M4",
                    hostSuccessionNotice: "Pedro ahora es el host"
                }
            )
        );

        expect(markup).toContain("Pedro ahora es el host");
        expect(markup).toContain("aria-live=\"polite\"");
        expect(markup).not.toMatch(/modal|confirm/i);
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

    it("shows Start only to the current self host while Room is lobby", () => {
        const hostMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: hostLobby },
                { roomCode: "AB7KQ2M4" }
            )
        );
        const nonHostMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "success", lobby: nonHostLobby },
                { roomCode: "AB7KQ2M4" }
            )
        );
        const playingMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "loading-game-state", lobby: playingHostLobby },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(hostMarkup).toContain("Iniciar tanda");
        expect(nonHostMarkup).not.toContain("Iniciar tanda");
        expect(playingMarkup).not.toContain("Iniciar tanda");
    });

    it("disables Start and shows loading copy while start_session is in flight", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "starting", lobby: hostLobby },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Iniciando...");
        expect(markup).toContain("disabled=\"\"");
    });

    it("keeps lobby visible with product feedback after start_session domain errors", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "success",
                    lobby: hostLobby,
                    startError: "Necesitás al menos 3 participantes activos para iniciar."
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Iniciar tanda");
        expect(markup).toContain("Necesitás al menos 3 participantes activos para iniciar.");
        expect(markup).not.toMatch(/SQL|Postgres|P00\d+/);
    });

    it("does not render lobby while private game state is loading", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                { status: "loading-game-state", lobby: playingHostLobby },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Preparando tu rol");
        expect(markup).not.toContain("Jugadores");
        expect(markup).not.toContain("Iniciar tanda");
        expect(markup).not.toContain("Casa");
    });

    it("renders tap-to-reveal without placing the private word in hidden DOM", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: playingHostLobby,
                    gameState: playerGameState,
                    isRoleRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Tu rol está listo");
        expect(markup).toContain("Ver mi rol");
        expect(markup).not.toContain("Casa");
        expect(markup).not.toContain("SOS EL IMPOSTOR");
        expect(markup).not.toContain("Sala AB7KQ2M4");
    });

    it("reveals the normal player's word without exposing impostor internals", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: playingHostLobby,
                    gameState: playerGameState,
                    isRoleRevealed: true
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Tu palabra");
        expect(markup).toContain("Casa");
        expect(markup).not.toContain("SOS EL IMPOSTOR");
        expect(markup).not.toMatch(/normalized|impostor_player_id|player-\d/);
    });

    it("reveals impostor without rendering a word, including when the host is impostor", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: playingHostLobby,
                    gameState: impostorGameState,
                    isRoleRevealed: true
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("SOS EL IMPOSTOR");
        expect(markup).not.toContain("Casa");
        expect(markup).not.toContain("Tu palabra");
    });

    it("renders excluded state without role, word, participants or Start", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "excluded",
                    lobby: playingHostLobby,
                    message: "Esperá a la próxima tanda para volver a jugar."
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("La tanda ya empezó y no quedaste incluido");
        expect(markup).toContain("Esperá a la próxima");
        expect(markup).not.toContain("Casa");
        expect(markup).not.toContain("SOS EL IMPOSTOR");
        expect(markup).not.toContain("Jugadores");
        expect(markup).not.toContain("Iniciar tanda");
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
        expect(source).toContain(
            "[\n    bootstrapState.status,\n    activeRoomId,\n    roomCode,\n    refreshAuthoritativeRoomState"
        );
        expect(source).not.toContain("[bootstrapState.status, dataState, roomCode, router]");
        expect(source).not.toContain("createLobbySyncController");
    });

    it("leaves the lobby route when an authoritative Realtime refetch returns no active Room", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("absentDestination: \"group\"");
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
        expect(source).not.toMatch(/last_seen_at/i);
    });

    it("requests host succession evaluation without choosing a successor in React", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("startRoomHostSuccessionRecheck({");
        expect(source).toContain("createHostSuccessionController()");
        expect(source).toContain("hostSuccessionController.submit(createImpostorRoomsClient())");
        expect(source).toContain("isHostMissing: () => isActiveHostMissingRef.current");
        expect(source).toContain("recheck.dispose()");
        expect(source).not.toMatch(/set.*host_player_id|successorPlayerId|candidatePlayerId/i);
    });

    it("derives host-missing trigger from Presence while keeping host authority in lobby data", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("participant.isHost");
        expect(source).toContain("!connectedPlayerIds.has(activeHostPlayerId");
        expect(source).toContain("isActiveHostMissingRef.current = isActiveHostMissing");
        expect(source).toContain("acceptActiveRoom(activeLobby, options.startError)");
        expect(source).toContain("recordActiveRoomHost(activeLobby)");
        expect(source).toContain("`${nextHost.nickname} ahora es el host`");
    });

    it("does not restart host succession recheck only because Presence changes", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("activeHostPlayerId,\n    hostSuccessionController");
        expect(source).not.toContain("isActiveHostMissing,\n    hostSuccessionController");
    });

    it("uses one authoritative refresh path for bootstrap, START success, retry and Realtime", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("const refreshAuthoritativeRoomState = useCallback(");
        expect(source).toContain("await refreshAuthoritativeRoomState(\"bootstrap\")");
        expect(source).toContain("await refreshAuthoritativeRoomState(\"start\")");
        expect(source).toContain("void refreshAuthoritativeRoomState(\"realtime\", {");
        expect(source).toContain("onRetryData: () => void refreshAuthoritativeRoomState(\"retry\")");
        expect(source).toContain("getMyActiveRoom(createImpostorRoomsClient())");
        expect(source).toContain("getMyGameState(createImpostorRoomsClient())");
    });

    it("does not accept a playing Room as lobby before private state loading", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );
        const playingBranch = source.slice(
            source.indexOf("if (activeLobby.room.status !== \"playing\")"),
            source.indexOf("let gameState: MyGameState | null;")
        );

        expect(playingBranch).toContain("recordActiveRoomHost(activeLobby)");
        expect(playingBranch).toContain("setDataState({ status: \"loading-game-state\", lobby: activeLobby })");
        expect(playingBranch).not.toContain("acceptActiveRoom(activeLobby)");
    });

    it("protects against stale refresh responses and setState after unmount", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("const refreshSequenceRef = useRef(0)");
        expect(source).toContain("const requestId = refreshSequenceRef.current + 1");
        expect(source).toContain("refreshSequenceRef.current = requestId");
        expect(source).toContain("refreshSequenceRef.current === requestId");
        expect(source).toContain("isMountedRef.current");
        expect(source).toContain("refreshSequenceRef.current += 1");
    });

    it("cleans private state before loading, lobby, excluded and error states", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("setDataState({ status: \"loading\" })");
        expect(source).toContain("setDataState({ status: \"loading-game-state\", lobby: activeLobby })");
        expect(source).toContain("setDataState({ status: \"awaiting-join\" })");
        expect(source).toContain("status: \"excluded\"");
        expect(source).toContain("status: \"error\"");
        expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|searchParams|console\.log\(.*gameState/i);
    });
});
