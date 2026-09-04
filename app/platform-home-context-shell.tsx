"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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

function renderImpostorGameEntry(content: ReactNode) {
  return (
    <section className="game-entry" aria-labelledby="games-title">
      <div className="game-entry__art" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="game-entry__content">
        <p className="game-entry__label" id="games-title">
          Juegos
        </p>
        <h2>Impostor</h2>
        {content}
      </div>
    </section>
  );
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
    const identity = (
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
      </section>
    );

    const activeRoomHref =
      roomState.status === "success"
        ? `/impostor/sala/${encodeURIComponent(roomState.room.code)}`
        : undefined;
    const isPlayingRoom =
      roomState.status === "success" && roomState.room.status === "playing";

    let cardContent: ReactNode;

    if (roomState.status === "success" && activeRoomHref) {
      cardContent = (
        <>
          <p className="game-entry__status">
            {isPlayingRoom ? "Partida en curso" : "Sala activa"}
          </p>
          <div className="game-entry__actions">
            <Link className="game-entry__cta" href={activeRoomHref}>
              {isPlayingRoom ? "Volver a la partida" : "Volver a la sala"}
            </Link>
            <Link className="home-secondary-cta" href="/impostor">
              Ver Impostor
            </Link>
          </div>
        </>
      );
    } else if (roomState.status === "error") {
      cardContent = (
        <>
          <p className="game-entry__status" aria-live="polite">
            No pudimos comprobar si tenés una sala activa.
          </p>
          <div className="game-entry__actions">
            {options.onRetryActiveRoom ? (
              <button
                className="game-entry__cta game-entry__cta--button"
                type="button"
                onClick={options.onRetryActiveRoom}
              >
                Reintentar
              </button>
            ) : null}
            <Link className="home-secondary-cta" href="/impostor">
              Ver Impostor
            </Link>
          </div>
        </>
      );
    } else if (roomState.status === "loading" || roomState.status === "idle") {
      cardContent = (
        <>
          <p>Encontrá al impostor sin revelar demasiado.</p>
          <p aria-live="polite">Comprobando tu sala activa...</p>
        </>
      );
    } else {
      cardContent = (
        <>
          <p>Encontrá al impostor sin revelar demasiado.</p>
          <Link className="game-entry__cta" href="/impostor">
            Jugar a Impostor
          </Link>
        </>
      );
    }

    return (
      <>
        {identity}
        {renderImpostorGameEntry(cardContent)}
      </>
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
