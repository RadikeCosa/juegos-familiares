"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../../../../lib/supabase/browser-client";
import {
  ensureAnonymousAuthIdentity,
  type AnonymousAuthIdentity,
} from "../../../../lib/supabase/anonymous-auth";
import {
  createJoinRoomByCodeController,
  createLobbySyncController,
  clearRoomCreationIntent,
  clearRoomJoinIntent,
  getMyActiveRoom,
  recordRoomJoinIntent,
  subscribeToRoomChanges,
  type ImpostorRoomChangesClient,
  type ImpostorRoomsClient,
  type RoomLobby,
} from "../../../../lib/supabase/impostor-rooms";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
} from "../../../../lib/supabase/platform-bootstrap";

type RoomLobbyDataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; lobby: RoomLobby }
  | { status: "error"; message: string }
  | { status: "awaiting-join"; error?: string }
  | { status: "joining" };

const GENERIC_ROOM_LOBBY_ERROR = "No pudimos cargar la sala. Intentá de nuevo.";
const GENERIC_START_AUTH_ERROR =
  "No pudimos empezar. Revisá tu conexión e intentá de nuevo.";

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

function createImpostorRoomsClient(): ImpostorRoomsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
}

function createImpostorRoomChangesClient(): ImpostorRoomChangesClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomChangesClient;
}

function createAnonymousAuthClient() {
  return createBrowserSupabaseClient() as unknown as Parameters<
    typeof ensureAnonymousAuthIdentity
  >[0];
}

function getFriendlyError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function formatPlayerCount(count: number) {
  return count === 1 ? "1 jugador" : `${count} jugadores`;
}

export function renderRoomParticipantsList(
  participants: RoomLobby["participants"],
) {
  return (
    <ul className="impostor-group-members">
      {participants.map((participant) => (
        <li key={participant.nickname}>
          <span>{participant.nickname}</span>
          {participant.isHost ? <strong>Host</strong> : null}
        </li>
      ))}
    </ul>
  );
}

export function renderRoomLobbyContent(
  bootstrapState: PlatformBootstrapState,
  dataState: RoomLobbyDataState,
  options: {
    roomCode: string;
    onRetryBootstrap?: () => void;
    onRetryData?: () => void;
    onJoinRoom?: () => void;
    onStartAnonymousAuth?: () => void;
    isStartingAuth?: boolean;
    startAuthError?: string;
  },
) {
  if (bootstrapState.status === "loading") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <h1>Comprobando tu grupo...</h1>
      </section>
    );
  }

  if (
    bootstrapState.status === "unrecognized" &&
    bootstrapState.reason === "no-auth"
  ) {
    return (
      <section
        className="impostor-group-card impostor-room-lobby"
        aria-labelledby="impostor-room-invite-title"
      >
        <p className="impostor-kicker">Sala</p>
        <h1 id="impostor-room-invite-title">
          Te invitaron a una sala de Impostor.
        </h1>
        <p>Sala {options.roomCode}.</p>
        <button
          className="impostor-action impostor-action--primary"
          type="button"
          disabled={options.isStartingAuth}
          onClick={options.onStartAnonymousAuth}
        >
          {options.isStartingAuth ? "Un momento..." : "Continuar para unirme"}
        </button>
        {options.startAuthError ? (
          <div className="impostor-group-error" aria-live="polite">
            <p>{options.startAuthError}</p>
          </div>
        ) : null}
      </section>
    );
  }

  if (bootstrapState.status === "unrecognized") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Sala</p>
        <h1>Primero necesitás unirte a un grupo.</h1>
        <p>Volvé a Impostor para crear un grupo o unirte con una invitación.</p>
        <Link
          className="impostor-action impostor-action--primary"
          href="/impostor"
        >
          Ir a Impostor
        </Link>
      </section>
    );
  }

  if (bootstrapState.status === "inconsistent") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Sala</p>
        <h1>No pudimos recuperar correctamente tu grupo.</h1>
        <p>Volvé a Impostor para revisar tu contexto.</p>
        <Link
          className="impostor-action impostor-action--primary"
          href="/impostor"
        >
          Ir a Impostor
        </Link>
      </section>
    );
  }

  if (bootstrapState.status === "connection-error") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Sala</p>
        <h1>No pudimos comprobar tu grupo ahora.</h1>
        <p>Revisá tu conexión e intentá de nuevo.</p>
        {options.onRetryBootstrap ? (
          <button
            className="impostor-action impostor-action--primary"
            type="button"
            onClick={options.onRetryBootstrap}
          >
            Reintentar
          </button>
        ) : null}
      </section>
    );
  }

  if (dataState.status === "loading" || dataState.status === "idle") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Sala</p>
        <h1>Preparando sala {options.roomCode}...</h1>
      </section>
    );
  }

  if (dataState.status === "awaiting-join" || dataState.status === "joining") {
    return (
      <section
        className="impostor-group-card impostor-room-lobby"
        aria-labelledby="impostor-room-join-title"
      >
        <p className="impostor-kicker">Sala</p>
        <h1 id="impostor-room-join-title">Sala {options.roomCode}</h1>
        <p>Te invitaron a esta sala de Impostor.</p>
        <button
          className="impostor-action impostor-action--primary"
          type="button"
          disabled={dataState.status === "joining"}
          onClick={options.onJoinRoom}
        >
          {dataState.status === "joining"
            ? "Uniéndote..."
            : "Continuar para unirme"}
        </button>
        {dataState.status === "awaiting-join" && dataState.error ? (
          <div className="impostor-group-error" aria-live="polite">
            <p>{dataState.error}</p>
          </div>
        ) : null}
      </section>
    );
  }

  if (dataState.status === "error") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Sala</p>
        <h1>No pudimos mostrar la sala.</h1>
        <div className="impostor-group-error" aria-live="polite">
          <p>{dataState.message}</p>
          {options.onRetryData ? (
            <button
              className="impostor-action impostor-action--primary"
              type="button"
              onClick={options.onRetryData}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const { lobby } = dataState;

  return (
    <section
      className="impostor-group-card impostor-room-lobby"
      aria-labelledby="impostor-room-title"
    >
      <p className="impostor-kicker">Sala</p>
      <h1 id="impostor-room-title">Sala {lobby.room.code}</h1>

      <div
        className="impostor-group-section"
        aria-labelledby="impostor-room-participants-title"
      >
        <h2 id="impostor-room-participants-title">Jugadores</h2>
        {renderRoomParticipantsList(lobby.participants)}
      </div>

      <p className="impostor-word-bank-count">
        {formatPlayerCount(lobby.participants.length)}
      </p>
    </section>
  );
}

export function ImpostorRoomLobbyShell({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [bootstrapState, setBootstrapState] = useState<PlatformBootstrapState>({
    status: "loading",
  });
  const [dataState, setDataState] = useState<RoomLobbyDataState>({
    status: "idle",
  });
  const [isStartingAuth, setIsStartingAuth] = useState(false);
  const [startAuthError, setStartAuthError] = useState<string | undefined>();
  const joinRoomController = useState(() =>
    createJoinRoomByCodeController(),
  )[0];
  const activeRoomId =
    bootstrapState.status === "recognized" && dataState.status === "success"
      ? dataState.lobby.room.id
      : undefined;

  async function runBootstrap() {
    setBootstrapState({ status: "loading" });
    setDataState({ status: "idle" });
    setBootstrapState(
      await bootstrapPlatformContext(createPlatformBootstrapClient()),
    );
  }

  async function runRecognizedFlow() {
    setDataState({ status: "loading" });

    try {
      const activeLobby = await getMyActiveRoom(createImpostorRoomsClient());

      if (activeLobby) {
        if (activeLobby.room.code !== roomCode) {
          router.replace(
            `/impostor/sala/${encodeURIComponent(activeLobby.room.code)}`,
          );

          return;
        }

        clearRoomCreationIntent(roomCode);
        clearRoomJoinIntent(roomCode);
        setDataState({ status: "success", lobby: activeLobby });

        return;
      }
    } catch (error) {
      setDataState({
        status: "error",
        message: getFriendlyError(error, GENERIC_ROOM_LOBBY_ERROR),
      });

      return;
    }

    setDataState({ status: "awaiting-join" });
  }

  async function handleJoinRoom() {
    setDataState({ status: "joining" });

    try {
      const lobby = await joinRoomController.submit(
        createImpostorRoomsClient(),
        roomCode,
      );

      recordRoomJoinIntent(lobby.room.code);
      setDataState({ status: "success", lobby });
    } catch (error) {
      setDataState({
        status: "awaiting-join",
        error: getFriendlyError(error, GENERIC_ROOM_LOBBY_ERROR),
      });
    }
  }

  async function handleStartAnonymousAuth() {
    setIsStartingAuth(true);
    setStartAuthError(undefined);

    try {
      const identity: AnonymousAuthIdentity = await ensureAnonymousAuthIdentity(
        createAnonymousAuthClient(),
      );

      void identity;
      await runBootstrap();
    } catch (error) {
      setStartAuthError(getFriendlyError(error, GENERIC_START_AUTH_ERROR));
    } finally {
      setIsStartingAuth(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    void bootstrapPlatformContext(createPlatformBootstrapClient()).then(
      (nextBootstrapState) => {
        if (isActive) {
          setBootstrapState(nextBootstrapState);
        }
      },
    );

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (bootstrapState.status !== "recognized") {
      return;
    }

    void Promise.resolve().then(() => runRecognizedFlow());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapState, roomCode]);

  useEffect(() => {
    if (bootstrapState.status !== "recognized" || !activeRoomId) {
      return;
    }

    let isActive = true;
    const syncController = createLobbySyncController({
      readLobby: () => getMyActiveRoom(createImpostorRoomsClient()),
      onSnapshot: (snapshot) => {
        if (!isActive) {
          return;
        }

        if (snapshot.status === "success") {
          if (snapshot.lobby.room.code !== roomCode) {
            router.replace(
              `/impostor/sala/${encodeURIComponent(snapshot.lobby.room.code)}`,
            );

            return;
          }

          clearRoomCreationIntent(roomCode);
          clearRoomJoinIntent(roomCode);
          setDataState({ status: "success", lobby: snapshot.lobby });
        }

        if (snapshot.status === "absent") {
          setDataState({ status: "awaiting-join" });
        }
      },
    });
    const subscription = subscribeToRoomChanges(
      createImpostorRoomChangesClient(),
      activeRoomId,
      () => syncController.invalidate(),
    );

    return () => {
      isActive = false;
      syncController.dispose();
      void subscription.unsubscribe();
    };
  }, [bootstrapState.status, activeRoomId, roomCode, router]);

  return renderRoomLobbyContent(bootstrapState, dataState, {
    roomCode,
    onRetryBootstrap: () => void runBootstrap(),
    onRetryData: () => void runRecognizedFlow(),
    onJoinRoom: () => void handleJoinRoom(),
    onStartAnonymousAuth: () => void handleStartAnonymousAuth(),
    isStartingAuth,
    startAuthError,
  });
}
