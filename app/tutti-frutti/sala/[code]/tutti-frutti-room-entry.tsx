"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../../../../lib/supabase/browser-client";
import { getMyActiveRoom, joinRoomByCode, normalizeRoomJoinCode, roomPath, type ActiveRoomLobby, type ImpostorRoomsClient } from "../../../../lib/supabase/impostor-rooms";

type RoomState = { status: "loading" } | { status: "absent" } | { status: "error"; message: string } | { status: "ready"; lobby: ActiveRoomLobby };

export function TuttiFruttiRoomEntry({ code }: { code: string }) {
  const router = useRouter();
  const [state, setState] = useState<RoomState>({ status: "loading" });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    void getMyActiveRoom(createBrowserSupabaseClient() as unknown as ImpostorRoomsClient)
      .then((lobby) => {
        if (!active) return;
        if (!lobby) {
          setState({ status: "absent" });
        } else if (lobby.room.gameType !== "tutti_frutti" || lobby.room.code !== normalizeRoomJoinCode(code)) {
          router.replace(roomPath(lobby.room.gameType, lobby.room.code));
        } else {
          setState({ status: "ready", lobby });
        }
      })
      .catch(() => { if (active) setState({ status: "error", message: "No pudimos recuperar la sala. Recargá la página para intentar de nuevo." }); });
    return () => { active = false; };
  }, [code, router]);

  async function joinDirectCode() {
    if (joining) return;
    setJoining(true);
    try {
      const client = createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
      await joinRoomByCode(client, code, "tutti_frutti");
      const lobby = await getMyActiveRoom(client);
      if (!lobby || lobby.room.gameType !== "tutti_frutti" || lobby.room.code !== normalizeRoomJoinCode(code)) {
        throw new Error("No pudimos confirmar tu sala activa.");
      }
      setState({ status: "ready", lobby });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "No pudimos entrar a la sala." });
    } finally {
      setJoining(false);
    }
  }

  if (state.status === "loading") return <p aria-live="polite">Comprobando sala...</p>;
  if (state.status === "error") return <p role="alert">{state.message} <Link href="/tutti-frutti">Volver a Tutti Frutti</Link></p>;
  if (state.status === "absent") return (
    <section className="impostor-platform-context">
      <h1>Sala {normalizeRoomJoinCode(code)}</h1>
      <p>Podés intentar unirte a esta sala de Tutti Frutti.</p>
      <button className="impostor-action impostor-action--primary" type="button" disabled={joining} onClick={() => void joinDirectCode()}>
        {joining ? "Entrando..." : "Unirme a la sala"}
      </button>
    </section>
  );
  return (
    <section className="impostor-platform-context" aria-labelledby="tutti-room-title">
      <p className="impostor-kicker">Sala de Tutti Frutti</p>
      <h1 id="tutti-room-title">Código {state.lobby.room.code}</h1>
      <p>La sala está creada. Todavía no se puede iniciar una partida de Tutti Frutti.</p>
      <Link className="impostor-action" href="/">Volver a Juegos Familiares</Link>
    </section>
  );
}
