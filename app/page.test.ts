import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import Home from "./page";

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
    expect(page.text).toContain("Impostor");
    expect(page.text).toContain("Jugar");
    expect(page.hrefs).toContain("/impostor");
  });
});
