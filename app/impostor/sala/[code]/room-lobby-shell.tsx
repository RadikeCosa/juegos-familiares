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
  advanceRoundResultToScoreboard,
  getConnectedRoomParticipantIds,
  getMyGameState,
  getMyActiveRoom,
  refreshMyRoomLiveness,
  endSession,
  submitImpostorGuess,
  submitRoundVote,
  subscribeToRoomPresence,
  recordRoomJoinIntent,
  startNextRound,
  startRoundDiscussion,
  startRoundVoting,
  startSecondRoundVoting,
  startRoomHostSuccessionRecheck,
  startRoomLivenessHeartbeat,
  subscribeToRoomChanges,
  type ImpostorRoomChangesClient,
  type ImpostorRoomPresenceClient,
  type ImpostorRoomsClient,
  type MyGameState,
  type RoomPresenceSubscription,
  type RoomPresenceState,
  type RoomLobby,
} from "../../../../lib/supabase/impostor-rooms";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState,
} from "../../../../lib/supabase/platform-bootstrap";
import { classifyVoteResults } from "./round-result-presentation";

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
      status: "voting-second";
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
  | {
      status: "scoreboard";
      lobby: RoomLobby;
      gameState: MyGameState;
    }
  | {
      status: "finished";
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

type RoomShareState =
  | { status: "idle" }
  | { status: "copied" }
  | { status: "shared" }
  | { status: "error"; message: string };

type RoomConnectionState =
  | { status: "stable" }
  | { status: "offline" }
  | { status: "reconnecting" }
  | { status: "reconcile-error"; message: string };
type ClipboardLike = {
  writeText: (text: string) => PromiseLike<void> | void;
};
type ShareNavigatorLike = {
  clipboard?: ClipboardLike;
  share?: (data: ShareData) => PromiseLike<void> | void;
};

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
const START_SECOND_VOTING_NOT_HOST_MESSAGE =
  "Solo el host actual puede ir a segunda votación.";
const START_SECOND_VOTING_NOT_HOST_UI_MESSAGE = "Ya no sos el host actual.";
const START_SECOND_VOTING_INCONSISTENT_MESSAGE =
  "No pudimos reconstruir la tanda para ir a segunda votación.";
const START_SECOND_VOTING_EXCLUDED_MESSAGE = "No participás de la tanda actual.";
const START_NEXT_ROUND_NOT_HOST_MESSAGE =
  "Solo el host actual puede iniciar otra ronda.";
const START_NEXT_ROUND_NOT_HOST_UI_MESSAGE = "Ya no sos el host actual.";
const START_NEXT_ROUND_INCONSISTENT_MESSAGE =
  "No pudimos reconstruir la tanda para iniciar otra ronda.";
const START_NEXT_ROUND_EXCLUDED_MESSAGE = "No participás de la tanda actual.";
const END_SESSION_FALLBACK_MESSAGE =
  "No pudimos terminar la tanda. Intentá de nuevo.";
const SUBMIT_GUESS_FALLBACK_MESSAGE =
  "No pudimos enviar el intento. Intentá de nuevo.";
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

function isBrowserOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export function getRoomInvitationPath(code: string) {
  return `/impostor/sala/${encodeURIComponent(code)}`;
}

export function getRoomInvitationUrl(code: string) {
  const path = getRoomInvitationPath(code);

  if (typeof window === "undefined") {
    return path;
  }

  return `${window.location.origin}${path}`;
}

export function getRoomShareData(code: string) {
  return {
    title: "Sala de Impostor",
    text: "Sumate a esta sala de Impostor.",
    url: getRoomInvitationUrl(code),
  };
}

function getNavigator(): ShareNavigatorLike | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  return navigator;
}

export async function shareRoom(
  code: string,
  shareNavigator: ShareNavigatorLike | undefined = getNavigator(),
): Promise<"shared"> {
  const shareData = getRoomShareData(code);

  if (shareNavigator?.share) {
    await shareNavigator.share(shareData);
    return "shared";
  }

  if (shareNavigator?.clipboard) {
    await shareNavigator.clipboard.writeText(shareData.url);
    return "shared";
  }

  throw new Error("Share unavailable");
}

export async function copyRoomCode(
  code: string,
  shareNavigator: ShareNavigatorLike | undefined = getNavigator(),
) {
  if (!shareNavigator?.clipboard) {
    throw new Error("Clipboard unavailable");
  }

  await shareNavigator.clipboard.writeText(code);
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
      | "voting-second"
      | "impostor-guess"
      | "round-result"
      | "scoreboard";
  }
> {
  return (
    state.status === "role-reveal" ||
    state.status === "discussion" ||
    state.status === "voting-first" ||
    state.status === "tie-discussion" ||
    state.status === "voting-second" ||
    state.status === "impostor-guess" ||
    state.status === "round-result" ||
    state.status === "scoreboard"
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

function isSameCandidates(left: MyGameState, right: MyGameState) {
  return JSON.stringify(left.candidates) === JSON.stringify(right.candidates);
}

function isSameVotingState(left: MyGameState, right: MyGameState) {
  return JSON.stringify(left.voting) === JSON.stringify(right.voting);
}

function isSameImpostorGuessState(left: MyGameState, right: MyGameState) {
  return JSON.stringify(left.impostorGuess) === JSON.stringify(right.impostorGuess);
}

function isSameRoundResultState(left: MyGameState, right: MyGameState) {
  return JSON.stringify(left.roundResult) === JSON.stringify(right.roundResult);
}

function isSameScoreboardState(left: MyGameState, right: MyGameState) {
  return JSON.stringify(left.scoreboard) === JSON.stringify(right.scoreboard);
}

function isSameFinishedState(left: MyGameState, right: MyGameState) {
  return JSON.stringify(left.finished) === JSON.stringify(right.finished);
}

function isSameGameState(left: MyGameState, right: MyGameState) {
  return (
    left.state === right.state &&
    isSamePrivateGameState(left, right) &&
    isSameCandidates(left, right) &&
    isSameVotingState(left, right) &&
    isSameVoteResults(left, right) &&
    isSameImpostorGuessState(left, right) &&
    isSameRoundResultState(left, right) &&
    isSameScoreboardState(left, right) &&
    isSameFinishedState(left, right)
  );
}

function isFirstVotingResolutionState(state: MyGameState["state"]) {
  return (
    state === "tie_discussion" ||
    state === "voting_second" ||
    state === "impostor_guess" ||
    state === "round_result" ||
    state === "scoreboard"
  );
}

export function toGameplayDataState(
  lobby: RoomLobby,
  gameState: MyGameState,
  previousState?: RoomLobbyDataState,
): RoomLobbyDataState {
  if (gameState.state === "finished") {
    return { status: "finished", gameState };
  }

  if (gameState.state === "voting_first") {
    return { status: "voting-first", lobby, gameState };
  }

  if (gameState.state === "tie_discussion") {
    return { status: "tie-discussion", lobby, gameState };
  }

  if (gameState.state === "voting_second") {
    return { status: "voting-second", lobby, gameState };
  }

  if (gameState.state === "impostor_guess") {
    return { status: "impostor-guess", lobby, gameState };
  }

  if (gameState.state === "scoreboard") {
    return { status: "scoreboard", lobby, gameState };
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

function isNotHostStartSecondVotingError(error: unknown) {
  return (
    error instanceof Error && error.message === START_SECOND_VOTING_NOT_HOST_MESSAGE
  );
}

function isInconsistentStartSecondVotingError(error: unknown) {
  return (
    error instanceof Error &&
    error.message === START_SECOND_VOTING_INCONSISTENT_MESSAGE
  );
}

function isExcludedStartSecondVotingError(error: unknown) {
  return (
    error instanceof Error && error.message === START_SECOND_VOTING_EXCLUDED_MESSAGE
  );
}

function isNotHostStartNextRoundError(error: unknown) {
  return (
    error instanceof Error && error.message === START_NEXT_ROUND_NOT_HOST_MESSAGE
  );
}

function isInconsistentStartNextRoundError(error: unknown) {
  return (
    error instanceof Error &&
    error.message === START_NEXT_ROUND_INCONSISTENT_MESSAGE
  );
}

function isExcludedStartNextRoundError(error: unknown) {
  return (
    error instanceof Error && error.message === START_NEXT_ROUND_EXCLUDED_MESSAGE
  );
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

      scheduleNextPoll();
    },
  };
}

export function createRoomAuthoritativeRefreshController() {
  let activeRequest: Promise<void> | null = null;

  return {
    run(refresh: () => Promise<void>): Promise<void> {
      if (activeRequest) {
        return activeRequest;
      }

      activeRequest = Promise.resolve()
        .then(refresh)
        .finally(() => {
          activeRequest = null;
        });

      return activeRequest;
    },
    hasActiveRequest() {
      return activeRequest !== null;
    },
  };
}

export async function runHostSuccessionEvaluation<
  TResult extends { hostChanged: boolean },
>(options: {
  evaluate: () => Promise<TResult>;
  refreshAuthoritative: () => Promise<unknown>;
}): Promise<TResult> {
  const result = await options.evaluate();

  if (result.hostChanged) {
    await options.refreshAuthoritative();
  }

  return result;
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

type StartSecondVotingCommandOptions = {
  start: () => Promise<unknown>;
  refreshGameplay: () => Promise<MyGameState | null>;
  refreshAuthoritative: () => Promise<void>;
  setError: (message: string | undefined) => void;
};

export async function runStartSecondVotingCommand(
  options: StartSecondVotingCommandOptions,
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

    if (recoveredGameState?.state === "voting_second") {
      options.setError(undefined);
      return;
    }

    if (isNotHostStartSecondVotingError(error)) {
      options.setError(START_SECOND_VOTING_NOT_HOST_UI_MESSAGE);
      await refreshAuthoritatively();
      return;
    }

    if (
      isInconsistentStartSecondVotingError(error) ||
      isExcludedStartSecondVotingError(error)
    ) {
      await refreshAuthoritatively();
      return;
    }

    options.setError(
      getFriendlyError(
        error,
        "No pudimos ir a segunda votación. Intentá de nuevo.",
      ),
    );
  }
}

type StartNextRoundCommandOptions = {
  start: () => Promise<unknown>;
  refreshGameplay: () => Promise<MyGameState | null>;
  refreshAuthoritative: () => Promise<void>;
  setError: (message: string | undefined) => void;
};

export async function runStartNextRoundCommand(
  options: StartNextRoundCommandOptions,
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

    if (recoveredGameState?.state === "role_reveal") {
      options.setError(undefined);
      return;
    }

    if (isNotHostStartNextRoundError(error)) {
      options.setError(START_NEXT_ROUND_NOT_HOST_UI_MESSAGE);
      await refreshAuthoritatively();
      return;
    }

    if (
      isInconsistentStartNextRoundError(error) ||
      isExcludedStartNextRoundError(error)
    ) {
      await refreshAuthoritatively();
      return;
    }

    options.setError(
      getFriendlyError(error, "No pudimos iniciar otra ronda. Intentá de nuevo."),
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

    if (
      recoveredGameState?.voting?.hasVoted ||
      (
        recoveredGameState &&
        isFirstVotingResolutionState(recoveredGameState.state)
      )
    ) {
      options.setError(undefined);
      return;
    }

    options.setError(
      getFriendlyError(error, "No pudimos registrar tu voto. Intentá de nuevo."),
    );
  }
}

export function confirmEndSession(confirmFn = globalThis.confirm) {
  return confirmFn(
    "Terminar la tanda cerrará esta sala para todos. Después verán el resultado final y deberán volver al grupo para crear otra sala.",
  );
}

type EndSessionCommandOptions = {
  end: () => Promise<unknown>;
  refreshFinished: () => Promise<MyGameState | null>;
  setError: (message: string | undefined) => void;
};

export async function runEndSessionCommand(options: EndSessionCommandOptions) {
  options.setError(undefined);

  try {
    await options.end();
    await options.refreshFinished();
  } catch (error) {
    let recoveredGameState: MyGameState | null = null;

    try {
      recoveredGameState = await options.refreshFinished();
    } catch {
      recoveredGameState = null;
    }

    if (recoveredGameState?.state === "finished") {
      options.setError(undefined);
      return;
    }

    options.setError(getFriendlyError(error, END_SESSION_FALLBACK_MESSAGE));
  }
}

type AdvanceScoreboardCommandOptions = {
  advance: () => Promise<unknown>;
  refreshGameplay: () => Promise<MyGameState | null>;
  onError?: (message: string) => void;
};

export async function runAdvanceScoreboardCommand(
  options: AdvanceScoreboardCommandOptions,
) {
  try {
    await options.advance();
    await options.refreshGameplay();
  } catch (error) {
    let recoveredGameState: MyGameState | null = null;

    try {
      recoveredGameState = await options.refreshGameplay();
    } catch {
      recoveredGameState = null;
    }

    if (recoveredGameState?.state === "scoreboard") {
      return;
    }

    options.onError?.(
      getFriendlyError(error, "No pudimos mostrar el marcador todavía."),
    );
  }
}

export function formatPlayerCount(count: number) {
  return count === 1 ? "1 jugador" : `${count} jugadores`;
}

function formatPlayerNames(players: Array<{ nickname: string }>) {
  return players.map((player) => player.nickname).join(", ");
}

function formatVoteCount(count: number) {
  return count === 1 ? "1 voto" : `${count} votos`;
}

function getRoundOutcomeSummary(
  gameState: MyGameState,
  roundImpostor?: { playerId: string; nickname: string } | null,
) {
  const result = gameState.roundResult;
  const voteClassification = classifyVoteResults(gameState.voteResults);

  if (!result) {
    return "La ronda ya fue resuelta, pero no tenemos suficiente detalle de la votación para explicarla con precisión.";
  }

  if (voteClassification.kind === "insufficient") {
    return "La ronda ya fue resuelta, pero no tenemos suficiente detalle de la votación para explicarla con precisión.";
  }

  if (voteClassification.kind === "tie") {
    return "La votación terminó empatada. El impostor no quedó como único señalado.";
  }

  const accused = voteClassification.player;
  const wasImpostor =
    roundImpostor?.playerId === accused.playerId ||
    typeof result.impostorGuessCorrect === "boolean";

  if (wasImpostor && result.impostorGuessCorrect === true) {
    return `El grupo señaló a ${accused.nickname}, que era el impostor, pero adivinó la palabra.`;
  }

  if (wasImpostor && result.impostorGuessCorrect === false) {
    return `El grupo señaló a ${accused.nickname}, que era el impostor, y el intento final falló.`;
  }

  if (result.winner === "impostor") {
    return `El grupo señaló a ${accused.nickname}. El impostor no fue descubierto.`;
  }

  return "La ronda ya fue resuelta, pero no tenemos suficiente detalle de la votación para explicarla con precisión.";
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

function renderRoomConnectionNotice(
  connectionState: RoomConnectionState,
  onRetry?: () => void,
) {
  if (connectionState.status === "stable") {
    return null;
  }

  const title =
    connectionState.status === "offline"
      ? "Sin conexión"
      : connectionState.status === "reconnecting"
        ? "Reconectando..."
        : "No pudimos actualizar la sala";
  const message =
    connectionState.status === "offline"
      ? "Podés mirar el último estado compartido, pero las acciones quedan pausadas."
      : connectionState.status === "reconnecting"
        ? "Estamos recuperando el estado actual antes de habilitar acciones."
        : connectionState.message;

  return (
    <div className="impostor-room-notice" aria-live="polite">
      <strong>{title}</strong>
      <p>{message}</p>
      {connectionState.status === "reconcile-error" && onRetry ? (
        <button
          className="impostor-action impostor-action--primary"
          type="button"
          onClick={onRetry}
        >
          Reintentar
        </button>
      ) : null}
    </div>
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
    onStartSecondVoting?: () => void;
    onStartNextRound?: () => void;
    onEndSession?: () => void;
    onSelectVoteTarget?: (targetPlayerId: string) => void;
    onSubmitVote?: () => void;
    onChangeImpostorGuessText?: (guessText: string) => void;
    onSubmitImpostorGuess?: () => void;
    onStartAnonymousAuth?: () => void;
    lifecycleActionState?: RoomLifecycleActionState;
    isStartingAuth?: boolean;
    startAuthError?: string;
    isStartingDiscussion?: boolean;
    startDiscussionError?: string;
    isStartingVoting?: boolean;
    startVotingError?: string;
    isStartingSecondVoting?: boolean;
    startSecondVotingError?: string;
    isStartingNextRound?: boolean;
    startNextRoundError?: string;
    isEndingSession?: boolean;
    endSessionError?: string;
    selectedVoteTargetPlayerId?: string | null;
    isSubmittingVote?: boolean;
    submitVoteError?: string;
    impostorGuessText?: string;
    isSubmittingImpostorGuess?: boolean;
    submitImpostorGuessError?: string;
    connectedPlayerIds?: Set<string>;
    hostSuccessionNotice?: string;
    roomShareState?: RoomShareState;
    onShareRoom?: () => void;
    onCopyRoomCode?: () => void;
    roomConnectionState?: RoomConnectionState;
  },
) {
  const roomConnectionState = options.roomConnectionState ?? { status: "stable" };
  const isRoomStateTrusted = roomConnectionState.status === "stable";

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
          disabled={options.isStartingAuth || !isRoomStateTrusted}
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
          disabled={dataState.status === "joining" || !isRoomStateTrusted}
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

  if (dataState.status === "finished") {
    const finished = dataState.gameState.finished;
    const finalScores = [...(finished?.finalScores ?? [])].sort(
      (left, right) =>
        right.score - left.score || left.nickname.localeCompare(right.nickname),
    );
    const winnerIds = new Set(finished?.winnerPlayerIds ?? []);
    const winners = [...(finished?.winners ?? [])].sort((left, right) =>
      left.nickname.localeCompare(right.nickname),
    );
    const winnerCopy =
      winners.length === 1
        ? `Ganó ${winners[0]?.nickname}`
        : `Empataron ${winners.map((winner) => winner.nickname).join(", ")}`;
    const roundCount = finished?.roundCount ?? 0;

    return (
      <section
        className="impostor-group-card impostor-room-role-reveal"
        aria-labelledby="impostor-room-finished-title"
      >
        <p className="impostor-kicker">Resultado final</p>
        <h1 id="impostor-room-finished-title">{winnerCopy}</h1>
        <p>
          {roundCount === 1
            ? "1 ronda jugada"
            : `${roundCount} rondas jugadas`}
        </p>
        <div
          className="impostor-group-section"
          aria-labelledby="impostor-room-final-score-title"
        >
          <h2 id="impostor-room-final-score-title">Clasificación final</h2>
          <ol className="impostor-scoreboard-list">
            {finalScores.map((player) => (
              <li key={player.playerId}>
                <span>
                  {player.nickname}
                  {winnerIds.has(player.playerId) ? <strong>Ganador</strong> : null}
                </span>
                <strong>
                  {player.score === 1 ? "1 punto" : `${player.score} puntos`}
                </strong>
              </li>
            ))}
          </ol>
        </div>
        <Link className="impostor-action impostor-action--primary" href="/impostor/grupo">
          Volver al grupo
        </Link>
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
      isRoomStateTrusted &&
      dataState.status === "role-reveal" &&
      selfParticipant?.isHost === true;
    const canStartVoting =
      isRoomStateTrusted &&
      dataState.status === "discussion" &&
      selfParticipant?.isHost === true;
    const canStartSecondVoting =
      isRoomStateTrusted &&
      dataState.status === "tie-discussion" &&
      selfParticipant?.isHost === true;
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
    const startSecondVotingErrorFeedback =
      dataState.status === "tie-discussion" && options.startSecondVotingError ? (
        <div className="impostor-group-error" aria-live="polite">
          <p>{options.startSecondVotingError}</p>
        </div>
      ) : null;
    const startSecondVotingAction = canStartSecondVoting ? (
      <div className="impostor-room-round-actions">
        <button
          className="impostor-action impostor-action--primary"
          type="button"
          disabled={options.isStartingSecondVoting}
          onClick={options.onStartSecondVoting}
        >
          {options.isStartingSecondVoting
            ? "Yendo a segunda votación..."
            : "Ir a segunda votación"}
        </button>
        {startSecondVotingErrorFeedback}
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

    if (!isRoomStateTrusted) {
      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-reconnecting-title"
        >
          <p className="impostor-kicker">Sala</p>
          <h1 id="impostor-room-reconnecting-title">
            Revisando estado de la sala
          </h1>
          {renderRoomConnectionNotice(roomConnectionState, options.onRetryData)}
          {hostParticipant ? <p>Host actual: {hostParticipant.nickname}</p> : null}
          <div
            className="impostor-group-section"
            aria-labelledby="impostor-room-safe-participants-title"
          >
            <h2 id="impostor-room-safe-participants-title">Jugadores</h2>
            {renderRoomParticipantsList(
              lobby.participants,
              options.connectedPlayerIds,
            )}
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
              Ver mi rol
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
              <h1 id="impostor-room-discussion-title">Tu palabra es</h1>
              <p className="impostor-room-secret-word">
                {dataState.gameState.privateView.word}
              </p>
            </>
          ) : (
            <h1 id="impostor-room-discussion-title">Sos el impostor</h1>
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
      const visibleVoteTargetIds = new Set(
        (voting?.candidates ?? []).map((candidate) => candidate.playerId),
      );
      const requestedSelectedTargetPlayerId =
        voting?.myVoteTargetPlayerId ??
        options.selectedVoteTargetPlayerId ??
        null;
      const selectedTargetPlayerId =
        requestedSelectedTargetPlayerId &&
        visibleVoteTargetIds.has(requestedSelectedTargetPlayerId)
          ? requestedSelectedTargetPlayerId
          : null;
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

    if (dataState.status === "voting-second") {
      const voting = dataState.gameState.voting;
      const visibleVoteTargetIds = new Set(
        (voting?.candidates ?? []).map((candidate) => candidate.playerId),
      );
      const requestedSelectedTargetPlayerId =
        voting?.myVoteTargetPlayerId ??
        options.selectedVoteTargetPlayerId ??
        null;
      const selectedTargetPlayerId =
        requestedSelectedTargetPlayerId &&
        visibleVoteTargetIds.has(requestedSelectedTargetPlayerId)
          ? requestedSelectedTargetPlayerId
          : null;
      const hasVoted = voting?.hasVoted === true;

      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-second-voting-title"
        >
          <p className="impostor-kicker">
            Ronda {dataState.gameState.roundNumber}
          </p>
          <h1 id="impostor-room-second-voting-title">Segunda votación</h1>
          <p>Elegí entre quienes empataron.</p>
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

    if (dataState.status === "tie-discussion") {
      const voteClassification = classifyVoteResults(
        dataState.gameState.voteResults,
      );
      const tieSummary =
        voteClassification.kind === "tie"
          ? `Empataron ${formatPlayerNames(voteClassification.players)} con ${formatVoteCount(voteClassification.voteCount)}. Conversen antes de la segunda votación.`
          : "Hubo empate. Conversen antes de la segunda votación.";

      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-result-title"
        >
          <p className="impostor-kicker">
            Ronda {dataState.gameState.roundNumber}
          </p>
          <h1 id="impostor-room-result-title">Hubo empate</h1>
          <p>{tieSummary}</p>
          {(dataState.gameState.candidates?.length ?? 0) > 0 ? (
            <div className="impostor-group-section">
              <h2>Empatados</h2>
              <ul className="impostor-vote-results">
                {(dataState.gameState.candidates ?? []).map((candidate) => (
                  <li key={candidate.playerId}>
                    <span>{candidate.nickname}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
          {startSecondVotingAction}
          {!canStartSecondVoting ? startSecondVotingErrorFeedback : null}
        </section>
      );
    }

    if (dataState.status === "impostor-guess") {
      const canSubmitGuess = dataState.gameState.impostorGuess?.canSubmit === true;
      const currentGuessText = options.impostorGuessText ?? "";
      const isGuessEmpty = currentGuessText.trim().length === 0;
      const voteClassification = classifyVoteResults(
        dataState.gameState.voteResults,
      );
      const guessSummary =
        voteClassification.kind === "unique-top"
          ? `${voteClassification.player.nickname} fue la persona más votada. El impostor tiene una última oportunidad.`
          : "El impostor tiene una última oportunidad.";

      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-guess-title"
        >
          <p className="impostor-kicker">
            Ronda {dataState.gameState.roundNumber}
          </p>
          <h1 id="impostor-room-guess-title">El impostor fue señalado</h1>
          {canSubmitGuess ? (
            <>
              <p>{guessSummary}</p>
              <label className="impostor-field">
                <span>¿Cuál era la palabra?</span>
                <input
                  type="text"
                  value={currentGuessText}
                  disabled={options.isSubmittingImpostorGuess}
                  onChange={(event) =>
                    options.onChangeImpostorGuessText?.(event.target.value)
                  }
                />
              </label>
              <button
                className="impostor-action impostor-action--primary"
                type="button"
                disabled={isGuessEmpty || options.isSubmittingImpostorGuess}
                onClick={options.onSubmitImpostorGuess}
              >
                {options.isSubmittingImpostorGuess
                  ? "Enviando intento..."
                  : "Enviar intento"}
              </button>
            </>
          ) : (
            <p>El impostor está haciendo su intento final.</p>
          )}
          {options.submitImpostorGuessError ? (
            <div className="impostor-group-error" aria-live="polite">
              <p>{options.submitImpostorGuessError}</p>
            </div>
          ) : null}
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

    if (dataState.status === "scoreboard") {
      const result = dataState.gameState.roundResult;
      const scoreboard = dataState.gameState.scoreboard;
      const winnerLabel =
        result?.winner === "group" ? "Ganó el grupo" : "Ganó el impostor";
      const word = dataState.gameState.privateView.word;
      const roundSummary = getRoundOutcomeSummary(
        dataState.gameState,
        scoreboard?.roundImpostor,
      );
      const canUseNextRoundAction =
        scoreboard?.canStartNextRound === true && selfParticipant?.isHost === true;
      const canUseEndSessionAction =
        scoreboard?.canEndSession === true && selfParticipant?.isHost === true;
      const isHostBlockedFromNextRound =
        selfParticipant?.isHost === true && scoreboard?.canStartNextRound !== true;
      const isAnyScoreboardActionPending =
        options.isStartingNextRound === true || options.isEndingSession === true;
      const nextRoundBlockCopy =
        scoreboard?.nextRoundBlockReason === "no_words"
          ? "No quedan palabras nuevas. Agreguen más al banco del grupo para seguir."
          : scoreboard?.nextRoundBlockReason === "session_not_ready"
            ? "La ronda todavía no está lista para abrir otra."
            : scoreboard?.nextRoundBlockReason === "not_host"
              ? "Esperando a que el host continúe..."
              : "Esperando a que el host continúe...";

      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-scoreboard-title"
        >
          <p className="impostor-kicker">
            Marcador · Ronda {dataState.gameState.roundNumber}
          </p>
          <h1 id="impostor-room-scoreboard-title">{winnerLabel}</h1>
          <p>{roundSummary}</p>
          {scoreboard?.roundImpostor ? (
            <p>El impostor era {scoreboard.roundImpostor.nickname}.</p>
          ) : null}
          {word ? (
            <div className="impostor-group-section">
              <h2>La palabra era</h2>
              <p className="impostor-room-secret-word">{word}</p>
            </div>
          ) : null}
          {result?.impostorGuessText ? (
            <div className="impostor-group-section">
              <h2>Intento del impostor</h2>
              <p>{result.impostorGuessText}</p>
            </div>
          ) : null}
          <div
            className="impostor-group-section"
            aria-labelledby="impostor-room-scoreboard-players-title"
          >
            <h2 id="impostor-room-scoreboard-players-title">
              Marcador acumulado de la tanda
            </h2>
            <ol className="impostor-scoreboard-list">
              {(scoreboard?.players ?? []).map((player) => (
                <li key={player.playerId}>
                  <span>
                    {player.nickname}
                    {player.isSelf ? <strong> Vos</strong> : null}
                  </span>
                  <strong>
                    {player.score === 1 ? "1 punto" : `${player.score} puntos`}
                  </strong>
                </li>
              ))}
            </ol>
          </div>
          <div className="impostor-room-round-actions">
            {canUseNextRoundAction ? (
              <button
                className="impostor-action impostor-action--primary"
                type="button"
                disabled={isAnyScoreboardActionPending}
                onClick={options.onStartNextRound}
              >
                {options.isStartingNextRound
                  ? "Abriendo nueva ronda..."
                  : "Nueva ronda"}
              </button>
            ) : null}
            {canUseEndSessionAction ? (
              <button
                className="impostor-action impostor-action--danger"
                type="button"
                disabled={isAnyScoreboardActionPending}
                onClick={options.onEndSession}
              >
                {options.isEndingSession
                  ? "Terminando tanda..."
                  : "Terminar tanda"}
              </button>
            ) : null}
            {isHostBlockedFromNextRound ? (
              <>
                <button
                  className="impostor-action impostor-action--primary"
                  type="button"
                  disabled
                >
                  Nueva ronda
                </button>
                <p className="impostor-room-notice" aria-live="polite">
                  {nextRoundBlockCopy}
                </p>
              </>
            ) : null}
            {!selfParticipant?.isHost ? (
              <p className="impostor-room-notice" aria-live="polite">
                {nextRoundBlockCopy}
              </p>
            ) : null}
            {options.startNextRoundError ? (
              <div className="impostor-group-error" aria-live="polite">
                <p>{options.startNextRoundError}</p>
              </div>
            ) : null}
            {options.endSessionError ? (
              <div className="impostor-group-error" aria-live="polite">
                <p>{options.endSessionError}</p>
              </div>
            ) : null}
          </div>
        </section>
      );
    }

    if (dataState.status === "round-result") {
      const result = dataState.gameState.roundResult;
      const winnerLabel =
        result?.winner === "group" ? "Ganó el grupo" : "Ganó el impostor";
      const word = dataState.gameState.privateView.word;
      const roundSummary = getRoundOutcomeSummary(dataState.gameState);

      return (
        <section
          className="impostor-group-card impostor-room-role-reveal"
          aria-labelledby="impostor-room-result-title"
        >
          <p className="impostor-kicker">
            Ronda {dataState.gameState.roundNumber}
          </p>
          <h1 id="impostor-room-result-title">{winnerLabel}</h1>
          <p>{roundSummary}</p>
          {word ? (
            <div className="impostor-group-section">
              <h2>La palabra era</h2>
              <p className="impostor-room-secret-word">{word}</p>
            </div>
          ) : null}
          {result?.impostorGuessText ? (
            <div className="impostor-group-section">
              <h2>Intento del impostor</h2>
              <p>{result.impostorGuessText}</p>
            </div>
          ) : null}
          <ol className="impostor-vote-results">
            {(dataState.gameState.voteResults ?? []).map((voteResult) => (
              <li key={voteResult.playerId}>
                <span>{voteResult.nickname}</span>
                <strong>
                  {voteResult.voteCount === 1
                    ? "1 voto"
                    : `${voteResult.voteCount} votos`}
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
          <h1 id="impostor-role-impostor-title">Sos el impostor</h1>
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
        <h1 id="impostor-role-player-title">Tu palabra es</h1>
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
    isStartingSession ||
    !isRoomStateTrusted;
  const isHost = Boolean(selfParticipant?.isHost);
  const isLobby = lobby.room.status === "lobby";
  const roomShareState = options.roomShareState ?? { status: "idle" };

  return (
    <section
      className="impostor-group-card impostor-room-lobby"
      aria-labelledby="impostor-room-title"
    >
      <p className="impostor-kicker">Sala</p>
      <h1 id="impostor-room-title">Sala {lobby.room.code}</h1>
      {renderRoomConnectionNotice(roomConnectionState, options.onRetryData)}

      <div
        className="impostor-group-section impostor-room-share"
        aria-labelledby="impostor-room-share-title"
      >
        <h2 id="impostor-room-share-title">Invitar a la sala</h2>
        <p>{getRoomInvitationUrl(lobby.room.code)}</p>
        <div className="impostor-room-share__actions">
          <button
            className="impostor-action impostor-action--primary"
            type="button"
            disabled={!isRoomStateTrusted}
            onClick={options.onShareRoom}
          >
            Compartir sala
          </button>
          <button
            className="impostor-action"
            type="button"
            disabled={!isRoomStateTrusted}
            onClick={options.onCopyRoomCode}
          >
            Copiar código
          </button>
        </div>
        {roomShareState.status === "shared" ? (
          <p className="impostor-platform-context__meta" aria-live="polite">
            Sala lista para compartir.
          </p>
        ) : null}
        {roomShareState.status === "copied" ? (
          <p className="impostor-platform-context__meta" aria-live="polite">
            Código copiado.
          </p>
        ) : null}
        {roomShareState.status === "error" ? (
          <p className="impostor-onboarding__status" aria-live="polite">
            {roomShareState.message}
          </p>
        ) : null}
      </div>

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
          {isHost && isLobby ? (
            <>
              <button
                className="impostor-action impostor-action--primary"
                type="button"
                disabled={isStartingSession || !isRoomStateTrusted}
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
          {!isHost && isLobby ? (
            <p className="impostor-room-notice" aria-live="polite">
              Esperando a que el host inicie la partida…
            </p>
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
  const [roomShareState, setRoomShareState] = useState<RoomShareState>({
    status: "idle",
  });
  const [isStartingDiscussion, setIsStartingDiscussion] = useState(false);
  const [startDiscussionError, setStartDiscussionError] = useState<
    string | undefined
  >();
  const [isStartingVoting, setIsStartingVoting] = useState(false);
  const [startVotingError, setStartVotingError] = useState<string | undefined>();
  const [isStartingSecondVoting, setIsStartingSecondVoting] = useState(false);
  const [startSecondVotingError, setStartSecondVotingError] = useState<
    string | undefined
  >();
  const [isStartingNextRound, setIsStartingNextRound] = useState(false);
  const [startNextRoundError, setStartNextRoundError] = useState<
    string | undefined
  >();
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [endSessionError, setEndSessionError] = useState<string | undefined>();
  const [selectedVoteTargetPlayerId, setSelectedVoteTargetPlayerId] = useState<
    string | null
  >(null);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [submitVoteError, setSubmitVoteError] = useState<string | undefined>();
  const [impostorGuessText, setImpostorGuessText] = useState("");
  const [isSubmittingImpostorGuess, setIsSubmittingImpostorGuess] =
    useState(false);
  const [submitImpostorGuessError, setSubmitImpostorGuessError] = useState<
    string | undefined
  >();
  const [roomPresenceSnapshot, setRoomPresenceSnapshot] = useState<{
    roomId?: string;
    state: RoomPresenceState;
  }>({ state: {} });
  const [hostSuccessionNotice, setHostSuccessionNotice] = useState<
    string | undefined
  >();
  const [roomConnectionState, setRoomConnectionState] =
    useState<RoomConnectionState>(() =>
      isBrowserOnline() ? { status: "stable" } : { status: "offline" },
    );
  const isActiveHostMissingRef = useRef(false);
  const isMountedRef = useRef(false);
  const refreshSequenceRef = useRef(0);
  const authoritativeRefreshInFlightCountRef = useRef(0);
  const advancingScoreboardRoundKeyRef = useRef<string | undefined>(undefined);
  const roomPresenceSubscriptionRef = useRef<RoomPresenceSubscription | null>(
    null,
  );
  const gameStatePollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [, setPreviousHostPlayerId] = useState<string | undefined>();
  const joinRoomController = useState(() =>
    createJoinRoomByCodeController(),
  )[0];
  const leaveRoomController = useState(() => createLeaveRoomController())[0];
  const closeRoomController = useState(() => createCloseRoomController())[0];
  const authoritativeRefreshController = useState(() =>
    createRoomAuthoritativeRefreshController(),
  )[0];
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

  const runAuthoritativeRoomStateRefresh = useCallback(
    async (
      reason:
        | "bootstrap"
        | "start"
        | "realtime"
        | "retry"
        | "foreground"
        | "online"
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
      const existingLobby = getLobbyFromDataState(dataState);
      const canPreserveExistingState =
        Boolean(existingLobby) &&
        reason !== "bootstrap" &&
        reason !== "start";
      const isReconnectReason =
        reason === "realtime" ||
        reason === "retry" ||
        reason === "foreground" ||
        reason === "online" ||
        reason === "authority" ||
        reason === "poll-reconcile";

      if (isReconnectReason && isBrowserOnline()) {
        setRoomConnectionState({ status: "reconnecting" });
      }

      if (!canPreserveExistingState) {
        setDataState({ status: "loading" });
      }

      try {
        const activeLobby = await getMyActiveRoom(createImpostorRoomsClient());

        if (!isLatestRefresh()) {
          return;
        }

        if (!activeLobby) {
          let finalGameState: MyGameState | null = null;

          try {
            finalGameState = await getMyGameState(createImpostorRoomsClient());
          } catch {
            finalGameState = null;
          }

          if (!isLatestRefresh()) {
            return;
          }

          if (finalGameState?.state === "finished") {
            setRoomConnectionState({ status: "stable" });
            setDataState({ status: "finished", gameState: finalGameState });
            return;
          }

          if (options.absentDestination === "group") {
            router.replace("/impostor/grupo");
            return;
          }

          setDataState({ status: "awaiting-join" });
          setRoomConnectionState({ status: "stable" });
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
          setRoomConnectionState({ status: "stable" });
          acceptActiveRoom(activeLobby, options.startError);
          return;
        }

        recordActiveRoomHost(activeLobby);
        if (!canPreserveExistingState) {
          setDataState({ status: "loading-game-state", lobby: activeLobby });
        }

        let gameState: MyGameState | null;

        try {
          gameState = await getMyGameState(createImpostorRoomsClient());
        } catch (error) {
          if (!isLatestRefresh()) {
            return;
          }

          if (isExcludedGameStateError(error)) {
            setRoomConnectionState({ status: "stable" });
            setDataState({
              status: "excluded",
              lobby: activeLobby,
              message: "Esperá a la próxima tanda para volver a jugar.",
            });
            return;
          }

          if (canPreserveExistingState) {
            setRoomConnectionState({
              status: "reconcile-error",
              message: getFriendlyError(
                error,
                GENERIC_GAME_RECONSTRUCTION_ERROR,
              ),
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
          if (canPreserveExistingState) {
            setRoomConnectionState({
              status: "reconcile-error",
              message: GENERIC_GAME_RECONSTRUCTION_ERROR,
            });
            return;
          }

          setDataState({
            status: "error",
            message: GENERIC_GAME_RECONSTRUCTION_ERROR,
          });
          return;
        }

        setRoomConnectionState({ status: "stable" });
        setDataState(toGameplayDataState(activeLobby, gameState));
      } catch (error) {
        if (!isLatestRefresh()) {
          return;
        }

        if (canPreserveExistingState) {
          setRoomConnectionState({
            status: "reconcile-error",
            message: getFriendlyError(error, GENERIC_ROOM_LOBBY_ERROR),
          });
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
      dataState,
      recordActiveRoomHost,
      roomCode,
      router,
    ],
  );

  const refreshAuthoritativeRoomState = useCallback(
    (
      reason:
        | "bootstrap"
        | "start"
        | "realtime"
        | "retry"
        | "foreground"
        | "online"
        | "authority"
        | "poll-reconcile",
      options: { startError?: string; absentDestination?: "join" | "group" } = {},
    ) =>
      authoritativeRefreshController.run(() =>
        runAuthoritativeRoomStateRefresh(reason, options),
      ),
    [authoritativeRefreshController, runAuthoritativeRoomStateRefresh],
  );
  const refreshAuthoritativeRoomStateRef = useRef(refreshAuthoritativeRoomState);

  useEffect(() => {
    refreshAuthoritativeRoomStateRef.current = refreshAuthoritativeRoomState;
  }, [refreshAuthoritativeRoomState]);

  const refreshFinishedGameStateNow = useCallback(async () => {
    const finalGameState = await getMyGameState(createImpostorRoomsClient());

    if (finalGameState?.state === "finished" && isMountedRef.current) {
      clearGameStatePollTimeout();
      setDataState({ status: "finished", gameState: finalGameState });
    }

    return finalGameState;
  }, [clearGameStatePollTimeout]);

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

  useEffect(() => {
    if (
      bootstrapState.status !== "recognized" ||
      !activeRoomId ||
      !currentRoomPlayerId ||
      dataState.status !== "round-result"
    ) {
      advancingScoreboardRoundKeyRef.current = undefined;
      return;
    }

    const roundKey = `${activeRoomId}:${dataState.gameState.roundNumber}`;

    if (advancingScoreboardRoundKeyRef.current === roundKey) {
      return;
    }

    advancingScoreboardRoundKeyRef.current = roundKey;

    void runAdvanceScoreboardCommand({
      advance: () => advanceRoundResultToScoreboard(createImpostorRoomsClient()),
      refreshGameplay: () => refreshGameplayStateNow("manual"),
      onError: (message) => console.warn(message),
    });
  }, [
    activeRoomId,
    bootstrapState.status,
    currentRoomPlayerId,
    dataState,
    refreshGameplayStateNow,
  ]);

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
    if (roomConnectionState.status !== "stable") {
      return;
    }

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
    if (
      lifecycleActionState.status === "leaving" ||
      roomConnectionState.status !== "stable"
    ) {
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
    if (
      lifecycleActionState.status === "closing" ||
      roomConnectionState.status !== "stable"
    ) {
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
    if (roomConnectionState.status !== "stable") {
      return;
    }

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

    if (
      !lobby ||
      dataState.status === "starting" ||
      !isMountedRef.current ||
      roomConnectionState.status !== "stable"
    ) {
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
    if (roomConnectionState.status !== "stable") {
      return;
    }

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
    if (roomConnectionState.status !== "stable") {
      return;
    }

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
    if (
      isStartingDiscussion ||
      !isMountedRef.current ||
      roomConnectionState.status !== "stable"
    ) {
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
    if (
      isStartingVoting ||
      !isMountedRef.current ||
      roomConnectionState.status !== "stable"
    ) {
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

  async function handleStartSecondVoting() {
    if (
      isStartingSecondVoting ||
      !isMountedRef.current ||
      roomConnectionState.status !== "stable"
    ) {
      return;
    }

    setStartSecondVotingError(undefined);
    setIsStartingSecondVoting(true);

    try {
      await runStartSecondVotingCommand({
        start: () => startSecondRoundVoting(createImpostorRoomsClient()),
        refreshGameplay: () => refreshGameplayStateNow("manual"),
        refreshAuthoritative: () => refreshAuthoritativeRoomState("authority"),
        setError: setStartSecondVotingError,
      });
    } finally {
      if (isMountedRef.current) {
        setIsStartingSecondVoting(false);
      }
    }
  }

  async function handleStartNextRound() {
    if (
      isStartingNextRound ||
      isEndingSession ||
      !isMountedRef.current ||
      roomConnectionState.status !== "stable"
    ) {
      return;
    }

    setStartNextRoundError(undefined);
    setIsStartingNextRound(true);

    try {
      await runStartNextRoundCommand({
        start: () => startNextRound(createImpostorRoomsClient()),
        refreshGameplay: () => refreshGameplayStateNow("manual"),
        refreshAuthoritative: () => refreshAuthoritativeRoomState("authority"),
        setError: setStartNextRoundError,
      });
    } finally {
      if (isMountedRef.current) {
        setIsStartingNextRound(false);
      }
    }
  }

  async function handleEndSession() {
    if (
      isEndingSession ||
      isStartingNextRound ||
      !isMountedRef.current ||
      roomConnectionState.status !== "stable"
    ) {
      return;
    }

    if (!confirmEndSession()) {
      return;
    }

    setEndSessionError(undefined);
    setIsEndingSession(true);

    try {
      await runEndSessionCommand({
        end: () => endSession(createImpostorRoomsClient()),
        refreshFinished: refreshFinishedGameStateNow,
        setError: setEndSessionError,
      });
    } finally {
      if (isMountedRef.current) {
        setIsEndingSession(false);
      }
    }
  }

  async function handleSubmitVote() {
    if (
      isSubmittingVote ||
      !isMountedRef.current ||
      roomConnectionState.status !== "stable"
    ) {
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

  async function handleSubmitImpostorGuess() {
    if (
      isSubmittingImpostorGuess ||
      !isMountedRef.current ||
      roomConnectionState.status !== "stable"
    ) {
      return;
    }

    if (impostorGuessText.trim().length === 0) {
      setSubmitImpostorGuessError("Escribí una palabra para enviar tu intento.");
      return;
    }

    setSubmitImpostorGuessError(undefined);
    setIsSubmittingImpostorGuess(true);

    try {
      await submitImpostorGuess(createImpostorRoomsClient(), impostorGuessText);
      setImpostorGuessText("");
      await refreshGameplayStateNow("manual");
    } catch (error) {
      let recoveredGameState: MyGameState | null = null;

      try {
        recoveredGameState = await refreshGameplayStateNow("manual");
      } catch {
        recoveredGameState = null;
      }

      if (
        recoveredGameState?.state === "round_result" ||
        recoveredGameState?.state === "scoreboard"
      ) {
        setSubmitImpostorGuessError(undefined);
        setImpostorGuessText("");
        return;
      }

      setSubmitImpostorGuessError(
        getFriendlyError(error, SUBMIT_GUESS_FALLBACK_MESSAGE),
      );
    } finally {
      if (isMountedRef.current) {
        setIsSubmittingImpostorGuess(false);
      }
    }
  }

  function handleSelectVoteTarget(targetPlayerId: string) {
    if (roomConnectionState.status !== "stable") {
      return;
    }

    setSelectedVoteTargetPlayerId(targetPlayerId);
    setSubmitVoteError(undefined);
  }

  function handleChangeImpostorGuessText(nextGuessText: string) {
    if (roomConnectionState.status !== "stable") {
      return;
    }

    setImpostorGuessText(nextGuessText);
    setSubmitImpostorGuessError(undefined);
  }

  async function handleShareRoom() {
    const lobby = getLobbyFromDataState(dataState);

    if (!lobby || roomConnectionState.status !== "stable") {
      return;
    }

    try {
      const result = await shareRoom(lobby.room.code);
      setRoomShareState({ status: result });
    } catch {
      setRoomShareState({
        status: "error",
        message: "No pudimos compartir la sala.",
      });
    }
  }

  async function handleCopyRoomCode() {
    const lobby = getLobbyFromDataState(dataState);

    if (
      !lobby ||
      roomConnectionState.status !== "stable" ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      setRoomShareState({
        status: "error",
        message: "No pudimos copiar el código.",
      });
      return;
    }

    try {
      await copyRoomCode(lobby.room.code);
      setRoomShareState({ status: "copied" });
    } catch {
      setRoomShareState({
        status: "error",
        message: "No pudimos copiar el código.",
      });
    }
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
    if (bootstrapState.status !== "recognized") {
      return;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void roomPresenceSubscriptionRef.current?.recoverPresence();
        void refreshAuthoritativeRoomState("foreground");
      }
    }

    function handleOnline() {
      void roomPresenceSubscriptionRef.current?.recoverPresence();
      void refreshAuthoritativeRoomState("online");
    }

    function handleOffline() {
      setRoomConnectionState({ status: "offline" });
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }

      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [bootstrapState.status, refreshAuthoritativeRoomState]);

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
    roomPresenceSubscriptionRef.current = subscription;

    return () => {
      if (roomPresenceSubscriptionRef.current === subscription) {
        roomPresenceSubscriptionRef.current = null;
      }

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
        runHostSuccessionEvaluation({
          evaluate: () =>
            hostSuccessionController.submit(createImpostorRoomsClient()),
          refreshAuthoritative: () =>
            refreshAuthoritativeRoomStateRef.current("authority"),
        }),
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
    onStartSecondVoting: () => void handleStartSecondVoting(),
    onStartNextRound: () => void handleStartNextRound(),
    onEndSession: () => void handleEndSession(),
    onSelectVoteTarget: handleSelectVoteTarget,
    onSubmitVote: () => void handleSubmitVote(),
    onChangeImpostorGuessText: handleChangeImpostorGuessText,
    onSubmitImpostorGuess: () => void handleSubmitImpostorGuess(),
    onStartAnonymousAuth: () => void handleStartAnonymousAuth(),
    lifecycleActionState,
    isStartingAuth,
    startAuthError,
    isStartingDiscussion,
    startDiscussionError,
    isStartingVoting,
    startVotingError,
    isStartingSecondVoting,
    startSecondVotingError,
    isStartingNextRound,
    startNextRoundError,
    isEndingSession,
    endSessionError,
    selectedVoteTargetPlayerId,
    isSubmittingVote,
    submitVoteError,
    impostorGuessText,
    isSubmittingImpostorGuess,
    submitImpostorGuessError,
    connectedPlayerIds,
    hostSuccessionNotice,
    roomShareState,
    roomConnectionState,
    onShareRoom: () => void handleShareRoom(),
    onCopyRoomCode: () => void handleCopyRoomCode(),
  });
}
