import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  copyInvitation,
  getCopyText,
  getInvitationShareData,
  renderAdminInvitationPanel,
  shareInvitation
} from "./admin-invitation-panel";
import { ImpostorAnonymousOnboardingActions } from "./anonymous-onboarding-actions";
import {
  isShareCancellation,
  renderImpostorPlatformContext
} from "./platform-context-shell";
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

describe("renderImpostorPlatformContext", () => {
  it("keeps onboarding hidden while bootstrap is loading", () => {
    const text = inspect(
      renderImpostorPlatformContext({
        status: "loading"
      })
    ).text;

    expect(text).toContain("Comprobando tu grupo");
    expect(text).not.toContain("Crear grupo");
    expect(text).not.toContain("Unirme a un grupo");
  });

  it("shows onboarding when the user is unrecognized", () => {
    const text = renderToStaticMarkup(
      renderImpostorPlatformContext({
        status: "unrecognized",
        reason: "no-auth"
      })
    );

    expect(text).toContain("Unirme a un grupo");
    expect(text).not.toContain("Crear grupo");
  });

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

    const text = renderToStaticMarkup(
      renderImpostorPlatformContext(state, { roomState: { status: "loading" } })
    );

    expect(text).toContain("Hola, Ramiro");
    expect(text).toContain("Tu grupo");
    expect(text).toContain("Familia");
    expect(text).toContain("Comprobando sala activa");
    expect(text).not.toContain("Ir al juego del grupo");
    expect(text).not.toContain("Compartir invitación");
    expect(text).not.toContain("Crear sala");
    expect(text).not.toContain("Agregar palabra");
    expect(text).not.toContain("Invitar personas");
  });

  it("shows differentiated room actions delegated to the group play section", () => {
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

    const markup = renderToStaticMarkup(
      renderImpostorPlatformContext(state, { roomState: { status: "absent" } })
    );

    expect(markup).toContain("Empezar a jugar");
    expect(markup).toContain("Crear sala");
    expect(markup).toContain("Unirme a una sala");
    expect(markup).toContain("href=\"/impostor/grupo#jugar\"");
    expect(markup).toContain("Compartir invitación");
    expect(markup).toContain("href=\"/grupo\"");
  });

  it("shows active lobby and playing Room CTAs with neutral group navigation", () => {
    const state: PlatformBootstrapState = {
      status: "recognized",
      player: {
        id: "player-2",
        groupId: "group-1",
        nickname: "Pedro",
        createdAt: "2026-08-14T12:00:00.000Z"
      },
      group: {
        id: "group-1",
        name: "Familia",
        adminPlayerId: "player-1",
        createdAt: "2026-08-14T12:00:00.000Z"
      }
    };

    const lobby = renderToStaticMarkup(
      renderImpostorPlatformContext(state, {
        roomState: {
          status: "success",
          room: { id: "room-1", code: "AB7KQ2M4", status: "lobby" }
        }
      })
    );
    const playing = renderToStaticMarkup(
      renderImpostorPlatformContext(state, {
        roomState: {
          status: "success",
          room: { id: "room-1", code: "PLAY1234", status: "playing" }
        }
      })
    );

    expect(lobby).toContain("Sala activa");
    expect(lobby).toContain("Volver a la sala");
    expect(lobby).toContain("Ver grupo");
    expect(lobby).toContain("href=\"/impostor/sala/AB7KQ2M4\"");
    expect(lobby).toContain("href=\"/impostor/grupo\"");
    expect(playing).toContain("Partida en curso");
    expect(playing).toContain("Volver a la partida");
    expect(playing).toContain("href=\"/impostor/sala/PLAY1234\"");
  });

  it("does not show invitation sharing to an admin while a Room is active", () => {
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

    const lobby = renderToStaticMarkup(
      renderImpostorPlatformContext(state, {
        roomState: {
          status: "success",
          room: { id: "room-1", code: "AB7KQ2M4", status: "lobby" }
        }
      })
    );
    const playing = renderToStaticMarkup(
      renderImpostorPlatformContext(state, {
        roomState: {
          status: "success",
          room: { id: "room-1", code: "PLAY1234", status: "playing" }
        }
      })
    );

    expect(lobby).toContain("Volver a la sala");
    expect(lobby).not.toContain("Compartir invitación");
    expect(playing).toContain("Volver a la partida");
    expect(playing).not.toContain("Compartir invitación");
  });

  it("shows retry and a neutral group CTA when active Room lookup fails", () => {
    const state: PlatformBootstrapState = {
      status: "recognized",
      player: {
        id: "player-2",
        groupId: "group-1",
        nickname: "Pedro",
        createdAt: "2026-08-14T12:00:00.000Z"
      },
      group: {
        id: "group-1",
        name: "Familia",
        adminPlayerId: "player-1",
        createdAt: "2026-08-14T12:00:00.000Z"
      }
    };

    const markup = renderToStaticMarkup(
      renderImpostorPlatformContext(state, {
        roomState: {
          status: "error",
          message: "No pudimos comprobar si tenés una sala activa."
        },
        onRetryActiveRoom: vi.fn()
      })
    );

    expect(markup).toContain("No pudimos comprobar si tenés una sala activa.");
    expect(markup).toContain("Reintentar");
    expect(markup).toContain("Ver grupo");
    expect(markup).not.toContain("Ir al juego del grupo");
    expect(markup).toContain("href=\"/impostor/grupo\"");
  });

  it("does not show invitation sharing to an admin when active Room lookup fails", () => {
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

    const markup = renderToStaticMarkup(
      renderImpostorPlatformContext(state, {
        roomState: {
          status: "error",
          message: "No pudimos comprobar si tenés una sala activa."
        },
        onRetryActiveRoom: vi.fn()
      })
    );

    expect(markup).toContain("Reintentar");
    expect(markup).not.toContain("Compartir invitación");
  });

  it("does not duplicate the invitation CTA for a non-admin Player", () => {
    const state: PlatformBootstrapState = {
      status: "recognized",
      player: {
        id: "player-2",
        groupId: "group-1",
        nickname: "Pedro",
        createdAt: "2026-08-14T12:00:00.000Z"
      },
      group: {
        id: "group-1",
        name: "Familia",
        adminPlayerId: "player-1",
        createdAt: "2026-08-14T12:00:00.000Z"
      }
    };

    const text = renderToStaticMarkup(
      renderImpostorPlatformContext(state, { roomState: { status: "absent" } })
    );

    expect(text).toContain("Hola, Pedro");
    expect(text).toContain("Tu grupo");
    expect(text).toContain("Familia");
    expect(text).toContain("Crear sala");
    expect(text).not.toContain("Invitá a los demás");
    expect(text).not.toContain("Invitar personas");
    expect(text).not.toContain("Compartir invitación");
  });

  it("shows connection errors without onboarding", () => {
    const text = inspect(
      renderImpostorPlatformContext({
        status: "connection-error"
      })
    ).text;

    expect(text).toContain("No pudimos comprobar tu grupo ahora");
    expect(text).toContain("Revisá tu conexión");
    expect(text).not.toContain("Crear grupo");
    expect(text).not.toContain("Unirme a un grupo");
  });
});

describe("isShareCancellation", () => {
  it("recognizes a user-cancelled navigator.share() rejection", () => {
    const abortError = new Error("The user aborted the request.");
    abortError.name = "AbortError";

    expect(isShareCancellation(abortError)).toBe(true);
  });

  it("does not treat other share/clipboard failures as a cancellation", () => {
    expect(isShareCancellation(new Error("Share unavailable"))).toBe(false);
    expect(isShareCancellation("not an error")).toBe(false);
  });
});

describe("ImpostorAnonymousOnboardingActions", () => {
  it("shows group creation only to platform admins", () => {
    const text = renderToStaticMarkup(
      <ImpostorAnonymousOnboardingActions
        initialPlatformPermissions={{ canCreateGroups: true }}
      />
    );

    expect(text).toContain("Crear grupo");
    expect(text).toContain("Unirme a un grupo");
  });

  it("keeps invitation join available for non-admin users without showing group creation", () => {
    const text = renderToStaticMarkup(
      <ImpostorAnonymousOnboardingActions
        initialPlatformPermissions={{ canCreateGroups: false }}
      />
    );

    expect(text).toContain("Unirme a un grupo");
    expect(text).not.toContain("Crear grupo");
  });

  it("offers a semantic confirmation and group continuation after invitation join", () => {
    const source = readFileSync(
      join(process.cwd(), "app/impostor/anonymous-onboarding-actions.tsx"),
      "utf8"
    );
    const successBlock = source.slice(
      source.indexOf('{state.status === "success" ? (', source.indexOf("ImpostorJoinByLinkActions")),
      source.indexOf("</section>", source.indexOf("ImpostorJoinByLinkActions"))
    );

    expect(successBlock).toContain('className="impostor-onboarding__success"');
    expect(successBlock).toContain('role="status"');
    expect(successBlock).toContain('href="/impostor/grupo"');
    expect(successBlock).toContain("Ir al grupo");
  });
});

describe("renderAdminInvitationPanel", () => {
  const noop = () => undefined;

  it("renders a loading state with the CTA disabled", () => {
    const markup = renderToStaticMarkup(
      renderAdminInvitationPanel(
        { status: "loading" },
        { onLoadInvitation: noop, onCopy: noop, onShare: noop }
      )
    );

    expect(markup).toContain("Buscando invitación");
    expect(markup).toContain("disabled");
  });

  it("renders the recovered invitation code and link", () => {
    const markup = renderToStaticMarkup(
      renderAdminInvitationPanel(
        {
          status: "success",
          invitation: {
            code: "K7M4Q9XA",
            path: "/impostor/join/K7M4Q9XA"
          }
        },
        { onLoadInvitation: noop, onCopy: noop, onShare: noop }
      )
    );

    expect(markup).toContain("Código de invitación");
    expect(markup).toContain("K7M4Q9XA");
    expect(markup).toContain("/impostor/join/K7M4Q9XA");
    expect(markup).toContain("Compartir invitación");
    expect(markup).toContain("Copiar código");
    expect(markup).toContain("Copiar enlace");
  });

  it("builds group share and copy payloads from the recovered active invitation", () => {
    const invitation = {
      code: "K7M4Q9XA",
      path: "/impostor/join/K7M4Q9XA"
    };

    expect(getCopyText(invitation, "code")).toBe("K7M4Q9XA");
    expect(getInvitationShareData(invitation)).toEqual({
      title: "Invitación a Impostor",
      text: "Sumate a mi grupo de Impostor.",
      url: "/impostor/join/K7M4Q9XA"
    });
  });

  it("copies the group invitation code through the provided clipboard", async () => {
    const writeText = vi.fn(async () => undefined);

    await copyInvitation(
      {
        code: "K7M4Q9XA",
        path: "/impostor/join/K7M4Q9XA"
      },
      "code",
      { clipboard: { writeText } }
    );

    expect(writeText).toHaveBeenCalledWith("K7M4Q9XA");
  });

  it("shares the group invitation link through native share when available", async () => {
    const share = vi.fn(async () => undefined);

    await expect(
      shareInvitation(
        {
          code: "K7M4Q9XA",
          path: "/impostor/join/K7M4Q9XA"
        },
        { share }
      )
    ).resolves.toBe("shared");

    expect(share).toHaveBeenCalledWith({
      title: "Invitación a Impostor",
      text: "Sumate a mi grupo de Impostor.",
      url: "/impostor/join/K7M4Q9XA"
    });
  });

  it("renders recoverable error feedback", () => {
    const markup = renderToStaticMarkup(
      renderAdminInvitationPanel(
        {
          status: "error",
          message: "No pudimos recuperar la invitación. Intentá de nuevo."
        },
        { onLoadInvitation: noop, onCopy: noop, onShare: noop }
      )
    );

    expect(markup).toContain("Invitar personas");
    expect(markup).toContain("No pudimos recuperar la invitación");
  });
});
