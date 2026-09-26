import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GroupInvitationPage from "./page";

vi.mock("../../../../lib/supabase/browser-client", () => ({ createBrowserSupabaseClient: vi.fn() }));

describe("platform group invitation route", () => {
  it("opens the group invitation flow in the Juegos Familiares surface", async () => {
    const page = await GroupInvitationPage({ params: Promise.resolve({ code: "K7M4Q9XA" }) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Te invitaron a un grupo");
    expect(markup).toContain("Continuar");
    expect(markup).toContain('href="/"');
    expect(markup).not.toContain("Impostor");
  });
});
