import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  copyInvitation,
  getCopyText,
  getInvitationShareData,
  renderAdminInvitationPanel,
  shareInvitation
} from "./admin-invitation-panel";
import { ImpostorAnonymousOnboardingActions } from "./anonymous-onboarding-actions";
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

    expect(text).toContain("Unirme a un grupo");
    expect(text).not.toContain("Crear grupo");
  });

  it("shows the recognized Player and Group with a clear group link", () => {
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

    const text = renderToStaticMarkup(renderImpostorPlatformContext(state));

    expect(text).toContain("Hola, Ramiro");
    expect(text).toContain("Tu grupo");
    expect(text).toContain("Familia");
    expect(text).toContain("Ver grupo");
    expect(text).not.toContain("Crear sala");
    expect(text).not.toContain("Agregar palabra");
    expect(text).not.toContain("Invitar personas");
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

    const text = renderToStaticMarkup(renderImpostorPlatformContext(state));

    expect(text).toContain("Hola, Pedro");
    expect(text).toContain("Tu grupo");
    expect(text).toContain("Familia");
    expect(text).toContain("Ver grupo");
    expect(text).not.toContain("Invitá a los demás");
    expect(text).not.toContain("Invitar personas");
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
