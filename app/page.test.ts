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

describe("Home", () => {
  it("presents Juegos Familiares with the available Impostor entry point", () => {
    const page = inspect(Home());

    expect(page.text).toContain("Juegos Familiares");
    expect(page.text).toContain("Juegos");
    expect(page.text).toContain("Impostor");
    expect(page.text).toContain("Jugar");
    expect(page.hrefs).toContain("/impostor");
  });

  it("does not create AuthIdentity when / renders", () => {
    inspect(Home());

    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(ensureAnonymousAuthIdentity).not.toHaveBeenCalled();
  });
});

describe("renderPlatformHomeContext", () => {
  it("shows the recognized Player and Group with navigation to the current group route", () => {
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

    const page = inspect(renderPlatformHomeContext(state));

    expect(page.text).toContain("Hola, Ramiro");
    expect(page.text).toContain("Tu grupo");
    expect(page.text).toContain("Familia");
    expect(page.text).toContain("Ver grupo");
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
    expect(
      renderPlatformHomeContext({ status: "unrecognized", reason: "no-auth" })
    ).toBeNull();
  });

  it("handles inconsistent and connection-error states without exposing a group", () => {
    const inconsistentText = inspect(
      renderPlatformHomeContext({
        status: "inconsistent",
        reason: "player-without-group"
      })
    ).text;
    const connectionErrorText = inspect(
      renderPlatformHomeContext({ status: "connection-error" })
    ).text;

    expect(inconsistentText).toContain("No pudimos recuperar correctamente");
    expect(connectionErrorText).toContain("No pudimos comprobar tu grupo ahora");
    expect(inconsistentText).not.toContain("Ver grupo");
    expect(connectionErrorText).not.toContain("Ver grupo");
  });
});
