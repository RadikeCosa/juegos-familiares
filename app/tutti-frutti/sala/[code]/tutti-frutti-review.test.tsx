import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TuttiFruttiReview as Review } from "../../../../lib/supabase/tutti-frutti-review";
import { TuttiFruttiReview } from "./tutti-frutti-review";

const review: Review = {
  roomId: "room-1", sessionId: "session-1", roundId: "round-1", roundNumber: 1,
  phase: "REVIEWING", categories: [
    { position: 1, label: "Nombre", entries: [
      { playerId: "a", nickname: "Ana", answerText: "Mono", isEmpty: false,
        duplicateGroupId: 1, duplicateCount: 2 },
      { playerId: "b", nickname: "Beto", answerText: "mono", isEmpty: false,
        duplicateGroupId: 1, duplicateCount: 2 }
    ] },
    { position: 2, label: "Lugar", entries: [
      { playerId: "a", nickname: "Ana", answerText: "", isEmpty: true,
        duplicateGroupId: null, duplicateCount: 0 }
    ] }
  ]
};

describe("Tutti Frutti review UI", () => {
  it("shows one configured category at a time and identifies provisional matches and empty categories", () => {
    const markup = renderToStaticMarkup(createElement(TuttiFruttiReview, { review }));
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Lugar · 1 para revisar");
    expect(markup).toContain("Mono");
    expect(markup).toContain("Coincidencia provisional con Beto.");
    expect(markup).toContain("Coincidencia provisional con Ana.");
    expect(markup).not.toContain("Sin respuesta</span>");
    expect(markup).toContain("1 de 2");
  });
});
