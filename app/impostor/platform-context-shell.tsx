"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  bootstrapPlatformContext,
  writeLocalIdentityFromContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
  type RecognizedPlatformContext
} from "../../lib/supabase/platform-bootstrap";
import { ImpostorAnonymousOnboardingActions } from "./anonymous-onboarding-actions";

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

function ImpostorRecognizedContext({
  group,
  player
}: RecognizedPlatformContext) {
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
