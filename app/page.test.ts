import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";
import { renderPlatformHomeContext } from "./platform-home-context-shell";
import type { PlatformBootstrapState } from "../lib/supabase/platform-bootstrap";

const createBrowserSupabaseClient = vi.hoisted(() => vi.fn());
const ensureAnonymousAuthIdentity = vi.hoisted(() => vi.fn());
vi.mock("../lib/supabase/browser-client", () => ({ createBrowserSupabaseClient }));
vi.mock("../lib/supabase/anonymous-auth", () => ({ ensureAnonymousAuthIdentity }));

type Props = { children?: ReactNode; href?: string };
function inspect(node: ReactNode): { text: string; hrefs: string[] } {
  if (node === null || node === undefined || typeof node === "boolean") return { text: "", hrefs: [] };
  if (typeof node === "string" || typeof node === "number") return { text: String(node), hrefs: [] };
  if (Array.isArray(node)) return node.reduce((result, child) => {
    const next = inspect(child);
    return { text: result.text + next.text, hrefs: [...result.hrefs, ...next.hrefs] };
  }, { text: "", hrefs: [] });
  if (isValidElement<Props>(node)) {
    const children = inspect(node.props.children);
    return { text: children.text, hrefs: typeof node.props.href === "string" ? [node.props.href, ...children.hrefs] : children.hrefs };
  }
  return { text: "", hrefs: [] };
}

const recognized: PlatformBootstrapState = {
  status: "recognized",
  player: { id: "player-1", groupId: "group-1", nickname: "Ramiro", createdAt: "2026-08-14T12:00:00.000Z" },
  group: { id: "group-1", name: "Familia", adminPlayerId: "player-1", createdAt: "2026-08-14T12:00:00.000Z" }
};

describe("Home", () => {
  it("presents Juegos Familiares and delegates interactive content to the platform shell", () => {
    const page = inspect(Home());
    expect(page.text).toContain("Juegos Familiares");
    expect(page.text).toContain("Juegos simples para compartir en familia o con amigos.");
  });

  it("does not create AuthIdentity when the home route renders", () => {
    inspect(Home());
    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(ensureAnonymousAuthIdentity).not.toHaveBeenCalled();
  });
});

describe("homepage group experience", () => {
  it("shows game cards before the collapsed group section without a separate group link", () => {
    const markup = renderToStaticMarkup(renderPlatformHomeContext(recognized, { status: "absent" }));
    expect(markup).toContain("Familia");
    expect(markup).toContain("Hola, Ramiro");
    expect(markup).toContain("Integrantes");
    expect(markup).toContain("Jugar a Impostor");
    expect(markup).toContain("Tutti Frutti");
    expect(markup).toContain('href="/impostor"');
    expect(markup).toContain('href="/tutti-frutti"');
    expect(markup).not.toContain('href="/grupo"');
    expect(markup.indexOf("Jugar a Impostor")).toBeLessThan(markup.indexOf("<details"));
    expect(markup.indexOf("Tutti Frutti")).toBeLessThan(markup.indexOf("<details"));
    expect(markup).not.toMatch(/<details[^>]*open/);
  });

  it("routes recognized users directly to an active Room", () => {
    const markup = renderToStaticMarkup(renderPlatformHomeContext(recognized, {
      status: "success", room: { id: "room-1", code: "AB7KQ2M4", status: "lobby", gameType: "impostor" }
    }));
    expect(markup).toContain('href="/impostor/sala/AB7KQ2M4"');
    expect(markup).toContain("Volver a la sala");
  });

  it("shows game cards before visible group onboarding to unrecognized visitors", () => {
    const markup = renderToStaticMarkup(renderPlatformHomeContext({ status: "unrecognized", reason: "no-auth" }, { status: "idle" }));
    expect(markup).toContain("Tu grupo");
    expect(markup).toContain("Unirme a un grupo");
    expect(markup).not.toContain("Crear grupo");
    expect(markup).toContain('href="/impostor"');
    expect(markup).toContain('href="/tutti-frutti"');
    expect(markup.indexOf("Jugar a Impostor")).toBeLessThan(markup.indexOf("Tu grupo"));
    expect(markup.indexOf("Tutti Frutti")).toBeLessThan(markup.indexOf("Tu grupo"));
  });

  it("keeps games before home recovery and retry states", () => {
    const inconsistent = renderToStaticMarkup(renderPlatformHomeContext({ status: "inconsistent", reason: "player-without-group" }, { status: "idle" }, { onRetryBootstrap: vi.fn() }));
    const connectionError = renderToStaticMarkup(renderPlatformHomeContext({ status: "connection-error" }, { status: "idle" }, { onRetryBootstrap: vi.fn() }));
    expect(inconsistent).toContain("No pudimos recuperar");
    expect(inconsistent).toContain("Volver a intentar");
    expect(connectionError).toContain("Reintentar");
    for (const markup of [inconsistent, connectionError]) {
      expect(markup).toContain('href="/impostor"');
      expect(markup).toContain('href="/tutti-frutti"');
      expect(markup.indexOf("Jugar a Impostor")).toBeLessThan(markup.indexOf("home-platform-context"));
    }
  });

  it("shows the games above the group loading state", () => {
    const markup = renderToStaticMarkup(renderPlatformHomeContext({ status: "loading" }, { status: "idle" }));
    expect(markup).toContain("Comprobando tu grupo");
    expect(markup.indexOf("Jugar a Impostor")).toBeLessThan(markup.indexOf("Comprobando tu grupo"));
    expect(markup.indexOf("Tutti Frutti")).toBeLessThan(markup.indexOf("Comprobando tu grupo"));
  });
});
