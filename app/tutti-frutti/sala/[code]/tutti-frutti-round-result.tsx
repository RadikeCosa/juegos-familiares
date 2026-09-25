"use client";

import type { TuttiFruttiRoundResult } from "../../../../lib/supabase/tutti-frutti-result";

export function TuttiFruttiRoundResultView({
  result, currentPlayerId, isHost, canAdvance, advancing, advanceError, connection, onAdvance
}: {
  result: TuttiFruttiRoundResult;
  currentPlayerId: string;
  isHost: boolean;
  canAdvance: boolean;
  advancing: boolean;
  advanceError: string | null;
  connection: "online" | "offline" | "reconnecting";
  onAdvance: () => void;
}) {
  return (
    <section className="tutti-review" aria-labelledby="tutti-result-title">
      <h2 id="tutti-result-title">Resultado de la ronda {result.roundNumber}</h2>
      <ol className="tutti-review__entries">
        {result.totals.map((player) => (
          <li className="tutti-review__entry" key={player.playerId}>
            <strong>{player.rank}. {player.nickname}{player.playerId === currentPlayerId ? " (vos)" : ""}</strong>
            <span>+{player.roundPoints} puntos · {player.totalPoints} acumulados</span>
          </li>
        ))}
      </ol>
      {result.categories.map((category) => (
        <section key={category.position} aria-labelledby={`tutti-result-category-${category.position}`}>
          <h3 id={`tutti-result-category-${category.position}`}>{category.label}</h3>
          <ul className="tutti-review__entries">
            {category.entries.map((entry) => (
              <li className="tutti-review__entry" key={entry.playerId}>
                <strong>{entry.nickname}</strong>
                <span>{entry.isEmpty ? "Sin respuesta" : entry.answerText}</span>
                <small>{entry.isEmpty ? "Sin respuesta" : entry.isValid ? "Válida" : "Invalidada"} · {entry.points} puntos</small>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {isHost && canAdvance ? (
        <div>
          {advanceError ? <p role="alert">{advanceError}</p> : null}
          <button className="impostor-action impostor-action--primary" type="button"
            disabled={advancing || connection !== "online"} onClick={onAdvance}>
            {advancing ? "Preparando ronda…" : "Siguiente ronda"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
