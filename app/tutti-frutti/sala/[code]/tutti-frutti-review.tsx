"use client";

import { useState } from "react";
import type { TuttiFruttiReview as Review } from "../../../../lib/supabase/tutti-frutti-review";

export function TuttiFruttiReview({
  review, currentPlayerId, challengeSeconds, connection, busy, error,
  onOpenChallenge, onVote
}: {
  review: Review;
  currentPlayerId: string;
  challengeSeconds: number;
  connection: "online" | "offline" | "reconnecting";
  busy: boolean;
  error: string | null;
  onOpenChallenge: (playerId: string, categoryPosition: number) => void;
  onVote: (challengeId: string, choice: "VALID" | "INVALID") => void;
}) {
  const [selectedPosition, setSelectedPosition] = useState(review.categories[0]?.position ?? 0);
  const visiblePosition = review.activeChallenge?.categoryPosition ?? selectedPosition;
  const selectedIndex = Math.max(0, review.categories.findIndex((category) => category.position === visiblePosition));
  const category = review.categories[selectedIndex];
  if (!category) return <p role="status">No hay categorías para revisar.</p>;
  const exceptions = (position: number) => review.categories.find((item) => item.position === position)?.entries
    .filter((entry) => entry.isEmpty || entry.duplicateGroupId !== null).length ?? 0;

  const activeChallenge = review.activeChallenge;
  const targetCategory = activeChallenge
    ? review.categories.find((item) => item.position === activeChallenge.categoryPosition) : null;
  const targetAnswer = targetCategory?.entries.find((entry) => entry.playerId === activeChallenge?.targetPlayerId);
  const twoPlayers = (review.categories[0]?.entries.length ?? 0) === 2;

  return (
    <section className="tutti-review" aria-labelledby="tutti-review-title">
      <h2 id="tutti-review-title">Respuestas de la ronda</h2>
      <p>Las coincidencias son provisionales. Las respuestas todavía no tienen puntaje.</p>
      {activeChallenge && targetAnswer ? (
        <section className="tutti-challenge" aria-labelledby="tutti-challenge-title">
          <h3 id="tutti-challenge-title">Impugnación · {targetCategory?.label}</h3>
          <p><strong>{targetAnswer.nickname}:</strong> {targetAnswer.answerText}</p>
          <p role="timer">{challengeSeconds > 0
            ? `La decisión cierra en ${challengeSeconds} ${challengeSeconds === 1 ? "segundo" : "segundos"}.`
            : "Cerrando la decisión…"}</p>
          {activeChallenge.canVote ? (
            <div className="tutti-challenge__actions">
              {twoPlayers ? (
                <>
                  <button type="button" className="impostor-action impostor-action--primary"
                    disabled={busy || connection !== "online"}
                    onClick={() => onVote(activeChallenge.id, "INVALID")}>De acuerdo: invalidar</button>
                  <button type="button" className="impostor-action"
                    disabled={busy || connection !== "online"}
                    onClick={() => onVote(activeChallenge.id, "VALID")}>No estoy de acuerdo</button>
                </>
              ) : (
                <>
                  <button type="button" className="impostor-action"
                    disabled={busy || connection !== "online"}
                    onClick={() => onVote(activeChallenge.id, "VALID")}>Votar válida</button>
                  <button type="button" className="impostor-action impostor-action--primary"
                    disabled={busy || connection !== "online"}
                    onClick={() => onVote(activeChallenge.id, "INVALID")}>Votar inválida</button>
                </>
              )}
            </div>
          ) : activeChallenge.myVote ? (
            <p role="status">Tu voto quedó registrado: {activeChallenge.myVote === "INVALID" ? "inválida" : "válida"}.</p>
          ) : (
            <p role="status">Esperando la decisión del autor de la respuesta.</p>
          )}
          {error ? <p role="alert">{error}</p> : null}
        </section>
      ) : null}
      {!activeChallenge && error ? <p role="alert">{error}</p> : null}
      <label htmlFor="tutti-review-category">Categoría</label>
      <select id="tutti-review-category" value={category.position}
        onChange={(event) => setSelectedPosition(Number(event.target.value))}>
        {review.categories.map((item) => (
          <option key={item.position} value={item.position}>
            {item.label}{exceptions(item.position) ? ` · ${exceptions(item.position)} para revisar` : ""}
          </option>
        ))}
      </select>
      <div className="tutti-review__navigation">
        <button className="impostor-action" type="button" disabled={selectedIndex === 0}
          onClick={() => setSelectedPosition(review.categories[selectedIndex - 1].position)}>
          Anterior
        </button>
        <span aria-live="polite">{selectedIndex + 1} de {review.categories.length}</span>
        <button className="impostor-action" type="button" disabled={selectedIndex === review.categories.length - 1}
          onClick={() => setSelectedPosition(review.categories[selectedIndex + 1].position)}>
          Siguiente
        </button>
      </div>
      <h3>{category.label}</h3>
      <ul className="tutti-review__entries">
        {category.entries.map((entry) => (
          <li className="tutti-review__entry" key={entry.playerId}>
            <strong>{entry.nickname}{entry.playerId === currentPlayerId ? " (vos)" : ""}</strong>
            <span className={entry.isEmpty ? "tutti-review__empty" : undefined}>
              {entry.isEmpty ? "Sin respuesta" : entry.answerText}
            </span>
            {entry.duplicateGroupId !== null ? (
              <small>Coincidencia provisional con {category.entries
                .filter((other) => other.playerId !== entry.playerId
                  && other.duplicateGroupId === entry.duplicateGroupId)
                .map((other) => other.nickname).join(", ")}.</small>
            ) : null}
            {entry.challengeStatus === "OPEN" ? <small>Impugnación abierta.</small> : null}
            {entry.challengeStatus === "RESOLVED_VALID" ? <small>Se mantiene válida tras la impugnación.</small> : null}
            {entry.challengeStatus === "RESOLVED_INVALID" ? <small>Respuesta invalidada por el grupo.</small> : null}
            {entry.canChallenge ? (
              <button type="button" className="impostor-action" disabled={busy || connection !== "online"}
                onClick={() => onOpenChallenge(entry.playerId, category.position)}>
                Impugnar respuesta
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
