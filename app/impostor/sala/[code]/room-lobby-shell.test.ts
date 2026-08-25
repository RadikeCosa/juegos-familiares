import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlatformBootstrapState } from "../../../../lib/supabase/platform-bootstrap";
import type { MyGameState, RoomLobby } from "../../../../lib/supabase/impostor-rooms";
import {
    createGameplayPollLoop,
    formatPlayerCount,
    renderRoomLobbyContent,
    runStartDiscussionCommand,
    runStartVotingCommand,
    runSubmitVoteCommand,
    toGameplayDataState
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
    privateView: { role: "player", word: "Casa" },
    voting: null,
    voteResults: null
};

const impostorGameState: MyGameState = {
    state: "role_reveal",
    roundNumber: 1,
    privateView: { role: "impostor", word: null },
    voting: null,
    voteResults: null
};

const discussionGameState: MyGameState = {
    state: "discussion",
    roundNumber: 1,
    privateView: { role: "player", word: "Casa" },
    voting: null,
    voteResults: null
};

const impostorDiscussionGameState: MyGameState = {
    state: "discussion",
    roundNumber: 1,
    privateView: { role: "impostor", word: null },
    voting: null,
    voteResults: null
};

const secondRoundDiscussionGameState: MyGameState = {
    state: "discussion",
    roundNumber: 2,
    privateView: { role: "player", word: "Mesa" },
    voting: null,
    voteResults: null
};

const votingGameState: MyGameState = {
    state: "voting_first",
    roundNumber: 1,
    privateView: { role: "player", word: "Casa" },
    voting: {
        candidates: [
            { playerId: "player-2", nickname: "Pedro" },
            { playerId: "player-3", nickname: "Ana" }
        ],
        myVoteTargetPlayerId: null,
        hasVoted: false
    },
    voteResults: null
};

const votedGameState: MyGameState = {
    ...votingGameState,
    voting: {
        candidates: votingGameState.voting?.candidates ?? [],
        myVoteTargetPlayerId: "player-2",
        hasVoted: true
    }
};

const tieDiscussionGameState: MyGameState = {
    state: "tie_discussion",
    roundNumber: 1,
    privateView: { role: "player", word: "Casa" },
    voting: null,
    voteResults: [
        { playerId: "player-2", nickname: "Pedro", voteCount: 2 },
        { playerId: "player-3", nickname: "Ana", voteCount: 2 }
    ]
};

const impostorGuessGameState: MyGameState = {
    state: "impostor_guess",
    roundNumber: 1,
    privateView: { role: "impostor", word: null },
    voting: null,
    voteResults: [{ playerId: "player-2", nickname: "Pedro", voteCount: 3 }]
};

const roundResultGameState: MyGameState = {
    state: "round_result",
    roundNumber: 1,
    privateView: { role: "player", word: "Casa" },
    voting: null,
    voteResults: [{ playerId: "player-3", nickname: "Ana", voteCount: 2 }]
};

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });

    return { promise, resolve, reject };
}

describe("formatPlayerCount", () => {
    it("uses singular for exactly one player", () => {
        expect(formatPlayerCount(1)).toBe("1 jugador");
    });

    it("uses plural otherwise", () => {
        expect(formatPlayerCount(0)).toBe("0 jugadores");
        expect(formatPlayerCount(3)).toBe("3 jugadores");
    });
});

describe("toGameplayDataState", () => {
    it("resets private reveal when role_reveal advances to discussion", () => {
        const previousState = {
            status: "role-reveal" as const,
            lobby: playingHostLobby,
            gameState: playerGameState,
            isPrivateViewRevealed: true
        };

        const nextState = toGameplayDataState(
            playingHostLobby,
            discussionGameState,
            previousState
        );

        expect(nextState).toMatchObject({
            status: "discussion",
            isPrivateViewRevealed: false
        });
    });

    it("preserves private reveal during same discussion payload polling", () => {
        const previousState = {
            status: "discussion" as const,
            lobby: playingHostLobby,
            gameState: discussionGameState,
            isPrivateViewRevealed: true
        };

        const nextState = toGameplayDataState(
            playingHostLobby,
            discussionGameState,
            previousState
        );

        expect(nextState).toMatchObject({
            status: "discussion",
            isPrivateViewRevealed: true
        });
    });

    it("hides private view on discussion round changes", () => {
        const previousState = {
            status: "discussion" as const,
            lobby: playingHostLobby,
            gameState: discussionGameState,
            isPrivateViewRevealed: true
        };

        const nextState = toGameplayDataState(
            playingHostLobby,
            secondRoundDiscussionGameState,
            previousState
        );

        expect(nextState).toMatchObject({
            status: "discussion",
            isPrivateViewRevealed: false
        });
    });

    it("starts hidden on direct bootstrap into discussion", () => {
        const nextState = toGameplayDataState(playingHostLobby, discussionGameState);

        expect(nextState).toMatchObject({
            status: "discussion",
            isPrivateViewRevealed: false
        });
    });

    it("recognizes voting and first-vote result states for polling convergence", () => {
        expect(toGameplayDataState(playingHostLobby, votingGameState)).toMatchObject({
            status: "voting-first"
        });
        expect(toGameplayDataState(playingHostLobby, tieDiscussionGameState)).toMatchObject({
            status: "tie-discussion"
        });
        expect(toGameplayDataState(playingHostLobby, impostorGuessGameState)).toMatchObject({
            status: "impostor-guess"
        });
        expect(toGameplayDataState(playingHostLobby, roundResultGameState)).toMatchObject({
            status: "round-result"
        });
    });
});

describe("runStartDiscussionCommand", () => {
    it("treats normal success as success and refreshes gameplay", async () => {
        const start = vi.fn(async () => ({ advanced: true }));
        const refreshGameplay = vi.fn(async () => discussionGameState);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartDiscussionCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(start).toHaveBeenCalledTimes(1);
        expect(refreshGameplay).toHaveBeenCalledTimes(1);
        expect(refreshAuthoritative).not.toHaveBeenCalled();
        expect(setError).toHaveBeenLastCalledWith(undefined);
    });

    it("treats idempotent already-in-phase success as success", async () => {
        const start = vi.fn(async () => ({ alreadyInPhase: true }));
        const refreshGameplay = vi.fn(async () => discussionGameState);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartDiscussionCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(refreshGameplay).toHaveBeenCalledTimes(1);
        expect(refreshAuthoritative).not.toHaveBeenCalled();
        expect(setError).toHaveBeenLastCalledWith(undefined);
    });

    it("recovers a lost command response by accepting discussion from manual refresh", async () => {
        const start = vi.fn(async () => {
            throw new Error("NetworkError");
        });
        const refreshGameplay = vi.fn(async () => discussionGameState);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartDiscussionCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(refreshGameplay).toHaveBeenCalledTimes(1);
        expect(refreshAuthoritative).not.toHaveBeenCalled();
        expect(setError).toHaveBeenLastCalledWith(undefined);
    });

    it("keeps a genuine network failure local when manual refresh remains role_reveal", async () => {
        const start = vi.fn(async () => {
            throw new Error("No pudimos empezar la ronda. Intentá de nuevo.");
        });
        const refreshGameplay = vi.fn(async () => playerGameState);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartDiscussionCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(refreshGameplay).toHaveBeenCalledTimes(1);
        expect(refreshAuthoritative).not.toHaveBeenCalled();
        expect(setError).toHaveBeenLastCalledWith("No pudimos empezar la ronda. Intentá de nuevo.");
    });

    it("reconciles P0019 with host-lost feedback and full authority refresh", async () => {
        const start = vi.fn(async () => {
            throw new Error("Solo el host actual puede empezar la ronda.");
        });
        const refreshGameplay = vi.fn(async () => playerGameState);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartDiscussionCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(setError).toHaveBeenLastCalledWith("Ya no sos el host actual.");
        expect(refreshAuthoritative).toHaveBeenCalledTimes(1);
    });

    it("reconciles P0022 with full authority refresh", async () => {
        const start = vi.fn(async () => {
            throw new Error("No pudimos reconstruir la tanda para empezar la ronda.");
        });
        const refreshGameplay = vi.fn(async () => null);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartDiscussionCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(refreshAuthoritative).toHaveBeenCalledTimes(1);
    });

    it("reconciles P0023 without showing stale private feedback", async () => {
        const start = vi.fn(async () => {
            throw new Error("No participás de la tanda actual.");
        });
        const refreshGameplay = vi.fn(async () => null);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartDiscussionCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(refreshAuthoritative).toHaveBeenCalledTimes(1);
        expect(setError).toHaveBeenCalledTimes(1);
        expect(setError).toHaveBeenCalledWith(undefined);
    });
});

describe("runStartVotingCommand", () => {
    it("recovers a lost command response by accepting voting_first from manual refresh", async () => {
        const start = vi.fn(async () => {
            throw new Error("NetworkError");
        });
        const refreshGameplay = vi.fn(async () => votingGameState);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartVotingCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(start).toHaveBeenCalledTimes(1);
        expect(refreshGameplay).toHaveBeenCalledTimes(1);
        expect(refreshAuthoritative).not.toHaveBeenCalled();
        expect(setError).toHaveBeenLastCalledWith(undefined);
    });

    it("reconciles host loss through the authoritative room path", async () => {
        const start = vi.fn(async () => {
            throw new Error("Solo el host actual puede ir a votación.");
        });
        const refreshGameplay = vi.fn(async () => discussionGameState);
        const refreshAuthoritative = vi.fn(async () => undefined);
        const setError = vi.fn();

        await runStartVotingCommand({
            start,
            refreshGameplay,
            refreshAuthoritative,
            setError
        });

        expect(setError).toHaveBeenLastCalledWith("Ya no sos el host actual.");
        expect(refreshAuthoritative).toHaveBeenCalledTimes(1);
    });
});

describe("runSubmitVoteCommand", () => {
    it("requires a local target before submitting", async () => {
        const submit = vi.fn(async () => undefined);
        const refreshGameplay = vi.fn(async () => votingGameState);
        const setError = vi.fn();

        await runSubmitVoteCommand({
            targetPlayerId: null,
            submit,
            refreshGameplay,
            setError
        });

        expect(submit).not.toHaveBeenCalled();
        expect(refreshGameplay).not.toHaveBeenCalled();
        expect(setError).toHaveBeenLastCalledWith("Elegí a quién votar.");
    });

    it("refreshes gameplay after successful vote submit", async () => {
        const submit = vi.fn(async () => undefined);
        const refreshGameplay = vi.fn(async () => votedGameState);
        const setError = vi.fn();

        await runSubmitVoteCommand({
            targetPlayerId: "player-2",
            submit,
            refreshGameplay,
            setError
        });

        expect(submit).toHaveBeenCalledWith("player-2");
        expect(refreshGameplay).toHaveBeenCalledTimes(1);
        expect(setError).toHaveBeenLastCalledWith(undefined);
    });

    it("recovers a lost vote response when polling sees the caller vote", async () => {
        const submit = vi.fn(async () => {
            throw new Error("NetworkError");
        });
        const refreshGameplay = vi.fn(async () => votedGameState);
        const setError = vi.fn();

        await runSubmitVoteCommand({
            targetPlayerId: "player-2",
            submit,
            refreshGameplay,
            setError
        });

        expect(refreshGameplay).toHaveBeenCalledTimes(1);
        expect(setError).toHaveBeenLastCalledWith(undefined);
    });

    it("recovers a lost final vote response when polling already sees a result", async () => {
        const submit = vi.fn(async () => {
            throw new Error("NetworkError");
        });
        const refreshGameplay = vi.fn(async () => roundResultGameState);
        const setError = vi.fn();

        await runSubmitVoteCommand({
            targetPlayerId: "player-2",
            submit,
            refreshGameplay,
            setError
        });

        expect(refreshGameplay).toHaveBeenCalledTimes(1);
        expect(setError).toHaveBeenLastCalledWith(undefined);
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
                    isPrivateViewRevealed: false
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

    it("shows Empezar ronda to the current host during role reveal without requiring local reveal", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: playingHostLobby,
                    gameState: playerGameState,
                    isPrivateViewRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Ver mi rol");
        expect(markup).toContain("Empezar ronda");
        expect(markup).not.toContain("Casa");
        expect(markup).not.toContain("Ir a votación");
    });

    it("does not render the start discussion CTA for non-hosts during role reveal", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: { ...playingHostLobby, participants: nonHostLobby.participants },
                    gameState: playerGameState,
                    isPrivateViewRevealed: true
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Tu palabra");
        expect(markup).toContain("Casa");
        expect(markup).not.toContain("Empezar ronda");
        expect(markup).not.toMatch(/esperando permiso|disabled/i);
    });

    it("keeps P0019 feedback visible after authoritative refresh removes the stale CTA", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: { ...playingHostLobby, participants: nonHostLobby.participants },
                    gameState: playerGameState,
                    isPrivateViewRevealed: true
                },
                {
                    roomCode: "AB7KQ2M4",
                    startDiscussionError: "Ya no sos el host actual."
                }
            )
        );

        expect(markup).toContain("Ya no sos el host actual.");
        expect(markup).not.toContain("Empezar ronda");
    });

    it("moves the start discussion CTA with authoritative host succession", () => {
        const previousHostMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: { ...playingHostLobby, participants: nonHostLobby.participants },
                    gameState: playerGameState,
                    isPrivateViewRevealed: true
                },
                { roomCode: "AB7KQ2M4" }
            )
        );
        const successorHostMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: { ...playingHostLobby, participants: hostLobby.participants },
                    gameState: playerGameState,
                    isPrivateViewRevealed: true
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(previousHostMarkup).not.toContain("Empezar ronda");
        expect(successorHostMarkup).toContain("Empezar ronda");
    });

    it("disables start discussion while the command is in flight and keeps the private view visible", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: playingHostLobby,
                    gameState: playerGameState,
                    isPrivateViewRevealed: true
                },
                { roomCode: "AB7KQ2M4", isStartingDiscussion: true }
            )
        );

        expect(markup).toContain("Tu palabra");
        expect(markup).toContain("Casa");
        expect(markup).toContain("Empezando ronda...");
        expect(markup).toContain("disabled=\"\"");
    });

    it("shows product feedback next to start discussion errors without leaving role reveal", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: playingHostLobby,
                    gameState: impostorGameState,
                    isPrivateViewRevealed: true
                },
                {
                    roomCode: "AB7KQ2M4",
                    startDiscussionError: "No pudimos empezar la ronda. Intentá de nuevo."
                }
            )
        );

        expect(markup).toContain("SOS EL IMPOSTOR");
        expect(markup).toContain("Empezar ronda");
        expect(markup).toContain("No pudimos empezar la ronda. Intentá de nuevo.");
    });

    it("reveals the normal player's word without exposing impostor internals", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "role-reveal",
                    lobby: playingHostLobby,
                    gameState: playerGameState,
                    isPrivateViewRevealed: true
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
                    isPrivateViewRevealed: true
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("SOS EL IMPOSTOR");
        expect(markup).not.toContain("Casa");
        expect(markup).not.toContain("Tu palabra");
    });

    it("renders normal discussion hidden without exposing the private word anywhere in markup", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: playingHostLobby,
                    gameState: discussionGameState,
                    isPrivateViewRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Ronda en juego");
        expect(markup).toContain("Ronda 1");
        expect(markup).toContain("Ver mi palabra");
        expect(markup).toContain("Host actual: Ramiro");
        expect(markup).not.toContain("Casa");
        expect(markup).not.toContain("Empezar ronda");
    });

    it("reveals and hides a normal player's word in discussion by removing it from DOM", () => {
        const revealedMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: playingHostLobby,
                    gameState: discussionGameState,
                    isPrivateViewRevealed: true
                },
                { roomCode: "AB7KQ2M4" }
            )
        );
        const hiddenMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: playingHostLobby,
                    gameState: discussionGameState,
                    isPrivateViewRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(revealedMarkup).toContain("Tu palabra");
        expect(revealedMarkup).toContain("Casa");
        expect(revealedMarkup).toContain("Ocultar");
        expect(hiddenMarkup).not.toContain("Casa");
    });

    it("renders impostor discussion hidden before reveal and never renders a word", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: playingHostLobby,
                    gameState: impostorDiscussionGameState,
                    isPrivateViewRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Ronda en juego");
        expect(markup).toContain("Ver mi rol");
        expect(markup).not.toContain("SOS EL IMPOSTOR");
        expect(markup).not.toContain("Casa");
    });

    it("reveals and hides impostor role in discussion by removing it from DOM", () => {
        const revealedMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: playingHostLobby,
                    gameState: impostorDiscussionGameState,
                    isPrivateViewRevealed: true
                },
                { roomCode: "AB7KQ2M4" }
            )
        );
        const hiddenMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: playingHostLobby,
                    gameState: impostorDiscussionGameState,
                    isPrivateViewRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(revealedMarkup).toContain("SOS EL IMPOSTOR");
        expect(revealedMarkup).toContain("Ocultar");
        expect(revealedMarkup).not.toContain("Casa");
        expect(hiddenMarkup).not.toContain("SOS EL IMPOSTOR");
    });

    it("keeps discussion separate from voting", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: { ...playingHostLobby, participants: nonHostLobby.participants },
                    gameState: discussionGameState,
                    isPrivateViewRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).not.toMatch(/Ir a votación|Votar|Elegir jugador|Finalizar ronda/);
    });

    it("shows Ir a votación only to the host during discussion", () => {
        const hostMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: playingHostLobby,
                    gameState: discussionGameState,
                    isPrivateViewRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );
        const nonHostMarkup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "discussion",
                    lobby: { ...playingHostLobby, participants: nonHostLobby.participants },
                    gameState: discussionGameState,
                    isPrivateViewRevealed: false
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(hostMarkup).toContain("Ir a votación");
        expect(nonHostMarkup).not.toContain("Ir a votación");
    });

    it("renders voting candidates without self, partial counts or hidden vote internals", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "voting-first",
                    lobby: playingHostLobby,
                    gameState: votingGameState
                },
                {
                    roomCode: "AB7KQ2M4",
                    selectedVoteTargetPlayerId: "player-3"
                }
            )
        );

        expect(markup).toContain("Votación");
        expect(markup).toContain("Pedro");
        expect(markup).toContain("Ana");
        expect(markup).toContain("aria-pressed=\"true\"");
        expect(markup).toContain("Votar");
        expect(markup).not.toContain("Ramiro");
        expect(markup).not.toContain("Casa");
        expect(markup).not.toContain("quién falta");
        expect(markup).not.toMatch(/votos|vote_count|player-\d/);
    });

    it("shows registered vote feedback and disables changing the vote", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "voting-first",
                    lobby: playingHostLobby,
                    gameState: votedGameState
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Voto registrado. Esperando al resto.");
        expect(markup).toContain("disabled=\"\"");
        expect(markup).not.toContain("Registrando voto");
    });

    it("renders tie discussion with aggregate results only", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "tie-discussion",
                    lobby: playingHostLobby,
                    gameState: tieDiscussionGameState
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Hubo empate");
        expect(markup).toContain("Pedro");
        expect(markup).toContain("2 votos");
        expect(markup).not.toContain("segunda votación");
        expect(markup).not.toMatch(/Ramiro.*Pedro|Pedro.*Ana.*Ramiro|player-\d/);
    });

    it("renders impostor guess pending state without word input or secret reveal", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "impostor-guess",
                    lobby: playingHostLobby,
                    gameState: impostorGuessGameState
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("El impostor fue señalado");
        expect(markup).toContain("Queda pendiente el intento del impostor.");
        expect(markup).not.toContain("Casa");
        expect(markup).not.toMatch(/input|Adivinar|secret_word|normalized/i);
    });

    it("renders round result without score or next-round controls", () => {
        const markup = renderToStaticMarkup(
            renderRoomLobbyContent(
                recognizedState,
                {
                    status: "round-result",
                    lobby: playingHostLobby,
                    gameState: roundResultGameState
                },
                { roomCode: "AB7KQ2M4" }
            )
        );

        expect(markup).toContain("Acusación incorrecta");
        expect(markup).toContain("sin marcador todavía");
        expect(markup).not.toMatch(/Nueva ronda|Puntaje|score/i);
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
        expect(source).toContain("const authoritativeRefreshInFlightCountRef = useRef(0)");
        expect(source).toContain("const gameStatePollTimeoutRef = useRef");
        expect(source).toContain("const requestId = refreshSequenceRef.current + 1");
        expect(source).toContain("refreshSequenceRef.current = requestId");
        expect(source).toContain("refreshSequenceRef.current === requestId");
        expect(source).toContain("isMountedRef.current");
        expect(source).toContain("authoritativeRefreshInFlightCountRef.current += 1");
        expect(source).toContain("clearGameStatePollTimeout()");
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

    it("uses a local slow recursive gameplay poll instead of gameplay Realtime or interval", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("const GAME_STATE_POLL_INTERVAL_MS = 3_000");
        expect(source).toContain("createGameplayPollLoop({");
        expect(source).toContain("setTimeoutFn(() =>");
        expect(source).toContain("void run(\"poll\")");
        expect(source).toContain("scheduleNextPoll()");
        expect(source).not.toContain("setInterval(");
        expect(source).not.toMatch(/broadcast|game_sessions|postgres_changes.*GameSession/i);
    });

    it("polls only the private game-state RPC in the normal gameplay sync path", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );
        const gameplayRefresh = source.slice(
            source.indexOf("const refreshGameplayStateNow = useCallback("),
            source.indexOf("async function runBootstrap()")
        );

        expect(gameplayRefresh).toContain("getMyGameState(createImpostorRoomsClient())");
        expect(gameplayRefresh).not.toContain("getMyActiveRoom(");
        expect(gameplayRefresh).toContain("refreshAuthoritativeRoomState(\"poll-reconcile\")");
    });

    it("starts gameplay polling only after a reconstructed playing state and stops outside gameplay", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("!isGameplayDataState(dataState)");
        expect(source).toContain("clearGameStatePollTimeout()");
        expect(source).toContain("bootstrapState.status !== \"recognized\"");
        expect(source).toContain("!activeRoomId");
        expect(source).toContain("!currentRoomPlayerId");
    });

    it("keeps polling silent and preserves reveal for equivalent private payloads", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("function isSamePrivateGameState(");
        expect(source).toContain("previousState?.status === \"role-reveal\"");
        expect(source).toContain("previousState.isPrivateViewRevealed");
        expect(source).toContain("setDataState(toGameplayDataState(activeLobby, gameState))");
        expect(source).not.toContain("setDataState({ status: \"loading-game-state\", lobby: currentState.lobby })");
    });

    it("handles terminal gameplay errors without infinite polling or stale secret resurrection", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("isExcludedGameStateError(error)");
        expect(source).toContain("status: \"excluded\"");
        expect(source).toContain("isInconsistentGameStateError(error)");
        expect(source).toContain("refreshAuthoritativeRoomState(\"poll-reconcile\")");
        expect(source).toContain("if (!gameState) {");
        expect(source).toContain("currentState.lobby.room.id !== requestRoomId");
    });

    it("keeps transient gameplay poll errors from clearing the last valid private state", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );
        const gameplayRefresh = source.slice(
            source.indexOf("const refreshGameplayStateNow = useCallback("),
            source.indexOf("async function runBootstrap()")
        );

        expect(gameplayRefresh).toContain("return null;");
        expect(gameplayRefresh).not.toContain("setDataState({ status: \"error\"");
        expect(gameplayRefresh).not.toContain("console.log");
    });

    it("pauses gameplay polling while hidden and refreshes immediately on foreground", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/sala/[code]/room-lobby-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("document.visibilityState !== \"hidden\"");
        expect(source).toContain("document.addEventListener(\"visibilitychange\", handleVisibilityChange)");
        expect(source).toContain("document.removeEventListener(\"visibilitychange\", handleVisibilityChange)");
        expect(source).toContain("void run(\"foreground\")");
    });
});

describe("createGameplayPollLoop", () => {
    it("uses recursive timeouts and never overlaps polling requests", async () => {
        vi.useFakeTimers();

        try {
            const first = createDeferred<void>();
            const refresh = vi.fn(() => first.promise);
            const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
            const loop = createGameplayPollLoop({
                intervalMs: 3_000,
                timeoutRef,
                refresh,
                isEligible: () => true,
                isVisible: () => true
            });

            loop.start();
            expect(refresh).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(3_000);
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(refresh).toHaveBeenLastCalledWith("poll");

            await vi.advanceTimersByTimeAsync(9_000);
            expect(refresh).toHaveBeenCalledTimes(1);

            first.resolve();
            await vi.runOnlyPendingTimersAsync();
            expect(refresh).toHaveBeenCalledTimes(2);

            loop.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps transient polling failures on the normal interval", async () => {
        vi.useFakeTimers();

        try {
            const refresh = vi
                .fn<() => Promise<void>>()
                .mockRejectedValueOnce(new Error("network"))
                .mockResolvedValue(undefined);
            const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
            const loop = createGameplayPollLoop({
                intervalMs: 3_000,
                timeoutRef,
                refresh,
                isEligible: () => true,
                isVisible: () => true
            });

            loop.start();
            await vi.advanceTimersByTimeAsync(3_000);
            expect(refresh).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(2_999);
            expect(refresh).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(1);
            expect(refresh).toHaveBeenCalledTimes(2);

            loop.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it("stops polling without scheduling terminal gameplay retries", async () => {
        vi.useFakeTimers();

        try {
            const loopRef: { current?: ReturnType<typeof createGameplayPollLoop> } = {};
            const refresh = vi.fn(async () => {
                loopRef.current?.stop();
            });
            const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
            const loop = createGameplayPollLoop({
                intervalMs: 3_000,
                timeoutRef,
                refresh,
                isEligible: () => true,
                isVisible: () => true
            });
            loopRef.current = loop;

            loop.start();
            await vi.advanceTimersByTimeAsync(3_000);
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(timeoutRef.current).toBeNull();

            await vi.advanceTimersByTimeAsync(9_000);
            expect(refresh).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("pauses hidden tabs and refreshes immediately when foregrounded", async () => {
        vi.useFakeTimers();

        try {
            let visible = true;
            const refresh = vi.fn(async () => undefined);
            const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
            const loop = createGameplayPollLoop({
                intervalMs: 3_000,
                timeoutRef,
                refresh,
                isEligible: () => true,
                isVisible: () => visible
            });

            loop.start();
            visible = false;
            loop.handleVisibilityChange();

            await vi.advanceTimersByTimeAsync(3_000);
            expect(refresh).not.toHaveBeenCalled();
            expect(timeoutRef.current).toBeNull();

            visible = true;
            loop.handleVisibilityChange();
            await Promise.resolve();

            expect(refresh).toHaveBeenCalledTimes(1);
            expect(refresh).toHaveBeenLastCalledWith("foreground");

            await vi.advanceTimersByTimeAsync(3_000);
            expect(refresh).toHaveBeenCalledTimes(2);

            loop.stop();
        } finally {
            vi.useRealTimers();
        }
    });
});
