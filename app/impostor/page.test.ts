import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const createBrowserSupabaseClient = vi.hoisted(() => vi.fn());
const ensureAnonymousAuthIdentity = vi.hoisted(() => vi.fn());

vi.mock("../../lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient
}));

vi.mock("../../lib/supabase/anonymous-auth", () => ({
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

describe("ImpostorPage", () => {
  it("presents the initial Impostor entry without domain gameplay", async () => {
    const { default: ImpostorPage } = await import("./page");
    const page = inspect(ImpostorPage());

    expect(page.text).toContain("Impostor");
    expect(page.text).toContain("pistas, sospechas y engaño");
    expect(page.text).toContain("Todos conocen la palabra menos una persona");
    expect(page.text).toContain("Cada participante usa su teléfono");
    expect(page.hrefs).toContain("/");

    expect(page.text).not.toContain("Crear sala");
    expect(page.text).not.toContain("Unirse a sala");
    expect(page.text).not.toContain("Agregar palabra");
    expect(page.text).not.toContain("Comenzar");
    expect(page.text).not.toContain("nickname");
    expect(page.text).not.toContain("código");
  });

  it("does not create AuthIdentity when /impostor renders", async () => {
    const { default: ImpostorPage } = await import("./page");

    inspect(ImpostorPage());

    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(ensureAnonymousAuthIdentity).not.toHaveBeenCalled();
  });
});

describe("ImpostorJoinPage", () => {
  it("presents an invitation entry without asking for a manual code", async () => {
    const { default: ImpostorJoinPage } = await import("./join/[code]/page");
    const page = inspect(
      await ImpostorJoinPage({
        params: Promise.resolve({ code: "K7M4Q9XA" })
      })
    );

    expect(page.text).toContain("Impostor");
    expect(page.text).toContain("Te invitaron a un grupo de Juegos Familiares");
    expect(page.hrefs).toContain("/impostor");

    expect(page.text).not.toContain("Código");
    expect(page.text).not.toContain("Crear sala");
    expect(page.text).not.toContain("Agregar palabra");
  });

  it("does not create AuthIdentity when /impostor/join/[code] renders", async () => {
    const { default: ImpostorJoinPage } = await import("./join/[code]/page");

    inspect(
      await ImpostorJoinPage({
        params: Promise.resolve({ code: "K7M4Q9XA" })
      })
    );

    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(ensureAnonymousAuthIdentity).not.toHaveBeenCalled();
  });
});

describe("ImpostorGroupPage", () => {
  it("presents the group route with navigation back to Impostor", async () => {
    const { default: ImpostorGroupPage } = await import("./grupo/page");
    const page = inspect(ImpostorGroupPage());

    expect(page.text).toContain("Saltar al contenido");
    expect(page.text).toContain("Impostor");
    expect(page.hrefs).toContain("/impostor");
  });

  it("does not create AuthIdentity when /impostor/grupo renders", async () => {
    const { default: ImpostorGroupPage } = await import("./grupo/page");

    inspect(ImpostorGroupPage());

    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(ensureAnonymousAuthIdentity).not.toHaveBeenCalled();
  });
});
