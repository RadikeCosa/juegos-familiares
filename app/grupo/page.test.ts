import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import PlatformGroupPage, { metadata } from "./page";

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

describe("/grupo", () => {
  it("defines the canonical Platform group page shell", () => {
    const page = inspect(PlatformGroupPage());

    expect(metadata.title).toBe("Tu grupo | Juegos Familiares");
    expect(page.text).toContain("Saltar al contenido");
    expect(page.text).toContain("Juegos Familiares");
    expect(page.text).toContain("Impostor");
    expect(page.hrefs).toContain("/");
    expect(page.hrefs).toContain("/impostor");
  });
});
