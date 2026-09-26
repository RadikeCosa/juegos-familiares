"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../../../lib/supabase/browser-client";
import {
  countAnswerCodePoints,
  getTuttiFruttiMyAnswers,
  saveTuttiFruttiAnswer,
  subscribeToTuttiFruttiAnswerInvalidations,
  type TuttiFruttiAnswerClient,
  type TuttiFruttiMyAnswers
} from "../../../../lib/supabase/tutti-frutti-answers";
import type { TuttiFruttiGameCategory } from "../../../../lib/supabase/tutti-frutti-game";

type ConnectionState = "online" | "offline" | "reconnecting";
type AnswerStatus = "saved" | "dirty" | "saving" | "error";
type AnswerField = {
  draft: string;
  saved: string;
  updatedAt: string | null;
  remoteDraft: string;
  remoteUpdatedAt: string | null;
  stale: boolean;
  status: AnswerStatus;
  error: string | null;
};
type AnswerFields = Record<number, AnswerField>;

function client() {
  return createBrowserSupabaseClient() as unknown as TuttiFruttiAnswerClient;
}

function emptyFields(categories: TuttiFruttiGameCategory[]): AnswerFields {
  return Object.fromEntries(categories.map(({ position }) => [position, {
    draft: "",
    saved: "",
    updatedAt: null,
    remoteDraft: "",
    remoteUpdatedAt: null,
    stale: false,
    status: "saved" as const,
    error: null
  }]));
}

function fieldMap(snapshot: TuttiFruttiMyAnswers): Record<number, { text: string; updatedAt: string | null }> {
  return Object.fromEntries(snapshot.answers.map((answer) => [answer.categoryPosition, {
    text: answer.answerText,
    updatedAt: answer.updatedAt
  }]));
}

export function TuttiFruttiAnswerEntry({
  roomId,
  sessionId,
  playerId,
  roundNumber,
  categories,
  connection,
  editable,
  onSaveState
}: {
  roomId: string;
  sessionId: string;
  playerId: string;
  roundNumber: number;
  categories: TuttiFruttiGameCategory[];
  connection: ConnectionState;
  editable: boolean;
  onSaveState: (ready: boolean, unconfirmed: boolean) => void;
}) {
  const [fields, setFields] = useState<AnswerFields>(() => emptyFields(categories));
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const categoryPositionsKey = categories.map((category) => category.position).join(",");
  const fieldsRef = useRef(fields);
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const saveRunnerRef = useRef<(position: number) => Promise<void>>(async () => {});
  const timersRef = useRef(new Map<number, number>());
  const inFlightRef = useRef(new Set<number>());
  const queuedRef = useRef(new Set<number>());
  const readSequenceRef = useRef(0);

  useEffect(() => {
    const values = categories.map((category) => fields[category.position]);
    onSaveState(
      loaded && values.every((field) => field?.status === "saved" && !field.stale
        && field.saved.normalize("NFC").trim().length > 0),
      loaded && values.some((field) => field && (field.status !== "saved" || field.stale || field.draft !== field.saved))
    );
  }, [categories, fields, loaded, onSaveState]);

  const updateFields = useCallback((update: (current: AnswerFields) => AnswerFields) => {
    setFields((current) => {
      const next = update(current);
      fieldsRef.current = next;
      return next;
    });
  }, []);

  const applySnapshot = useCallback((snapshot: TuttiFruttiMyAnswers) => {
    const remote = fieldMap(snapshot);
    updateFields((current) => {
      const next: AnswerFields = { ...current };
      for (const category of categoriesRef.current) {
        const position = category.position;
        const serverField = remote[position] ?? { text: "", updatedAt: null };
        const local = current[position] ?? emptyFields([category])[position];
        const isDirty = local.status !== "saved" || local.draft !== local.saved;
        if (isDirty) {
          const serverChanged = local.updatedAt !== serverField.updatedAt
            || local.saved !== serverField.text;
          next[position] = {
            ...local,
            remoteDraft: serverField.text,
            remoteUpdatedAt: serverField.updatedAt,
            stale: local.stale || serverChanged
          };
        } else {
          next[position] = {
            draft: serverField.text,
            saved: serverField.text,
            updatedAt: serverField.updatedAt,
            remoteDraft: serverField.text,
            remoteUpdatedAt: serverField.updatedAt,
            stale: false,
            status: "saved",
            error: null
          };
        }
      }
      return next;
    });
    setLoaded(true);
    setLoadError(null);
  }, [updateFields]);

  const refreshAnswers = useCallback(async () => {
    const sequence = ++readSequenceRef.current;
    try {
      const snapshot = await getTuttiFruttiMyAnswers(client(), roomId);
      if (sequence !== readSequenceRef.current) return;
      if (snapshot.roundNumber !== roundNumber) return;
      applySnapshot(snapshot);
    } catch (error) {
      if (sequence === readSequenceRef.current) {
        setLoadError(error instanceof Error ? error.message : "No pudimos recuperar tus respuestas.");
      }
    }
  }, [applySnapshot, roomId, roundNumber]);

  useEffect(() => {
    setLoaded(false);
    setLoadError(null);
    updateFields(() => emptyFields(categoriesRef.current));
    void refreshAnswers();
    return () => { readSequenceRef.current += 1; };
  }, [categoryPositionsKey, refreshAnswers, roomId, roundNumber, sessionId, updateFields]);

  useEffect(() => {
    const subscription = subscribeToTuttiFruttiAnswerInvalidations(client(), playerId, () => {
      void refreshAnswers();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAnswers();
    };
    const onOnline = () => { void refreshAnswers(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void subscription.unsubscribe();
    };
  }, [playerId, refreshAnswers]);

  useEffect(() => {
    if (!editable) void refreshAnswers();
  }, [editable, refreshAnswers]);

  saveRunnerRef.current = async (position: number) => {
    if (!editable) return;
    if (inFlightRef.current.has(position)) {
      queuedRef.current.add(position);
      return;
    }
    const current = fieldsRef.current[position];
    if (!current || current.status === "saved" && !current.stale) return;
    if (countAnswerCodePoints(current.draft) > 200) {
      updateFields((values) => ({
        ...values,
        [position]: { ...values[position], status: "error", error: "La respuesta supera el límite de 200 caracteres." }
      }));
      return;
    }
    if (connection !== "online") {
      updateFields((values) => ({
        ...values,
        [position]: { ...values[position], status: "error", error: "Sin conexión. El borrador sigue en esta pantalla; reintentá al volver." }
      }));
      return;
    }

    const submittedText = current.draft;
    inFlightRef.current.add(position);
    updateFields((values) => ({
      ...values,
      [position]: { ...values[position], status: "saving", error: null }
    }));
    try {
      const saved = await saveTuttiFruttiAnswer(client(), roomId, position, submittedText);
      updateFields((values) => {
        const latest = values[position];
        const editedAgain = latest.draft !== submittedText;
        const remoteIsNewer = latest.remoteUpdatedAt !== null
          && Date.parse(latest.remoteUpdatedAt) > Date.parse(saved.updatedAt);
        const canonicalText = remoteIsNewer ? latest.remoteDraft : saved.answerText;
        const canonicalUpdatedAt = remoteIsNewer ? latest.remoteUpdatedAt : saved.updatedAt;
        return {
          ...values,
          [position]: {
            ...latest,
            draft: editedAgain ? latest.draft : canonicalText,
            saved: canonicalText,
            updatedAt: canonicalUpdatedAt,
            remoteDraft: canonicalText,
            remoteUpdatedAt: canonicalUpdatedAt,
            stale: editedAgain ? latest.stale || remoteIsNewer : false,
            status: editedAgain ? "dirty" : "saved",
            error: null
          }
        };
      });
    } catch (error) {
      updateFields((values) => {
        const latest = values[position];
        const editedAgain = latest.draft !== submittedText;
        return {
          ...values,
          [position]: {
            ...latest,
            status: editedAgain ? "dirty" : "error",
            error: editedAgain ? null : error instanceof Error ? error.message : "No pudimos guardar la respuesta. Reintentá."
          }
        };
      });
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P0042") {
        void refreshAnswers();
      }
    } finally {
      inFlightRef.current.delete(position);
      if (queuedRef.current.delete(position)) {
        const latest = fieldsRef.current[position];
        if (latest && latest.draft !== latest.saved) {
          void saveRunnerRef.current(position);
        }
      }
    }
  };

  function scheduleSave(position: number) {
    const previous = timersRef.current.get(position);
    if (previous !== undefined) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      timersRef.current.delete(position);
      void saveRunnerRef.current(position);
    }, 500);
    timersRef.current.set(position, timer);
  }

  function changeAnswer(position: number, value: string) {
    if (!editable) return;
    const field = fieldsRef.current[position];
    if (!field) return;
    updateFields((current) => ({
      ...current,
      [position]: { ...current[position], draft: value, status: "dirty", error: null }
    }));
    scheduleSave(position);
  }

  function retryAnswer(position: number) {
    const timer = timersRef.current.get(position);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(position);
    void saveRunnerRef.current(position);
  }

  function reloadAnswer(position: number) {
    const field = fieldsRef.current[position];
    if (!field) return;
    const timer = timersRef.current.get(position);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(position);
    updateFields((current) => ({
      ...current,
      [position]: {
        ...current[position],
        draft: field.remoteDraft,
        saved: field.remoteDraft,
        updatedAt: field.remoteUpdatedAt,
        stale: false,
        status: "saved",
        error: null
      }
    }));
  }

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
  }, []);

  return (
    <section className="tutti-answer-entry" aria-labelledby="tutti-answer-entry-title">
      <h2 id="tutti-answer-entry-title">Tus respuestas · Ronda {roundNumber}</h2>
      <p>{editable ? "Solo vos podés ver tus respuestas durante la ronda. Se guardan automáticamente." : "La ronda ya no acepta respuestas."}</p>
      {!editable && Object.values(fields).some((field) => field.status !== "saved" || field.stale || field.draft !== field.saved) ? (
        <p role="alert">Algunas ediciones todavía no tienen confirmación de guardado.</p>
      ) : null}
      {connection === "offline" ? <p className="tutti-answer-entry__offline" role="status">Sin conexión. Los cambios que no se guardaron quedan en esta pantalla hasta que vuelvas a conectarte.</p> : null}
      {!loaded && !loadError ? <p aria-live="polite">Recuperando tus respuestas…</p> : null}
      {loadError ? (
        <div className="tutti-answer-entry__load-error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="impostor-action" onClick={() => void refreshAnswers()} disabled={connection !== "online"}>Volver a intentar</button>
        </div>
      ) : null}
      {loaded && !editable ? (
        <div className="tutti-answer-entry__fields">
          {categories.map((category) => {
            const field = fields[category.position];
            const confirmed = field?.stale ? field.remoteDraft : field?.saved;
            const unconfirmed = field && (field.status !== "saved" || field.stale || field.draft !== field.saved);
            return (
              <div className="tutti-answer-field" key={category.position}>
                <strong>{category.label}</strong>
                <p>Guardado confirmado: {confirmed || "Sin respuesta"}</p>
                {unconfirmed ? (
                  <p role="status">Última edición sin confirmar: {field.draft || "Respuesta vacía"}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {loaded && editable ? (
        <div className="tutti-answer-entry__fields">
          {categories.map((category) => {
            const field = fields[category.position];
            const length = countAnswerCodePoints(field?.draft ?? "");
            const tooLong = length > 200;
            const statusId = `tutti-answer-status-${category.position}`;
            return (
              <div className="tutti-answer-field" key={category.position}>
                <label htmlFor={`tutti-answer-${category.position}`}>{category.label}</label>
                <input
                  autoComplete="off"
                  id={`tutti-answer-${category.position}`}
                  maxLength={400}
                  onChange={(event) => changeAnswer(category.position, event.target.value)}
                  aria-describedby={statusId}
                  value={field?.draft ?? ""}
                  type="text"
                />
                <div id={statusId} className="tutti-answer-field__status" aria-live="polite" aria-atomic="true">
                  <span>{length}/200 caracteres</span>
                  {tooLong ? <span role="alert"> La respuesta supera el límite.</span> : null}
                  {field?.status === "saving" ? <span> Guardando…</span> : null}
                  {field?.status === "saved" && !field.stale ? <span> Guardado.</span> : null}
                  {field?.status === "dirty" ? <span> Cambios pendientes.</span> : null}
                  {field?.error ? <span role="alert"> {field.error}</span> : null}
                </div>
                {field?.stale ? (
                  <div className="tutti-answer-field__stale" role="status">
                    <p>Otra pestaña guardó una respuesta más reciente.</p>
                    <button type="button" className="impostor-action" onClick={() => reloadAnswer(category.position)}>
                      Recargar respuesta guardada
                    </button>
                    <button
                      type="button"
                      className="impostor-action impostor-action--primary"
                      onClick={() => retryAnswer(category.position)}
                      disabled={connection !== "online" || tooLong || field.status === "saving"}
                    >
                      Guardar mi borrador
                    </button>
                  </div>
                ) : field?.status === "error" ? (
                  <button
                    type="button"
                    className="impostor-action"
                    onClick={() => retryAnswer(category.position)}
                    disabled={connection !== "online" || tooLong}
                  >
                    Reintentar guardado
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
