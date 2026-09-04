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
  player,
  roomState,
  onRetryActiveRoom,
  roomCreationState,
  roomJoinState,
  onCreateRoom,
  onShowJoinRoomForm,
  onJoinRoomSubmit,
}: RecognizedPlatformContext & {
  roomState: ActiveRoomContextState;
  onRetryActiveRoom?: () => void;
  roomCreationState: RoomCreationState;
  roomJoinState: RoomJoinState;
  onCreateRoom?: () => void;
  onShowJoinRoomForm?: () => void;
  onJoinRoomSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isAdmin = group.adminPlayerId === player.id;
  const [shareState, setShareState] = useState<ShareGroupInvitationState>({
    status: "idle"
  });
  const invitationController = useRef(
    createGetMyActiveGroupInvitationController()
  );
  const joinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (roomJoinState.status === "form") {
      joinInputRef.current?.focus();
    }
  }, [roomJoinState.status]);

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
      <h2 id="impostor-platform-context-title">Empezar a jugar</h2>
      <p>Hola, {player.nickname}.</p>
      {roomState.status === "loading" || roomState.status === "idle" ? (
        <p aria-live="polite">Comprobando sala activa...</p>
      ) : null}
      {roomState.status === "absent" ? (
        <>
          <p className="impostor-platform-context__meta">
            No hay una sala activa.
          </p>
          <button
            className="impostor-action impostor-action--primary"
            type="button"
            disabled={roomJoinState.status === "joining"}
            onClick={onShowJoinRoomForm}
          >
            Unirme a una sala
          </button>
          <button
            className="impostor-action"
            type="button"
            disabled={roomCreationState.status === "creating"}
            onClick={onCreateRoom}
          >
            {roomCreationState.status === "creating"
              ? "Creando sala..."
              : "Crear sala"}
          </button>
          {roomCreationState.status === "error" ? (
            <p aria-live="polite">{roomCreationState.message}</p>
          ) : null}
          {roomJoinState.status === "form" ||
          roomJoinState.status === "joining" ? (
            <form
              className="impostor-create-group"
              aria-labelledby="impostor-join-room-title"
              onSubmit={onJoinRoomSubmit}
            >
              <h3 id="impostor-join-room-title">Unirme a una sala</h3>
              <label className="impostor-field">
                <span>Código de sala</span>
                <input
                  ref={joinInputRef}
                  name="roomCode"
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={8}
                  required
                  disabled={roomJoinState.status === "joining"}
                />
              </label>
              <button
                className="impostor-action impostor-action--primary"
                type="submit"
                disabled={roomJoinState.status === "joining"}
              >
                {roomJoinState.status === "joining"
                  ? "Uniéndote..."
                  : "Unirme"}
              </button>
            </form>
          ) : null}
          {roomJoinState.status === "error" ? (
            <p aria-live="polite">{roomJoinState.message}</p>
          ) : null}
          <Link className="impostor-action" href="/impostor/grupo">
            Ver grupo
          </Link>
        </>
      ) : null}
      {roomState.status === "success" ? (
        <>
          <p className="impostor-platform-context__meta">
            {roomState.room.status === "playing"
              ? "Partida en curso"
              : "Sala activa"}
          </p>
          <Link
            className="impostor-action impostor-action--primary"
            href={`/impostor/sala/${encodeURIComponent(roomState.room.code)}`}
          >
            {roomState.room.status === "playing"
              ? "Volver a la partida"
              : "Volver a la sala"}
          </Link>
          <Link className="impostor-action" href="/impostor/grupo">
            Ver grupo
          </Link>
        </>
      ) : null}
      {roomState.status === "error" ? (
        <>
          <p>No pudimos comprobar si tenés una sala activa.</p>
          {onRetryActiveRoom ? (
            <button
              className="impostor-action impostor-action--primary"
              type="button"
              onClick={onRetryActiveRoom}
            >
              Reintentar
            </button>
          ) : null}
          <Link className="impostor-action" href="/impostor/grupo">
            Ver grupo
          </Link>
        </>
      ) : null}
      <div className="impostor-group-summary">
        <p>Tu grupo</p>
        <strong>{group.name}</strong>
        <Link className="impostor-action" href="/grupo">
          Ver grupo de Platform
        </Link>
      </div>
      {isAdmin && roomState.status === "absent" ? (
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
    roomState?: ActiveRoomContextState;
    onRetryActiveRoom?: () => void;
    roomCreationState?: RoomCreationState;
    roomJoinState?: RoomJoinState;
    onCreateRoom?: () => void;
    onShowJoinRoomForm?: () => void;
    onJoinRoomSubmit?: (event: FormEvent<HTMLFormElement>) => void;
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
    return (
      <ImpostorRecognizedContext
        group={state.group}
        player={state.player}
        roomState={options.roomState ?? { status: "idle" }}
        onRetryActiveRoom={options.onRetryActiveRoom}
        roomCreationState={options.roomCreationState ?? { status: "idle" }}
        roomJoinState={options.roomJoinState ?? { status: "idle" }}
        onCreateRoom={options.onCreateRoom}
        onShowJoinRoomForm={options.onShowJoinRoomForm}
        onJoinRoomSubmit={options.onJoinRoomSubmit}
      />
    );
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
  const { roomState, retry: retryActiveRoom } = useActiveRoomContext(state);
  const {
    roomCreationState,
    roomJoinState,
    createRoom,
    showJoinRoomForm,
    joinRoomByCode
  } = useRoomEntryActions();

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

  function handleJoinRoomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    joinRoomByCode(String(formData.get("roomCode") ?? ""));
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
    onRetry: () => void runBootstrap(true),
    roomState,
    onRetryActiveRoom: retryActiveRoom,
    roomCreationState,
    roomJoinState,
    onCreateRoom: createRoom,
    onShowJoinRoomForm: showJoinRoomForm,
    onJoinRoomSubmit: handleJoinRoomSubmit
  });
}
