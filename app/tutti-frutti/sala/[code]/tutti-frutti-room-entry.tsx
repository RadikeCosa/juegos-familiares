"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../../../lib/supabase/browser-client";
import {
  getTuttiFruttiRoomConfiguration,
  saveTuttiFruttiRoomConfiguration,
  type SavedTuttiFruttiRoomConfiguration,
  type TuttiFruttiRoomConfiguration,
  type TuttiFruttiRoomSetupClient
} from "../../../../lib/supabase/tutti-frutti-room-setup";
import {
  callTuttiFrutti,
  getTuttiFruttiGameState,
  startTuttiFruttiSession,
  advanceTuttiFruttiRound,
  submitTuttiFruttiLetterSkipVote,
  type TuttiFruttiGameClient,
  type TuttiFruttiStartedGame
} from "../../../../lib/supabase/tutti-frutti-game";
import { getTuttiFruttiReview, type TuttiFruttiReview as Review,
  openTuttiFruttiChallenge, subscribeToTuttiFruttiReviewInvalidations,
  voteTuttiFruttiChallenge, type TuttiFruttiReviewClient } from "../../../../lib/supabase/tutti-frutti-review";
import { TuttiFruttiRoomSetup } from "./tutti-frutti-room-setup";
import { TuttiFruttiAnswerEntry } from "./tutti-frutti-answer-entry";
import { TuttiFruttiReview } from "./tutti-frutti-review";
import { TuttiFruttiRoundResultView } from "./tutti-frutti-round-result";
import { getTuttiFruttiPostgameState, getTuttiFruttiRoundResult, scoreTuttiFruttiRound,
  subscribeToTuttiFruttiResultInvalidations, type TuttiFruttiPostgameState,
  type TuttiFruttiRoundResult,
  type TuttiFruttiResultClient } from "../../../../lib/supabase/tutti-frutti-result";
import {
  closeRoom, getConnectedRoomParticipantIds, getMyActiveRoom, joinRoomByCode,
  leaveRoom, normalizeRoomJoinCode, reassignRoomHostIfStale,
  refreshMyRoomLiveness, roomPath, startRoomLivenessHeartbeat,
  subscribeToRoomChanges, subscribeToRoomPresence,
  type ActiveRoomLobby, type ImpostorRoomChangesClient,
  type ImpostorRoomPresenceClient, type ImpostorRoomsClient,
  type RoomPresenceState, type RoomPresenceSubscription
} from "../../../../lib/supabase/impostor-rooms";

type RoomState =
  | { status: "loading" }
  | { status: "absent" }
  | { status: "error"; message: string }
  | { status: "ready"; lobby: ActiveRoomLobby };

type SetupState =
  | { status: "loading"; roomId: string }
  | { status: "error"; roomId: string; message: string }
  | {
      status: "ready";
      roomId: string;
      server: SavedTuttiFruttiRoomConfiguration;
      draft: TuttiFruttiRoomConfiguration;
      stale: boolean;
      saving: boolean;
      error: string | null;
      notice: string | null;
    };

type ReviewState =
  | { status: "loading"; sessionId: string; roundNumber: number }
  | { status: "error"; sessionId: string; roundNumber: number; message: string }
  | { status: "ready"; sessionId: string; roundNumber: number; review: Review };

type ResultState =
  | { status: "loading"; sessionId: string; roundNumber: number }
  | { status: "error"; sessionId: string; roundNumber: number; message: string }
  | { status: "ready"; sessionId: string; roundNumber: number; result: TuttiFruttiRoundResult };

type PostgameState =
  | { status: "loading"; roomId: string }
  | { status: "error"; roomId: string; message: string }
  | { status: "ready"; roomId: string; postgame: TuttiFruttiPostgameState };

function roomsClient(): ImpostorRoomsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
}

export function TuttiFruttiLobbyContent(options: {
  lobby: ActiveRoomLobby;
  connected: Set<string>;
  connection: "online" | "offline" | "reconnecting";
  busy: boolean;
  starting: boolean;
  voting: boolean;
  skipSeconds: number;
  countdownSeconds?: number;
  callReady?: boolean;
  calling?: boolean;
  unconfirmedAnswers?: boolean;
  reviewState?: ReviewState | null;
  challengeSeconds?: number;
  challengeBusy?: boolean;
  challengeError?: string | null;
  resultState?: ResultState | null;
  scoring?: boolean;
  advancing?: boolean;
  advanceError?: string | null;
  onAdvance?: () => void;
  postgame?: boolean;
  postgameLoading?: boolean;
  postgameError?: string | null;
  game: TuttiFruttiStartedGame | null;
  gameError: string | null;
  actionError: string | null;
  onStart: () => void;
  onSkipVote: (candidateId: string) => void;
  onCall?: () => void;
  onAnswerSaveState?: (ready: boolean, unconfirmed: boolean) => void;
  onRetryReview?: () => void;
  onOpenChallenge?: (playerId: string, categoryPosition: number) => void;
  onVoteChallenge?: (challengeId: string, choice: "VALID" | "INVALID") => void;
  onScore?: () => void;
  onRetryResult?: () => void;
  onExit: (asHost: boolean) => void;
}) {
  const { lobby, connected, connection, busy, starting, voting, skipSeconds, countdownSeconds = 45,
    callReady = false, calling = false, unconfirmedAnswers = false, reviewState = null,
    challengeSeconds = 0, challengeBusy = false, challengeError = null,
    resultState = null, scoring = false, advancing = false, advanceError = null,
    postgame = false, postgameLoading = false, postgameError = null,
    game, gameError, actionError, onStart, onSkipVote, onCall = () => {},
    onAnswerSaveState = () => {}, onRetryReview = () => {}, onOpenChallenge = () => {},
    onVoteChallenge = () => {}, onScore = () => {}, onRetryResult = () => {}, onAdvance = () => {}, onExit } = options;
  const isHost = lobby.participants.some((participant) => participant.isSelf && participant.isHost);
  const selfPlayerId = lobby.participants.find((participant) => participant.isSelf)?.playerId;
  const enoughPlayers = lobby.participants.length >= 2;
  const isPlaying = lobby.room.status === "playing";
  const connectionLabel = connection === "offline"
    ? "Sin conexión"
    : connection === "reconnecting" ? "Reconectando…" : "Conectado";
  const participantList = (
    <ul className="impostor-group-members">
      {lobby.participants.map((participant) => (
        <li key={participant.playerId}>
          <span>{participant.nickname}</span>
          <span className="impostor-room-badges">
            {participant.isSelf ? <strong>Vos</strong> : null}
            {participant.isHost ? <strong>Host</strong> : null}
            <span className={connected.has(participant.playerId) ? "impostor-presence impostor-presence--connected" : "impostor-presence impostor-presence--disconnected"}>
              {connected.has(participant.playerId) ? "conectado" : "desconectado"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <section className={`impostor-platform-context${isPlaying ? " tutti-room-context--playing" : ""}`} aria-labelledby="tutti-room-title">
      {isPlaying ? (
        <details className="tutti-room-summary">
          <summary>
            <span className="tutti-room-summary__content">
              <span id="tutti-room-title" className="tutti-room-summary__title" role="heading" aria-level={1}>
                Sala · Código {lobby.room.code}
              </span>
              <span className={`tutti-room-summary__connection tutti-room-summary__connection--${connection}`} aria-live="polite">
                {connectionLabel}
              </span>
              <span className="tutti-room-summary__count">
                {lobby.participants.length} {lobby.participants.length === 1 ? "participante" : "participantes"}
              </span>
            </span>
          </summary>
          <div className="tutti-room-summary__details">
            <p>{connection === "offline" ? "La sala se actualizará al volver la conexión." : "Compartí el código con personas de tu grupo."}</p>
            <h2>Participantes</h2>
            {participantList}
          </div>
        </details>
      ) : (
        <>
          <p className="impostor-kicker">Sala de Tutti Frutti</p>
          <h1 id="tutti-room-title">Código {lobby.room.code}</h1>
          <p>Compartí el código con personas de tu grupo.</p>
          <p aria-live="polite">{connection === "offline" ? "Sin conexión. La sala se actualizará al volver." : connection === "reconnecting" ? "Actualizando sala..." : "Sala sincronizada"}</p>
          <h2>Participantes</h2>
          {participantList}
        </>
      )}
      {lobby.room.status === "lobby" ? (
        <>
          {postgameLoading ? (
            <p aria-live="polite">Comprobando el estado de la partida…</p>
          ) : postgameError ? (
            <p role="alert">{postgameError}</p>
          ) : isHost ? (
            <>
              <p>{postgame
                ? enoughPlayers
                  ? "La partida anterior terminó. Podés editar la configuración e iniciar una nueva."
                  : "La partida anterior terminó. Se necesitan al menos dos participantes para iniciar otra."
                : enoughPlayers
                  ? "La sala está lista para empezar."
                  : "Se necesitan al menos dos participantes para iniciar."}</p>
              <button
                className="impostor-action impostor-action--primary"
                type="button"
                disabled={busy || starting || !enoughPlayers || connection !== "online"}
                onClick={onStart}
              >
                {starting ? "Iniciando partida…" : postgame ? "Nueva partida" : "Iniciar partida"}
              </button>
            </>
          ) : postgame ? (
            <p>La partida anterior terminó. Esperando a que el anfitrión configure e inicie otra.</p>
          ) : <p>Esperando a que el anfitrión inicie la partida.</p>}
        </>
      ) : (
        <section aria-labelledby="tutti-game-started-title" className="tutti-setup">
          <h2 id="tutti-game-started-title">Partida iniciada</h2>
          {game ? (
            <>
              <p>Ronda {game.round.number} de {game.roundCount}</p>
              <p>Letra preparada</p>
              <p aria-label={`Letra ${game.round.letter}`} className="tutti-game-letter">{game.round.letter}</p>
              <p>Categorías: {game.categories.map((category) => category.label).join(", ")}</p>
              {game.round.phase === "LETTER_PENDING" && game.round.letterDecision ? (
                <section className="tutti-letter-decision" aria-labelledby="tutti-letter-decision-title">
                  <h3 id="tutti-letter-decision-title">¿Saltamos esta letra?</h3>
                  <p aria-live="polite">
                    Votos para saltar: {game.round.letterDecision.votes} de {game.round.letterDecision.votesRequired} necesarios.
                  </p>
                  <p role="timer" aria-label={`La decisión se cierra en aproximadamente ${skipSeconds} segundos`}>
                    La letra se acepta en {skipSeconds} {skipSeconds === 1 ? "segundo" : "segundos"} si no se alcanza la mayoría.
                  </p>
                  {game.round.letterDecision.canSkip ? (
                    <button
                      className="impostor-action impostor-action--primary"
                      type="button"
                      disabled={voting || game.round.letterDecision.hasVoted || connection !== "online"}
                      onClick={() => onSkipVote(game.round.letterDecision!.candidateId)}
                    >
                      {voting ? "Registrando voto…" : game.round.letterDecision.hasVoted ? "Voto registrado" : "Votar para saltarla"}
                    </button>
                  ) : (
                    <p>Esta letra se necesita para completar las rondas restantes y no se puede saltar.</p>
                  )}
                </section>
              ) : ["PLAYING", "FINAL_COUNTDOWN", "REVIEWING"].includes(game.round.phase) ? (
                <>
                  {game.round.phase === "PLAYING" ? (
                    <p role="status">Letra confirmada. Completá y guardá todas las categorías para llamar Tutti Frutti.</p>
                  ) : game.round.phase === "FINAL_COUNTDOWN" ? (
                    <div className="tutti-countdown" role="status">
                      <p>{game.participants.find((participant) => participant.playerId === game.round.calledByPlayerId)?.nickname ?? "Un participante"} llamó Tutti Frutti.</p>
                      <p role="timer">{countdownSeconds > 0 ? `${countdownSeconds} segundos restantes` : "Cerrando respuestas…"}</p>
                    </div>
                  ) : (
                    <>
                      <p role="status">Respuestas bloqueadas. Revisá las respuestas de la ronda.</p>
                      <a className="impostor-action" href="#tutti-review">Ir a revisión</a>
                    </>
                  )}
                  {lobby.room.id && selfPlayerId ? (
                    <TuttiFruttiAnswerEntry
                      roomId={lobby.room.id}
                      sessionId={game.sessionId}
                      playerId={selfPlayerId}
                      roundNumber={game.round.number}
                      categories={game.categories}
                      connection={connection}
                      editable={game.round.phase === "PLAYING" || game.round.phase === "FINAL_COUNTDOWN" && countdownSeconds > 0}
                      onSaveState={onAnswerSaveState}
                    />
                  ) : null}
                  {game.round.phase === "PLAYING" ? (
                    <button className="impostor-action impostor-action--primary" type="button"
                      disabled={!callReady || calling || connection !== "online"} onClick={onCall}>
                      {calling ? "Iniciando cuenta…" : "Tutti Frutti"}
                    </button>
                  ) : null}
                  {game.round.phase === "REVIEWING" && unconfirmedAnswers ? (
                    <p role="alert">Alguna edición no alcanzó a guardarse antes del cierre.</p>
                  ) : null}
                  {game.round.phase === "REVIEWING" ? (
                    <div id="tutti-review">
                      {reviewState?.status === "ready" ? (
                        <TuttiFruttiReview key={`${reviewState.sessionId}:${reviewState.roundNumber}`}
                          review={reviewState.review} currentPlayerId={selfPlayerId ?? ""}
                          challengeSeconds={challengeSeconds} connection={connection} busy={challengeBusy}
                          error={challengeError} isHost={isHost} scoring={scoring} onScore={onScore}
                          onOpenChallenge={onOpenChallenge} onVote={onVoteChallenge} />
                      ) : reviewState?.status === "error" ? (
                        <div role="alert">
                          <p>{reviewState.message}</p>
                          <button type="button" className="impostor-action" onClick={onRetryReview}
                            disabled={connection !== "online"}>Volver a intentar</button>
                        </div>
                      ) : <p aria-live="polite">Recuperando respuestas de la ronda…</p>}
                    </div>
                  ) : null}
                </>
              ) : game.round.phase === "RESULT" ? (
                resultState?.status === "ready" && resultState.sessionId === game.sessionId
                  && resultState.roundNumber === game.round.number ? (
                    <TuttiFruttiRoundResultView result={resultState.result} currentPlayerId={selfPlayerId ?? ""}
                      isHost={isHost} canAdvance={game.round.number < game.roundCount}
                      advancing={advancing} advanceError={advanceError} connection={connection} onAdvance={onAdvance} />
                  ) : resultState?.status === "error" ? (
                    <div role="alert"><p>{resultState.message}</p>
                      <button type="button" className="impostor-action" onClick={onRetryResult}
                        disabled={connection !== "online"}>Volver a intentar</button></div>
                  ) : <p aria-live="polite">Recuperando el resultado de la ronda…</p>
              ) : null}
            </>
          ) : <p aria-live="polite">Recuperando la partida…</p>}
          {gameError ? <p role="alert">{gameError}</p> : null}
        </section>
      )}
      {lobby.room.status === "lobby" ? (
        <button className="impostor-action" type="button" disabled={busy || connection !== "online"} onClick={() => onExit(isHost)}>
          {isHost ? "Cerrar sala" : "Salir de la sala"}
        </button>
      ) : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      <Link className="impostor-action" href="/">Volver a Juegos Familiares</Link>
    </section>
  );
}

export function TuttiFruttiRoomEntry({ code, postgameSessionId = null }: {
  code: string;
  postgameSessionId?: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<RoomState>({ status: "loading" });
  const [presence, setPresence] = useState<RoomPresenceState>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [game, setGame] = useState<TuttiFruttiStartedGame | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [challengeSeconds, setChallengeSeconds] = useState(0);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [resultState, setResultState] = useState<ResultState | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [postgameState, setPostgameState] = useState<PostgameState | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [votingCandidateId, setVotingCandidateId] = useState<string | null>(null);
  const [skipSeconds, setSkipSeconds] = useState(5);
  const [countdownSeconds, setCountdownSeconds] = useState(45);
  const [callReady, setCallReady] = useState(false);
  const [unconfirmedAnswers, setUnconfirmedAnswers] = useState(false);
  const [calling, setCalling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<"online" | "offline" | "reconnecting">("online");
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const actionInFlight = useRef(false);
  const skipVoteInFlight = useRef(false);
  const callInFlight = useRef(false);
  const challengeInFlight = useRef(false);
  const scoreInFlight = useRef(false);
  const advanceInFlight = useRef(false);
  const requestSequence = useRef(0);
  const setupRequestSequence = useRef(0);
  const gameRequestSequence = useRef(0);
  const reviewRequestSequence = useRef(0);
  const postgameRequestSequence = useRef(0);
  const serverOffsetMs = useRef(0);
  const onAnswerSaveState = useCallback((ready: boolean, unconfirmed: boolean) => {
    setCallReady(ready);
    setUnconfirmedAnswers(unconfirmed);
  }, []);
  const roomPresenceRef = useRef<RoomPresenceSubscription | null>(null);
  const normalizedCode = normalizeRoomJoinCode(code);

  const refreshSetup = useCallback(async (roomId: string, forceAdopt = false) => {
    const request = ++setupRequestSequence.current;
    try {
      const snapshot = await getTuttiFruttiRoomConfiguration(
        createBrowserSupabaseClient() as unknown as TuttiFruttiRoomSetupClient,
        roomId
      );
      if (request !== setupRequestSequence.current) return;

      setSetupState((current) => {
        if (!current || current.roomId !== roomId || current.status !== "ready" || forceAdopt) {
          return {
            status: "ready", roomId, server: snapshot, draft: snapshot.configuration,
            stale: false, saving: false, error: null, notice: null
          };
        }

        const hasLocalEdits = JSON.stringify(current.draft) !== JSON.stringify(current.server.configuration);
        const serverChanged = current.server.updatedAt !== snapshot.updatedAt
          || JSON.stringify(current.server.configuration) !== JSON.stringify(snapshot.configuration);
        if (hasLocalEdits && serverChanged) {
          return { ...current, server: snapshot, stale: true, notice: null };
        }

        return {
          ...current,
          server: snapshot,
          draft: serverChanged ? snapshot.configuration : current.draft,
          stale: current.stale && hasLocalEdits,
          error: null
        };
      });
    } catch (error) {
      if (request === setupRequestSequence.current) {
        setSetupState({
          status: "error", roomId,
          message: error instanceof Error ? error.message : "No pudimos recuperar la configuración."
        });
      }
    }
  }, []);

  const refreshGame = useCallback(async (roomId: string) => {
    const request = ++gameRequestSequence.current;
    try {
      const requestedAt = Date.now();
      const snapshot = await getTuttiFruttiGameState(
        createBrowserSupabaseClient() as unknown as TuttiFruttiGameClient,
        roomId
      );
      if (request === gameRequestSequence.current) {
        serverOffsetMs.current = Date.parse(snapshot.serverNow) - (requestedAt + Date.now()) / 2;
        setGame(snapshot);
        setGameError(null);
      }
    } catch (error) {
      if (request === gameRequestSequence.current) {
        setGameError(error instanceof Error ? error.message : "No pudimos recuperar la partida.");
      }
    }
  }, []);

  const refreshResult = useCallback(async (roomId: string, sessionId: string, roundNumber: number) => {
    const request = ++reviewRequestSequence.current;
    setResultState((current) => current?.status === "ready"
      && current.sessionId === sessionId && current.roundNumber === roundNumber
      ? current : { status: "loading", sessionId, roundNumber });
    try {
      const result = await getTuttiFruttiRoundResult(
        createBrowserSupabaseClient() as unknown as TuttiFruttiResultClient, roomId
      );
      if (request !== reviewRequestSequence.current) return;
      if (result.roomId !== roomId || result.sessionId !== sessionId || result.roundNumber !== roundNumber) {
        throw new Error("El resultado pertenece a otra ronda. Actualizá la partida.");
      }
      setResultState({ status: "ready", sessionId, roundNumber, result });
      setScoreError(null);
    } catch (error) {
      if (request === reviewRequestSequence.current) {
        setResultState({ status: "error", sessionId, roundNumber,
          message: error instanceof Error ? error.message : "No pudimos recuperar el resultado." });
      }
    }
  }, []);

  const refreshReview = useCallback(async (roomId: string, sessionId: string, roundNumber: number) => {
    const request = ++reviewRequestSequence.current;
    setReviewState((current) => current?.status === "ready"
      && current.sessionId === sessionId && current.roundNumber === roundNumber
      ? current : { status: "loading", sessionId, roundNumber });
    try {
      const requestedAt = Date.now();
      const review = await getTuttiFruttiReview(
        createBrowserSupabaseClient() as unknown as TuttiFruttiReviewClient, roomId
      );
      if (request !== reviewRequestSequence.current) return;
      if (review.roomId !== roomId || review.sessionId !== sessionId || review.roundNumber !== roundNumber) {
        throw new Error("La revisión pertenece a otra ronda. Actualizá la partida.");
      }
      serverOffsetMs.current = Date.parse(review.serverNow) - (requestedAt + Date.now()) / 2;
      setReviewState({ status: "ready", sessionId, roundNumber, review });
    } catch (error) {
      if (request === reviewRequestSequence.current) {
        setReviewState({ status: "error", sessionId, roundNumber,
          message: error instanceof Error ? error.message : "No pudimos recuperar la revisión." });
      }
    }
  }, []);

  const refreshPostgame = useCallback(async (roomId: string) => {
    const request = ++postgameRequestSequence.current;
    setPostgameState((current) => current?.roomId === roomId && current.status === "ready"
      ? current : { status: "loading", roomId });
    try {
      const postgame = await getTuttiFruttiPostgameState(
        createBrowserSupabaseClient() as unknown as TuttiFruttiResultClient,
        roomId
      );
      if (request !== postgameRequestSequence.current) return;
      setPostgameState({ status: "ready", roomId, postgame });
      if (postgame.latestFinishedSessionId
        && postgame.latestFinishedSessionId !== postgameSessionId) {
        router.replace(`/tutti-frutti/resultado/${encodeURIComponent(postgame.latestFinishedSessionId)}`);
      }
    } catch (error) {
      if (request === postgameRequestSequence.current) {
        setPostgameState({ status: "error", roomId, message: error instanceof Error
          ? error.message : "No pudimos recuperar el estado de la sala." });
      }
    }
  }, [postgameSessionId, router]);

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    try {
      const lobby = await getMyActiveRoom(roomsClient());
      if (request !== requestSequence.current) return;
      if (!lobby) {
        setState({ status: "absent" });
        setSetupState(null);
        setGame(null);
        setReviewState(null);
        setResultState(null);
        setPostgameState(null);
      }
      else if (lobby.room.gameType !== "tutti_frutti" || lobby.room.code !== normalizedCode) {
        router.replace(roomPath(lobby.room.gameType, lobby.room.code));
      } else if (!lobby.room.id) {
        setState({ status: "error", message: "No pudimos reconocer la sala activa." });
      } else {
        const activeRoomId = lobby.room.id;
        setState({ status: "ready", lobby });
        setSetupState((current) => current?.roomId === activeRoomId
          ? current
          : { status: "loading", roomId: activeRoomId });
        void refreshSetup(activeRoomId);
        if (lobby.room.status === "playing") {
          setPostgameState(null);
          void refreshGame(activeRoomId);
        } else {
          setGame(null);
          setGameError(null);
          void refreshPostgame(activeRoomId);
        }
      }
      setConnection("online");
    } catch {
      if (request === requestSequence.current) {
        setState({ status: "error", message: "No pudimos recuperar la sala. Recargá la página para intentar de nuevo." });
      }
    }
  }, [normalizedCode, refreshGame, refreshPostgame, refreshSetup, router]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    return () => { requestSequence.current += 1; };
  }, [refresh]);

  const lobby = state.status === "ready" ? state.lobby : null;
  const roomId = lobby?.room.id;
  const selfPlayerId = lobby?.participants.find((participant) => participant.isSelf)?.playerId;
  const gamePhase = game?.round.phase;
  const gameSessionId = game?.sessionId;
  const gameRoundNumber = game?.round.number;
  useEffect(() => { setAdvanceError(null); }, [gameSessionId, gameRoundNumber]);

  const openChallenge = useCallback(async (playerId: string, categoryPosition: number) => {
    if (!roomId || challengeInFlight.current || connection !== "online") return;
    challengeInFlight.current = true;
    setChallengeBusy(true);
    setChallengeError(null);
    try {
      const client = createBrowserSupabaseClient() as unknown as TuttiFruttiReviewClient;
      await openTuttiFruttiChallenge(client, roomId, playerId, categoryPosition);
      if (gameSessionId && gameRoundNumber) await refreshReview(roomId, gameSessionId, gameRoundNumber);
    } catch (error) {
      setChallengeError(error instanceof Error ? error.message : "No pudimos abrir la impugnación.");
      if (gameSessionId && gameRoundNumber) void refreshReview(roomId, gameSessionId, gameRoundNumber);
    } finally {
      challengeInFlight.current = false;
      setChallengeBusy(false);
    }
  }, [roomId, connection, gameSessionId, gameRoundNumber, refreshReview]);

  const voteChallenge = useCallback(async (challengeId: string, choice: "VALID" | "INVALID") => {
    if (!roomId || challengeInFlight.current || connection !== "online") return;
    challengeInFlight.current = true;
    setChallengeBusy(true);
    setChallengeError(null);
    try {
      const client = createBrowserSupabaseClient() as unknown as TuttiFruttiReviewClient;
      const result = await voteTuttiFruttiChallenge(client, roomId, challengeId, choice);
      if (typeof result === "object" && result !== null && "accepted" in result
        && (result as { accepted?: unknown }).accepted === false) {
        setChallengeError("El plazo terminó antes de registrar tu voto. Actualizamos el resultado.");
      }
      if (gameSessionId && gameRoundNumber) await refreshReview(roomId, gameSessionId, gameRoundNumber);
    } catch (error) {
      setChallengeError(error instanceof Error ? error.message : "No pudimos registrar tu voto.");
      if (gameSessionId && gameRoundNumber) void refreshReview(roomId, gameSessionId, gameRoundNumber);
    } finally {
      challengeInFlight.current = false;
      setChallengeBusy(false);
    }
  }, [roomId, connection, gameSessionId, gameRoundNumber, refreshReview]);

  async function advanceRound() {
    if (!roomId || !game || game.round.phase !== "RESULT" || game.round.number >= game.roundCount
      || advanceInFlight.current || connection !== "online") return;
    advanceInFlight.current = true;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const snapshot = await advanceTuttiFruttiRound(
        createBrowserSupabaseClient() as unknown as TuttiFruttiGameClient, roomId, game.round.id
      );
      gameRequestSequence.current += 1;
      setGame(snapshot);
      setGameError(null);
      setResultState(null);
    } catch (error) {
      setAdvanceError(error instanceof Error ? error.message : "No pudimos preparar la siguiente ronda.");
      await refreshGame(roomId);
    } finally {
      advanceInFlight.current = false;
      setAdvancing(false);
    }
  }

  async function scoreRound() {
    if (!roomId || !gameSessionId || !gameRoundNumber || reviewState?.status !== "ready"
      || reviewState.sessionId !== gameSessionId || reviewState.roundNumber !== gameRoundNumber
      || scoreInFlight.current || connection !== "online") return;
    if (!window.confirm("Al puntuar, las respuestas y el resultado de esta ronda quedarán definitivos.")) return;
    scoreInFlight.current = true;
    setScoring(true);
    setScoreError(null);
    try {
      const result = await scoreTuttiFruttiRound(
        createBrowserSupabaseClient() as unknown as TuttiFruttiResultClient, roomId, reviewState.review.roundId
      );
      serverOffsetMs.current = Date.parse(result.serverNow) - Date.now();
      if (game && result.roundNumber === game.roundCount) {
        router.replace(`/tutti-frutti/resultado/${encodeURIComponent(result.sessionId)}`);
        return;
      }
      setResultState({ status: "ready", sessionId: result.sessionId,
        roundNumber: result.roundNumber, result });
      if (gameSessionId && gameRoundNumber) reviewRequestSequence.current += 1;
      await refreshGame(roomId);
    } catch (error) {
      setScoreError(error instanceof Error ? error.message : "No pudimos puntuar la ronda.");
      await refreshGame(roomId);
      if (gameSessionId && gameRoundNumber) void refreshReview(roomId, gameSessionId, gameRoundNumber);
    } finally {
      scoreInFlight.current = false;
      setScoring(false);
    }
  }

  useEffect(() => {
    if (!roomId || gamePhase !== "REVIEWING" || !gameSessionId || !gameRoundNumber) {
      setReviewState(null);
      return;
    }
    void refreshReview(roomId, gameSessionId, gameRoundNumber);
    return () => { reviewRequestSequence.current += 1; };
  }, [roomId, gamePhase, gameSessionId, gameRoundNumber, refreshReview]);

  useEffect(() => {
    if (!roomId || gamePhase !== "RESULT" || !gameSessionId || !gameRoundNumber) {
      setResultState(null);
      return;
    }
    void refreshResult(roomId, gameSessionId, gameRoundNumber);
    return () => { reviewRequestSequence.current += 1; };
  }, [roomId, gamePhase, gameSessionId, gameRoundNumber, refreshResult]);

  useEffect(() => {
    if (!roomId || !gameSessionId || !gameRoundNumber || gamePhase !== "REVIEWING") return;
    const client = createBrowserSupabaseClient() as unknown as TuttiFruttiReviewClient;
    const subscription = subscribeToTuttiFruttiReviewInvalidations(client, gameSessionId,
      () => {
        void refreshGame(roomId);
        void refreshReview(roomId, gameSessionId, gameRoundNumber);
      });
    return () => { void subscription.unsubscribe(); };
  }, [roomId, gamePhase, gameSessionId, gameRoundNumber, refreshGame, refreshReview]);

  useEffect(() => {
    if (!roomId || !gameSessionId || !gameRoundNumber || gamePhase !== "RESULT") return;
    const client = createBrowserSupabaseClient() as unknown as TuttiFruttiResultClient;
    const subscription = subscribeToTuttiFruttiResultInvalidations(client, gameSessionId, () => {
      void refreshResult(roomId, gameSessionId, gameRoundNumber);
      void refreshGame(roomId);
    });
    return () => { void subscription.unsubscribe(); };
  }, [roomId, gamePhase, gameSessionId, gameRoundNumber, refreshGame, refreshResult]);

  useEffect(() => {
    if (!roomId || gamePhase !== "RESULT" || connection !== "online") return;
    const interval = window.setInterval(() => {
      void refresh();
      void refreshGame(roomId);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [roomId, gamePhase, connection, refresh, refreshGame]);

  const activeChallenge = reviewState?.status === "ready" ? reviewState.review.activeChallenge : null;
  const activeChallengeId = activeChallenge?.id;
  const activeChallengeDeadline = activeChallenge?.deadlineAt;
  useEffect(() => {
    if (!roomId || !gameSessionId || !gameRoundNumber || gamePhase !== "REVIEWING"
      || !activeChallengeId || !activeChallengeDeadline) {
      setChallengeSeconds(0);
      return;
    }
    let pollInFlight = false;
    const update = () => {
      setChallengeSeconds(Math.max(0, Math.ceil((Date.parse(activeChallengeDeadline)
        - (Date.now() + serverOffsetMs.current)) / 1000)));
      if (!pollInFlight) {
        pollInFlight = true;
        void refreshReview(roomId, gameSessionId, gameRoundNumber).finally(() => { pollInFlight = false; });
      }
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [roomId, gameSessionId, gameRoundNumber, gamePhase, activeChallengeId,
    activeChallengeDeadline, refreshReview]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        setConnection("reconnecting");
        void roomPresenceRef.current?.recoverPresence();
        void refresh();
        if (roomId && gamePhase === "REVIEWING" && gameSessionId && gameRoundNumber) {
          void refreshReview(roomId, gameSessionId, gameRoundNumber);
        }
        if (roomId && gamePhase === "RESULT" && gameSessionId && gameRoundNumber) {
          void refreshResult(roomId, gameSessionId, gameRoundNumber);
        }
      }
    }
    function onOnline() {
      setConnection("reconnecting");
      void roomPresenceRef.current?.recoverPresence();
      void refresh();
      if (roomId && gamePhase === "REVIEWING" && gameSessionId && gameRoundNumber) {
        void refreshReview(roomId, gameSessionId, gameRoundNumber);
      }
      if (roomId && gamePhase === "RESULT" && gameSessionId && gameRoundNumber) {
        void refreshResult(roomId, gameSessionId, gameRoundNumber);
      }
    }
    function onOffline() { setConnection("offline"); }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh, refreshReview, refreshResult, roomId, gamePhase, gameSessionId, gameRoundNumber]);

  const pendingCandidateId = game?.round.phase === "LETTER_PENDING"
    ? game.round.letterDecision?.candidateId ?? null
    : null;
  const pendingDeadline = pendingCandidateId && game?.round.letterDecision
    ? game.round.letterDecision.deadlineAt
    : null;

  useEffect(() => {
    if (!roomId || !pendingCandidateId || !pendingDeadline || connection !== "online") return;
    const serverTimeOffset = serverOffsetMs.current;
    const updateAndRefresh = () => {
      const remainingMs = Date.parse(pendingDeadline) - (Date.now() + serverTimeOffset);
      setSkipSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
      void refreshGame(roomId);
    };
    updateAndRefresh();
    const interval = window.setInterval(updateAndRefresh, 1_000);
    return () => window.clearInterval(interval);
  }, [roomId, pendingCandidateId, pendingDeadline, connection, refreshGame]);

  const countdownDeadline = game?.round.countdownEndsAt;
  useEffect(() => {
    if (!roomId || connection !== "online"
      || (gamePhase !== "PLAYING" && gamePhase !== "FINAL_COUNTDOWN")) return;
    let ticks = 0;
    let pollInFlight = false;
    const update = () => {
      if (countdownDeadline) {
        setCountdownSeconds(Math.max(0, Math.ceil((Date.parse(countdownDeadline)
          - (Date.now() + serverOffsetMs.current)) / 1000)));
      }
      ticks += 1;
      if ((gamePhase === "FINAL_COUNTDOWN" || ticks % 2 === 0) && !pollInFlight) {
        pollInFlight = true;
        void refreshGame(roomId).finally(() => { pollInFlight = false; });
      }
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [roomId, gamePhase, countdownDeadline, connection, refreshGame]);

  useEffect(() => {
    if (!roomId || !selfPlayerId) return;
    const client = createBrowserSupabaseClient();
    const changes = subscribeToRoomChanges(client as unknown as ImpostorRoomChangesClient, roomId, () => { void refresh(); }, "tutti_frutti");
    if (lobby?.room.status !== "lobby" && lobby?.room.status !== "playing") {
      return () => { void changes.unsubscribe(); };
    }
    const heartbeat = startRoomLivenessHeartbeat({
      refresh: () => refreshMyRoomLiveness(client as unknown as ImpostorRoomsClient),
      onError: () => setConnection("reconnecting")
    });
    // Presence only drives the participant connection indicators; liveness and host succession come from RPCs below.
    const roomPresence = subscribeToRoomPresence(client as unknown as ImpostorRoomPresenceClient, {
      roomId, currentPlayerId: selfPlayerId, gameType: "tutti_frutti",
      onSync: setPresence,
      onSubscribed: () => {
        void refreshMyRoomLiveness(client as unknown as ImpostorRoomsClient)
          .catch(() => setConnection("reconnecting"));
      },
      onError: () => setConnection("reconnecting")
    });
    roomPresenceRef.current = roomPresence;
    let evaluating = false;
    async function evaluateHost() {
      if (evaluating) return;
      evaluating = true;
      try {
        await refreshMyRoomLiveness(client as unknown as ImpostorRoomsClient);
        const result = await reassignRoomHostIfStale(client as unknown as ImpostorRoomsClient);
        if (result.hostChanged) await refresh();
      } catch {
        // A failed check cannot transfer authority; the next interval retries.
      } finally { evaluating = false; }
    }
    void evaluateHost();
    const interval = window.setInterval(() => { void evaluateHost(); void refresh(); }, 30_000);
    return () => {
      window.clearInterval(interval);
      heartbeat.dispose();
      void changes.unsubscribe();
      void roomPresence.unsubscribe();
      if (roomPresenceRef.current === roomPresence) roomPresenceRef.current = null;
    };
  }, [roomId, selfPlayerId, lobby?.room.status, refresh]);

  async function startGame() {
    if (!lobby || !lobby.room.id || lobby.room.status !== "lobby" || starting || lobby.participants.length < 2) return;
    setStarting(true);
    setActionError(null);
    try {
      const snapshot = await startTuttiFruttiSession(
        createBrowserSupabaseClient() as unknown as TuttiFruttiGameClient,
        lobby.room.id
      );
      setGame(snapshot);
      setGameError(null);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No pudimos iniciar la partida.");
      await refresh();
    } finally {
      setStarting(false);
    }
  }

  async function voteToSkip(candidateId: string) {
    const roomId = lobby?.room.id;
    if (!roomId || skipVoteInFlight.current || connection !== "online") return;
    skipVoteInFlight.current = true;
    setVotingCandidateId(candidateId);
    setActionError(null);
    try {
      const snapshot = await submitTuttiFruttiLetterSkipVote(
        createBrowserSupabaseClient() as unknown as TuttiFruttiGameClient,
        roomId,
        candidateId
      );
      gameRequestSequence.current += 1;
      serverOffsetMs.current = Date.parse(snapshot.serverNow) - Date.now();
      setGame(snapshot);
      setGameError(null);
      await refreshGame(roomId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No pudimos registrar el voto.");
      await refreshGame(roomId);
    } finally {
      skipVoteInFlight.current = false;
      setVotingCandidateId(null);
    }
  }

  async function callRound() {
    const activeRoomId = lobby?.room.id;
    if (!activeRoomId || !callReady || callInFlight.current || connection !== "online") return;
    callInFlight.current = true;
    setCalling(true);
    setActionError(null);
    try {
      const requestedAt = Date.now();
      const snapshot = await callTuttiFrutti(
        createBrowserSupabaseClient() as unknown as TuttiFruttiGameClient, activeRoomId
      );
      gameRequestSequence.current += 1;
      serverOffsetMs.current = Date.parse(snapshot.serverNow) - (requestedAt + Date.now()) / 2;
      setGame(snapshot);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No pudimos iniciar la cuenta.");
      await refreshGame(activeRoomId);
    } finally {
      callInFlight.current = false;
      setCalling(false);
    }
  }

  async function joinDirectCode() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    try {
      await joinRoomByCode(roomsClient(), normalizedCode, "tutti_frutti");
      await refresh();
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "No pudimos entrar a la sala." });
    } finally { actionInFlight.current = false; setBusy(false); }
  }

  async function exitRoom(asHost: boolean) {
    if (actionInFlight.current) return;
    if (asHost && !window.confirm("Cerrar la sala la termina para todos sus participantes.")) return;
    actionInFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      if (asHost) await closeRoom(roomsClient());
      else await leaveRoom(roomsClient());
      router.replace("/tutti-frutti");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No pudimos completar la acción.");
    } finally { actionInFlight.current = false; setBusy(false); }
  }

  function updateSetup(configuration: TuttiFruttiRoomConfiguration) {
    setSetupState((current) => current?.status === "ready"
      ? { ...current, draft: configuration, error: null, notice: null }
      : current);
  }

  async function saveSetup() {
    if (setupState?.status !== "ready" || setupState.stale || setupState.saving) return;
    const roomId = setupState.roomId;
    setSetupState((current) => current?.status === "ready"
      ? { ...current, saving: true, error: null, notice: null }
      : current);
    try {
      const saved = await saveTuttiFruttiRoomConfiguration(
        createBrowserSupabaseClient() as unknown as TuttiFruttiRoomSetupClient,
        roomId,
        setupState.draft
      );
      setSetupState((current) => current?.status === "ready" && current.roomId === roomId
        ? { ...current, server: saved, draft: saved.configuration, stale: false, saving: false, error: null, notice: "Configuración guardada." }
        : current);
      await refreshSetup(roomId, true);
      setSetupState((current) => current?.status === "ready" && current.roomId === roomId
        ? { ...current, notice: "Configuración guardada." }
        : current);
    } catch (error) {
      setSetupState((current) => current?.status === "ready" && current.roomId === roomId
        ? {
            ...current,
            saving: false,
            error: error instanceof Error ? error.message : "No pudimos guardar la configuración."
          }
        : current);
    }
  }

  if (state.status === "loading") return <p aria-live="polite">Comprobando sala...</p>;
  if (state.status === "error") return <p role="alert">{state.message} <Link href="/tutti-frutti">Volver a Tutti Frutti</Link></p>;
  if (state.status === "absent") return (
    <section className="impostor-platform-context">
      <h1>Sala {normalizedCode}</h1>
      <p>Podés intentar unirte a esta sala de Tutti Frutti.</p>
      <button className="impostor-action impostor-action--primary" type="button" disabled={busy} onClick={() => void joinDirectCode()}>
        {busy ? "Entrando..." : "Unirme a la sala"}
      </button>
    </section>
  );

  const isHost = state.lobby.participants.some((participant) => participant.isSelf && participant.isHost);
  const setupForRoom = setupState?.roomId === state.lobby.room.id ? setupState : null;
  const postgameForRoom = postgameState?.roomId === state.lobby.room.id ? postgameState : null;
  const isLobby = state.lobby.room.status === "lobby";
  const hasFinishedSession = postgameForRoom?.status === "ready"
    && postgameForRoom.postgame.hasFinishedSession;
  const postgameLoading = isLobby && (!postgameForRoom || postgameForRoom.status === "loading");
  const postgameError = postgameForRoom?.status === "error" ? postgameForRoom.message : null;
  const postgameBlocksSetup = isLobby
    && (postgameLoading || Boolean(postgameError));

  return (
    <>
      <TuttiFruttiLobbyContent
        lobby={state.lobby}
        connected={getConnectedRoomParticipantIds(state.lobby.participants, presence)}
        connection={connection}
        busy={busy}
        starting={starting}
        voting={votingCandidateId !== null}
        skipSeconds={skipSeconds}
        countdownSeconds={countdownSeconds}
        callReady={callReady}
        calling={calling}
        unconfirmedAnswers={unconfirmedAnswers}
        reviewState={reviewState?.sessionId === game?.sessionId && reviewState?.roundNumber === game?.round.number
          ? reviewState : null}
        challengeSeconds={challengeSeconds}
        challengeBusy={challengeBusy}
        challengeError={challengeError ?? scoreError}
        resultState={resultState?.sessionId === game?.sessionId && resultState?.roundNumber === game?.round.number
          ? resultState : null}
        scoring={scoring}
        advancing={advancing}
        advanceError={advanceError}
        onAdvance={() => { void advanceRound(); }}
        postgame={hasFinishedSession}
        postgameLoading={postgameLoading}
        postgameError={postgameError}
        game={game}
        gameError={gameError}
        actionError={actionError}
        onStart={() => { void startGame(); }}
        onSkipVote={(candidateId) => { void voteToSkip(candidateId); }}
        onCall={() => { void callRound(); }}
        onAnswerSaveState={onAnswerSaveState}
        onRetryReview={() => {
          if (roomId && gameSessionId && gameRoundNumber) {
            void refreshReview(roomId, gameSessionId, gameRoundNumber);
          }
        }}
        onOpenChallenge={(playerId, categoryPosition) => { void openChallenge(playerId, categoryPosition); }}
        onVoteChallenge={(challengeId, choice) => { void voteChallenge(challengeId, choice); }}
        onScore={() => { void scoreRound(); }}
        onRetryResult={() => {
          if (roomId && gameSessionId && gameRoundNumber) {
            void refreshResult(roomId, gameSessionId, gameRoundNumber);
          }
        }}
        onExit={(asHost) => { void exitRoom(asHost); }}
      />
      {!postgameBlocksSetup && setupForRoom?.status === "loading"
        ? <p aria-live="polite">Recuperando configuración…</p> : null}
      {!postgameBlocksSetup && setupForRoom?.status === "error" ? (
        <section className="tutti-setup tutti-setup--error" aria-labelledby="tutti-setup-error-title">
          <h2 id="tutti-setup-error-title">No pudimos recuperar la configuración</h2>
          <p role="alert">{setupForRoom.message}</p>
          <button className="impostor-action" disabled={connection !== "online"} onClick={() => void refreshSetup(setupForRoom.roomId, true)} type="button">
            Volver a intentar
          </button>
        </section>
      ) : null}
      {!postgameBlocksSetup && setupForRoom?.status === "ready" ? (
        <TuttiFruttiRoomSetup
          configuration={setupForRoom.draft}
          isHost={isHost}
          roomStatus={state.lobby.room.status}
          connection={connection}
          dirty={JSON.stringify(setupForRoom.draft) !== JSON.stringify(setupForRoom.server.configuration)}
          stale={setupForRoom.stale}
          saving={setupForRoom.saving}
          error={setupForRoom.error}
          notice={setupForRoom.notice}
          onChange={updateSetup}
          onSave={() => { void saveSetup(); }}
          onReload={() => { void refreshSetup(setupForRoom.roomId, true); }}
        />
      ) : null}
    </>
  );
}
