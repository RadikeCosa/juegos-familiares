import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TuttiFruttiReview as Review } from "../../../../lib/supabase/tutti-frutti-review";
import { TuttiFruttiReview } from "./tutti-frutti-review";

const review: Review = {
  roomId: "room-1", sessionId: "session-1", roundId: "round-1", roundNumber: 1,
  phase: "REVIEWING", serverNow: "2026-09-25T12:00:00Z", activeChallenge: null, categories: [
    { position: 1, label: "Nombre", entries: [
      { playerId: "a", nickname: "Ana", answerText: "Mono", isEmpty: false,
        duplicateGroupId: 1, duplicateCount: 2, canChallenge: false, challengeStatus: null },
      { playerId: "b", nickname: "Beto", answerText: "mono", isEmpty: false,
        duplicateGroupId: 1, duplicateCount: 2, canChallenge: true, challengeStatus: null }
    ] },
    { position: 2, label: "Lugar", entries: [
      { playerId: "a", nickname: "Ana", answerText: "", isEmpty: true,
        duplicateGroupId: null, duplicateCount: 0, canChallenge: false, challengeStatus: null }
    ] }
  ]
};

describe("Tutti Frutti review UI", () => {
  it("shows one configured category at a time and identifies provisional matches and empty categories", () => {
    const markup = renderToStaticMarkup(createElement(TuttiFruttiReview, {
      review, currentPlayerId: "a", challengeSeconds: 0, connection: "online", busy: false,
      error: null, isHost: true, scoring: false, onScore: () => {},
      onOpenChallenge: () => {}, onVote: () => {}
    }));
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Lugar · 1 para revisar");
    expect(markup).toContain("Mono");
    expect(markup).toContain("Coincidencia provisional con Beto.");
    expect(markup).toContain("Coincidencia provisional con Ana.");
    expect(markup).not.toContain("Sin respuesta</span>");
    expect(markup).toContain("1 de 2");
    expect(markup).toContain("Impugnar respuesta");
    expect(markup).toContain("Finalizar revisión y puntuar");
  });

  it("shows only the current player's choice and uses mutual agreement for two players", () => {
    const activeReview = { ...review, activeChallenge: {
      id: "challenge-1", targetPlayerId: "a", categoryPosition: 1,
      deadlineAt: "2026-09-25T12:00:30Z", myVote: null, canVote: true
    } };
    const markup = renderToStaticMarkup(createElement(TuttiFruttiReview, {
      review: activeReview, currentPlayerId: "b", challengeSeconds: 30, connection: "online", busy: false,
      error: null, isHost: false, scoring: false, onScore: () => {},
      onOpenChallenge: () => {}, onVote: () => {}
    }));
    expect(markup).toContain("De acuerdo: invalidar");
    expect(markup).toContain("No estoy de acuerdo");
    expect(markup).not.toContain("votos para invalidar");
    expect(markup).not.toContain("Votar válida");
  });

  it("offers a private VALID/INVALID ballot to a non-author in a three-player game", () => {
    const threePlayerReview: Review = {
      ...review,
      categories: [{ ...review.categories[0], entries: [...review.categories[0].entries, {
        playerId: "c", nickname: "Cora", answerText: "Rana", isEmpty: false,
        duplicateGroupId: null, duplicateCount: 0, canChallenge: true, challengeStatus: null
      }] }]
    };
    const activeReview: Review = { ...threePlayerReview, activeChallenge: {
      id: "challenge-1", targetPlayerId: "a", categoryPosition: 1,
      deadlineAt: "2026-09-25T12:00:30Z", myVote: null, canVote: true
    } };
    const markup = renderToStaticMarkup(createElement(TuttiFruttiReview, {
      review: activeReview, currentPlayerId: "c", challengeSeconds: 18, connection: "online", busy: false,
      error: null, isHost: false, scoring: false, onScore: () => {},
      onOpenChallenge: () => {}, onVote: () => {}
    }));
    expect(markup).toContain("Votar válida");
    expect(markup).toContain("Votar inválida");
    expect(markup).toContain("La decisión cierra en 18 segundos.");
    expect(markup).not.toContain("votos para invalidar");
  });
});
