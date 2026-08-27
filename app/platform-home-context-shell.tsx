"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase/browser-client";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
} from "../lib/supabase/platform-bootstrap";

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

export function renderPlatformHomeContext(state: PlatformBootstrapState) {
  if (state.status === "loading") {
    return (
      <section className="home-platform-context" aria-live="polite">
        <h2>Comprobando tu grupo...</h2>
      </section>
    );
  }

  if (state.status === "recognized") {
    return (
      <section
        className="home-platform-context"
        aria-labelledby="home-platform-context-title"
      >
        <h2 id="home-platform-context-title">Hola, {state.player.nickname}</h2>
        <div className="home-group-summary">
          <p>Tu grupo</p>
          <strong>{state.group.name}</strong>
        </div>
        <Link className="home-secondary-cta" href="/impostor/grupo">
          Ver grupo
        </Link>
      </section>
    );
  }

  if (state.status === "inconsistent") {
    return (
      <section className="home-platform-context" aria-live="polite">
        <h2>No pudimos recuperar correctamente tu grupo.</h2>
        <p>Podés seguir entrando a los juegos.</p>
      </section>
    );
  }

  if (state.status === "connection-error") {
    return (
      <section className="home-platform-context" aria-live="polite">
        <h2>No pudimos comprobar tu grupo ahora.</h2>
        <p>Podés seguir entrando a los juegos.</p>
      </section>
    );
  }

  return null;
}

export function PlatformHomeContextShell() {
  const [state, setState] = useState<PlatformBootstrapState>({
    status: "loading",
  });

  useEffect(() => {
    let isActive = true;

    void bootstrapPlatformContext(createPlatformBootstrapClient()).then(
      (bootstrapState) => {
        if (isActive) {
          setState(bootstrapState);
        }
      },
    );

    return () => {
      isActive = false;
    };
  }, []);

  return renderPlatformHomeContext(state);
}
