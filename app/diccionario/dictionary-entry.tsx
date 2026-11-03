"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import { bootstrapPlatformContext, type PlatformBootstrapClient, type PlatformBootstrapState } from "../../lib/supabase/platform-bootstrap";
import { createRoom, getMyActiveRoom, joinRoomByCode, roomPath, type ActiveRoomLobby, type ImpostorRoomsClient } from "../../lib/supabase/impostor-rooms";
import { dictionaryAvailable, dictionaryError } from "../../lib/supabase/dictionary";
export function DictionaryHomeCard() {
    const [enabled, setEnabled] = useState(false);
    useEffect(() => { let live = true; void dictionaryAvailable(createBrowserSupabaseClient()).then(v => { if (live)
        setEnabled(v); }).catch(() => { }); return () => { live = false; }; }, []);
    if (!enabled)
        return null;
    return (
        <section className="game-entry" aria-labelledby="dictionary-entry-title">
            <div className="game-entry__art game-entry__art--dictionary" aria-hidden="true">
                <svg viewBox="0 0 96 96" fill="none" focusable="false">
                    <path d="M48 24C37 17 23 16 12 20v54c12-4 25-3 36 4 11-7 24-8 36-4V20c-11-4-25-3-36 4Z" fill="currentColor" />
                    <path d="M48 25v52M23 33c5-1 10 0 15 2M23 44c5-1 10 0 15 2M23 55c5-1 10 0 15 2M59 47c5-2 10-3 15-2M59 58c5-2 10-3 15-2" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M61 18h12v21l-6-4-6 4V18Z" fill="var(--accent)" />
                </svg>
            </div>
            <div className="game-entry__content">
                <p className="game-entry__label">Juegos</p>
                <h2 id="dictionary-entry-title">Diccionario</h2>
                <p>Inventá una definición. Encontrá la verdadera.</p>
                <Link className="game-entry__cta" href="/diccionario">Ir a Diccionario</Link>
            </div>
        </section>
    );
}
export function DictionaryEntry() {
    const router = useRouter();
    const [platform, setPlatform] = useState<PlatformBootstrapState>({ status: "loading" });
    const [room, setRoom] = useState<ActiveRoomLobby | null>(null);
    const [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        const client = createBrowserSupabaseClient();
        void bootstrapPlatformContext(client as unknown as PlatformBootstrapClient).then(async (p) => {
            if (!live)
                return;
            setPlatform(p);
            if (p.status !== "recognized")
                return;
            const [active, available] = await Promise.all([getMyActiveRoom(client as unknown as ImpostorRoomsClient), dictionaryAvailable(client)]);
            if (live) {
                setRoom(active);
                setEnabled(available);
                setReady(true);
            }
        }).catch(() => { if (live)
            setError("No pudimos comprobar tu grupo y sala. Volvé a intentar."); });
        return () => { live = false; };
    }, []);
    async function enter(action: "create" | "join", code = "") {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const c = createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
            const lobby = action === "create" ? await createRoom(c, "dictionary") : await joinRoomByCode(c, code, "dictionary");
            router.push(roomPath("dictionary", lobby.room.code));
        }
        catch (e) {
            setError(dictionaryError(e).message);
            setBusy(false);
        }
    }
    function join(e: FormEvent<HTMLFormElement>) { e.preventDefault(); void enter("join", String(new FormData(e.currentTarget).get("code") ?? "")); }
    if (error && !ready)
        return <div role="alert">{error} <button type="button" onClick={() => location.reload()}>Reintentar</button></div>;
    if (platform.status === "loading" || (platform.status === "recognized" && !ready))
        return <p role="status">Comprobando tu grupo y sala…</p>;
    if (platform.status !== "recognized")
        return <p>Entrá a tu grupo desde <Link href="/">Juegos Familiares</Link> para jugar.</p>;
    if (room)
        return <><p>Ya tenés una sala activa.</p><Link className="impostor-action impostor-action--primary" href={roomPath(room.room.gameType, room.room.code)}>Volver a la sala</Link></>;
    return <section className="impostor-platform-context"><p>Hola, {platform.player.nickname}.</p>{enabled ? <button className="impostor-action impostor-action--primary" disabled={busy} onClick={() => void enter("create")}>Crear sala</button> : <p>Estamos preparando el catálogo. Diccionario todavía no está habilitado.</p>}
    <form onSubmit={join} className="impostor-create-group"><label className="impostor-field">Código de sala<input name="code" required autoCapitalize="characters" maxLength={32} disabled={busy}/></label><button className="impostor-action" disabled={busy}>Unirme a una sala</button></form>{error && <p role="alert">{error}</p>}</section>;
}
