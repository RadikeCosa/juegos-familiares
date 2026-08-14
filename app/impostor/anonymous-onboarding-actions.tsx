"use client";

import { useRef, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  createCreateGroupSubmitController,
  type CreatedGroupWithAdminPlayer
} from "../../lib/supabase/platform-groups";

type OnboardingIntent = "create-group" | "join-group";

type ActionState =
  | { status: "idle" }
  | { status: "create-group-form" }
  | { status: "join-group-pending" }
  | { status: "loading" }
  | { status: "success"; result: CreatedGroupWithAdminPlayer }
  | { status: "error"; message: string };

function getFriendlyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "No pudimos crear el grupo.";
}

export function ImpostorAnonymousOnboardingActions() {
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const createGroupSubmitController = useRef(createCreateGroupSubmitController());

  function handleIntent(intent: OnboardingIntent) {
    if (state.status === "loading") {
      return;
    }

    setState(
      intent === "create-group"
        ? { status: "create-group-form" }
        : { status: "join-group-pending" }
    );
  }

  async function handleCreateGroupSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (state.status === "loading") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const playerNickname = String(formData.get("playerNickname") ?? "");
    const groupName = String(formData.get("groupName") ?? "");

    setState({ status: "loading" });

    try {
      const result = await createGroupSubmitController.current.submit(
        createBrowserSupabaseClient(),
        {
          groupName,
          playerNickname
        }
      );

      setState({ status: "success", result });
    } catch (error) {
      setState({ status: "error", message: getFriendlyError(error) });
    }
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
          onClick={() => handleIntent("create-group")}
        >
          Crear grupo
        </button>
        <button
          className="impostor-action"
          type="button"
          disabled={isLoading}
          onClick={() => handleIntent("join-group")}
        >
          Unirme a un grupo
        </button>
      </div>

      {state.status === "create-group-form" || state.status === "loading" ? (
        <form
          className="impostor-create-group"
          aria-labelledby="impostor-create-group-title"
          onSubmit={(event) => void handleCreateGroupSubmit(event)}
        >
          <h3 id="impostor-create-group-title">Crear grupo</h3>
          <label className="impostor-field">
            <span>Tu nombre</span>
            <input
              name="playerNickname"
              type="text"
              autoComplete="name"
              maxLength={32}
              required
              disabled={isLoading}
            />
          </label>
          <label className="impostor-field">
            <span>Nombre del grupo</span>
            <input
              name="groupName"
              type="text"
              maxLength={80}
              required
              disabled={isLoading}
            />
          </label>
          <button
            className="impostor-action impostor-action--primary"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? "Creando..." : "Crear grupo"}
          </button>
        </form>
      ) : null}

      <p className="impostor-onboarding__status" aria-live="polite">
        {state.status === "loading"
          ? "Creando identidad y grupo..."
          : state.status === "join-group-pending"
            ? "Unirse a un grupo llega en el siguiente paso."
            : state.status === "success"
              ? "Grupo creado."
              : state.status === "error"
            ? state.message
            : "La identidad se prepara recién cuando elegís una acción."}
      </p>
      {state.status === "success" ? (
        <dl className="impostor-created-group">
          <div>
            <dt>Grupo</dt>
            <dd>{state.result.group.name}</dd>
          </div>
          <div>
            <dt>Jugador</dt>
            <dd>{state.result.player.nickname}</dd>
          </div>
          <div>
            <dt>Administrador inicial</dt>
            <dd>Sí</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
