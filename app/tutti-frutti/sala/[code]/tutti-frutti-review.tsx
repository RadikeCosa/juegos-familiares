"use client";

import { useState } from "react";
import type { TuttiFruttiReview as Review } from "../../../../lib/supabase/tutti-frutti-review";

export function TuttiFruttiReview({ review }: { review: Review }) {
  const [selectedPosition, setSelectedPosition] = useState(review.categories[0]?.position ?? 0);
  const selectedIndex = Math.max(0, review.categories.findIndex((category) => category.position === selectedPosition));
  const category = review.categories[selectedIndex];
  if (!category) return <p role="status">No hay categorías para revisar.</p>;
  const exceptions = (position: number) => review.categories.find((item) => item.position === position)?.entries
    .filter((entry) => entry.isEmpty || entry.duplicateGroupId !== null).length ?? 0;

  return (
    <section className="tutti-review" aria-labelledby="tutti-review-title">
      <h2 id="tutti-review-title">Respuestas de la ronda</h2>
      <p>Las coincidencias son provisionales. Las respuestas todavía no tienen puntaje.</p>
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
            <strong>{entry.nickname}</strong>
            <span className={entry.isEmpty ? "tutti-review__empty" : undefined}>
              {entry.isEmpty ? "Sin respuesta" : entry.answerText}
            </span>
            {entry.duplicateGroupId !== null ? (
              <small>Coincidencia provisional con {category.entries
                .filter((other) => other.playerId !== entry.playerId
                  && other.duplicateGroupId === entry.duplicateGroupId)
                .map((other) => other.nickname).join(", ")}.</small>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
