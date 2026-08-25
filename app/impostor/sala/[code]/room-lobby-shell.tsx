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
  submitRoundVote,
  subscribeToRoomPresence,
  recordRoomJoinIntent,
  startRoundDiscussion,
  startRoundVoting,
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
      isPrivateViewRevealed: boolean;
    }
  | {
      status: "discussion";
      lobby: RoomLobby;
      gameState: MyGameState;
      isPrivateViewRevealed: boolean;
    }
  | {
      status: "voting-first";
      lobby: RoomLobby;
      gameState: MyGameState;
    }
  | {
      status: "tie-discussion";
      lobby: RoomLobby;
      gameState: MyGameState;
    }
  | {
      status: "impostor-guess";
      lobby: RoomLobby;
      gameState: MyGameState;
    }
  | {
      status: "round-result";
      lobby: RoomLobby;
      gameState: MyGameState;
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
const START_DISCUSSION_NOT_HOST_MESSAGE =
  "Solo el host actual puede empezar la ronda.";
const START_DISCUSSION_NOT_HOST_UI_MESSAGE = "Ya no sos el host actual.";
const START_DISCUSSION_INCONSISTENT_MESSAGE =
  "No pudimos reconstruir la tanda para empezar la ronda.";
const START_DISCUSSION_EXCLUDED_MESSAGE = "No participás de la tanda actual.";
const START_VOTING_NOT_HOST_MESSAGE =
  "Solo el host actual puede ir a votación.";
const START_VOTING_NOT_HOST_UI_MESSAGE = "Ya no sos el host actual.";
const START_VOTING_INCONSISTENT_MESSAGE =
  "No pudimos reconstruir la tanda para ir a votación.";
const START_VOTING_EXCLUDED_MESSAGE = "No participás de la tanda actual.";
const EXCLUDED_GAME_STATE_MESSAGE = "No participás de la tanda actual.";
const ROOM_LIVENESS_LOG_MESSAGE = "No pudimos refrescar liveness de sala.";
const ROOM_HOST_SUCCESSION_LOG_MESSAGE = "No pudimos revisar sucesión de host.";
const INCONSISTENT_GAME_STATE_MESSAGE =
  "No pudimos reconstruir la tanda. Volvé a intentar más tarde.";
const GAME_STATE_POLL_INTERVAL_MS = 3_000;

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

function isInconsistentGameStateError(error: unknown) {
  return error instanceof Error && error.message === INCONSISTENT_GAME_STATE_MESSAGE;
}

function isNotHostStartError(error: unknown) {
  return error instanceof Error && error.message === START_NOT_HOST_MESSAGE;
}

function isNotHostStartDiscussionError(error: unknown) {
  return (
    error instanceof Error && error.message === START_DISCUSSION_NOT_HOST_MESSAGE
  );
}

function isInconsistentStartDiscussionError(error: unknown) {
  return (
    error instanceof Error &&
    error.message === START_DISCUSSION_INCONSISTENT_MESSAGE
  );
}

function isExcludedStartDiscussionError(error: unknown) {
  return (
    error instanceof Error && error.message === START_DISCUSSION_EXCLUDED_MESSAGE
  );
}

function isGameplayDataState(
  state: RoomLobbyDataState,
): state is Extract<
  RoomLobbyDataState,
  {
    status:
      | "role-reveal"
      | "discussion"
      | "voting-first"
      | "tie-discussion"
      | "impostor-guess"
      | "round-result";
  }
> {
  return (
    state.status === "role-reveal" ||
    state.status === "discussion" ||
    state.status === "voting-first" ||
    state.status === "tie-discussion" ||
    state.status === "impostor-guess" ||
    state.status === "round-result"
  );
}

function isSamePrivateGameState(left: MyGameState, right: MyGameState) {
  return (
    left.roundNumber === right.roundNumber &&
    left.privateView.role === right.privateView.role &&
    left.privateView.word === right.privateView.word
  );
}

function isSameVoteResults(left: MyGameState, right: MyGameState) {
  return JSON.stringify(left.voteResults) === JSON.stringify(right.voteResults);
}

function isSameVotingState(left: MyGameState, right: MyGameState) {
  return JSON.stringify(left.voting) === JSON.stringify(right.voting);
}

function isSameGameState(left: MyGameState, right: MyGameState) {
  return (
    left.state === right.state &&
    isSamePrivateGameState(left, right) &&
    isSameVotingState(left, right) &&
    isSameVoteResults(left, right)
  );
}

export function toGameplayDataState(
  lobby: RoomLobby,
  gameState: MyGameState,
  previousState?: RoomLobbyDataState,
): RoomLobbyDataState {
  if (gameState.state === "voting_first") {
    return { status: "voting-first", lobby, gameState };
  }

  if (gameState.state === "tie_discussion") {
    return { status: "tie-discussion", lobby, gameState };
  }

  if (gameState.state === "impostor_guess") {
    return { status: "impostor-guess", lobby, gameState };
  }

  if (gameState.state === "round_result") {
    return { status: "round-result", lobby, gameState };
  }

  if (gameState.state === "discussion") {
    const isPrivateViewRevealed =
      previousState?.status === "discussion" &&
      isSamePrivateGameState(previousState.gameState, gameState)
        ? previousState.isPrivateViewRevealed
        : false;

    return { status: "discussion", lobby, gameState, isPrivateViewRevealed };
  }

  const isPrivateViewRevealed =
    previousState?.status === "role-reveal" &&
    isSamePrivateGameState(previousState.gameState, gameState)
      ? previousState.isPrivateViewRevealed
      : false;

  return {
    status: "role-reveal",
    lobby,
    gameState,
    isPrivateViewRevealed,
  };
}

function isNotHostStartVotingError(error: unknown) {
  return error instanceof Error && error.message === START_VOTING_NOT_HOST_MESSAGE;
}

function isInconsistentStartVotingError(error: unknown) {
  return error instanceof Error && error.message === START_VOTING_INCONSISTENT_MESSAGE;
}

function isExcludedStartVotingError(error: unknown) {
  return error instanceof Error && error.message === START_VOTING_EXCLUDED_MESSAGE;
}

type GameplayPollLoopOptions = {
  intervalMs: number;
  timeoutRef: { current: ReturnType<typeof setTimeout> | null };
  refresh: (reason: "poll" | "foreground") => Promise<unknown>;
  isEligible: () => boolean;
  isVisible: () => boolean;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

export function createGameplayPollLoop(options: GameplayPollLoopOptions) {
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let isActive = false;
  let isInFlight = false;

  function clearScheduledPoll() {
    if (options.timeoutRef.current) {
      clearTimeoutFn(options.timeoutRef.current);
      options.timeoutRef.current = null;
    }
  }

  function canRun() {
    return isActive && options.isEligible() && options.isVisible();
  }

  function scheduleNextPoll() {
    clearScheduledPoll();

    if (!canRun() || isInFlight) {
      return;
    }

    options.timeoutRef.current = setTimeoutFn(() => {
      options.timeoutRef.current = null;
      void run("poll");
    }, options.intervalMs);
  }

  async function run(reason: "poll" | "foreground") {
    if (!canRun() || isInFlight) {
      return;
    }

    isInFlight = true;

    try {
      await options.refresh(reason);
    } catch {
      // Transient background sync failures keep the last valid gameplay state.
    } finally {
      isInFlight = false;
      scheduleNextPoll();
    }
  }

  return {
    start() {
      isActive = true;
      scheduleNextPoll();
    },
    stop() {
      isActive = false;
      clearScheduledPoll();
    },
    handleVisibilityChange() {
      if (!options.isVisible()) {
        clearScheduledPoll();
        return;
      }

      void run("foreground");
    },
  };
}

type StartDiscussionCommandOptions = {
  start: () => Promise<unknown>;
  refreshGameplay: () => Promise<MyGameState | null>;
  refreshAuthoritative: () => Promise<void>;
  setError: (message: string | undefined) => void;
};

export async function runStartDiscussionCommand(
  options: StartDiscussionCommandOptions,
) {
  async function refreshAuthoritatively() {
    try {
      await options.refreshAuthoritative();
    } catch (reconcileError) {
      options.setError(
        getFriendlyError(
          reconcileError,
          "No pudimos reconstruir la sala. Intentá de nuevo.",
        ),
      );
    }
  }

  options.setError(undefined);

  try {
    await options.start();
    await options.refreshGameplay();
    return;
  } catch (error) {
    let recoveredGameState: MyGameState | null = null;

    try {
      recoveredGameState = await options.refreshGameplay();
    } catch {
      recoveredGameState = null;
    }

    if (recoveredGameState?.state === "discussion") {
      options.setError(undefined);
      return;
    }

    if (isNotHostStartDiscussionError(error)) {
      options.setError(START_DISCUSSION_NOT_HOST_UI_MESSAGE);
      await refreshAuthoritatively();
      return;
    }

    if (
      isInconsistentStartDiscussionError(error) ||
      isExcludedStartDiscussionError(error)
    ) {
      await refreshAuthoritatively();
      return;
    }

    options.setError(
      getFriendlyError(error, "No pudimos empezar la ronda. Intentá de nuevo."),
    );
  }
}

type StartVotingCommandOptions = {
  start: () => Promise<unknown>;
  refreshGameplay: () => Promise<MyGameState | null>;
  refreshAuthoritative: () => Promise<void>;
  setError: (message: string | undefined) => void;
};

export async function runStartVotingCommand(options: StartVotingCommandOptions) {
  async function refreshAuthoritatively() {
    try {
      await options.refreshAuthoritative();
    } catch (reconcileError) {
      options.setError(
        getFriendlyError(
          reconcileError,
          "No pudimos reconstruir la sala. Intentá de nuevo.",
        ),
      );
    }
  }

  options.setError(undefined);

  try {
    await options.start();
    await options.refreshGameplay();
    return;
  } catch (error) {
    let recoveredGameState: MyGameState | null = null;

    try {
      recoveredGameState = await options.refreshGameplay();
    } catch {
      recoveredGameState = null;
    }

    if (recoveredGameState?.state === "voting_first") {
      options.setError(undefined);
      return;
    }

    if (isNotHostStartVotingError(error)) {
      options.setError(START_VOTING_NOT_HOST_UI_MESSAGE);
      await refreshAuthoritatively();
      return;
    }

    if (
      isInconsistentStartVotingError(error) ||
      isExcludedStartVotingError(error)
    ) {
      await refreshAuthoritatively();
      return;
    }

    options.setError(
      getFriendlyError(error, "No pudimos ir a votación. Intentá de nuevo."),
    );
  }
}

type SubmitVoteCommandOptions = {
  targetPlayerId: string | null;
  submit: (targetPlayerId: string) => Promise<unknown>;
  refreshGameplay: () => Promise<MyGameState | null>;
  setError: (message: string | undefined) => void;
};

export async function runSubmitVoteCommand(options: SubmitVoteCommandOptions) {
  options.setError(undefined);

  if (!options.targetPlayerId) {
    options.setError("Elegí a quién votar.");
    return;
  }

  try {
    await options.submit(options.targetPlayerId);
    await options.refreshGameplay();
  } catch (error) {
    let recoveredGameState: MyGameState | null = null;

    try {
      recoveredGameState = await options.refreshGameplay();
    } catch {
      recoveredGameState = null;
    }

    if (recoveredGameState?.voting?.hasVoted) {
      options.setError(undefined);
      return;
    }

    options.setError(
      getFriendlyError(error, "No pudimos registrar tu voto. Intentá de nuevo."),
    );
  }
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
    onRevealPrivateView?: () => void;
    onHidePrivateView?: () => void;
    onStartDiscussion?: () => void;
    onStartVoting?: () => void;
    onSelectVoteTarget?: (targetPlayerId: string) => void;
    onSubmitVote?: () => void;
    onStartAnonymousAuth?: () => void;
    lifecycleActionState?: RoomLifecycleActionState;
    isStartingAuth?: boolean;
    startAuthError?: string;
    isStartingDiscussion?: boolean;
    startDiscussionError?: string;
    isStartingVoting?: boolean;
    startVotingError?: string;
    selectedVoteTargetPlayerId?: string | null;
    isSubmittingVote?: boolean;
    submitVoteError?: string;
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
    isGameplayDataState(dataState)
  ) {
    const { lobby } = dataState;
    const hostParticipant = getHostParticipant(lobby);
    const selfParticipant = getSelfParticipant(lobby);
    const canStartDiscussion =
      dataState.status === "role-reveal" && selfParticipant?.isHost === true;
    const canStartVoting =
      dataState.status === "discussion" && selfParticipant?.isHost === true;
    const startDiscussionErrorFeedback =
      dataState.status === "role-reveal" && options.startDiscussionError ? (
        <div className="impostor-group-error" aria-live="polite">
          <p>{options.startDiscussionError}</p>
        </div>
      ) : null;
    const startDiscussionAction = canStartDiscussion ? (
      <div className="impostor-room-round-actions">
        <button
          className="impostor-action impostor-action--primary"
          type="button"
          disabled={options.isStartingDiscussion}
          onClick={options.onStartDiscussion}
        >
          {options.isStartingDiscussion ? "Empezando ronda..." : "Empezar ronda"}
        </button>
        {startDiscussionErrorFeedback}
      </div>
    ) : null;
    const startVotingErrorFeedback =
      dataState.status === "discussion" && options.startVotingError ? (
        <div className="impostor-group-error" aria-live="polite">
          <p>{options.startVotingError}</p>
        </div>
      ) : null;
    const startVotingAction = canStartVoting ? (
      <div className="impostor-room-round-actions">
        <button
          className="impostor-action impostor-action--primary"
          type="button"
          disabled={options.isStartingVoting}
          onClick={options.onStartVoting}
        >
          {options.isStartingVoting ? "Yendo a votación..." : "Ir a votación"}
        </button>
        {startVotingErrorFeedback}
      </div>
    ) : null;

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

    if (dataState.status === "discussion") {
      if (!dataState.isPrivateViewRevealed) {
        return (
          <section
            className="impostor-group-card impostor-room-role-reveal"
            aria-labelledby="impostor-room-discussion-title"
          >
            <p className="impostor-kicker">Ronda {dataState.gameState.roundNumber}</p>
            <h1 id="impostor-room-discussion-title">Ronda en juego</h1>
            {hostParticipant ? <p>Host actual: {hostParticipant.nickname}</p> : null}
            <button
              className="impostor-action impostor-action--primary"
              type="button"
              onClick={options.onRevealPrivateView}
            >
              {dataState.gameState.privateView.role === "player"
                ? "Ver mi palabra"
                : "Ver mi rol"}
            </button>
            {startVotingAction}
            {!canStartVoting ? startVotingErrorFeedback : null}
          </section>
        );
      }

      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-discussion-title"
        >
          <p className="impostor-kicker">Ronda {dataState.gameState.roundNumber}</p>
          {dataState.gameState.privateView.role === "player" ? (
            <>
              <h1 id="impostor-room-discussion-title">Tu palabra</h1>
              <p className="impostor-room-secret-word">
                {dataState.gameState.privateView.word}
              </p>
            </>
          ) : (
            <h1 id="impostor-room-discussion-title">SOS EL IMPOSTOR</h1>
          )}
          {hostParticipant ? <p>Host actual: {hostParticipant.nickname}</p> : null}
          <button
            className="impostor-action impostor-action--primary"
            type="button"
            onClick={options.onHidePrivateView}
          >
            Ocultar
          </button>
          {startVotingAction}
          {!canStartVoting ? startVotingErrorFeedback : null}
        </section>
      );
    }

    if (dataState.status === "voting-first") {
      const voting = dataState.gameState.voting;
      const selectedTargetPlayerId =
        voting?.myVoteTargetPlayerId ??
        options.selectedVoteTargetPlayerId ??
        null;
      const hasVoted = voting?.hasVoted === true;

      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-voting-title"
        >
          <p className="impostor-kicker">
            Ronda {dataState.gameState.roundNumber}
          </p>
          <h1 id="impostor-room-voting-title">Votación</h1>
          <p>Elegí a quién acusa el grupo.</p>
          <div className="impostor-vote-list" role="list">
            {(voting?.candidates ?? []).map((candidate) => {
              const isSelected = selectedTargetPlayerId === candidate.playerId;

              return (
                <button
                  key={candidate.playerId}
                  className={
                    isSelected
                      ? "impostor-vote-option impostor-vote-option--selected"
                      : "impostor-vote-option"
                  }
                  type="button"
                  disabled={hasVoted || options.isSubmittingVote}
                  aria-pressed={isSelected}
                  onClick={() => options.onSelectVoteTarget?.(candidate.playerId)}
                >
                  {candidate.nickname}
                </button>
              );
            })}
          </div>
          {hasVoted ? (
            <p className="impostor-room-notice" aria-live="polite">
              Voto registrado. Esperando al resto.
            </p>
          ) : (
            <button
              className="impostor-action impostor-action--primary"
              type="button"
              disabled={!selectedTargetPlayerId || options.isSubmittingVote}
              onClick={options.onSubmitVote}
            >
              {options.isSubmittingVote ? "Registrando voto..." : "Votar"}
            </button>
          )}
          {options.submitVoteError ? (
            <div className="impostor-group-error" aria-live="polite">
              <p>{options.submitVoteError}</p>
            </div>
          ) : null}
        </section>
      );
    }

    if (
      dataState.status === "tie-discussion" ||
      dataState.status === "impostor-guess" ||
      dataState.status === "round-result"
    ) {
      const title =
        dataState.status === "tie-discussion"
          ? "Hubo empate"
          : dataState.status === "impostor-guess"
            ? "El impostor fue señalado"
            : "Acusación incorrecta";
      const message =
        dataState.status === "tie-discussion"
          ? "Conversen el empate antes de seguir."
          : dataState.status === "impostor-guess"
            ? "Queda pendiente el intento del impostor."
            : "La ronda quedó resuelta sin marcador todavía.";

      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-result-title"
        >
          <p className="impostor-kicker">
            Ronda {dataState.gameState.roundNumber}
          </p>
          <h1 id="impostor-room-result-title">{title}</h1>
          <p>{message}</p>
          <ol className="impostor-vote-results">
            {(dataState.gameState.voteResults ?? []).map((result) => (
              <li key={result.playerId}>
                <span>{result.nickname}</span>
                <strong>
                  {result.voteCount === 1
                    ? "1 voto"
                    : `${result.voteCount} votos`}
                </strong>
              </li>
            ))}
          </ol>
        </section>
      );
    }

    if (!dataState.isPrivateViewRevealed) {
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
            onClick={options.onRevealPrivateView}
          >
            Ver mi rol
          </button>
          {startDiscussionAction}
          {!canStartDiscussion ? startDiscussionErrorFeedback : null}
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
          {startDiscussionAction}
          {!canStartDiscussion ? startDiscussionErrorFeedback : null}
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
        {startDiscussionAction}
        {!canStartDiscussion ? startDiscussionErrorFeedback : null}
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
  const [isStartingDiscussion, setIsStartingDiscussion] = useState(false);
  const [startDiscussionError, setStartDiscussionError] = useState<
    string | undefined
  >();
  const [isStartingVoting, setIsStartingVoting] = useState(false);
  const [startVotingError, setStartVotingError] = useState<string | undefined>();
  const [selectedVoteTargetPlayerId, setSelectedVoteTargetPlayerId] = useState<
    string | null
  >(null);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [submitVoteError, setSubmitVoteError] = useState<string | undefined>();
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
  const authoritativeRefreshInFlightCountRef = useRef(0);
  const gameStatePollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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

  const clearGameStatePollTimeout = useCallback(() => {
    if (gameStatePollTimeoutRef.current) {
      clearTimeout(gameStatePollTimeoutRef.current);
      gameStatePollTimeoutRef.current = null;
    }
  }, []);

  const refreshAuthoritativeRoomState = useCallback(
    async (
      reason:
        | "bootstrap"
        | "start"
        | "realtime"
        | "retry"
        | "authority"
        | "poll-reconcile",
      options: { startError?: string; absentDestination?: "join" | "group" } = {},
    ) => {
      authoritativeRefreshInFlightCountRef.current += 1;
      clearGameStatePollTimeout();
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

        setDataState(toGameplayDataState(activeLobby, gameState));
      } catch (error) {
        if (!isLatestRefresh()) {
          return;
        }

        setDataState({
          status: "error",
          message: getFriendlyError(error, GENERIC_ROOM_LOBBY_ERROR),
        });
      } finally {
        authoritativeRefreshInFlightCountRef.current = Math.max(
          0,
          authoritativeRefreshInFlightCountRef.current - 1,
        );
      }
    },
    [
      acceptActiveRoom,
      clearGameStatePollTimeout,
      recordActiveRoomHost,
      roomCode,
      router,
    ],
  );

  const refreshGameplayStateNow = useCallback(
    async (reason: "poll" | "foreground" | "manual") => {
      void reason;

      if (
        authoritativeRefreshInFlightCountRef.current > 0 ||
        !isMountedRef.current ||
        bootstrapState.status !== "recognized" ||
        !activeRoomId ||
        !currentRoomPlayerId ||
        !isGameplayDataState(dataState)
      ) {
        return null;
      }

      const requestRoomId = activeRoomId;
      const requestId = refreshSequenceRef.current + 1;
      refreshSequenceRef.current = requestId;

      function isLatestGameplayRefresh() {
        return (
          isMountedRef.current &&
          refreshSequenceRef.current === requestId &&
          activeRoomId === requestRoomId
        );
      }

      let gameState: MyGameState | null;

      try {
        gameState = await getMyGameState(createImpostorRoomsClient());
      } catch (error) {
        if (!isLatestGameplayRefresh()) {
          return null;
        }

        if (isExcludedGameStateError(error)) {
          clearGameStatePollTimeout();
          setDataState((currentState) => {
            if (
              !isGameplayDataState(currentState) ||
              currentState.lobby.room.id !== requestRoomId
            ) {
              return currentState;
            }

            return {
              status: "excluded",
              lobby: currentState.lobby,
              message: "Esperá a la próxima tanda para volver a jugar.",
            };
          });
          return null;
        }

        if (isInconsistentGameStateError(error)) {
          clearGameStatePollTimeout();
          await refreshAuthoritativeRoomState("poll-reconcile");
        }

        return null;
      }

      if (!isLatestGameplayRefresh()) {
        return null;
      }

      if (!gameState) {
        clearGameStatePollTimeout();
        await refreshAuthoritativeRoomState("poll-reconcile");
        return null;
      }

      setDataState((currentState) => {
        if (
          !isGameplayDataState(currentState) ||
          currentState.lobby.room.id !== requestRoomId
        ) {
          return currentState;
        }

        const nextState = toGameplayDataState(
          currentState.lobby,
          gameState,
          currentState,
        );

        if (
          nextState.status === currentState.status &&
          isSameGameState(nextState.gameState, currentState.gameState) &&
          ((nextState.status === "role-reveal" &&
            currentState.status === "role-reveal" &&
            nextState.isPrivateViewRevealed ===
              currentState.isPrivateViewRevealed) ||
            (nextState.status === "discussion" &&
              currentState.status === "discussion" &&
              nextState.isPrivateViewRevealed ===
                currentState.isPrivateViewRevealed) ||
            (nextState.status !== "role-reveal" &&
              nextState.status !== "discussion"))
        ) {
          return currentState;
        }

        return nextState;
      });

      return gameState;
    },
    [
      activeRoomId,
      bootstrapState.status,
      clearGameStatePollTimeout,
      currentRoomPlayerId,
      dataState,
      refreshAuthoritativeRoomState,
    ],
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

  function handleRevealPrivateView() {
    setDataState((currentState) => {
      if (!isGameplayDataState(currentState)) {
        return currentState;
      }

      return {
        ...currentState,
        isPrivateViewRevealed: true,
      };
    });
  }

  function handleHidePrivateView() {
    setDataState((currentState) => {
      if (!isGameplayDataState(currentState)) {
        return currentState;
      }

      return {
        ...currentState,
        isPrivateViewRevealed: false,
      };
    });
  }

  async function handleStartDiscussion() {
    if (isStartingDiscussion || !isMountedRef.current) {
      return;
    }

    setStartDiscussionError(undefined);
    setIsStartingDiscussion(true);

    try {
      await runStartDiscussionCommand({
        start: () => startRoundDiscussion(createImpostorRoomsClient()),
        refreshGameplay: () => refreshGameplayStateNow("manual"),
        refreshAuthoritative: () => refreshAuthoritativeRoomState("authority"),
        setError: setStartDiscussionError,
      });
    } finally {
      if (isMountedRef.current) {
        setIsStartingDiscussion(false);
      }
    }
  }

  async function handleStartVoting() {
    if (isStartingVoting || !isMountedRef.current) {
      return;
    }

    setStartVotingError(undefined);
    setIsStartingVoting(true);

    try {
      await runStartVotingCommand({
        start: () => startRoundVoting(createImpostorRoomsClient()),
        refreshGameplay: () => refreshGameplayStateNow("manual"),
        refreshAuthoritative: () => refreshAuthoritativeRoomState("authority"),
        setError: setStartVotingError,
      });
    } finally {
      if (isMountedRef.current) {
        setIsStartingVoting(false);
      }
    }
  }

  async function handleSubmitVote() {
    if (isSubmittingVote || !isMountedRef.current) {
      return;
    }

    setIsSubmittingVote(true);

    try {
      await runSubmitVoteCommand({
        targetPlayerId: selectedVoteTargetPlayerId,
        submit: (targetPlayerId) =>
          submitRoundVote(createImpostorRoomsClient(), targetPlayerId),
        refreshGameplay: () => refreshGameplayStateNow("manual"),
        setError: setSubmitVoteError,
      });
    } finally {
      if (isMountedRef.current) {
        setIsSubmittingVote(false);
      }
    }
  }

  function handleSelectVoteTarget(targetPlayerId: string) {
    setSelectedVoteTargetPlayerId(targetPlayerId);
    setSubmitVoteError(undefined);
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
      clearGameStatePollTimeout();
      refreshSequenceRef.current += 1;
    };
  }, [clearGameStatePollTimeout]);

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

  useEffect(() => {
    if (
      bootstrapState.status !== "recognized" ||
      !activeRoomId ||
      !currentRoomPlayerId ||
      !isGameplayDataState(dataState)
    ) {
      clearGameStatePollTimeout();
      return;
    }

    const pollLoop = createGameplayPollLoop({
      intervalMs: GAME_STATE_POLL_INTERVAL_MS,
      timeoutRef: gameStatePollTimeoutRef,
      refresh: refreshGameplayStateNow,
      isEligible: () =>
        isMountedRef.current &&
        authoritativeRefreshInFlightCountRef.current === 0,
      isVisible: () =>
        typeof document === "undefined" || document.visibilityState !== "hidden",
    });

    function handleVisibilityChange() {
      pollLoop.handleVisibilityChange();
    }

    pollLoop.start();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      pollLoop.stop();

      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [
    bootstrapState.status,
    activeRoomId,
    currentRoomPlayerId,
    dataState,
    clearGameStatePollTimeout,
    refreshGameplayStateNow,
  ]);

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
    onRevealPrivateView: () => void handleRevealPrivateView(),
    onHidePrivateView: () => void handleHidePrivateView(),
    onStartDiscussion: () => void handleStartDiscussion(),
    onStartVoting: () => void handleStartVoting(),
    onSelectVoteTarget: handleSelectVoteTarget,
    onSubmitVote: () => void handleSubmitVote(),
    onStartAnonymousAuth: () => void handleStartAnonymousAuth(),
    lifecycleActionState,
    isStartingAuth,
    startAuthError,
    isStartingDiscussion,
    startDiscussionError,
    isStartingVoting,
    startVotingError,
    selectedVoteTargetPlayerId,
    isSubmittingVote,
    submitVoteError,
    connectedPlayerIds,
    hostSuccessionNotice,
  });
}
