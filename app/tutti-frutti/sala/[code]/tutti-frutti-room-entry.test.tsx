import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActiveRoomLobby } from "../../../../lib/supabase/impostor-rooms";
import type { TuttiFruttiStartedGame } from "../../../../lib/supabase/tutti-frutti-game";
import { TuttiFruttiLobbyContent } from "./tutti-frutti-room-entry";

const lobby: ActiveRoomLobby = {
  room: { id: "room-1", code: "TUTT1234", status: "lobby", gameType: "tutti_frutti" },
  participants: [
    { playerId: "host", nickname: "Ana", isHost: true, isSelf: true, joinedAt: "2026-09-21T00:00:00Z" },
    { playerId: "member", nickname: "Beto", isHost: false, isSelf: false, joinedAt: "2026-09-21T00:01:00Z" }
  ]
};

function render(
  current: ActiveRoomLobby,
  connected: Set<string>,
  connection: "online" | "offline" | "reconnecting" = "online",
  game: TuttiFruttiStartedGame | null = null,
  overrides: Partial<Parameters<typeof TuttiFruttiLobbyContent>[0]> = {}
) {
  return renderToStaticMarkup(createElement(TuttiFruttiLobbyContent, {
    lobby: current, connected, connection, busy: false, starting: false,
    voting: false, skipSeconds: 5, game,
    gameError: null, actionError: null, onStart: vi.fn(), onSkipVote: vi.fn(), onExit: vi.fn(),
    ...overrides
  }));
}

describe("Tutti Frutti lobby", () => {
  it("shows the authoritative roster, host, and visual Presence separately", () => {
    const markup = render(lobby, new Set(["host"]));
    expect(markup).toContain("Código TUTT1234");
    expect(markup).toContain("Ana");
    expect(markup).toContain("Beto");
    expect(markup).toContain("Host");
    expect(markup).toContain("conectado");
    expect(markup).toContain("desconectado");
    expect(markup).toContain("Cerrar sala");
    expect(markup).toContain("Iniciar partida");
  });

  it("lets a member leave and keeps actions unavailable while offline", () => {
    const memberLobby: ActiveRoomLobby = {
      ...lobby,
      participants: lobby.participants.map((participant) => ({
        ...participant, isSelf: participant.playerId === "member"
      }))
    };
    const markup = render(memberLobby, new Set(), "offline");
    expect(markup).toContain("Salir de la sala");
    expect(markup).toContain("Sin conexión");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Salir de la sala<\/button>/);
  });

  it("does not offer start to a guest and waits for the host", () => {
    const memberLobby: ActiveRoomLobby = {
      ...lobby,
      participants: lobby.participants.map((participant) => ({
        ...participant, isSelf: participant.playerId === "member"
      }))
    };
    const markup = render(memberLobby, new Set());
    expect(markup).toContain("Esperando a que el anfitrión inicie la partida.");
    expect(markup).not.toContain("Iniciar partida");
  });

  it("shows the shared candidate letter once the Room is playing", () => {
    const playingLobby: ActiveRoomLobby = {
      ...lobby,
      room: { ...lobby.room, status: "playing" }
    };
    const game: TuttiFruttiStartedGame = {
      roomId: "room-1", roomStatus: "playing", sessionId: "session-1",
      serverNow: "2026-09-24T20:00:00.000Z",
      startedByPlayerId: "host", roundCount: 5,
      categories: [{ position: 1, kind: "preset", key: "name", label: "Nombre" }],
      participants: [
        { playerId: "host", nickname: "Ana" },
        { playerId: "member", nickname: "Beto" }
      ],
      round: {
        number: 1, phase: "LETTER_PENDING", letter: "M", countdownEndsAt: null, calledByPlayerId: null, lockedAt: null,
        letterDecision: {
          candidateId: "candidate-1", deadlineAt: "2026-09-24T20:00:05.000Z",
          votes: 0, votesRequired: 2, hasVoted: false, canSkip: true
        }
      }
    };
    const markup = render(playingLobby, new Set(), "online", game);
    expect(markup).toContain("Partida iniciada");
    expect(markup).toContain("Letra M");
    expect(markup).toContain("Categorías: Nombre");
    expect(markup).toContain("Votos para saltar: 0 de 2 necesarios.");
    expect(markup).toContain("Votar para saltarla");
    expect(markup).toContain("La letra se acepta en 5 segundos");
    expect(markup).not.toContain("Iniciar partida");
  });

  it("shows the reserve rule and disables skipping when letters are needed for later rounds", () => {
    const playingLobby: ActiveRoomLobby = {
      ...lobby, room: { ...lobby.room, status: "playing" }
    };
    const game: TuttiFruttiStartedGame = {
      roomId: "room-1", roomStatus: "playing", sessionId: "session-1",
      serverNow: "2026-09-24T20:00:00.000Z",
      startedByPlayerId: "host", roundCount: 5,
      categories: [{ position: 1, kind: "preset", key: "name", label: "Nombre" }],
      participants: [
        { playerId: "host", nickname: "Ana" },
        { playerId: "member", nickname: "Beto" }
      ],
      round: {
        number: 1, phase: "LETTER_PENDING", letter: "M", countdownEndsAt: null, calledByPlayerId: null, lockedAt: null,
        letterDecision: {
          candidateId: "candidate-1", deadlineAt: "2026-09-24T20:00:05.000Z",
          votes: 0, votesRequired: 2, hasVoted: false, canSkip: false
        }
      }
    };
    const markup = render(playingLobby, new Set(), "online", game);
    expect(markup).toContain("Votos para saltar: 0 de 2 necesarios.");
    expect(markup).toContain("no se puede saltar");
    expect(markup).not.toContain("Votar para saltarla");
  });

  it("shows the accepted letter after the deadline transition", () => {
    const playingLobby: ActiveRoomLobby = {
      ...lobby, room: { ...lobby.room, status: "playing" }
    };
    const game: TuttiFruttiStartedGame = {
      roomId: "room-1", roomStatus: "playing", sessionId: "session-1",
      serverNow: "2026-09-24T20:00:06.000Z",
      startedByPlayerId: "host", roundCount: 5,
      categories: [{ position: 1, kind: "preset", key: "name", label: "Nombre" }],
      participants: [{ playerId: "host", nickname: "Ana" }],
      round: { number: 1, phase: "PLAYING", letter: "M", countdownEndsAt: null, calledByPlayerId: null, lockedAt: null, letterDecision: null }
    };
    const markup = render(playingLobby, new Set(), "online", game);
    expect(markup).toContain("Letra confirmada. Completá y guardá todas las categorías para llamar Tutti Frutti.");
    expect(markup).not.toContain("Votar para saltarla");
    expect(markup).toContain("Tutti Frutti</button>");
  });

  it("shows the first caller and shared countdown without exposing other answers", () => {
    const playingLobby = { ...lobby, room: { ...lobby.room, status: "playing" as const } };
    const game: TuttiFruttiStartedGame = {
      roomId: "room-1", roomStatus: "playing", sessionId: "session-1",
      serverNow: "2026-09-25T12:00:00.000Z", startedByPlayerId: "host", roundCount: 5,
      categories: [{ position: 1, kind: "preset", key: "name", label: "Nombre" }],
      participants: [{ playerId: "host", nickname: "Ana" }, { playerId: "member", nickname: "Beto" }],
      round: { number: 1, phase: "FINAL_COUNTDOWN", letter: "M",
        countdownEndsAt: "2026-09-25T12:00:45.000Z", calledByPlayerId: "member",
        lockedAt: null, letterDecision: null }
    };
    const markup = render(playingLobby, new Set(), "online", game, { countdownSeconds: 37 });
    expect(markup).toContain("Beto llamó Tutti Frutti.");
    expect(markup).toContain("37 segundos restantes");
    expect(markup).not.toContain("Tutti Frutti</button>");
  });

  it("shows a waiting state and warns about unconfirmed edits after lock", () => {
    const playingLobby = { ...lobby, room: { ...lobby.room, status: "playing" as const } };
    const game: TuttiFruttiStartedGame = {
      roomId: "room-1", roomStatus: "playing", sessionId: "session-1",
      serverNow: "2026-09-25T12:00:46.000Z", startedByPlayerId: "host", roundCount: 5,
      categories: [{ position: 1, kind: "preset", key: "name", label: "Nombre" }],
      participants: [{ playerId: "host", nickname: "Ana" }],
      round: { number: 1, phase: "REVIEWING", letter: "M",
        countdownEndsAt: "2026-09-25T12:00:45.000Z", calledByPlayerId: "host",
        lockedAt: "2026-09-25T12:00:45.100Z", letterDecision: null }
    };
    const markup = render(playingLobby, new Set(), "online", game, { unconfirmedAnswers: true });
    expect(markup).toContain("Respuestas bloqueadas. Esperando la revisión.");
    expect(markup).toContain("Alguna edición no alcanzó a guardarse");
    expect(markup).not.toContain("Tutti Frutti</button>");
  });

  it("keeps a submitted vote fixed and disables the action for that candidate", () => {
    const playingLobby: ActiveRoomLobby = {
      ...lobby, room: { ...lobby.room, status: "playing" }
    };
    const game: TuttiFruttiStartedGame = {
      roomId: "room-1", roomStatus: "playing", sessionId: "session-1",
      serverNow: "2026-09-24T20:00:00.000Z",
      startedByPlayerId: "host", roundCount: 5,
      categories: [{ position: 1, kind: "preset", key: "name", label: "Nombre" }],
      participants: [{ playerId: "host", nickname: "Ana" }],
      round: {
        number: 1, phase: "LETTER_PENDING", letter: "M", countdownEndsAt: null, calledByPlayerId: null, lockedAt: null,
        letterDecision: {
          candidateId: "candidate-1", deadlineAt: "2026-09-24T20:00:05.000Z",
          votes: 1, votesRequired: 2, hasVoted: true, canSkip: true
        }
      }
    };
    const markup = render(playingLobby, new Set(), "online", game);
    expect(markup).toContain("Voto registrado");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Voto registrado<\/button>/);
  });
});
