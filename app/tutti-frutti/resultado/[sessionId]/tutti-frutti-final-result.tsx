"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../../../../lib/supabase/browser-client";
import {
  getMyActiveRoom,
  roomPath,
  subscribeToRoomChanges,
  type ActiveRoomLobby,
  type ImpostorRoomChangesClient,
  type ImpostorRoomsClient
} from "../../../../lib/supabase/impostor-rooms";
import {
  getTuttiFruttiFinalResult,
  type TuttiFruttiFinalResult as FinalResult,
  type TuttiFruttiResultClient
} from "../../../../lib/supabase/tutti-frutti-result";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: FinalResult };

export function getPlayingRoomRouteForResult(roomId: string, activeRoom: ActiveRoomLobby | null) {
  if (!activeRoom || activeRoom.room.id !== roomId
    || activeRoom.room.gameType !== "tutti_frutti" || activeRoom.room.status !== "playing") return null;
  return roomPath("tutti_frutti", activeRoom.room.code);
}

export function TuttiFruttiFinalResult({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await getTuttiFruttiFinalResult(
        createBrowserSupabaseClient() as unknown as TuttiFruttiResultClient,
        sessionId
      );
      setState({ status: "ready", result });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error
        ? error.message : "No pudimos recuperar el resultado final." });
    }
  }, [sessionId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useEffect(() => {
    if (state.status !== "ready" || !state.result.canReturnToRoom) return;
    const { roomId } = state.result;
    const client = createBrowserSupabaseClient();
    let disposed = false;
    let checking = false;
    const reconcileRoom = async () => {
      if (disposed || checking) return;
      checking = true;
      try {
        const activeRoom = await getMyActiveRoom(client as unknown as ImpostorRoomsClient);
        if (disposed) return;
        const route = getPlayingRoomRouteForResult(roomId, activeRoom);
        if (route) router.replace(route);
      } catch {
        // The final result remains available; a later event, poll, or reconnect retries.
      } finally {
        checking = false;
      }
    };
    const subscription = subscribeToRoomChanges(
      client as unknown as ImpostorRoomChangesClient,
      roomId,
      () => { void reconcileRoom(); },
      "tutti_frutti"
    );
    const interval = window.setInterval(() => { void reconcileRoom(); }, 15_000);
    const onOnline = () => { void reconcileRoom(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void reconcileRoom();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void reconcileRoom();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void subscription.unsubscribe();
    };
  }, [router, state]);

  if (state.status === "loading") return <p aria-live="polite">Recuperando resultado final…</p>;
  if (state.status === "error") return (
    <section className="tutti-review" aria-labelledby="tutti-final-error-title">
      <h1 id="tutti-final-error-title">Resultado final</h1>
      <p role="alert">{state.message}</p>
      <button className="impostor-action" type="button" onClick={() => { void load(); }}>
        Volver a intentar
      </button>
      <Link className="impostor-action" href="/">Volver a Juegos Familiares</Link>
    </section>
  );

  return <TuttiFruttiFinalResultView result={state.result} />;
}

export function TuttiFruttiFinalResultView({ result }: { result: FinalResult }) {
  const winners = result.totals.filter(player => result.winnerPlayerIds.includes(player.playerId));
  return (
    <section className="tutti-review" aria-labelledby="tutti-final-title">
      <p className="impostor-kicker">Partida terminada</p>
      <h1 id="tutti-final-title">Resultado final</h1>
      <p>{result.isTie
        ? `Empate entre ${winners.map(player => player.nickname).join(", ")}`
        : `${winners[0]?.nickname ?? "Ganador"} ganó la partida`}</p>
      <p>{result.roundCount} rondas completadas</p>
      <ol className="tutti-review__entries">
        {result.totals.map(player => (
          <li className="tutti-review__entry" key={player.playerId}>
            <strong>{player.rank}. {player.nickname}</strong>
            <span>{player.totalPoints} puntos</span>
          </li>
        ))}
      </ol>
      {result.canReturnToRoom && result.roomCode ? (
        <Link className="impostor-action impostor-action--primary"
          href={`/tutti-frutti/sala/${encodeURIComponent(result.roomCode)}?postgame=${encodeURIComponent(result.sessionId)}`}>
          Ir al lobby
        </Link>
      ) : (
        <Link className="impostor-action impostor-action--primary" href="/">
          Volver a Juegos Familiares
        </Link>
      )}
    </section>
  );
}
