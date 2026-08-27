"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminInvitationSection } from "../platform-admin-invitation-panel";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
  type RecognizedPlatformContext
} from "../../lib/supabase/platform-bootstrap";
import {
  listGroupPlayers,
  type GroupPlayer,
  type PlatformPlayersClient
} from "../../lib/supabase/platform-players";

type GroupPlayersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; players: GroupPlayer[] }
  | { status: "error"; message: string };

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

function createPlatformPlayersClient(): PlatformPlayersClient {
  return createBrowserSupabaseClient() as unknown as PlatformPlayersClient;
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

export function renderPlatformGroupMembersList(
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

function renderMembersCount(count: number) {
  return count === 1 ? "1 integrante" : `${count} integrantes`;
}

export function renderPlatformGroupContext(
  bootstrapState: PlatformBootstrapState,
  playersState: GroupPlayersState,
  options: {
    onRetryBootstrap?: () => void;
    onRetryPlayers?: () => void;
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
        <h1>Todavia no tenes un grupo en este dispositivo.</h1>
        <p>Volve a Juegos Familiares para entrar a un juego o unirte con una invitacion.</p>
        <Link className="impostor-action impostor-action--primary" href="/">
          Ir al inicio
        </Link>
      </section>
    );
  }

  if (bootstrapState.status === "inconsistent") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Grupo</p>
        <h1>No pudimos recuperar correctamente tu grupo.</h1>
        <p>Volve al inicio para revisar tu contexto.</p>
        <Link className="impostor-action impostor-action--primary" href="/">
          Ir al inicio
        </Link>
      </section>
    );
  }

  if (bootstrapState.status === "connection-error") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Grupo</p>
        <h1>No pudimos comprobar tu grupo ahora.</h1>
        <p>Revisa tu conexion e intenta de nuevo.</p>
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
  const membersCount =
    playersState.status === "success" ? playersState.players.length : undefined;

  return (
    <section
      className="impostor-group-card"
      aria-labelledby="platform-group-title"
    >
      <p className="impostor-kicker">Tu grupo</p>
      <h1 id="platform-group-title">{group.name}</h1>

      <div
        className="impostor-group-section"
        aria-labelledby="platform-group-members-title"
      >
        <div className="platform-group-section-heading">
          <h2 id="platform-group-members-title">Integrantes</h2>
          {typeof membersCount === "number" ? (
            <p className="platform-group-count" aria-live="polite">
              {renderMembersCount(membersCount)}
            </p>
          ) : null}
        </div>

        {playersState.status === "loading" || playersState.status === "idle" ? (
          <p aria-live="polite">Cargando integrantes...</p>
        ) : null}

        {playersState.status === "success"
          ? renderPlatformGroupMembersList(playersState.players, group.adminPlayerId)
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

      {isAdmin ? <AdminInvitationSection context="platform" /> : null}
    </section>
  );
}

export function PlatformGroupContextShell() {
  const [bootstrapState, setBootstrapState] = useState<PlatformBootstrapState>({
    status: "loading"
  });
  const [playersState, setPlayersState] = useState<GroupPlayersState>({
    status: "idle"
  });

  async function runBootstrap(showLoading: boolean) {
    if (showLoading) {
      setBootstrapState({ status: "loading" });
      setPlayersState({ status: "idle" });
    }

    setBootstrapState(
      await bootstrapPlatformContext(createPlatformBootstrapClient())
    );
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
          : "No pudimos cargar los integrantes. Intenta de nuevo.";

      setPlayersState({ status: "error", message });
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

        return listGroupPlayers(
          createPlatformPlayersClient(),
          bootstrapState.group.id
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
            : "No pudimos cargar los integrantes. Intenta de nuevo.";

        if (isActive) {
          setPlayersState({ status: "error", message });
        }
      });

    return () => {
      isActive = false;
    };
  }, [bootstrapState]);

  return renderPlatformGroupContext(bootstrapState, playersState, {
    onRetryBootstrap: () => void runBootstrap(true),
    onRetryPlayers:
      bootstrapState.status === "recognized"
        ? () => void loadPlayers(bootstrapState)
        : undefined
  });
}
