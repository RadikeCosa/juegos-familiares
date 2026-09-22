"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../../../lib/supabase/browser-client";
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

function roomsClient(): ImpostorRoomsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
}

export function TuttiFruttiLobbyContent(options: {
  lobby: ActiveRoomLobby;
  connected: Set<string>;
  connection: "online" | "offline" | "reconnecting";
  busy: boolean;
  actionError: string | null;
  onExit: (asHost: boolean) => void;
}) {
  const { lobby, connected, connection, busy, actionError, onExit } = options;
  const isHost = lobby.participants.some((participant) => participant.isSelf && participant.isHost);
  return (
    <section className="impostor-platform-context" aria-labelledby="tutti-room-title">
      <p className="impostor-kicker">Sala de Tutti Frutti</p>
      <h1 id="tutti-room-title">Código {lobby.room.code}</h1>
      <p>Compartí el código con personas de tu grupo.</p>
      <p aria-live="polite">{connection === "offline" ? "Sin conexión. La sala se actualizará al volver." : connection === "reconnecting" ? "Actualizando sala..." : "Sala sincronizada"}</p>
      <h2>Participantes</h2>
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
      <p>La sala está lista. Todavía no se puede iniciar una partida de Tutti Frutti.</p>
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

export function TuttiFruttiRoomEntry({ code }: { code: string }) {
  const router = useRouter();
  const [state, setState] = useState<RoomState>({ status: "loading" });
  const [presence, setPresence] = useState<RoomPresenceState>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<"online" | "offline" | "reconnecting">("online");
  const actionInFlight = useRef(false);
  const requestSequence = useRef(0);
  const roomPresenceRef = useRef<RoomPresenceSubscription | null>(null);
  const normalizedCode = normalizeRoomJoinCode(code);

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    try {
      const lobby = await getMyActiveRoom(roomsClient());
      if (request !== requestSequence.current) return;
      if (!lobby) setState({ status: "absent" });
      else if (lobby.room.gameType !== "tutti_frutti" || lobby.room.code !== normalizedCode) {
        router.replace(roomPath(lobby.room.gameType, lobby.room.code));
      } else setState({ status: "ready", lobby });
      setConnection("online");
    } catch {
      if (request === requestSequence.current) {
        setState({ status: "error", message: "No pudimos recuperar la sala. Recargá la página para intentar de nuevo." });
      }
    }
  }, [normalizedCode, router]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    return () => { requestSequence.current += 1; };
  }, [refresh]);

  const lobby = state.status === "ready" ? state.lobby : null;
  const roomId = lobby?.room.id;
  const selfPlayerId = lobby?.participants.find((participant) => participant.isSelf)?.playerId;

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        setConnection("reconnecting");
        void roomPresenceRef.current?.recoverPresence();
        void refresh();
      }
    }
    function onOnline() {
      setConnection("reconnecting");
      void roomPresenceRef.current?.recoverPresence();
      void refresh();
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
  }, [refresh]);

  useEffect(() => {
    if (!roomId || !selfPlayerId || lobby?.room.status !== "lobby") return;
    const client = createBrowserSupabaseClient();
    const changes = subscribeToRoomChanges(client as unknown as ImpostorRoomChangesClient, roomId, () => { void refresh(); }, "tutti_frutti");
    const heartbeat = startRoomLivenessHeartbeat({
      refresh: () => refreshMyRoomLiveness(client as unknown as ImpostorRoomsClient),
      onError: () => setConnection("reconnecting")
    });
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

  return <TuttiFruttiLobbyContent
    lobby={state.lobby}
    connected={getConnectedRoomParticipantIds(state.lobby.participants, presence)}
    connection={connection}
    busy={busy}
    actionError={actionError}
    onExit={(asHost) => { void exitRoom(asHost); }}
  />;
}
