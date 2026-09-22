import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActiveRoomLobby } from "../../../../lib/supabase/impostor-rooms";
import { TuttiFruttiLobbyContent } from "./tutti-frutti-room-entry";

const lobby: ActiveRoomLobby = {
  room: { id: "room-1", code: "TUTT1234", status: "lobby", gameType: "tutti_frutti" },
  participants: [
    { playerId: "host", nickname: "Ana", isHost: true, isSelf: true, joinedAt: "2026-09-21T00:00:00Z" },
    { playerId: "member", nickname: "Beto", isHost: false, isSelf: false, joinedAt: "2026-09-21T00:01:00Z" }
  ]
};

function render(current: ActiveRoomLobby, connected: Set<string>, connection: "online" | "offline" | "reconnecting" = "online") {
  return renderToStaticMarkup(createElement(TuttiFruttiLobbyContent, {
    lobby: current, connected, connection, busy: false, actionError: null, onExit: vi.fn()
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
    expect(markup).not.toContain("Iniciar partida");
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
});
