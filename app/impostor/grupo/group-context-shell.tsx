"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AdminInvitationSection } from "../admin-invitation-panel";
import { createBrowserSupabaseClient } from "../../../lib/supabase/browser-client";
import {
  getMyGroupWordCount,
  listMyGroupWords,
  type ImpostorGroupWordsClient,
  type MyGroupWord,
} from "../../../lib/supabase/impostor-group-words";
import {
  createCreateRoomController,
  createJoinRoomByCodeController,
  getMyActiveRoom,
  normalizeRoomJoinCode,
  recordRoomCreationIntent,
  recordRoomJoinIntent,
  type ImpostorRoomsClient,
  type RoomLobby,
} from "../../../lib/supabase/impostor-rooms";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
  type RecognizedPlatformContext,
} from "../../../lib/supabase/platform-bootstrap";
import {
  listGroupPlayers,
  type GroupPlayer,
  type PlatformPlayersClient,
} from "../../../lib/supabase/platform-players";

type GroupPlayersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; players: GroupPlayer[] }
  | { status: "error"; message: string };

type GroupWordsSummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; totalCount: number; ownWords: MyGroupWord[] }
  | { status: "error"; message: string };

export type RoomCreationState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "error"; message: string };

export type RoomJoinState =
  | { status: "idle" }
  | { status: "form" }
  | { status: "joining" }
  | { status: "error"; message: string };

export type ActiveRoomState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "absent" }
  | { status: "success"; room: RoomLobby["room"] }
  | { status: "error"; message: string };

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

function createPlatformPlayersClient(): PlatformPlayersClient {
  return createBrowserSupabaseClient() as unknown as PlatformPlayersClient;
}

function createImpostorGroupWordsClient(): ImpostorGroupWordsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorGroupWordsClient;
}

function createImpostorRoomsClient(): ImpostorRoomsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
}

export function formatAvailableWords(count: number) {
  return count === 1 ? "1 disponible" : `${count} disponibles`;
}

function sortPlayersForGroup(players: GroupPlayer[], adminPlayerId: string) {
  return [...players].sort((firstPlayer, secondPlayer) => {
    if (firstPlayer.id === adminPlayerId) {
      return -1;
    }

    if (secondPlayer.id === adminPlayerId) {
      return 1;
    }

    return firstPlayer.createdAt.localeCompare(secondPlayer.createdAt);
  });
}

export function renderGroupMembersList(
  players: GroupPlayer[],
  adminPlayerId: string,
) {
  const orderedPlayers = sortPlayersForGroup(players, adminPlayerId);

  return (
    <ul className="impostor-group-members">
      {orderedPlayers.map((member) => {
        const isAdmin = member.id === adminPlayerId;

        return (
          <li key={member.id}>
            <span>{member.nickname}</span>
            {isAdmin ? <strong>Admin</strong> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function renderImpostorGroupContext(
  bootstrapState: PlatformBootstrapState,
  playersState: GroupPlayersState,
  options: {
    groupWordsState?: GroupWordsSummaryState;
    roomCreationState?: RoomCreationState;
    roomJoinState?: RoomJoinState;
    activeRoomState?: ActiveRoomState;
    onRetryBootstrap?: () => void;
    onRetryPlayers?: () => void;
    onRetryGroupWords?: () => void;
    onRetryActiveRoom?: () => void;
    onCreateRoom?: () => void;
    onShowJoinRoomForm?: () => void;
    onJoinRoomSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  } = {},
) {
  if (bootstrapState.status === "loading") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <h1>Comprobando tu grupo...</h1>
      </section>
    );
  }

  if (bootstrapState.status === "unrecognized") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Grupo</p>
        <h1>Todavía no tenés un grupo en este dispositivo.</h1>
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
        <p className="impostor-kicker">Grupo</p>
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
        <p className="impostor-kicker">Grupo</p>
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

  const { group, player } = bootstrapState;
  const isAdmin = group.adminPlayerId === player.id;
  const groupWordsState = options.groupWordsState ?? { status: "idle" };
  const roomCreationState = options.roomCreationState ?? { status: "idle" };
  const roomJoinState = options.roomJoinState ?? { status: "idle" };
  const activeRoomState = options.activeRoomState ?? { status: "absent" };
  const hasActiveRoom =
    activeRoomState.status === "success" &&
    (activeRoomState.room.status === "lobby" ||
      activeRoomState.room.status === "playing");
  const isPlayingRoom =
    activeRoomState.status === "success" &&
    activeRoomState.room.status === "playing";

  return (
    <section
      className="impostor-group-card"
      aria-labelledby="impostor-group-title"
    >
      <p className="impostor-kicker">Tu grupo</p>
      <h1 id="impostor-group-title">{group.name}</h1>

      <div
        className="impostor-group-section"
        aria-labelledby="impostor-group-members-title"
      >
        <h2 id="impostor-group-members-title">Integrantes</h2>

        {playersState.status === "loading" || playersState.status === "idle" ? (
          <p aria-live="polite">Cargando integrantes...</p>
        ) : null}

        {playersState.status === "success"
          ? renderGroupMembersList(playersState.players, group.adminPlayerId)
          : null}

        {playersState.status === "error" ? (
          <div className="impostor-group-error" aria-live="polite">
            <p>{playersState.message}</p>
            {options.onRetryPlayers ? (
              <button
                className="impostor-action"
                type="button"
                onClick={options.onRetryPlayers}
              >
                Reintentar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className="impostor-group-section impostor-play-section"
        aria-labelledby="impostor-play-title"
      >
        <h2 id="impostor-play-title">Jugar</h2>

        {activeRoomState.status === "idle" ||
        activeRoomState.status === "loading" ? (
          <p aria-live="polite">Comprobando sala activa...</p>
        ) : null}

        {hasActiveRoom ? (
          <div className="impostor-active-room" aria-live="polite">
            <p>{isPlayingRoom ? "Partida en curso" : "Sala activa"}</p>
            <Link
              className="impostor-action impostor-action--primary"
              href={`/impostor/sala/${encodeURIComponent(activeRoomState.room.code)}`}
            >
              {isPlayingRoom ? "Volver a la partida" : "Volver a la sala"}
            </Link>
          </div>
        ) : null}

        {activeRoomState.status === "error" ? (
          <div className="impostor-group-error" aria-live="polite">
            <p>No pudimos comprobar si tenés una sala activa.</p>
            {options.onRetryActiveRoom ? (
              <button
                className="impostor-action impostor-action--primary"
                type="button"
                onClick={options.onRetryActiveRoom}
              >
                Reintentar
              </button>
            ) : null}
          </div>
        ) : null}

        {activeRoomState.status === "absent" ||
        (activeRoomState.status === "success" && !hasActiveRoom) ? (
          <>
            <button
              className="impostor-action impostor-action--primary"
              type="button"
              disabled={roomJoinState.status === "joining"}
              onClick={options.onShowJoinRoomForm}
            >
              Unirme a una sala
            </button>

            <button
              className="impostor-action"
              type="button"
              disabled={roomCreationState.status === "creating"}
              onClick={options.onCreateRoom}
            >
              {roomCreationState.status === "creating"
                ? "Creando sala..."
                : "Crear sala"}
            </button>

            {roomCreationState.status === "error" ? (
              <div className="impostor-group-error" aria-live="polite">
                <p>{roomCreationState.message}</p>
              </div>
            ) : null}

            {roomJoinState.status === "form" ||
            roomJoinState.status === "joining" ? (
              <form
                className="impostor-create-group"
                aria-labelledby="impostor-join-room-title"
                onSubmit={options.onJoinRoomSubmit}
              >
                <h3 id="impostor-join-room-title">Unirme a una sala</h3>
                <label className="impostor-field">
                  <span>Código de sala</span>
                  <input
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
              <div className="impostor-group-error" aria-live="polite">
                <p>{roomJoinState.message}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div
        className="impostor-group-section impostor-word-bank-summary"
        aria-labelledby="impostor-word-bank-summary-title"
      >
        <h2 id="impostor-word-bank-summary-title">Banco de palabras</h2>

        {groupWordsState.status === "loading" ||
        groupWordsState.status === "idle" ? (
          <p aria-live="polite">Cargando banco...</p>
        ) : null}

        {groupWordsState.status === "success" ? (
          <dl className="impostor-word-bank-stats">
            <div>
              <dt>Total</dt>
              <dd>{formatAvailableWords(groupWordsState.totalCount)}</dd>
            </div>
            <div>
              <dt>Tus aportes</dt>
              <dd>{groupWordsState.ownWords.length}</dd>
            </div>
          </dl>
        ) : null}

        {groupWordsState.status === "error" ? (
          <div className="impostor-group-error" aria-live="polite">
            <p>{groupWordsState.message}</p>
            {options.onRetryGroupWords ? (
              <button
                className="impostor-action"
                type="button"
                onClick={options.onRetryGroupWords}
              >
                Reintentar
              </button>
            ) : null}
          </div>
        ) : null}

        <Link
          className="impostor-action impostor-action--primary"
          href="/impostor/grupo/palabras"
        >
          Agregar palabras
        </Link>
      </div>

      {isAdmin ? <AdminInvitationSection /> : null}
    </section>
  );
}

export function ImpostorGroupContextShell() {
  const router = useRouter();
  const [bootstrapState, setBootstrapState] = useState<PlatformBootstrapState>({
    status: "loading",
  });
  const [playersState, setPlayersState] = useState<GroupPlayersState>({
    status: "idle",
  });
  const [groupWordsState, setGroupWordsState] =
    useState<GroupWordsSummaryState>({
      status: "idle",
    });
  const [roomCreationState, setRoomCreationState] = useState<RoomCreationState>(
    {
      status: "idle",
    },
  );
  const [roomJoinState, setRoomJoinState] = useState<RoomJoinState>({
    status: "idle",
  });
  const [activeRoomState, setActiveRoomState] = useState<ActiveRoomState>({
    status: "idle",
  });
  const createRoomController = useState(() => createCreateRoomController())[0];
  const joinRoomController = useState(() =>
    createJoinRoomByCodeController(),
  )[0];

  async function runBootstrap(showLoading: boolean) {
    if (showLoading) {
      setBootstrapState({ status: "loading" });
      setPlayersState({ status: "idle" });
      setGroupWordsState({ status: "idle" });
      setActiveRoomState({ status: "idle" });
    }

    setBootstrapState(
      await bootstrapPlatformContext(createPlatformBootstrapClient()),
    );
  }

  async function loadPlayers(context: RecognizedPlatformContext) {
    setPlayersState({ status: "loading" });

    try {
      const players = await listGroupPlayers(
        createPlatformPlayersClient(),
        context.group.id,
      );

      setPlayersState({ status: "success", players });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos cargar los integrantes. Intentá de nuevo.";

      setPlayersState({ status: "error", message });
    }
  }

  async function loadGroupWordsSummary() {
    setGroupWordsState({ status: "loading" });

    try {
      const client = createImpostorGroupWordsClient();
      const [totalCount, ownWords] = await Promise.all([
        getMyGroupWordCount(client),
        listMyGroupWords(client),
      ]);

      setGroupWordsState({ status: "success", totalCount, ownWords });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos cargar el banco de palabras. Intentá de nuevo.";

      setGroupWordsState({ status: "error", message });
    }
  }

  async function loadActiveRoom() {
    setActiveRoomState({ status: "loading" });

    try {
      const lobby = await getMyActiveRoom(createImpostorRoomsClient());

      setActiveRoomState(
        lobby ? { status: "success", room: lobby.room } : { status: "absent" },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos confirmar si tenés una sala activa.";

      setActiveRoomState({ status: "error", message });
    }
  }

  async function handleCreateRoom() {
    if (roomCreationState.status === "creating") {
      return;
    }

    setRoomCreationState({ status: "creating" });

    try {
      const lobby = await createRoomController.submit(
        createImpostorRoomsClient(),
      );

      recordRoomCreationIntent(lobby.room.code);
      router.push(`/impostor/sala/${encodeURIComponent(lobby.room.code)}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos crear la sala. Intentá de nuevo.";

      setRoomCreationState({ status: "error", message });
    }
  }

  function handleShowJoinRoomForm() {
    if (roomJoinState.status === "joining") {
      return;
    }

    setRoomJoinState({ status: "form" });
  }

  async function handleJoinRoomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (roomJoinState.status === "joining") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const roomCode = normalizeRoomJoinCode(
      String(formData.get("roomCode") ?? ""),
    );

    setRoomJoinState({ status: "joining" });

    try {
      const lobby = await joinRoomController.submit(
        createImpostorRoomsClient(),
        roomCode,
      );

      recordRoomJoinIntent(lobby.room.code);
      router.push(`/impostor/sala/${encodeURIComponent(lobby.room.code)}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos unir a la sala. Intentá de nuevo.";

      setRoomJoinState({ status: "error", message });
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

    let isActive = true;

    void Promise.resolve()
      .then(() => {
        if (isActive) {
          setPlayersState({ status: "loading" });
        }

        return listGroupPlayers(
          createPlatformPlayersClient(),
          bootstrapState.group.id,
        );
      })
      .then((players) => {
        if (isActive) {
          setPlayersState({ status: "success", players });
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : "No pudimos cargar los integrantes. Intentá de nuevo.";

        if (isActive) {
          setPlayersState({ status: "error", message });
        }
      });

    return () => {
      isActive = false;
    };
  }, [bootstrapState]);

  useEffect(() => {
    if (bootstrapState.status !== "recognized") {
      return;
    }

    let isActive = true;

    void Promise.resolve()
      .then(() => {
        if (isActive) {
          setGroupWordsState({ status: "loading" });
        }

        const client = createImpostorGroupWordsClient();

        return Promise.all([
          getMyGroupWordCount(client),
          listMyGroupWords(client),
        ]);
      })
      .then(([totalCount, ownWords]) => {
        if (isActive) {
          setGroupWordsState({ status: "success", totalCount, ownWords });
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : "No pudimos cargar el banco de palabras. Intentá de nuevo.";

        if (isActive) {
          setGroupWordsState({ status: "error", message });
        }
      });

    return () => {
      isActive = false;
    };
  }, [bootstrapState]);

  useEffect(() => {
    if (bootstrapState.status !== "recognized") {
      return;
    }

    let isActive = true;

    void Promise.resolve()
      .then(() => {
        if (isActive) {
          setActiveRoomState({ status: "loading" });
        }

        return getMyActiveRoom(createImpostorRoomsClient());
      })
      .then((lobby) => {
        if (isActive) {
          setActiveRoomState(
            lobby
              ? { status: "success", room: lobby.room }
              : { status: "absent" },
          );
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : "No pudimos confirmar si tenés una sala activa.";

        if (isActive) {
          setActiveRoomState({ status: "error", message });
        }
      });

    return () => {
      isActive = false;
    };
  }, [bootstrapState]);

  return renderImpostorGroupContext(bootstrapState, playersState, {
    groupWordsState,
    roomCreationState,
    roomJoinState,
    activeRoomState,
    onRetryBootstrap: () => void runBootstrap(true),
    onRetryPlayers:
      bootstrapState.status === "recognized"
        ? () => void loadPlayers(bootstrapState)
        : undefined,
    onRetryGroupWords:
      bootstrapState.status === "recognized"
        ? () => void loadGroupWordsSummary()
        : undefined,
    onRetryActiveRoom:
      bootstrapState.status === "recognized"
        ? () => void loadActiveRoom()
        : undefined,
    onCreateRoom: () => void handleCreateRoom(),
    onShowJoinRoomForm: () => handleShowJoinRoomForm(),
    onJoinRoomSubmit: (event) => void handleJoinRoomSubmit(event),
  });
}
