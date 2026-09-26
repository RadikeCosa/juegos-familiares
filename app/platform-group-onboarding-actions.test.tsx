import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlatformGroupJoinByLinkActions, PlatformGroupOnboardingActions } from "./platform-group-onboarding-actions";
import { AdminInvitationPanel, getInvitationShareData } from "./platform-admin-invitation-panel";

const createBrowserSupabaseClient = vi.hoisted(() => vi.fn());
vi.mock("../lib/supabase/browser-client", () => ({ createBrowserSupabaseClient }));
vi.mock("../lib/supabase/anonymous-auth", () => ({ ensureAnonymousAuthIdentity: vi.fn() }));

const noop = () => undefined;

describe("platform group onboarding", () => {
  it("shows group creation only for platform admins", () => {
    const admin = renderToStaticMarkup(<PlatformGroupOnboardingActions initialPlatformPermissions={{ canCreateGroups: true }} />);
    const member = renderToStaticMarkup(<PlatformGroupOnboardingActions initialPlatformPermissions={{ canCreateGroups: false }} />);
    expect(admin).toContain("Crear grupo");
    expect(admin).toContain("Unirme a un grupo");
    expect(member).not.toContain("Crear grupo");
    expect(member).toContain("Unirme a un grupo");
  });

  it("does not create an auth identity merely by rendering homepage onboarding", () => {
    renderToStaticMarkup(<PlatformGroupOnboardingActions initialPlatformPermissions={{ canCreateGroups: false }} />);
    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
  });

  it("offers link invitation acceptance from the platform route", () => {
    const markup = renderToStaticMarkup(<PlatformGroupJoinByLinkActions invitationCode="K7M4Q9XA" />);
    expect(markup).toContain("Te invitaron a un grupo");
    expect(markup).toContain("Continuar");
    expect(markup).not.toContain("Impostor");
  });

  it("returns to home after accepting an invitation", () => {
    const source = readFileSync("app/platform-group-onboarding-actions.tsx", "utf8");
    expect(source).toContain('href="/"');
    expect(source).toContain("Ir al inicio");
    expect(source).toContain('role="status"');
  });
});

describe("platform invitation", () => {
  it("shares links that resolve to the home group experience", () => {
    const invitation = { code: "K7M4Q9XA", path: "/grupo/invitacion/K7M4Q9XA" };
    expect(getInvitationShareData(invitation, "platform")).toEqual({
      title: "Invitación a Juegos Familiares",
      text: "Sumate a mi grupo de Juegos Familiares.",
      url: "/grupo/invitacion/K7M4Q9XA"
    });
  });

  it("shows the platform invitation link only in the platform invitation panel", () => {
    const markup = renderToStaticMarkup(<AdminInvitationPanel
      state={{ status: "success", invitation: { code: "K7M4Q9XA", path: "/grupo/invitacion/K7M4Q9XA" } }}
      onLoadInvitation={noop}
      onCopy={noop}
      onShare={noop}
      context="platform"
    />);
    expect(markup).toContain("K7M4Q9XA");
    expect(markup).toContain("/grupo/invitacion/K7M4Q9XA");
  });
});
