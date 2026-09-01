import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";
import { renderPlatformHomeContext } from "./platform-home-context-shell";
import type { PlatformBootstrapState } from "../lib/supabase/platform-bootstrap";

const createBrowserSupabaseClient = vi.hoisted(() => vi.fn());
const ensureAnonymousAuthIdentity = vi.hoisted(() => vi.fn());

vi.mock("../lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient
}));

vi.mock("../lib/supabase/anonymous-auth", () => ({
  ensureAnonymousAuthIdentity
}));

type InspectableProps = {
  children?: ReactNode;
  href?: string;
};

function inspect(node: ReactNode): { text: string; hrefs: string[] } {
  if (node === null || node === undefined || typeof node === "boolean") {
    return { text: "", hrefs: [] };
  }

  if (typeof node === "string" || typeof node === "number") {
    return { text: String(node), hrefs: [] };
  }

  if (Array.isArray(node)) {
    return node.reduce(
      (result, child) => {
        const inspectedChild = inspect(child);

        return {
          text: result.text + inspectedChild.text,
          hrefs: [...result.hrefs, ...inspectedChild.hrefs]
        };
      },
      { text: "", hrefs: [] }
    );
  }

  if (isValidElement<InspectableProps>(node)) {
    const inspectedChildren = inspect(node.props.children);
    const hrefs =
      typeof node.props.href === "string"
        ? [node.props.href, ...inspectedChildren.hrefs]
        : inspectedChildren.hrefs;

    return {
      text: inspectedChildren.text,
      hrefs
    };
  }

  return { text: "", hrefs: [] };
}

function countMatches(text: string, pattern: string) {
  return text.split(pattern).length - 1;
}

describe("Home", () => {
  it("presents Juegos Familiares with the available Impostor entry point", () => {
    const page = inspect(Home());

    expect(page.text).toContain("Juegos Familiares");
    expect(page.text).toContain("Juegos");
    expect(page.text).toContain("Impostor");
    expect(page.text).toContain("Encontrá al impostor sin revelar demasiado");
    expect(countMatches(page.text, "Impostor")).toBe(1);
    expect(countMatches(page.text, "Encontrá al impostor sin revelar demasiado")).toBe(1);
    expect(page.text).not.toContain("Jugar");
  });

  it("does not create AuthIdentity when / renders", () => {
    inspect(Home());

    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(ensureAnonymousAuthIdentity).not.toHaveBeenCalled();
  });
});

describe("renderPlatformHomeContext", () => {
  it("shows the recognized Player and Group while checking the active Room", () => {
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

    const page = inspect(renderPlatformHomeContext(state, { status: "loading" }));

    expect(page.text).toContain("Hola, Ramiro");
    expect(page.text).toContain("Tu grupo");
    expect(page.text).toContain("Familia");
    expect(page.text).toContain("Comprobando sala activa");
    expect(page.text).not.toContain("Ir al juego del grupo");
    expect(page.text).not.toContain("Volver a la sala");
    expect(page.text).not.toContain("Volver a la partida");
  });

  it("uses a single contextual Impostor CTA when no active Room exists", () => {
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

    const page = inspect(renderPlatformHomeContext(state, { status: "absent" }));

    expect(page.text).toContain("Tu grupo ya está listo para jugar.");
    expect(page.text).toContain("Ir al juego del grupo");
    expect(page.hrefs).toEqual(["/impostor/grupo"]);
  });

  it("links directly to active lobby and playing Rooms", () => {
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

    const lobby = inspect(
      renderPlatformHomeContext(state, {
        status: "success",
        room: { id: "room-1", code: "AB7KQ2M4", status: "lobby" }
      })
    );
    const playing = inspect(
      renderPlatformHomeContext(state, {
        status: "success",
        room: { id: "room-1", code: "PLAY1234", status: "playing" }
      })
    );

    expect(lobby.text).toContain("Sala activa");
    expect(lobby.text).toContain("Volver a la sala");
    expect(lobby.hrefs).toContain("/impostor/sala/AB7KQ2M4");
    expect(playing.text).toContain("Partida en curso");
    expect(playing.text).toContain("Volver a la partida");
    expect(playing.hrefs).toContain("/impostor/sala/PLAY1234");
  });

  it("shows retry and neutral navigation when active Room lookup fails", () => {
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

    const page = inspect(
      renderPlatformHomeContext(
        state,
        { status: "error", message: "No pudimos comprobar si tenés una sala activa." },
        { onRetryActiveRoom: vi.fn() }
      )
    );

    expect(page.text).toContain("No pudimos comprobar si tenés una sala activa.");
    expect(page.text).toContain("Reintentar");
    expect(page.text).toContain("Ir al grupo");
    expect(page.text).not.toContain("Ir al juego del grupo");
    expect(page.hrefs).toContain("/impostor/grupo");
  });

  it("keeps loading state focused on checking the group without showing stale data", () => {
    const markup = renderToStaticMarkup(
      renderPlatformHomeContext({ status: "loading" })
    );

    expect(markup).toContain("Comprobando tu grupo");
    expect(markup).not.toContain("Hola,");
    expect(markup).not.toContain("Ver grupo");
  });

  it("keeps unrecognized users on a lightweight home without onboarding", () => {
    const page = inspect(
      renderPlatformHomeContext({ status: "unrecognized", reason: "no-auth" })
    );

    expect(page.text).toContain(
      "Entrá a Impostor para unirte a tu grupo o seguir jugando."
    );
    expect(page.text).toContain("Jugar");
    expect(page.text).not.toContain("Encontrá al impostor sin revelar demasiado.");
    expect(page.hrefs).toContain("/impostor");
  });

  it("links inconsistent and connection-error states to the neutral Impostor entry", () => {
    const inconsistent = inspect(
      renderPlatformHomeContext({
        status: "inconsistent",
        reason: "player-without-group"
      })
    );
    const connectionError = inspect(
      renderPlatformHomeContext({ status: "connection-error" })
    );

    expect(inconsistent.text).toContain("No pudimos recuperar correctamente");
    expect(inconsistent.text).toContain(
      "Podés entrar a Impostor para revisar tu contexto."
    );
    expect(inconsistent.text).toContain("Ir a Impostor");
    expect(inconsistent.text).not.toContain("Ver grupo");
    expect(inconsistent.hrefs).toContain("/impostor");

    expect(connectionError.text).toContain("No pudimos comprobar tu grupo ahora");
    expect(connectionError.text).toContain(
      "Podés entrar a Impostor y volver a intentar desde ahí."
    );
    expect(connectionError.text).toContain("Ir a Impostor");
    expect(connectionError.text).not.toContain("Ver grupo");
    expect(connectionError.hrefs).toContain("/impostor");
  });
});
