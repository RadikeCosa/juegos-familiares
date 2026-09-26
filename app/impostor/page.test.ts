import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ImpostorPage from "./page";
import LegacyImpostorGroupPage from "./grupo/page";
import LegacyImpostorJoinPage from "./join/[code]/page";
import WordBankPage from "./grupo/palabras/page";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

const createBrowserSupabaseClient = vi.hoisted(() => vi.fn());
const ensureAnonymousAuthIdentity = vi.hoisted(() => vi.fn());
vi.mock("../../lib/supabase/browser-client", () => ({ createBrowserSupabaseClient }));
vi.mock("../../lib/supabase/anonymous-auth", () => ({ ensureAnonymousAuthIdentity }));

type Props = { children?: ReactNode; href?: string };
function inspect(node: ReactNode): { text: string; hrefs: string[] } {
  if (node === null || node === undefined || typeof node === "boolean") return { text: "", hrefs: [] };
  if (typeof node === "string" || typeof node === "number") return { text: String(node), hrefs: [] };
  if (Array.isArray(node)) return node.reduce((result, child) => {
    const next = inspect(child);
    return { text: result.text + next.text, hrefs: [...result.hrefs, ...next.hrefs] };
  }, { text: "", hrefs: [] });
  if (isValidElement<Props>(node)) {
    const child = inspect(node.props.children);
    return { text: child.text, hrefs: typeof node.props.href === "string" ? [node.props.href, ...child.hrefs] : child.hrefs };
  }
  return { text: "", hrefs: [] };
}

describe("Impostor routes", () => {
  it("keeps the Impostor entry and its room UI inside the game", () => {
    const page = inspect(ImpostorPage());
    expect(page.text).toContain("Impostor");
    expect(page.text).toContain("pistas, sospechas y engaño");
    expect(page.hrefs).toContain("/");
  });

  it("redirects the retired Impostor group page to its game entry", () => {
    redirect.mockClear();
    LegacyImpostorGroupPage();
    expect(redirect).toHaveBeenCalledWith("/impostor");
  });

  it("redirects legacy group invitation URLs to the platform invitation route", async () => {
    redirect.mockClear();
    await LegacyImpostorJoinPage({ params: Promise.resolve({ code: "K7M4Q9XA" }) });
    expect(redirect).toHaveBeenCalledWith("/grupo/invitacion/K7M4Q9XA");
  });

  it("keeps the Impostor word bank route within the game", () => {
    const page = inspect(WordBankPage());
    expect(page.text).toContain("Impostor");
    expect(page.hrefs).toContain("/impostor");
  });

  it("does not create AuthIdentity when static Impostor and word-bank routes render", () => {
    inspect(ImpostorPage());
    inspect(WordBankPage());
    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(ensureAnonymousAuthIdentity).not.toHaveBeenCalled();
  });
});
