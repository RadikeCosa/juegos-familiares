import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import ImpostorPage from "./page";

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
  it("presents the initial Impostor entry without playable actions", () => {
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
  });
});
