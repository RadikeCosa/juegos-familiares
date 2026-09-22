"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  createRoom,
  getMyActiveRoom,
  joinRoomByCode,
  roomPath,
  type ActiveRoomLobby,
  type ImpostorRoomsClient
} from "../../lib/supabase/impostor-rooms";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState
} from "../../lib/supabase/platform-bootstrap";

type EntryState =
  | { status: "loading" }
  | { status: "ready"; activeRoom: ActiveRoomLobby | null }
  | { status: "error"; message: string };

function roomsClient(): ImpostorRoomsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
}

export function TuttiFruttiEntryShell() {
  const router = useRouter();
  const [platform, setPlatform] = useState<PlatformBootstrapState>({ status: "loading" });
  const [entry, setEntry] = useState<EntryState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void bootstrapPlatformContext(createBrowserSupabaseClient() as unknown as PlatformBootstrapClient)
      .then(async (state) => {
        if (!active) return;
        setPlatform(state);
        if (state.status !== "recognized") return;
        try {
          const activeRoom = await getMyActiveRoom(roomsClient());
          if (active) setEntry({ status: "ready", activeRoom });
        } catch {
          if (active) setEntry({ status: "error", message: "No pudimos comprobar tu sala activa." });
        }
      });
    return () => { active = false; };
  }, []);

  async function submit(action: "create" | "join", code?: string) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const lobby = action === "create"
        ? await createRoom(roomsClient(), "tutti_frutti")
        : await joinRoomByCode(roomsClient(), code ?? "", "tutti_frutti");
      router.push(roomPath("tutti_frutti", lobby.room.code));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No pudimos entrar a la sala.");
      setBusy(false);
    }
  }

  function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("roomCode") ?? "");
    void submit("join", code);
  }

  if (platform.status === "loading" || (platform.status === "recognized" && entry.status === "loading")) {
    return <p aria-live="polite">Comprobando tu grupo y sala activa...</p>;
  }
  if (platform.status !== "recognized") {
    return (
      <section className="impostor-platform-context">
        <p>Necesitás entrar a un grupo antes de crear o unirte a una sala.</p>
        <Link className="impostor-action impostor-action--primary" href="/grupo">Ir a mi grupo</Link>
      </section>
    );
  }
  if (entry.status === "error") {
    return <p role="alert">{entry.message}</p>;
  }
  if (entry.status === "ready" && entry.activeRoom) {
    const { room } = entry.activeRoom;
    return (
      <section className="impostor-platform-context">
        <p>Ya tenés una sala activa{room.gameType === "impostor" ? " de Impostor" : " de Tutti Frutti"}.</p>
        <Link className="impostor-action impostor-action--primary" href={roomPath(room.gameType, room.code)}>
          Volver a la sala
        </Link>
      </section>
    );
  }

  return (
    <section className="impostor-platform-context" aria-labelledby="tutti-frutti-entry-title">
      <h2 id="tutti-frutti-entry-title">Entrar a una sala</h2>
      <p>Hola, {platform.player.nickname}. Podés crear una sala o usar un código de tu grupo.</p>
      <button className="impostor-action impostor-action--primary" type="button" disabled={busy} onClick={() => void submit("create")}>
        {busy ? "Un momento..." : "Crear sala"}
      </button>
      <form className="impostor-create-group impostor-room-join-step" onSubmit={onJoin}>
        <label className="impostor-field">
          <span>Código de sala</span>
          <input name="roomCode" type="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={8} required disabled={busy} />
        </label>
        <button className="impostor-action" type="submit" disabled={busy}>Unirme a una sala</button>
      </form>
      {actionError ? <p role="alert">{actionError}</p> : null}
    </section>
  );
}
