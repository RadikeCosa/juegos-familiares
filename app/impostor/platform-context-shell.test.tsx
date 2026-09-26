import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { renderImpostorPlatformContext } from "./platform-context-shell";
import type { PlatformBootstrapState } from "../../lib/supabase/platform-bootstrap";

vi.mock("../../lib/supabase/browser-client", () => ({ createBrowserSupabaseClient: vi.fn() }));

const recognized: PlatformBootstrapState = {
  status: "recognized",
  player: { id: "player-1", groupId: "group-1", nickname: "Ramiro", createdAt: "2026-08-14T12:00:00.000Z" },
  group: { id: "group-1", name: "Familia", adminPlayerId: "player-1", createdAt: "2026-08-14T12:00:00.000Z" }
};

describe("Impostor room entry", () => {
  it("sends unrecognized users to home for group setup without offering group management in Impostor", () => {
    const markup = renderToStaticMarkup(renderImpostorPlatformContext({ status: "unrecognized", reason: "no-auth" }));
    expect(markup).toContain("Necesitás unirte a un grupo para jugar");
    expect(markup).toContain('href="/"');
    expect(markup).not.toContain("Unirme a un grupo");
    expect(markup).not.toContain("Crear grupo");
    expect(markup).not.toContain("Invitar personas");
  });

  it("keeps room creation and joining in Impostor while omitting group administration", () => {
    const markup = renderToStaticMarkup(renderImpostorPlatformContext(recognized, {
      roomState: { status: "absent" },
      onCreateRoom: vi.fn(),
      onShowJoinRoomForm: vi.fn()
    }));
    expect(markup).toContain("Crear sala");
    expect(markup).toContain("Unirme a una sala");
    expect(markup).toContain("Administrar banco de palabras");
    expect(markup).not.toContain("Tu grupo");
    expect(markup).not.toContain("Familia");
    expect(markup).not.toContain("Compartir invitación");
    expect(markup).not.toContain("Integrantes");
  });

  it("keeps active Room return actions within the game", () => {
    const markup = renderToStaticMarkup(renderImpostorPlatformContext(recognized, {
      roomState: { status: "success", room: { id: "room-1", code: "AB7KQ2M4", status: "playing", gameType: "impostor" } }
    }));
    expect(markup).toContain("Partida en curso");
    expect(markup).toContain('href="/impostor/sala/AB7KQ2M4"');
    expect(markup).not.toContain('href="/impostor/grupo"');
  });
});
