"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../../../lib/supabase/browser-client";
import {
  ensureAnonymousAuthIdentity,
  type AnonymousAuthIdentity,
} from "../../../../lib/supabase/anonymous-auth";
import {
  createCloseRoomController,
  createHostSuccessionController,
  createJoinRoomByCodeController,
  createLeaveRoomController,
  createStartSessionController,
  clearRoomCreationIntent,
  clearRoomJoinIntent,
  getConnectedRoomParticipantIds,
  getMyGameState,
  getMyActiveRoom,
  refreshMyRoomLiveness,
  subscribeToRoomPresence,
  recordRoomJoinIntent,
  startRoomHostSuccessionRecheck,
  startRoomLivenessHeartbeat,
  subscribeToRoomChanges,
  type ImpostorRoomChangesClient,
  type ImpostorRoomPresenceClient,
  type ImpostorRoomsClient,
  type MyGameState,
  type RoomPresenceState,
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
  | { status: "success"; lobby: RoomLobby; startError?: string }
  | { status: "starting"; lobby: RoomLobby }
  | { status: "loading-game-state"; lobby: RoomLobby }
  | {
      status: "role-reveal";
      lobby: RoomLobby;
      gameState: MyGameState;
      isRoleRevealed: boolean;
    }
  | { status: "excluded"; lobby: RoomLobby; message: string }
  | { status: "error"; message: string }
  | { status: "awaiting-join"; error?: string }
  | { status: "joining" };

type RoomLifecycleActionState =
  | { status: "idle" }
  | { status: "leaving" }
  | { status: "closing" }
  | { status: "error"; message: string };

const GENERIC_ROOM_LOBBY_ERROR = "No pudimos cargar la sala. Intentá de nuevo.";
const GENERIC_GAME_RECONSTRUCTION_ERROR = "No pudimos reconstruir la partida.";
const GENERIC_START_AUTH_ERROR =
  "No pudimos empezar. Revisá tu conexión e intentá de nuevo.";
const START_NOT_HOST_MESSAGE = "Solo el host actual puede iniciar la tanda.";
const START_NOT_HOST_UI_MESSAGE = "Ya no sos el host actual.";
const EXCLUDED_GAME_STATE_MESSAGE = "No participás de la tanda actual.";
const ROOM_LIVENESS_LOG_MESSAGE = "No pudimos refrescar liveness de sala.";
const ROOM_HOST_SUCCESSION_LOG_MESSAGE = "No pudimos revisar sucesión de host.";

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

function createImpostorRoomsClient(): ImpostorRoomsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
}

function createImpostorRoomChangesClient(): ImpostorRoomChangesClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomChangesClient;
}

function createImpostorRoomPresenceClient(): ImpostorRoomPresenceClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomPresenceClient;
}

function createAnonymousAuthClient() {
  return createBrowserSupabaseClient() as unknown as Parameters<
    typeof ensureAnonymousAuthIdentity
  >[0];
}

function getFriendlyError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function logRoomLivenessError(error: unknown) {
  console.warn(ROOM_LIVENESS_LOG_MESSAGE, error);
}

function logRoomHostSuccessionError(error: unknown) {
  console.warn(ROOM_HOST_SUCCESSION_LOG_MESSAGE, error);
}

function getLobbyFromDataState(state: RoomLobbyDataState) {
  return "lobby" in state ? state.lobby : undefined;
}

function getSelfParticipant(lobby: RoomLobby) {
  return lobby.participants.find((participant) => participant.isSelf);
}

function getHostParticipant(lobby: RoomLobby) {
  return lobby.participants.find((participant) => participant.isHost);
}

function isExcludedGameStateError(error: unknown) {
  return error instanceof Error && error.message === EXCLUDED_GAME_STATE_MESSAGE;
}

function isNotHostStartError(error: unknown) {
  return error instanceof Error && error.message === START_NOT_HOST_MESSAGE;
}

export function formatPlayerCount(count: number) {
  return count === 1 ? "1 jugador" : `${count} jugadores`;
}

export function renderRoomParticipantsList(
  participants: RoomLobby["participants"],
  connectedPlayerIds: Set<string> = new Set(),
) {
  return (
    <ul className="impostor-group-members">
      {participants.map((participant) => (
        <li key={participant.playerId}>
          <span>{participant.nickname}</span>
          <span className="impostor-room-badges">
            {participant.isSelf ? <strong>Vos</strong> : null}
            {participant.isHost ? <strong>Host</strong> : null}
            <span
              className={
                connectedPlayerIds.has(participant.playerId)
                  ? "impostor-presence impostor-presence--connected"
                  : "impostor-presence impostor-presence--disconnected"
              }
            >
              {connectedPlayerIds.has(participant.playerId)
                ? "conectado"
                : "desconectado"}
            </span>
          </span>
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
    onLeaveRoom?: () => void;
    onCloseRoom?: () => void;
    onStartSession?: () => void;
    onRevealRole?: () => void;
    onStartAnonymousAuth?: () => void;
    lifecycleActionState?: RoomLifecycleActionState;
    isStartingAuth?: boolean;
    startAuthError?: string;
    connectedPlayerIds?: Set<string>;
    hostSuccessionNotice?: string;
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

  if (
    dataState.status === "loading-game-state" ||
    dataState.status === "excluded" ||
    dataState.status === "role-reveal"
  ) {
    const { lobby } = dataState;
    const hostParticipant = getHostParticipant(lobby);

    if (dataState.status === "loading-game-state") {
      return (
        <section className="impostor-group-card" aria-live="polite">
          <p className="impostor-kicker">Tanda</p>
          <h1>Preparando tu rol...</h1>
          {hostParticipant ? <p>Host actual: {hostParticipant.nickname}</p> : null}
        </section>
      );
    }

    if (dataState.status === "excluded") {
      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-excluded-title"
        >
          <p className="impostor-kicker">Tanda</p>
          <h1 id="impostor-room-excluded-title">
            La tanda ya empezó y no quedaste incluido.
          </h1>
          <p>Esperá a la próxima.</p>
          <div className="impostor-group-error" aria-live="polite">
            <p>{dataState.message}</p>
          </div>
        </section>
      );
    }

    if (!dataState.isRoleRevealed) {
      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-role-hidden-title"
        >
          <p className="impostor-kicker">Tanda</p>
          <h1 id="impostor-role-hidden-title">Tu rol está listo</h1>
          {hostParticipant ? <p>Host actual: {hostParticipant.nickname}</p> : null}
          <button
            className="impostor-action impostor-action--primary"
            type="button"
            onClick={options.onRevealRole}
          >
            Ver mi rol
          </button>
        </section>
      );
    }

    if (dataState.gameState.privateView.role === "impostor") {
      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-role-impostor-title"
        >
          <p className="impostor-kicker">Ronda {dataState.gameState.roundNumber}</p>
          <h1 id="impostor-role-impostor-title">SOS EL IMPOSTOR</h1>
          {hostParticipant ? <p>Host actual: {hostParticipant.nickname}</p> : null}
        </section>
      );
    }

    return (
      <section
        className="impostor-group-card impostor-room-role-reveal"
        aria-labelledby="impostor-role-player-title"
      >
        <p className="impostor-kicker">Ronda {dataState.gameState.roundNumber}</p>
        <h1 id="impostor-role-player-title">Tu palabra</h1>
        <p className="impostor-room-secret-word">
          {dataState.gameState.privateView.word}
        </p>
        {hostParticipant ? <p>Host actual: {hostParticipant.nickname}</p> : null}
      </section>
    );
  }

  const { lobby } = dataState;
  const selfParticipant = getSelfParticipant(lobby);
  const lifecycleActionState = options.lifecycleActionState ?? {
    status: "idle" as const,
  };
  const isStartingSession = dataState.status === "starting";
  const isLifecycleActionPending =
    lifecycleActionState.status === "leaving" ||
    lifecycleActionState.status === "closing" ||
    isStartingSession;
  const isHost = Boolean(selfParticipant?.isHost);

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
        {options.hostSuccessionNotice ? (
          <p className="impostor-room-notice" aria-live="polite">
            {options.hostSuccessionNotice}
          </p>
        ) : null}
        {renderRoomParticipantsList(
          lobby.participants,
          options.connectedPlayerIds,
        )}
      </div>

      <p className="impostor-word-bank-count">
        {formatPlayerCount(lobby.participants.length)}
      </p>

      {selfParticipant ? (
        <div className="impostor-room-danger-zone">
          {isHost && lobby.room.status === "lobby" ? (
            <>
              <button
                className="impostor-action impostor-action--primary"
                type="button"
                disabled={isStartingSession}
                onClick={options.onStartSession}
              >
                {isStartingSession ? "Iniciando..." : "Iniciar tanda"}
              </button>
              {dataState.status === "success" && dataState.startError ? (
                <div className="impostor-group-error" aria-live="polite">
                  <p>{dataState.startError}</p>
                </div>
              ) : null}
            </>
          ) : null}

          {selfParticipant.isHost ? (
            <>
              <p>Cerrar la sala termina este lobby para todos.</p>
              <button
                className="impostor-action impostor-action--danger"
                type="button"
                disabled={isLifecycleActionPending}
                onClick={options.onCloseRoom}
              >
                {lifecycleActionState.status === "closing"
                  ? "Cerrando sala..."
                  : "Cerrar sala"}
              </button>
            </>
          ) : (
            <button
              className="impostor-action"
              type="button"
              disabled={isLifecycleActionPending}
              onClick={options.onLeaveRoom}
            >
              {lifecycleActionState.status === "leaving"
                ? "Saliendo..."
                : "Salir de la sala"}
            </button>
          )}

          {lifecycleActionState.status === "error" ? (
            <div className="impostor-group-error" aria-live="polite">
              <p>{lifecycleActionState.message}</p>
            </div>
          ) : null}
        </div>
      ) : null}
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
  const [lifecycleActionState, setLifecycleActionState] =
    useState<RoomLifecycleActionState>({ status: "idle" });
  const [roomPresenceSnapshot, setRoomPresenceSnapshot] = useState<{
    roomId?: string;
    state: RoomPresenceState;
  }>({ state: {} });
  const [hostSuccessionNotice, setHostSuccessionNotice] = useState<
    string | undefined
  >();
  const isActiveHostMissingRef = useRef(false);
  const isMountedRef = useRef(false);
  const refreshSequenceRef = useRef(0);
  const [, setPreviousHostPlayerId] = useState<string | undefined>();
  const joinRoomController = useState(() =>
    createJoinRoomByCodeController(),
  )[0];
  const leaveRoomController = useState(() => createLeaveRoomController())[0];
  const closeRoomController = useState(() => createCloseRoomController())[0];
  const hostSuccessionController = useState(() =>
    createHostSuccessionController(),
  )[0];
  const startSessionController = useState(() =>
    createStartSessionController(),
  )[0];
  const activeRoomId =
    bootstrapState.status === "recognized"
      ? getLobbyFromDataState(dataState)?.room.id
      : undefined;
  const currentRoomPlayerId =
    getLobbyFromDataState(dataState)?.participants.find(
      (participant) => participant.isSelf,
    )?.playerId;

  const recordActiveRoomHost = useCallback((lobby: RoomLobby) => {
    const nextHost = lobby.participants.find((participant) => participant.isHost);

    setPreviousHostPlayerId((previousHostPlayerId) => {
      if (
        previousHostPlayerId &&
        nextHost &&
        nextHost.playerId !== previousHostPlayerId
      ) {
        setHostSuccessionNotice(`${nextHost.nickname} ahora es el host`);
      }

      return nextHost?.playerId;
    });
  }, []);

  const acceptActiveRoom = useCallback((lobby: RoomLobby, startError?: string) => {
    recordActiveRoomHost(lobby);
    setDataState({ status: "success", lobby, startError });
  }, [recordActiveRoomHost]);

  const refreshAuthoritativeRoomState = useCallback(
    async (
      reason: "bootstrap" | "start" | "realtime" | "retry" | "authority",
      options: { startError?: string; absentDestination?: "join" | "group" } = {},
    ) => {
      const requestId = refreshSequenceRef.current + 1;
      refreshSequenceRef.current = requestId;

      function isLatestRefresh() {
        return isMountedRef.current && refreshSequenceRef.current === requestId;
      }

      void reason;
      setDataState({ status: "loading" });

      try {
        const activeLobby = await getMyActiveRoom(createImpostorRoomsClient());

        if (!isLatestRefresh()) {
          return;
        }

        if (!activeLobby) {
          if (options.absentDestination === "group") {
            router.replace("/impostor/grupo");
            return;
          }

          setDataState({ status: "awaiting-join" });
          return;
        }

        if (activeLobby.room.code !== roomCode) {
          router.replace(
            `/impostor/sala/${encodeURIComponent(activeLobby.room.code)}`,
          );

          return;
        }

        clearRoomCreationIntent(roomCode);
        clearRoomJoinIntent(roomCode);
        setLifecycleActionState({ status: "idle" });

        if (activeLobby.room.status !== "playing") {
          acceptActiveRoom(activeLobby, options.startError);
          return;
        }

        recordActiveRoomHost(activeLobby);
        setDataState({ status: "loading-game-state", lobby: activeLobby });

        let gameState: MyGameState | null;

        try {
          gameState = await getMyGameState(createImpostorRoomsClient());
        } catch (error) {
          if (!isLatestRefresh()) {
            return;
          }

          if (isExcludedGameStateError(error)) {
            setDataState({
              status: "excluded",
              lobby: activeLobby,
              message: "Esperá a la próxima tanda para volver a jugar.",
            });
            return;
          }

          setDataState({
            status: "error",
            message: getFriendlyError(error, GENERIC_GAME_RECONSTRUCTION_ERROR),
          });
          return;
        }

        if (!isLatestRefresh()) {
          return;
        }

        if (!gameState) {
          setDataState({
            status: "error",
            message: GENERIC_GAME_RECONSTRUCTION_ERROR,
          });
          return;
        }

        setDataState({
          status: "role-reveal",
          lobby: activeLobby,
          gameState,
          isRoleRevealed: false,
        });
      } catch (error) {
        if (!isLatestRefresh()) {
          return;
        }

        setDataState({
          status: "error",
          message: getFriendlyError(error, GENERIC_ROOM_LOBBY_ERROR),
        });
      }
    },
    [acceptActiveRoom, recordActiveRoomHost, roomCode, router],
  );

  async function runBootstrap() {
    const requestId = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = requestId;
    setBootstrapState({ status: "loading" });
    setDataState({ status: "idle" });
    const nextBootstrapState = await bootstrapPlatformContext(
      createPlatformBootstrapClient(),
    );

    if (!isMountedRef.current || refreshSequenceRef.current !== requestId) {
      return;
    }

    setBootstrapState(nextBootstrapState);
  }

  async function runRecognizedFlow() {
    await refreshAuthoritativeRoomState("bootstrap");
  }

  async function handleJoinRoom() {
    setDataState({ status: "joining" });

    try {
      const lobby = await joinRoomController.submit(
        createImpostorRoomsClient(),
        roomCode,
      );

      recordRoomJoinIntent(lobby.room.code);
      setLifecycleActionState({ status: "idle" });
      acceptActiveRoom(lobby);
    } catch (error) {
      setDataState({
        status: "awaiting-join",
        error: getFriendlyError(error, GENERIC_ROOM_LOBBY_ERROR),
      });
    }
  }

  async function handleLeaveRoom() {
    if (lifecycleActionState.status === "leaving") {
      return;
    }

    setLifecycleActionState({ status: "leaving" });

    try {
      await leaveRoomController.submit(createImpostorRoomsClient());
      router.replace("/impostor/grupo");
    } catch (error) {
      setLifecycleActionState({
        status: "error",
        message: getFriendlyError(error, "No pudimos salir de la sala."),
      });
    }
  }

  async function handleCloseRoom() {
    if (lifecycleActionState.status === "closing") {
      return;
    }

    if (!window.confirm("Cerrar la sala termina este lobby para todos.")) {
      return;
    }

    setLifecycleActionState({ status: "closing" });

    try {
      await closeRoomController.submit(createImpostorRoomsClient());
      router.replace("/impostor/grupo");
    } catch (error) {
      setLifecycleActionState({
        status: "error",
        message: getFriendlyError(error, "No pudimos cerrar la sala."),
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
      if (!isMountedRef.current) {
        return;
      }

      await runBootstrap();
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      setStartAuthError(getFriendlyError(error, GENERIC_START_AUTH_ERROR));
    } finally {
      if (isMountedRef.current) {
        setIsStartingAuth(false);
      }
    }
  }

  async function handleStartSession() {
    const lobby = getLobbyFromDataState(dataState);

    if (!lobby || dataState.status === "starting" || !isMountedRef.current) {
      return;
    }

    setDataState({ status: "starting", lobby });

    try {
      await startSessionController.submit(createImpostorRoomsClient());
      await refreshAuthoritativeRoomState("start");
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const message = isNotHostStartError(error)
        ? START_NOT_HOST_UI_MESSAGE
        : getFriendlyError(error, "No pudimos iniciar la tanda. Intentá de nuevo.");

      if (
        isNotHostStartError(error) ||
        message === "No tenés una sala activa para iniciar." ||
        message === "Esta sala no se puede iniciar ahora."
      ) {
        await refreshAuthoritativeRoomState("authority", {
          startError: message,
        });
        return;
      }

      setDataState({ status: "success", lobby, startError: message });
    }
  }

  function handleRevealRole() {
    setDataState((currentState) => {
      if (currentState.status !== "role-reveal") {
        return currentState;
      }

      return {
        ...currentState,
        isRoleRevealed: true,
      };
    });
  }

  useEffect(() => {
    let isActive = true;
    isMountedRef.current = true;

    void bootstrapPlatformContext(createPlatformBootstrapClient()).then(
      (nextBootstrapState) => {
        if (isActive) {
          setBootstrapState(nextBootstrapState);
        }
      },
    );

    return () => {
      isActive = false;
      isMountedRef.current = false;
      refreshSequenceRef.current += 1;
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

    const subscription = subscribeToRoomChanges(
      createImpostorRoomChangesClient(),
      activeRoomId,
      () =>
        void refreshAuthoritativeRoomState("realtime", {
          absentDestination: "group",
        }),
    );

    return () => {
      void subscription.unsubscribe();
    };
  }, [
    bootstrapState.status,
    activeRoomId,
    roomCode,
    refreshAuthoritativeRoomState,
  ]);

  useEffect(() => {
    if (
      bootstrapState.status !== "recognized" ||
      !activeRoomId ||
      !currentRoomPlayerId
    ) {
      return;
    }

    const subscription = subscribeToRoomPresence(
      createImpostorRoomPresenceClient(),
      {
        roomId: activeRoomId,
        currentPlayerId: currentRoomPlayerId,
        onSync: (state) => setRoomPresenceSnapshot({ roomId: activeRoomId, state }),
        onSubscribed: () => {
          void refreshMyRoomLiveness(createImpostorRoomsClient()).catch(
            logRoomLivenessError,
          );
        },
        onError: logRoomLivenessError,
      },
    );

    return () => {
      void subscription.unsubscribe();
    };
  }, [bootstrapState.status, activeRoomId, currentRoomPlayerId]);

  useEffect(() => {
    if (
      bootstrapState.status !== "recognized" ||
      !activeRoomId ||
      !currentRoomPlayerId
    ) {
      return;
    }

    const heartbeat = startRoomLivenessHeartbeat({
      refresh: () => refreshMyRoomLiveness(createImpostorRoomsClient()),
      onError: logRoomLivenessError,
    });

    return () => {
      heartbeat.dispose();
    };
  }, [bootstrapState.status, activeRoomId, currentRoomPlayerId]);

  const activePresenceState =
    roomPresenceSnapshot.roomId === activeRoomId ? roomPresenceSnapshot.state : {};
  const activeLobby = getLobbyFromDataState(dataState);
  const connectedPlayerIds =
    activeLobby
      ? getConnectedRoomParticipantIds(
          activeLobby.participants,
          activePresenceState,
        )
      : new Set<string>();
  const activeHostParticipant = activeLobby?.participants.find(
    (participant) => participant.isHost,
  );
  const activeHostPlayerId = activeHostParticipant?.playerId;
  const isActiveHostMissing =
    Boolean(activeHostPlayerId) && !connectedPlayerIds.has(activeHostPlayerId ?? "");

  useEffect(() => {
    isActiveHostMissingRef.current = isActiveHostMissing;
  }, [isActiveHostMissing]);

  useEffect(() => {
    if (
      bootstrapState.status !== "recognized" ||
      !activeRoomId ||
      !currentRoomPlayerId ||
      !activeHostPlayerId
    ) {
      return;
    }

    const recheck = startRoomHostSuccessionRecheck({
      evaluate: () =>
        hostSuccessionController.submit(createImpostorRoomsClient()),
      isHostMissing: () => isActiveHostMissingRef.current,
      onError: logRoomHostSuccessionError,
    });

    return () => {
      recheck.dispose();
    };
  }, [
    bootstrapState.status,
    activeRoomId,
    currentRoomPlayerId,
    activeHostPlayerId,
    hostSuccessionController,
  ]);

  // eslint-disable-next-line react-hooks/refs -- renderRoomLobbyContent only passes callbacks to JSX event handlers.
  return renderRoomLobbyContent(bootstrapState, dataState, {
    roomCode,
    onRetryBootstrap: () => void runBootstrap(),
    onRetryData: () => void refreshAuthoritativeRoomState("retry"),
    onJoinRoom: () => void handleJoinRoom(),
    onLeaveRoom: () => void handleLeaveRoom(),
    onCloseRoom: () => void handleCloseRoom(),
    onStartSession: () => void handleStartSession(),
    onRevealRole: () => void handleRevealRole(),
    onStartAnonymousAuth: () => void handleStartAnonymousAuth(),
    lifecycleActionState,
    isStartingAuth,
    startAuthError,
    connectedPlayerIds,
    hostSuccessionNotice,
  });
}
