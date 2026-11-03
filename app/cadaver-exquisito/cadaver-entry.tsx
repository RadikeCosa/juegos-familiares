"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import { bootstrapPlatformContext, type PlatformBootstrapClient } from "../../lib/supabase/platform-bootstrap";
import { createRoom, joinRoomByCode, getMyActiveRoom, roomPath, type ImpostorRoomsClient, type ActiveRoomLobby } from "../../lib/supabase/impostor-rooms";
import { cadaverError } from "../../lib/supabase/cadaver-exquisito";
export function CadaverHomeCard() {
  return (
    <section className="game-entry" aria-labelledby="cadaver-entry-title">
      <div className="game-entry__art game-entry__art--cadaver" aria-hidden="true">
        <svg viewBox="0 0 96 96" fill="none" focusable="false">
          <path d="M22 14h33l15 15v45a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8Z" fill="currentColor" />
          <path d="M54 14v17h16M28 41h24M28 53h17M28 65h10" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m46 70 5-17 24-24a6 6 0 0 1 9 9L60 62l-14 8Z" fill="var(--accent)" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" />
          <path d="m69 35 9 9M51 53l9 9" stroke="var(--primary)" strokeWidth="3" />
        </svg>
      </div>
      <div className="game-entry__content">
        <p className="game-entry__label">Juegos</p>
        <h2 id="cadaver-entry-title">Cadáver exquisito</h2>
        <p>Una historia entre todos. Tres palabras para seguirla.</p>
        <Link className="game-entry__cta" href="/cadaver-exquisito">Ir a Cadáver exquisito</Link>
      </div>
    </section>
  );
}
export function CadaverEntry() {
  const router = useRouter();
  const [ready, setReady] = useState(false), [recognized, setRecognized] = useState(false), [busy, setBusy] = useState(false);
  const [active, setActive] = useState<ActiveRoomLobby | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const client = createBrowserSupabaseClient();
    void bootstrapPlatformContext(client as unknown as PlatformBootstrapClient).then(async context => {
      if (!live) return;
      setRecognized(context.status === "recognized");
      const room = context.status === "recognized" ? await getMyActiveRoom(client as unknown as ImpostorRoomsClient) : null;
      if (live) { setActive(room); setReady(true); }
    }).catch(() => { if (live) setError("No pudimos comprobar tu grupo y sala."); });
    return () => { live = false; };
  }, []);
  async function enter(action: "create" | "join", code = "") {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const client = createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
      const room = action === "create" ? await createRoom(client, "cadaver_exquisito") : await joinRoomByCode(client, code, "cadaver_exquisito");
      router.push(roomPath("cadaver_exquisito", room.room.code));
    } catch (e) { setError(e instanceof Error ? e.message : cadaverError(e).message); setBusy(false); }
  }
  function join(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void enter("join", String(new FormData(event.currentTarget).get("code") ?? "")); }
  if (!ready) return error ? <p role="alert">{error} <button className="impostor-action" onClick={() => location.reload()}>Reintentar</button></p> : <p role="status">Comprobando tu grupo y sala…</p>;
  if (!recognized) return <p>Entrá a tu grupo desde <Link href="/">Juegos Familiares</Link> para jugar.</p>;
  return <section className="impostor-platform-context">
    {active ? <p>Ya tenés una sala activa. <Link href={roomPath(active.room.gameType, active.room.code)}>Volver a la sala</Link></p> : <button className="impostor-action impostor-action--primary" disabled={busy} onClick={() => void enter("create")}>Crear sala</button>}
    <form onSubmit={join} className="impostor-create-group"><label className="impostor-field">Código de sala<input name="code" required maxLength={32} autoCapitalize="none" disabled={busy} /></label><button className="impostor-action" disabled={busy}>Unirme o regresar a una sala</button></form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
