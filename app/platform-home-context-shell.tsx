"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PlatformGroupOnboardingActions } from "./platform-group-onboarding-actions";
import { renderPlatformGroupContext } from "./platform-group-section";
import {
  listGroupPlayers,
  type GroupPlayer,
  type PlatformPlayersClient
} from "../lib/supabase/platform-players";
import {
  useActiveRoomContext,
  type ActiveRoomContextState,
} from "./impostor/use-active-room-context";
import { createBrowserSupabaseClient } from "../lib/supabase/browser-client";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
  type RecognizedPlatformContext,
  writeLocalIdentityFromContext,
} from "../lib/supabase/platform-bootstrap";
import { roomPath } from "../lib/supabase/impostor-rooms";

type HomeGroupPlayersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; players: GroupPlayer[] }
  | { status: "error"; message: string };

function createPlatformPlayersClient(): PlatformPlayersClient {
  return createBrowserSupabaseClient() as unknown as PlatformPlayersClient;
}

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


function PlatformGroupDetails({ context }: { context: RecognizedPlatformContext }) {
  const [playersState, setPlayersState] = useState<HomeGroupPlayersState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    void listGroupPlayers(createPlatformPlayersClient(), context.group.id)
      .then((players: GroupPlayer[]) => {
        if (active) setPlayersState({ status: "success", players });
      })
      .catch((error: unknown) => {
        if (active) setPlayersState({
          status: "error",
          message: error instanceof Error ? error.message : "No pudimos cargar los integrantes. Intentá de nuevo."
        });
      });
    return () => { active = false; };
  }, [context.group.id, retryCount]);

  return renderPlatformGroupContext(
    { status: "recognized", ...context },
    playersState,
    { onRetryPlayers: () => setRetryCount((count) => count + 1) }
  );
}

export function renderPlatformHomeContext(
  state: PlatformBootstrapState,
  roomState: ActiveRoomContextState = { status: "idle" },
  options: { onRetryActiveRoom?: () => void; onRetryBootstrap?: () => void; onRecognizedContext?: (context: RecognizedPlatformContext) => void } = {},
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
        ? roomPath(roomState.room.gameType, roomState.room.code)
        : undefined;
    const isPlayingRoom =
      roomState.status === "success" && roomState.room.status === "playing";

    let cardContent: ReactNode;

    if (roomState.status === "success" && activeRoomHref && roomState.room.gameType === "impostor") {
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
    } else if (roomState.status === "success") {
      cardContent = (
        <>
          <p>Encontrá al impostor sin revelar demasiado.</p>
          <Link className="game-entry__cta" href="/impostor">Ver Impostor</Link>
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
        <PlatformGroupDetails key={state.group.id} context={{ group: state.group, player: state.player }} />
        {renderImpostorGameEntry(cardContent)}
        <section className="game-entry" aria-labelledby="tutti-frutti-entry-title">
          <div className="game-entry__art game-entry__art--tutti-frutti" aria-hidden="true">
            <svg viewBox="0 0 96 96" fill="none" focusable="false">
              <path d="M48 27c2-10 8-15 17-16" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
              <path d="M53 24c6-9 15-12 24-9-4 9-12 14-24 9Z" fill="var(--accent)" />
              <circle cx="48" cy="56" r="28" fill="currentColor" />
              <path d="M48 37v38M29 56h38M35 43l26 26M61 43 35 69" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="game-entry__content">
            <p className="game-entry__label">Juegos</p>
            <h2 id="tutti-frutti-entry-title">Tutti Frutti</h2>
            {roomState.status === "success" && roomState.room.gameType === "tutti_frutti" && activeRoomHref ? (
              <>
                <p className="game-entry__status">{isPlayingRoom ? "Partida en curso" : "Sala activa"}</p>
                <Link className="game-entry__cta" href={activeRoomHref}>Volver a la sala</Link>
              </>
            ) : (
              <Link className="game-entry__cta" href="/tutti-frutti">Ir a Tutti Frutti</Link>
            )}
          </div>
        </section>
      </>
    );
  }

  if (state.status === "unrecognized") {
    return <section className="home-platform-context" aria-labelledby="home-group-onboarding-title"><h2 id="home-group-onboarding-title">Tu grupo</h2><p>Creá un grupo o sumate con una invitación para empezar a jugar.</p><PlatformGroupOnboardingActions onRecognizedContext={options.onRecognizedContext} /></section>;
  }

  if (state.status === "inconsistent") {
    return (
      <section className="home-platform-context" aria-live="polite">
        <h2>No pudimos recuperar correctamente tu grupo.</h2>
        <p>No pudimos recuperar el grupo asociado a esta identidad.</p>
        {options.onRetryBootstrap ? (
          <button className="home-secondary-cta home-secondary-cta--primary home-secondary-cta--button" type="button" onClick={options.onRetryBootstrap}>Volver a intentar</button>
        ) : null}
      </section>
    );
  }

  if (state.status === "connection-error") {
    return (
      <section className="home-platform-context" aria-live="polite">
        <h2>No pudimos comprobar tu grupo ahora.</h2>
        <p>Revisá tu conexión e intentá cargar de nuevo la información del grupo.</p>
        {options.onRetryBootstrap ? (
          <button className="home-secondary-cta home-secondary-cta--primary home-secondary-cta--button" type="button" onClick={options.onRetryBootstrap}>Reintentar</button>
        ) : null}
      </section>
    );
  }

  return <section className="home-platform-context" aria-live="polite"><p>Gestioná tu grupo desde acá para empezar a jugar.</p><PlatformGroupOnboardingActions onRecognizedContext={options.onRecognizedContext} /></section>;
}

export function PlatformHomeContextShell() {
  const [state, setState] = useState<PlatformBootstrapState>({
    status: "loading",
  });
  const { roomState, retry } = useActiveRoomContext(state);

  function handleRecognizedContext(context: RecognizedPlatformContext) {
    writeLocalIdentityFromContext(context);
    setState({ status: "recognized", ...context });
  }

  function retryBootstrap() {
    setState({ status: "loading" });
    void bootstrapPlatformContext(createPlatformBootstrapClient()).then(setState);
  }

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
    onRetryBootstrap: retryBootstrap,
    onRecognizedContext: handleRecognizedContext
  });
}
