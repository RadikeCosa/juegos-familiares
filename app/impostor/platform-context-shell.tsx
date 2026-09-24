"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useActiveRoomContext,
  type ActiveRoomContextState,
} from "./use-active-room-context";
import {
  useRoomEntryActions,
  type RoomCreationState,
  type RoomJoinState,
} from "./use-room-entry-actions";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
} from "../../lib/supabase/platform-bootstrap";
import { roomPath } from "../../lib/supabase/impostor-rooms";

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

function ImpostorRoomEntry({
  player,
  roomState,
  onRetryActiveRoom,
  roomCreationState,
  roomJoinState,
  onCreateRoom,
  onShowJoinRoomForm,
  onHideJoinRoomForm,
  onJoinRoomSubmit,
}: {
  player: { nickname: string };
  roomState: ActiveRoomContextState;
  onRetryActiveRoom?: () => void;
  roomCreationState: RoomCreationState;
  roomJoinState: RoomJoinState;
  onCreateRoom?: () => void;
  onShowJoinRoomForm?: () => void;
  onHideJoinRoomForm?: () => void;
  onJoinRoomSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const joinInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (roomJoinState.status === "form") joinInputRef.current?.focus();
  }, [roomJoinState.status]);

  return (
    <section className="impostor-platform-context" aria-labelledby="impostor-platform-context-title">
      <h2 id="impostor-platform-context-title">Jugar a Impostor</h2>
      <p>Hola, {player.nickname}.</p>
      {roomState.status === "loading" || roomState.status === "idle" ? (
        <p aria-live="polite">Comprobando sala activa...</p>
      ) : null}
      {roomState.status === "absent" ? (
        <>
          <p className="impostor-platform-context__meta">No hay una sala activa.</p>
          {roomJoinState.status === "idle" ? (
            <>
              <button className="impostor-action impostor-action--primary" type="button" onClick={onShowJoinRoomForm}>
                Unirme a una sala
              </button>
              <button className="impostor-action" type="button" disabled={roomCreationState.status === "creating"} onClick={onCreateRoom}>
                {roomCreationState.status === "creating" ? "Creando sala..." : "Crear sala"}
              </button>
              {roomCreationState.status === "error" ? <p role="alert">{roomCreationState.message}</p> : null}
            </>
          ) : (
            <form className="impostor-create-group impostor-room-join-step" aria-labelledby="impostor-join-room-title" onSubmit={onJoinRoomSubmit}>
              <div>
                <p className="impostor-kicker">Unirse a una sala</p>
                <h3 id="impostor-join-room-title">Ingresá el código de la sala</h3>
                <p id="impostor-join-room-help">Pedíselo a la persona que creó la sala.</p>
              </div>
              <label className="impostor-field">
                <span>Código de sala</span>
                <input ref={joinInputRef} aria-describedby="impostor-join-room-help" aria-invalid={roomJoinState.status === "error"} name="roomCode" type="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={8} required disabled={roomJoinState.status === "joining"} />
              </label>
              {roomJoinState.status === "error" ? <p className="impostor-room-join-step__error" aria-live="polite">{roomJoinState.message}</p> : null}
              <div className="impostor-room-join-step__actions">
                <button className="impostor-action impostor-action--primary" type="submit" disabled={roomJoinState.status === "joining"}>
                  {roomJoinState.status === "joining" ? "Entrando..." : "Entrar a la sala"}
                </button>
                <button className="impostor-action" type="button" disabled={roomJoinState.status === "joining"} onClick={onHideJoinRoomForm}>Volver</button>
              </div>
            </form>
          )}
        </>
      ) : null}
      {roomState.status === "success" ? (
        <>
          <p className="impostor-platform-context__meta">{roomState.room.status === "playing" ? "Partida en curso" : "Sala activa"}</p>
          <Link className="impostor-action impostor-action--primary" href={roomPath(roomState.room.gameType, roomState.room.code)}>
            {roomState.room.status === "playing" ? "Volver a la partida" : "Volver a la sala"}
          </Link>
        </>
      ) : null}
      {roomState.status === "error" ? (
        <>
          <p>No pudimos comprobar si tenés una sala activa.</p>
          {onRetryActiveRoom ? <button className="impostor-action impostor-action--primary" type="button" onClick={onRetryActiveRoom}>Reintentar</button> : null}
        </>
      ) : null}
      <Link className="impostor-action" href="/impostor/grupo/palabras">Administrar banco de palabras</Link>
    </section>
  );
}

export function renderImpostorPlatformContext(
  state: PlatformBootstrapState,
  options: {
    onRetry?: () => void;
    roomState?: ActiveRoomContextState;
    onRetryActiveRoom?: () => void;
    roomCreationState?: RoomCreationState;
    roomJoinState?: RoomJoinState;
    onCreateRoom?: () => void;
    onShowJoinRoomForm?: () => void;
    onHideJoinRoomForm?: () => void;
    onJoinRoomSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  } = {}
) {
  if (state.status === "loading") {
    return <section className="impostor-platform-context" aria-live="polite"><h2>Comprobando tu grupo...</h2></section>;
  }

  if (state.status === "recognized") {
    return (
      <ImpostorRoomEntry
        player={state.player}
        roomState={options.roomState ?? { status: "idle" }}
        onRetryActiveRoom={options.onRetryActiveRoom}
        roomCreationState={options.roomCreationState ?? { status: "idle" }}
        roomJoinState={options.roomJoinState ?? { status: "idle" }}
        onCreateRoom={options.onCreateRoom}
        onShowJoinRoomForm={options.onShowJoinRoomForm}
        onHideJoinRoomForm={options.onHideJoinRoomForm}
        onJoinRoomSubmit={options.onJoinRoomSubmit}
      />
    );
  }

  if (state.status === "inconsistent") {
    return <section className="impostor-platform-context" aria-live="polite"><h2>No pudimos recuperar tu acceso.</h2><p>Revisá el grupo desde el inicio antes de jugar.</p><Link className="impostor-action impostor-action--primary" href="/">Ir al inicio</Link></section>;
  }

  if (state.status === "connection-error") {
    return <section className="impostor-platform-context" aria-live="polite"><h2>No pudimos comprobar tu acceso ahora.</h2><p>Revisá tu conexión e intentá de nuevo.</p>{options.onRetry ? <button className="impostor-action impostor-action--primary" type="button" onClick={options.onRetry}>Reintentar</button> : null}</section>;
  }

  return <section className="impostor-platform-context" aria-live="polite"><h2>Necesitás unirte a un grupo para jugar.</h2><p>La gestión del grupo está en la pantalla de inicio.</p><Link className="impostor-action impostor-action--primary" href="/">Ir al inicio</Link></section>;
}

export function ImpostorPlatformContextShell() {
  const [state, setState] = useState<PlatformBootstrapState>({ status: "loading" });
  const { roomState, retry: retryActiveRoom } = useActiveRoomContext(state);
  const { roomCreationState, roomJoinState, createRoom, showJoinRoomForm, hideJoinRoomForm, joinRoomByCode } = useRoomEntryActions();

  async function runBootstrap(showLoading: boolean) {
    if (showLoading) setState({ status: "loading" });
    setState(await bootstrapPlatformContext(createPlatformBootstrapClient()));
  }

  function handleJoinRoomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    joinRoomByCode(String(new FormData(event.currentTarget).get("roomCode") ?? ""));
  }

  useEffect(() => {
    let active = true;
    void bootstrapPlatformContext(createPlatformBootstrapClient()).then((nextState) => {
      if (active) setState(nextState);
    });
    return () => { active = false; };
  }, []);

  return renderImpostorPlatformContext(state, {
    onRetry: () => void runBootstrap(true),
    roomState,
    onRetryActiveRoom: retryActiveRoom,
    roomCreationState,
    roomJoinState,
    onCreateRoom: createRoom,
    onShowJoinRoomForm: showJoinRoomForm,
    onHideJoinRoomForm: hideJoinRoomForm,
    onJoinRoomSubmit: handleJoinRoomSubmit
  });
}
