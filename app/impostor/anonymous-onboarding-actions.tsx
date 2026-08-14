"use client";

import { useRef, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  createCreateGroupSubmitController,
  createJoinGroupSubmitController,
  createResolveGroupInvitationController,
  type CreatedGroupWithAdminPlayer,
  type JoinedGroupWithInvitation,
  type ResolvedGroupInvitation
} from "../../lib/supabase/platform-groups";

type OnboardingIntent = "create-group" | "join-group";

type ActionState =
  | { status: "idle" }
  | { status: "create-group-form" }
  | { status: "join-code-form" }
  | { status: "creating" }
  | { status: "create-success"; result: CreatedGroupWithAdminPlayer }
  | { status: "resolving"; invitationCode: string }
  | {
      status: "resolved";
      invitationCode: string;
      result: ResolvedGroupInvitation;
    }
  | { status: "joining"; invitationCode: string; result: ResolvedGroupInvitation }
  | { status: "join-success"; result: JoinedGroupWithInvitation }
  | { status: "error"; message: string };

type JoinByLinkState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "resolved"; result: ResolvedGroupInvitation }
  | { status: "joining"; result: ResolvedGroupInvitation }
  | { status: "success"; result: JoinedGroupWithInvitation }
  | { status: "error"; message: string };

function getFriendlyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "No pudimos crear el grupo.";
}

function getInvitationUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return `${window.location.origin}${path}`;
}

export function ImpostorAnonymousOnboardingActions() {
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const createGroupSubmitController = useRef(createCreateGroupSubmitController());
  const resolveGroupInvitationController = useRef(
    createResolveGroupInvitationController()
  );
  const joinGroupSubmitController = useRef(createJoinGroupSubmitController());

  function handleIntent(intent: OnboardingIntent) {
    if (
      state.status === "creating" ||
      state.status === "resolving" ||
      state.status === "joining"
    ) {
      return;
    }

    setState(
      intent === "create-group"
        ? { status: "create-group-form" }
        : { status: "join-code-form" }
    );
  }

  async function handleCreateGroupSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (state.status === "creating") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const playerNickname = String(formData.get("playerNickname") ?? "");
    const groupName = String(formData.get("groupName") ?? "");

    setState({ status: "creating" });

    try {
      const result = await createGroupSubmitController.current.submit(
        createBrowserSupabaseClient(),
        {
          groupName,
          playerNickname
        }
      );

      setState({ status: "create-success", result });
    } catch (error) {
      setState({ status: "error", message: getFriendlyError(error) });
    }
  }

  async function handleResolveInvitationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status === "resolving" || state.status === "joining") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const invitationCode = String(formData.get("invitationCode") ?? "");

    setState({ status: "resolving", invitationCode });

    try {
      const result = await resolveGroupInvitationController.current.submit(
        createBrowserSupabaseClient(),
        invitationCode
      );

      setState({
        status: "resolved",
        invitationCode: result.canonicalCode,
        result
      });
    } catch (error) {
      setState({ status: "error", message: getFriendlyError(error) });
    }
  }

  async function handleJoinGroupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "resolved") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const playerNickname = String(formData.get("playerNickname") ?? "");
    const { invitationCode, result: resolvedInvitation } = state;

    setState({
      status: "joining",
      invitationCode,
      result: resolvedInvitation
    });

    try {
      const result = await joinGroupSubmitController.current.submit(
        createBrowserSupabaseClient(),
        {
          invitationCode,
          playerNickname
        }
      );

      setState({ status: "join-success", result });
    } catch (error) {
      setState({ status: "error", message: getFriendlyError(error) });
    }
  }

  const isLoading =
    state.status === "creating" ||
    state.status === "resolving" ||
    state.status === "joining";
  const resolvedJoinState =
    state.status === "resolved" || state.status === "joining" ? state : null;

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

      {state.status === "create-group-form" || state.status === "creating" ? (
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
            {state.status === "creating" ? "Creando..." : "Crear grupo"}
          </button>
        </form>
      ) : null}

      {state.status === "join-code-form" || state.status === "resolving" ? (
        <form
          className="impostor-create-group"
          aria-labelledby="impostor-join-group-title"
          onSubmit={(event) => void handleResolveInvitationSubmit(event)}
        >
          <h3 id="impostor-join-group-title">Unirme a un grupo</h3>
          <label className="impostor-field">
            <span>Código</span>
            <input
              name="invitationCode"
              type="text"
              autoCapitalize="characters"
              maxLength={8}
              required
              disabled={isLoading}
            />
          </label>
          <button
            className="impostor-action impostor-action--primary"
            type="submit"
            disabled={isLoading}
          >
            {state.status === "resolving" ? "Buscando..." : "Continuar"}
          </button>
        </form>
      ) : null}

      {resolvedJoinState ? (
        <form
          className="impostor-create-group"
          aria-labelledby="impostor-join-nickname-title"
          onSubmit={(event) => void handleJoinGroupSubmit(event)}
        >
          <h3 id="impostor-join-nickname-title">
            Grupo: {resolvedJoinState.result.groupName}
          </h3>
          <label className="impostor-field">
            <span>Tu nombre</span>
            <input
              name="playerNickname"
              type="text"
              autoComplete="name"
              maxLength={32}
              required
              disabled={state.status === "joining"}
            />
          </label>
          <button
            className="impostor-action impostor-action--primary"
            type="submit"
            disabled={state.status === "joining"}
          >
            {state.status === "joining" ? "Uniéndote..." : "Unirme"}
          </button>
        </form>
      ) : null}

      <p className="impostor-onboarding__status" aria-live="polite">
        {state.status === "creating"
          ? "Creando identidad y grupo..."
          : state.status === "resolving"
            ? "Creando identidad y buscando grupo..."
            : state.status === "joining"
              ? "Uniéndote al grupo..."
              : state.status === "create-success"
              ? "Grupo creado."
              : state.status === "join-success"
                ? `Te uniste a ${state.result.group.name}.`
              : state.status === "error"
            ? state.message
            : "La identidad se prepara recién cuando elegís una acción."}
      </p>
      {state.status === "create-success" ? (
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
          <div>
            <dt>Código de invitación</dt>
            <dd>{state.result.invitation.code}</dd>
          </div>
          <div>
            <dt>Enlace</dt>
            <dd>{getInvitationUrl(state.result.invitation.path)}</dd>
          </div>
        </dl>
      ) : null}
      {state.status === "join-success" ? (
        <dl className="impostor-created-group">
          <div>
            <dt>Grupo</dt>
            <dd>{state.result.group.name}</dd>
          </div>
          <div>
            <dt>Tu nombre</dt>
            <dd>{state.result.player.nickname}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

export function ImpostorJoinByLinkActions({
  invitationCode
}: {
  invitationCode: string;
}) {
  const [state, setState] = useState<JoinByLinkState>({ status: "idle" });
  const resolveGroupInvitationController = useRef(
    createResolveGroupInvitationController()
  );
  const joinGroupSubmitController = useRef(createJoinGroupSubmitController());

  async function handleContinue() {
    if (state.status === "resolving" || state.status === "joining") {
      return;
    }

    setState({ status: "resolving" });

    try {
      const result = await resolveGroupInvitationController.current.submit(
        createBrowserSupabaseClient(),
        invitationCode
      );

      setState({ status: "resolved", result });
    } catch (error) {
      setState({ status: "error", message: getFriendlyError(error) });
    }
  }

  async function handleJoinGroupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "resolved") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const playerNickname = String(formData.get("playerNickname") ?? "");
    const resolvedInvitation = state.result;

    setState({ status: "joining", result: resolvedInvitation });

    try {
      const result = await joinGroupSubmitController.current.submit(
        createBrowserSupabaseClient(),
        {
          invitationCode: resolvedInvitation.canonicalCode,
          playerNickname
        }
      );

      setState({ status: "success", result });
    } catch (error) {
      setState({ status: "error", message: getFriendlyError(error) });
    }
  }

  return (
    <section
      className="impostor-onboarding"
      aria-labelledby="impostor-link-join-title"
    >
      <h2 id="impostor-link-join-title">Te invitaron a un grupo</h2>
      {state.status === "idle" || state.status === "resolving" ? (
        <button
          className="impostor-action impostor-action--primary"
          type="button"
          disabled={state.status === "resolving"}
          onClick={() => void handleContinue()}
        >
          {state.status === "resolving" ? "Buscando..." : "Continuar"}
        </button>
      ) : null}

      {state.status === "resolved" || state.status === "joining" ? (
        <form
          className="impostor-create-group"
          aria-labelledby="impostor-link-join-nickname-title"
          onSubmit={(event) => void handleJoinGroupSubmit(event)}
        >
          <h3 id="impostor-link-join-nickname-title">
            Grupo: {state.result.groupName}
          </h3>
          <label className="impostor-field">
            <span>Tu nombre</span>
            <input
              name="playerNickname"
              type="text"
              autoComplete="name"
              maxLength={32}
              required
              disabled={state.status === "joining"}
            />
          </label>
          <button
            className="impostor-action impostor-action--primary"
            type="submit"
            disabled={state.status === "joining"}
          >
            {state.status === "joining" ? "Uniéndote..." : "Unirme"}
          </button>
        </form>
      ) : null}

      <p className="impostor-onboarding__status" aria-live="polite">
        {state.status === "resolving"
          ? "Creando identidad y buscando grupo..."
          : state.status === "joining"
            ? "Uniéndote al grupo..."
            : state.status === "success"
              ? `Te uniste a ${state.result.group.name}.`
              : state.status === "error"
                ? state.message
                : "La identidad se prepara cuando continuás."}
      </p>

      {state.status === "success" ? (
        <dl className="impostor-created-group">
          <div>
            <dt>Grupo</dt>
            <dd>{state.result.group.name}</dd>
          </div>
          <div>
            <dt>Tu nombre</dt>
            <dd>{state.result.player.nickname}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
