"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminInvitationSection } from "../admin-invitation-panel";
import { createBrowserSupabaseClient } from "../../../lib/supabase/browser-client";
import {
  getMyGroupWordCount,
  listMyGroupWords,
  type ImpostorGroupWordsClient,
  type MyGroupWord
} from "../../../lib/supabase/impostor-group-words";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
  type RecognizedPlatformContext
} from "../../../lib/supabase/platform-bootstrap";
import {
  listGroupPlayers,
  type GroupPlayer,
  type PlatformPlayersClient
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

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

function createPlatformPlayersClient(): PlatformPlayersClient {
  return createBrowserSupabaseClient() as unknown as PlatformPlayersClient;
}

function createImpostorGroupWordsClient(): ImpostorGroupWordsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorGroupWordsClient;
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
  adminPlayerId: string
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
    onRetryBootstrap?: () => void;
    onRetryPlayers?: () => void;
    onRetryGroupWords?: () => void;
  } = {}
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
        <p>
          Volvé a Impostor para crear un grupo o unirte con una invitación.
        </p>
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
  const [bootstrapState, setBootstrapState] = useState<PlatformBootstrapState>({
    status: "loading"
  });
  const [playersState, setPlayersState] = useState<GroupPlayersState>({
    status: "idle"
  });
  const [groupWordsState, setGroupWordsState] = useState<GroupWordsSummaryState>({
    status: "idle"
  });

  async function runBootstrap(showLoading: boolean) {
    if (showLoading) {
      setBootstrapState({ status: "loading" });
      setPlayersState({ status: "idle" });
      setGroupWordsState({ status: "idle" });
    }

    setBootstrapState(await bootstrapPlatformContext(createPlatformBootstrapClient()));
  }

  async function loadPlayers(context: RecognizedPlatformContext) {
    setPlayersState({ status: "loading" });

    try {
      const players = await listGroupPlayers(
        createPlatformPlayersClient(),
        context.group.id
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
        listMyGroupWords(client)
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

  useEffect(() => {
    let isActive = true;

    void bootstrapPlatformContext(createPlatformBootstrapClient()).then(
      (nextBootstrapState) => {
        if (isActive) {
          setBootstrapState(nextBootstrapState);
        }
      }
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

        return listGroupPlayers(createPlatformPlayersClient(), bootstrapState.group.id);
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
          listMyGroupWords(client)
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

  return renderImpostorGroupContext(bootstrapState, playersState, {
    groupWordsState,
    onRetryBootstrap: () => void runBootstrap(true),
    onRetryPlayers:
      bootstrapState.status === "recognized"
        ? () => void loadPlayers(bootstrapState)
        : undefined,
    onRetryGroupWords:
      bootstrapState.status === "recognized"
        ? () => void loadGroupWordsSummary()
        : undefined
  });
}
