import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderImpostorPlatformContext } from "./platform-context-shell";
import type { PlatformBootstrapState } from "../../lib/supabase/platform-bootstrap";

vi.mock("../../lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient: vi.fn()
}));

type InspectableProps = {
  children?: ReactNode;
};

function inspect(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(inspect).join("");
  }

  if (isValidElement<InspectableProps>(node)) {
    return inspect(node.props.children);
  }

  return "";
}

describe("renderImpostorPlatformContext", () => {
  it("keeps onboarding hidden while bootstrap is loading", () => {
    const text = inspect(
      renderImpostorPlatformContext({
        status: "loading"
      })
    );

    expect(text).toContain("Comprobando tu grupo");
    expect(text).not.toContain("Crear grupo");
    expect(text).not.toContain("Unirme a un grupo");
  });

  it("shows onboarding when the user is unrecognized", () => {
    const text = inspect(
      renderImpostorPlatformContext({
        status: "unrecognized",
        reason: "no-auth"
      })
    );

    expect(text).toContain("Crear grupo");
    expect(text).toContain("Unirme a un grupo");
  });

  it("shows the recognized Player and Group", () => {
    const state: PlatformBootstrapState = {
      status: "recognized",
      player: {
        id: "player-1",
        groupId: "group-1",
        nickname: "Ramiro",
        createdAt: "2026-08-14T12:00:00.000Z"
      },
      group: {
        id: "group-1",
        name: "Familia",
        adminPlayerId: "player-1",
        createdAt: "2026-08-14T12:00:00.000Z"
      }
    };

    const text = inspect(renderImpostorPlatformContext(state));

    expect(text).toContain("Hola, Ramiro");
    expect(text).toContain("Grupo: Familia");
    expect(text).not.toContain("Crear sala");
    expect(text).not.toContain("Agregar palabra");
  });

  it("shows connection errors without onboarding", () => {
    const text = inspect(
      renderImpostorPlatformContext({
        status: "connection-error"
      })
    );

    expect(text).toContain("No pudimos comprobar tu grupo ahora");
    expect(text).toContain("Revisá tu conexión");
    expect(text).not.toContain("Crear grupo");
    expect(text).not.toContain("Unirme a un grupo");
  });
});
