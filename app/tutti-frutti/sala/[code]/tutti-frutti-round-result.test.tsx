import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TuttiFruttiRoundResult } from "../../../../lib/supabase/tutti-frutti-result";
import { TuttiFruttiRoundResultView } from "./tutti-frutti-round-result";

const result: TuttiFruttiRoundResult = {
  roomId: "room-1", sessionId: "session-1", roundId: "round-1", roundNumber: 1,
  phase: "RESULT", scoredAt: "2026-09-25T12:00:00Z", serverNow: "2026-09-25T12:00:01Z",
  categories: [{ position: 1, label: "Animal", entries: [
    { playerId: "a", nickname: "Ana", answerText: "Mono", isEmpty: false, isValid: true, points: 10 },
    { playerId: "b", nickname: "Beto", answerText: "", isEmpty: true, isValid: false, points: 0 }
  ] }],
  totals: [
    { playerId: "a", nickname: "Ana", roundPoints: 10, totalPoints: 20, rank: 1 },
    { playerId: "b", nickname: "Beto", roundPoints: 0, totalPoints: 8, rank: 2 }
  ]
};

describe("Tutti Frutti round result", () => {
  it("explains awarded points and keeps participants with no saved answer visible", () => {
    const markup = renderToStaticMarkup(createElement(TuttiFruttiRoundResultView, {
      result, currentPlayerId: "b"
    }));
    expect(markup).toContain("Resultado de la ronda 1");
    expect(markup).toContain("+10 puntos · 20 acumulados");
    expect(markup).toContain("Mono");
    expect(markup).toContain("Sin respuesta · 0 puntos");
    expect(markup).toContain("(vos)");
  });
});
