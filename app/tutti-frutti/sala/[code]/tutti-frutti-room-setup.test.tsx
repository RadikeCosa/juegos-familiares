import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION } from "../../../../lib/supabase/tutti-frutti-room-setup";
import { TuttiFruttiRoomSetup } from "./tutti-frutti-room-setup";

function render(options: Partial<Parameters<typeof TuttiFruttiRoomSetup>[0]> = {}) {
  return renderToStaticMarkup(createElement(TuttiFruttiRoomSetup, {
    configuration: DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION,
    isHost: true,
    roomStatus: "lobby",
    connection: "online",
    dirty: false,
    stale: false,
    saving: false,
    error: null,
    notice: null,
    onChange: vi.fn(),
    onSave: vi.fn(),
    onReload: vi.fn(),
    ...options
  }));
}

describe("Tutti Frutti room setup UI", () => {
  it("shows the suggested rounds and five ordered preset categories", () => {
    const markup = render({ dirty: true });
    expect(markup).toContain("5 rondas");
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Animal");
    expect(markup).toContain("Comida");
    expect(markup).toContain("Lugar");
    expect(markup).toContain("Objeto");
    expect(markup).toContain("5/6 categorías");
    expect(markup).toContain("Guardar configuración");
  });

  it("does not expose edit controls to a member and explains the frozen state", () => {
    const markup = render({ isHost: false, roomStatus: "playing" });
    expect(markup).toContain("quedó fijada al comenzar");
    expect(markup).not.toContain("Agregar categoría personalizada");
    expect(markup).not.toContain("Guardar configuración");
  });

  it("makes stale host drafts reload before saving again", () => {
    const markup = render({ stale: true, dirty: true });
    expect(markup).toContain("Otra pestaña guardó una configuración más reciente");
    expect(markup).toContain("Recargar configuración");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Guardar configuración<\/button>/);
  });
});
