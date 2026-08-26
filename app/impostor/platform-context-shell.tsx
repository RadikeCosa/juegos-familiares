"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  bootstrapPlatformContext,
  writeLocalIdentityFromContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
  type RecognizedPlatformContext
} from "../../lib/supabase/platform-bootstrap";
import { createGetMyActiveGroupInvitationController } from "../../lib/supabase/platform-groups";
import { shareInvitation } from "./admin-invitation-panel";
import { ImpostorAnonymousOnboardingActions } from "./anonymous-onboarding-actions";

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

type ShareGroupInvitationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function isShareCancellation(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function ImpostorRecognizedContext({
  group,
  player
}: RecognizedPlatformContext) {
  const isAdmin = group.adminPlayerId === player.id;
  const [shareState, setShareState] = useState<ShareGroupInvitationState>({
    status: "idle"
  });
  const invitationController = useRef(
    createGetMyActiveGroupInvitationController()
  );

  async function handleShareInvitation() {
    if (shareState.status === "loading") {
      return;
    }

    setShareState({ status: "loading" });

    try {
      const invitation = await invitationController.current.submit(
        createBrowserSupabaseClient()
      );
      const result = await shareInvitation(invitation);

      setShareState({
        status: "success",
        message:
          result === "shared"
            ? "Invitación lista para compartir."
            : "Enlace copiado."
      });
    } catch (error) {
      if (isShareCancellation(error)) {
        setShareState({ status: "idle" });
        return;
      }

      setShareState({
        status: "error",
        message: "No pudimos compartir la invitación. Intentá de nuevo."
      });
    }
  }

  return (
    <section
      className="impostor-platform-context"
      aria-labelledby="impostor-platform-context-title"
    >
      <h2 id="impostor-platform-context-title">Hola, {player.nickname}</h2>
      <div className="impostor-group-summary">
        <p>Tu grupo</p>
        <strong>{group.name}</strong>
      </div>
      <p className="impostor-platform-context__meta">
        Tu grupo ya está listo para seguir con Impostor.
      </p>
      <Link
        className="impostor-action impostor-action--primary"
        href="/impostor/grupo"
      >
        Ver grupo
      </Link>
      {isAdmin ? (
        <button
          className="impostor-action"
          type="button"
          disabled={shareState.status === "loading"}
          onClick={() => void handleShareInvitation()}
        >
          {shareState.status === "loading"
            ? "Preparando invitación..."
            : "Compartir invitación"}
        </button>
      ) : null}
      {isAdmin && shareState.status === "success" ? (
        <p className="impostor-platform-context__meta" aria-live="polite">
          {shareState.message}
        </p>
      ) : null}
      {isAdmin && shareState.status === "error" ? (
        <p className="impostor-onboarding__status" aria-live="polite">
          {shareState.message}
        </p>
      ) : null}
    </section>
  );
}

export function renderImpostorPlatformContext(
  state: PlatformBootstrapState,
  options: {
    onRecognizedContext?: (context: RecognizedPlatformContext) => void;
    onRetry?: () => void;
  } = {}
) {
  if (state.status === "loading") {
    return (
      <section className="impostor-platform-context" aria-live="polite">
        <h2>Comprobando tu grupo...</h2>
      </section>
    );
  }

  if (state.status === "recognized") {
    return <ImpostorRecognizedContext group={state.group} player={state.player} />;
  }

  if (state.status === "inconsistent") {
    return (
      <section className="impostor-platform-context" aria-live="polite">
        <h2>No pudimos recuperar correctamente tu grupo.</h2>
        <p>Podés intentar más tarde o volver a empezar.</p>
      </section>
    );
  }

  if (state.status === "connection-error") {
    return (
      <section className="impostor-platform-context" aria-live="polite">
        <h2>No pudimos comprobar tu grupo ahora.</h2>
        <p>Revisá tu conexión e intentá de nuevo.</p>
        {options.onRetry ? (
          <button
            className="impostor-action impostor-action--primary"
            type="button"
            onClick={options.onRetry}
          >
            Reintentar
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <ImpostorAnonymousOnboardingActions
      onRecognizedContext={options.onRecognizedContext}
    />
  );
}

export function ImpostorPlatformContextShell() {
  const [state, setState] = useState<PlatformBootstrapState>({
    status: "loading"
  });

  async function runBootstrap(showLoading: boolean) {
    if (showLoading) {
      setState({ status: "loading" });
    }

    setState(await bootstrapPlatformContext(createPlatformBootstrapClient()));
  }

  function handleRecognizedContext(context: RecognizedPlatformContext) {
    writeLocalIdentityFromContext(context);
    setState({ status: "recognized", ...context });
  }

  useEffect(() => {
    let isActive = true;

    void bootstrapPlatformContext(createPlatformBootstrapClient()).then(
      (bootstrapState) => {
        if (isActive) {
          setState(bootstrapState);
        }
      }
    );

    return () => {
      isActive = false;
    };
  }, []);

  return renderImpostorPlatformContext(state, {
    onRecognizedContext: handleRecognizedContext,
    onRetry: () => void runBootstrap(true)
  });
}
