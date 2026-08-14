"use client";

import { useRef, useState } from "react";
import { ensureAnonymousAuthIdentity } from "../../lib/supabase/anonymous-auth";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";

type OnboardingIntent = "create-group" | "join-group";

type ActionState =
  | { status: "idle" }
  | { status: "loading"; intent: OnboardingIntent }
  | { status: "success"; intent: OnboardingIntent; isNew: boolean }
  | { status: "error"; message: string };

const successCopy: Record<OnboardingIntent, string> = {
  "create-group": "Identidad lista. La creación de grupo llega en el siguiente paso.",
  "join-group": "Identidad lista. Unirse a un grupo llega en el siguiente paso."
};

function getFriendlyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "No pudimos preparar la identidad anónima.";
}

export function ImpostorAnonymousOnboardingActions() {
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const activeRequest = useRef<Promise<void> | null>(null);

  async function handleIntent(intent: OnboardingIntent) {
    if (activeRequest.current) {
      return activeRequest.current;
    }

    const request = (async () => {
      setState({ status: "loading", intent });

      try {
        const supabase = createBrowserSupabaseClient();
        const identity = await ensureAnonymousAuthIdentity(supabase);

        setState({
          status: "success",
          intent,
          isNew: identity.isNew
        });
      } catch (error) {
        setState({ status: "error", message: getFriendlyError(error) });
      } finally {
        activeRequest.current = null;
      }
    })();

    activeRequest.current = request;
    return request;
  }

  const isLoading = state.status === "loading";

  return (
    <section
      className="impostor-onboarding"
      aria-labelledby="impostor-onboarding-title"
    >
      <h2 id="impostor-onboarding-title">Empezar</h2>
      <div className="impostor-onboarding__actions">
        <button
          className="impostor-action impostor-action--primary"
          type="button"
          disabled={isLoading}
          onClick={() => void handleIntent("create-group")}
        >
          {state.status === "loading" && state.intent === "create-group"
            ? "Preparando..."
            : "Crear grupo"}
        </button>
        <button
          className="impostor-action"
          type="button"
          disabled={isLoading}
          onClick={() => void handleIntent("join-group")}
        >
          {state.status === "loading" && state.intent === "join-group"
            ? "Preparando..."
            : "Unirme a un grupo"}
        </button>
      </div>

      <p className="impostor-onboarding__status" aria-live="polite">
        {state.status === "success"
          ? successCopy[state.intent]
          : state.status === "error"
            ? state.message
            : "La identidad se prepara recién cuando elegís una acción."}
      </p>
      {state.status === "success" ? (
        <p className="impostor-onboarding__meta">
          {state.isNew
            ? "Se creó una AuthIdentity anónima."
            : "Se reutilizó la AuthIdentity existente."}
        </p>
      ) : null}
    </section>
  );
}
