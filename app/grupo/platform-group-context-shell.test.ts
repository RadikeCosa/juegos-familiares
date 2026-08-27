import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getInvitationShareData } from "../platform-admin-invitation-panel";
import {
  renderPlatformGroupContext,
  renderPlatformGroupMembersList
} from "./platform-group-context-shell";
import type { PlatformBootstrapState } from "../../lib/supabase/platform-bootstrap";

vi.mock("../../lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient: vi.fn()
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

const adminBootstrapState: PlatformBootstrapState = {
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

const nonAdminBootstrapState: PlatformBootstrapState = {
  status: "recognized",
  player: {
    id: "player-2",
    groupId: "group-1",
    nickname: "Pedro",
    createdAt: "2026-08-14T12:01:00.000Z"
  },
  group: {
    id: "group-1",
    name: "Familia",
    adminPlayerId: "player-1",
    createdAt: "2026-08-14T12:00:00.000Z"
  }
};

const players = [
  {
    id: "player-2",
    nickname: "Pedro",
    createdAt: "2026-08-14T12:01:00.000Z"
  },
  {
    id: "player-3",
    nickname: "Camila",
    createdAt: "2026-08-14T12:02:00.000Z"
  },
  {
    id: "player-1",
    nickname: "Ramiro",
    createdAt: "2026-08-14T12:00:00.000Z"
  }
];

describe("renderPlatformGroupMembersList", () => {
  it("shows the admin first and marks it with a badge", () => {
    const text = inspect(renderPlatformGroupMembersList(players, "player-1")).text;

    expect(text).toMatch(/^RamiroAdminPedroCamila$/);
  });
});

describe("renderPlatformGroupContext", () => {
  it("can build Platform invitation share data without changing the invitation route", () => {
    expect(
      getInvitationShareData(
        {
          code: "K7M4Q9XA",
          path: "/impostor/join/K7M4Q9XA"
        },
        "platform"
      )
    ).toEqual({
      title: "Invitación a Juegos Familiares",
      text: "Sumate a mi grupo de Juegos Familiares.",
      url: "/impostor/join/K7M4Q9XA"
    });
  });

  it("renders the Platform group surface with members, count and invitation CTA", () => {
    const markup = renderToStaticMarkup(
      renderPlatformGroupContext(adminBootstrapState, {
        status: "success",
        players
      })
    );

    expect(markup).toContain("Familia");
    expect(markup).toContain("Integrantes");
    expect(markup).toContain("3 integrantes");
    expect(markup).toContain("Ramiro");
    expect(markup).toContain("Admin");
    expect(markup).toContain("Pedro");
    expect(markup).toContain("Camila");
    expect(markup).toContain("Buscando invitación");
  });

  it("does not render Impostor-only Room or GroupWord actions", () => {
    const markup = renderToStaticMarkup(
      renderPlatformGroupContext(adminBootstrapState, {
        status: "success",
        players
      })
    );

    expect(markup).not.toContain("Jugar");
    expect(markup).not.toContain("Crear sala");
    expect(markup).not.toContain("Unirme a una sala");
    expect(markup).not.toContain("Banco de palabras");
    expect(markup).not.toContain("Agregar palabras");
    expect(markup).not.toContain("/impostor/grupo/palabras");
  });

  it("renders the non-admin group view without the invitation CTA", () => {
    const markup = renderToStaticMarkup(
      renderPlatformGroupContext(nonAdminBootstrapState, {
        status: "success",
        players
      })
    );

    expect(markup).toContain("Familia");
    expect(markup).toContain("Integrantes");
    expect(markup).not.toContain("Invitar personas");
    expect(markup).not.toContain("Compartir invitacion");
    expect(markup).not.toContain("Copiar codigo");
  });

  it("renders loading states for bootstrap and players", () => {
    expect(
      inspect(renderPlatformGroupContext({ status: "loading" }, { status: "idle" }))
        .text
    ).toContain("Comprobando tu grupo");

    expect(
      inspect(renderPlatformGroupContext(adminBootstrapState, { status: "loading" }))
        .text
    ).toContain("Cargando integrantes");
  });

  it("keeps the group visible when players fail to load", () => {
    const text = inspect(
      renderPlatformGroupContext(
        adminBootstrapState,
        {
          status: "error",
          message: "No pudimos cargar los integrantes. Intenta de nuevo."
        },
        { onRetryPlayers: () => undefined }
      )
    ).text;

    expect(text).toContain("Familia");
    expect(text).toContain("No pudimos cargar los integrantes");
    expect(text).toContain("Reintentar");
  });

  it("renders connection errors with a retry action", () => {
    const text = inspect(
      renderPlatformGroupContext(
        { status: "connection-error" },
        { status: "idle" },
        { onRetryBootstrap: () => undefined }
      )
    ).text;

    expect(text).toContain("No pudimos comprobar tu grupo ahora");
    expect(text).toContain("Reintentar");
  });

  it("sends unrecognized users back to the Platform home without onboarding", () => {
    const page = inspect(
      renderPlatformGroupContext(
        { status: "unrecognized", reason: "no-auth" },
        { status: "idle" }
      )
    );

    expect(page.text).toContain("Todavia no tenes un grupo");
    expect(page.text).toContain("Ir al inicio");
    expect(page.text).not.toContain("Crear grupo");
    expect(page.hrefs).toContain("/");
  });

  it("fails safely when the recognized context is inconsistent", () => {
    const page = inspect(
      renderPlatformGroupContext(
        { status: "inconsistent", reason: "player-without-group" },
        { status: "success", players }
      )
    );

    expect(page.text).toContain("No pudimos recuperar correctamente tu grupo");
    expect(page.text).toContain("Ir al inicio");
    expect(page.text).not.toContain("Familia");
    expect(page.text).not.toContain("Integrantes");
    expect(page.text).not.toContain("Ramiro");
    expect(page.text).not.toContain("Invitar personas");
    expect(page.hrefs).toContain("/");
  });
});
