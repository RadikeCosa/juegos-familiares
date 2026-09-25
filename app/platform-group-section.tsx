"use client";

import Link from "next/link";
import { AdminInvitationSection } from "./platform-admin-invitation-panel";
import type { PlatformBootstrapState } from "../lib/supabase/platform-bootstrap";
import type { GroupPlayer } from "../lib/supabase/platform-players";

export type GroupPlayersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; players: GroupPlayer[] }
  | { status: "error"; message: string };

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
      <section className="home-platform-context home-group-card" aria-live="polite">
        <h2>Comprobando tu grupo...</h2>
      </section>
    );
  }

  if (bootstrapState.status === "unrecognized") {
    return (
      <section className="home-platform-context home-group-card" aria-live="polite">
        <p className="impostor-kicker">Grupo</p>
        <h2>Todavía no tenés un grupo en este dispositivo.</h2>
        <p>Volvé a Juegos Familiares para crear o unirte a un grupo.</p>
        <Link className="impostor-action impostor-action--primary" href="/">
          Ir al inicio
        </Link>
      </section>
    );
  }

  if (bootstrapState.status === "inconsistent") {
    return (
      <section className="home-platform-context home-group-card" aria-live="polite">
        <p className="impostor-kicker">Grupo</p>
        <h2>No pudimos recuperar correctamente tu grupo.</h2>
        <p>Volve al inicio para revisar tu contexto.</p>
        <Link className="impostor-action impostor-action--primary" href="/">
          Ir al inicio
        </Link>
      </section>
    );
  }

  if (bootstrapState.status === "connection-error") {
    return (
      <section className="home-platform-context home-group-card" aria-live="polite">
        <p className="impostor-kicker">Grupo</p>
        <h2>No pudimos comprobar tu grupo ahora.</h2>
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
    <details className="home-group-disclosure">
      <summary className="home-group-disclosure__summary">
        <span>Tu grupo</span>
        <strong>{group.name}</strong>
      </summary>
      <section className="home-platform-context home-group-card">
        <p>Hola, {player.nickname}.</p>

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
    </details>
  );
}
