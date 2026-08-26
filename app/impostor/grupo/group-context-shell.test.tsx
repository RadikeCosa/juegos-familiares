import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  formatAvailableWords,
  renderGroupMembersList,
  renderImpostorGroupContext
} from "./group-context-shell";
import type { PlatformBootstrapState } from "../../../lib/supabase/platform-bootstrap";

vi.mock("../../../lib/supabase/browser-client", () => ({
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

describe("renderGroupMembersList", () => {
  it("shows the admin first and marks it with a badge", () => {
    const text = inspect(renderGroupMembersList(players, "player-1")).text;

    expect(text).toMatch(/^RamiroAdminPedroCamila$/);
  });
});

describe("renderImpostorGroupContext", () => {
  it("renders the admin group view with members and invitation CTA", () => {
    const markup = renderToStaticMarkup(
      renderImpostorGroupContext(adminBootstrapState, {
        status: "success",
        players
      })
    );

    expect(markup).toContain("Familia");
    expect(markup).toContain("Integrantes");
    expect(markup).toContain("Ramiro");
    expect(markup).toContain("Admin");
    expect(markup).toContain("Pedro");
    expect(markup).toContain("Camila");
    expect(markup).toContain("Banco de palabras");
    expect(markup).toContain("Cargando banco");
    expect(markup).toContain("/impostor/grupo/palabras");
    expect(markup).toContain("Invitar personas");
  });

  it("renders the non-admin group view without the invitation CTA", () => {
    const markup = renderToStaticMarkup(
      renderImpostorGroupContext(nonAdminBootstrapState, {
        status: "success",
        players
      })
    );

    expect(markup).toContain("Familia");
    expect(markup).toContain("Integrantes");
    expect(markup).toContain("Ramiro");
    expect(markup).toContain("Admin");
    expect(markup).not.toContain("Invitar personas");
    expect(markup).not.toContain("Compartir invitación");
    expect(markup).not.toContain("Copiar código");
  });

  it("renders loading states for bootstrap and players", () => {
    expect(
      inspect(
        renderImpostorGroupContext({ status: "loading" }, { status: "idle" })
      ).text
    ).toContain("Comprobando tu grupo");

    expect(
      inspect(renderImpostorGroupContext(adminBootstrapState, { status: "loading" }))
        .text
    ).toContain("Cargando integrantes");
  });

  it("keeps the group visible when players fail to load", () => {
    const text = inspect(
      renderImpostorGroupContext(adminBootstrapState, {
        status: "error",
        message: "No pudimos cargar los integrantes. Intentá de nuevo."
      })
    ).text;

    expect(text).toContain("Familia");
    expect(text).toContain("No pudimos cargar los integrantes");
    expect(text).toContain("Reintentar");
  });

  it("renders connection errors with a retry action", () => {
    const text = inspect(
      renderImpostorGroupContext(
        { status: "connection-error" },
        { status: "idle" },
        { onRetryBootstrap: () => undefined }
      )
    ).text;

    expect(text).toContain("No pudimos comprobar tu grupo ahora");
    expect(text).toContain("Reintentar");
  });

  it("sends unrecognized users back to /impostor without onboarding", () => {
    const page = inspect(
      renderImpostorGroupContext(
        { status: "unrecognized", reason: "no-auth" },
        { status: "idle" }
      )
    );

    expect(page.text).toContain("Todavía no tenés un grupo");
    expect(page.text).toContain("Ir a Impostor");
    expect(page.text).not.toContain("Crear grupo");
    expect(page.hrefs).toContain("/impostor");
  });

  it("sends sessions without Player back to /impostor", () => {
    const page = inspect(
      renderImpostorGroupContext(
        { status: "unrecognized", reason: "no-player" },
        { status: "idle" }
      )
    );

    expect(page.text).toContain("Todavía no tenés un grupo");
    expect(page.hrefs).toContain("/impostor");
  });

  it("documents direct refresh as bootstrap followed by players loading", () => {
    const text = inspect(
      renderImpostorGroupContext(adminBootstrapState, { status: "loading" })
    ).text;

    expect(text).toContain("Familia");
    expect(text).toContain("Cargando integrantes");
  });

  it("renders the word bank summary for a recognized player", () => {
    const markup = renderToStaticMarkup(
      renderImpostorGroupContext(
        adminBootstrapState,
        {
          status: "success",
          players
        },
        {
          groupWordsState: {
            status: "success",
            totalCount: 12,
            ownWords: [
              {
                id: "word-1",
                text: "Chocotorta",
                createdAt: "2026-08-18T13:00:00.000Z"
              },
              {
                id: "word-2",
                text: "Torre Eiffel",
                createdAt: "2026-08-18T13:01:00.000Z"
              },
              {
                id: "word-3",
                text: "Harry Potter",
                createdAt: "2026-08-18T13:02:00.000Z"
              }
            ]
          }
        }
      )
    );

    expect(markup).toContain("Banco de palabras");
    expect(markup).toContain("12 disponibles");
    expect(markup).toContain("Tus aportes");
    expect(markup).toContain("<dd>3</dd>");
    expect(markup).toContain("Agregar palabras");
    expect(markup).toContain("/impostor/grupo/palabras");
  });

  it("pluralizes the available words count", () => {
    expect(formatAvailableWords(0)).toBe("0 disponibles");
    expect(formatAvailableWords(1)).toBe("1 disponible");
    expect(formatAvailableWords(12)).toBe("12 disponibles");
  });
});
