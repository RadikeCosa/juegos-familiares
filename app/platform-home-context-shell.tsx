"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  useActiveRoomContext,
  type ActiveRoomContextState,
} from "./impostor/use-active-room-context";
import { createBrowserSupabaseClient } from "../lib/supabase/browser-client";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
} from "../lib/supabase/platform-bootstrap";

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

export function renderPlatformHomeContext(
  state: PlatformBootstrapState,
  roomState: ActiveRoomContextState = { status: "idle" },
  options: { onRetryActiveRoom?: () => void } = {},
) {
  if (state.status === "loading") {
    return (
      <section className="home-platform-context" aria-live="polite">
        <h2>Comprobando tu grupo...</h2>
      </section>
    );
  }

  if (state.status === "recognized") {
    const activeRoomHref =
      roomState.status === "success"
        ? `/impostor/sala/${encodeURIComponent(roomState.room.code)}`
        : undefined;
    const isPlayingRoom =
      roomState.status === "success" && roomState.room.status === "playing";
    const isLobbyRoom =
      roomState.status === "success" && roomState.room.status === "lobby";

    if (roomState.status === "success" && activeRoomHref) {
      return (
        <section className="home-platform-context home-platform-context--active">
          <p className="home-platform-context__meta">
            {isPlayingRoom ? "Partida en curso" : "Sala activa"}
          </p>
          <Link
            className="home-secondary-cta home-secondary-cta--primary"
            href={activeRoomHref}
          >
            {isPlayingRoom
              ? "Volver a la partida"
              : isLobbyRoom
                ? "Volver a la sala"
                : "Ir al juego del grupo"}
          </Link>
        </section>
      );
    }

    return (
      <section className="home-platform-context home-platform-context--recognized">
        <Link
          className="home-group-context-link"
          href="/grupo"
          aria-label={`Abrir el grupo actual: ${state.group.name}`}
        >
          <span className="home-group-context-link__initial" aria-hidden="true">
            {state.player.nickname.slice(0, 1).toLocaleUpperCase()}
          </span>
          <span className="home-group-context-link__details">
            <strong>{state.player.nickname}</strong>
            <span>({state.group.name})</span>
          </span>
        </Link>
        {roomState.status === "loading" || roomState.status === "idle" ? (
          <p className="home-platform-context__checking" aria-live="polite">
            Comprobando sala activa...
          </p>
        ) : null}
        {roomState.status === "error" ? (
          <>
            <p>No pudimos comprobar si tenés una sala activa.</p>
            {options.onRetryActiveRoom ? (
              <button
                className="home-secondary-cta home-secondary-cta--primary"
                type="button"
                onClick={options.onRetryActiveRoom}
              >
                Reintentar
              </button>
            ) : null}
          </>
        ) : null}
      </section>
    );
  }

  if (state.status === "inconsistent") {
    return (
      <section className="home-platform-context" aria-live="polite">
        <h2>No pudimos recuperar correctamente tu grupo.</h2>
        <p>Podés entrar a Impostor para revisar tu contexto.</p>
        <Link
          className="home-secondary-cta home-secondary-cta--primary"
          href="/impostor"
        >
          Ir a Impostor
        </Link>
      </section>
    );
  }

  if (state.status === "connection-error") {
    return (
      <section className="home-platform-context" aria-live="polite">
        <h2>No pudimos comprobar tu grupo ahora.</h2>
        <p>Podés entrar a Impostor y volver a intentar desde ahí.</p>
        <Link
          className="home-secondary-cta home-secondary-cta--primary"
          href="/impostor"
        >
          Ir a Impostor
        </Link>
      </section>
    );
  }

  return (
    <section className="home-platform-context" aria-live="polite">
      <p>Entrá a Impostor para unirte a tu grupo o seguir jugando.</p>
      <Link
        className="home-secondary-cta home-secondary-cta--primary"
        href="/impostor"
      >
        Jugar
      </Link>
    </section>
  );
}

export function PlatformHomeContextShell() {
  const [state, setState] = useState<PlatformBootstrapState>({
    status: "loading",
  });
  const { roomState, retry } = useActiveRoomContext(state);

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

  return renderPlatformHomeContext(state, roomState, {
    onRetryActiveRoom: retry,
  });
}
