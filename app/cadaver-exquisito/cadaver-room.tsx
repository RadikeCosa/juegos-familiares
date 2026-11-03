"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import { cadaverError, cadaverRpc, parseCadaverState, type CadaverOperation, type CadaverState } from "../../lib/supabase/cadaver-exquisito";
import { contributionWords, normalizeContribution, remainingMilliseconds } from "../../lib/cadaver-exquisito/words";
import { formatRoomJoinCode } from "../../lib/supabase/impostor-rooms";
import styles from "./cadaver.module.css";
type Action = { operation: CadaverOperation; args: Record<string, unknown> };
const terminal = (state: CadaverState) => ["completed", "expired", "cancelled"].includes(state.status);
export function CadaverRoom({ code }: { code: string }) {
  const [state, setState] = useState<CadaverState | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [left, setLeft] = useState(false), [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<Action | null>(null), [pending, setPending] = useState<Action | null>(null);
  const active = useRef(false), current = useRef<CadaverState | null>(null), sequence = useRef(0);
  const draftKey = useRef<string | null>(null), serverClock = useRef({ received: 0, expires: "", now: "" });
  const [remaining, setRemaining] = useState<number | null>(null);
  const stopped = left || !!state && (terminal(state) || !state.occupied);
  const apply = useCallback((value: CadaverState, started: number) => {
    current.current = value;
    serverClock.current = { received: started, expires: value.expiresAt, now: value.serverNow };
    setRemaining(remainingMilliseconds(value.expiresAt, value.serverNow, performance.now() - started));
    const key = value.occupied && value.status === "writing" && value.writerId === value.playerId
      ? `cadaver-draft:${value.playerId}:${value.sessionId}:${value.turn}` : null;
    if (key !== draftKey.current) {
      try {
        if (draftKey.current) sessionStorage.removeItem(draftKey.current);
        setDraft(key ? sessionStorage.getItem(key) ?? "" : "");
      } catch { setDraft(""); }
      draftKey.current = key;
      setConfirm(null);
    }
    if (terminal(value)) {
      // Clear stale turn keys too, including after a reload following cancellation.
      try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(`cadaver-draft:${value.playerId}:${value.sessionId}:`)) sessionStorage.removeItem(key); } catch { /* Storage is optional. */ }
      setPending(null);
    }
    setState(value);
  }, []);
  const load = useCallback(async () => {
    const n = ++sequence.current, started = performance.now();
    const data = await cadaverRpc(createBrowserSupabaseClient(), "get_cadaver_state", { room_code: code });
    const value = parseCadaverState(data);
    if (n === sequence.current) apply(value, started);
  }, [code, apply]);
  useEffect(() => {
    if (stopped) return;
    let live = true, refreshing = false, delay = 15_000;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      clearTimeout(timer);
      if (!live || document.visibilityState !== "visible") return;
      if (refreshing || active.current) { timer = setTimeout(refresh, 1000); return; }
      refreshing = true;
      try { await load(); if (live) { setError(null); delay = 15_000; } }
      catch (e) { if (live) { setError(e instanceof Error ? e.message : "No pudimos recuperar la sala."); delay = Math.min(delay * 2, 60_000); } }
      finally { refreshing = false; if (live) timer = setTimeout(refresh, delay); }
    }
    void refresh();
    document.addEventListener("visibilitychange", refresh); window.addEventListener("online", refresh); window.addEventListener("focus", refresh);
    const invalidate = () => { ++sequence.current; };
    return () => { live = false; invalidate(); clearTimeout(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); };
  }, [load, stopped]);
  useEffect(() => {
    if (!state?.roomId || stopped) return;
    const client = createBrowserSupabaseClient();
    const channel = client.channel(`cadaver:${state.roomId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "cadaver_signals", filter: `room_id=eq.${state.roomId}` }, () => {
      if (!active.current && document.visibilityState === "visible") void load().catch(() => {});
    }).subscribe(status => { if (status === "SUBSCRIBED" && !active.current && document.visibilityState === "visible") void load().catch(() => {}); });
    let live = true;
    async function heartbeat() {
      if (!live || active.current || document.visibilityState !== "visible") return;
      try { await cadaverRpc(client, "heartbeat_cadaver_room", { target_room_id: current.current?.roomId }); } catch { /* State polling handles recovery. */ }
    }
    void heartbeat();
    const timer = setInterval(heartbeat, 30_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => { live = false; clearInterval(timer); document.removeEventListener("visibilitychange", heartbeat); void client.removeChannel(channel); };
  }, [state?.roomId, stopped, load]);
  useEffect(() => {
    const timer = setInterval(() => {
      const clock = serverClock.current;
      if (clock.now) setRemaining(remainingMilliseconds(clock.expires, clock.now, performance.now() - clock.received));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  function edit(text: string) {
    setDraft(text);
    try { if (draftKey.current) sessionStorage.setItem(draftKey.current, text); } catch { /* Do not block writing when storage is unavailable. */ }
  }
  async function act(action: Action) {
    if (active.current) return;
    active.current = true; ++sequence.current; setBusy(true); setConfirm(null); setError(null); setPending(action);
    const started = performance.now();
    try {
      const data = await cadaverRpc(createBrowserSupabaseClient(), action.operation, action.args);
      if (action.operation === "leave_cadaver_room") {
        try { if (draftKey.current) sessionStorage.removeItem(draftKey.current); } catch { /* Optional storage. */ }
        draftKey.current = null; setDraft(""); setLeft(true); setPending(null); return;
      }
      apply(parseCadaverState(data), started);
      setPending(null);
      if (data && typeof data === "object" && "actionError" in data) setError(cadaverError({ code: data.actionError }).message);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos confirmar la acción."); }
    finally { active.current = false; setBusy(false); }
  }
  function action(operation: CadaverOperation, args: Record<string, unknown> = {}): Action { return { operation, args: { target_room_id: state?.roomId, ...args } }; }
  if (left) return <section className={styles.content}><h1>Saliste de la sala</h1><p>Si la partida comenzó, conserva tu posición. Podés regresar con el mismo código mientras no venza.</p><Link href="/cadaver-exquisito">Crear, unirme o regresar</Link></section>;
  if (!state) return <section className={styles.content}>{error ? <><p role="alert">{error}</p><button className="impostor-action" onClick={() => void load().catch(e => setError(e.message))}>Reintentar</button><Link href="/cadaver-exquisito">Volver</Link></> : <p role="status">Comprobando sala…</p>}</section>;
  const writer = state.participants.find(p => p.playerId === state.writerId);
  const ownTurn = state.status === "writing" && state.occupied && state.writerId === state.playerId;
  const count = contributionWords(draft).length;
  return <section className={styles.content} aria-labelledby="cadaver-heading">
    <header><p className="impostor-kicker">Cadáver exquisito · Sala {formatRoomJoinCode(state.code)}</p><h1 id="cadaver-heading">{state.status === "lobby" ? "Antes de la primera palabra" : state.status === "writing" ? `Ronda ${state.round} de ${state.roundCount}` : state.status === "completed" ? "La historia está lista" : state.status === "expired" ? "La sala venció" : "Partida cancelada"}</h1></header>
    {error && <div role="alert"><p>{error}</p>{pending && <button className="impostor-action" disabled={busy} onClick={() => void act(pending)}>Reintentar la misma acción</button>}</div>}
    {!terminal(state) && <p className={styles.deadline}>Vence el {new Date(state.expiresAt).toLocaleString("es-AR")}. {remaining !== null && `Quedan ${Math.floor(remaining / 3_600_000)} h ${Math.floor((remaining % 3_600_000) / 60_000)} min.`} Regresar no renueva el plazo.</p>}
    {!terminal(state) && !state.occupied ? <><p>Abandonaste esta sala. Para escribir o administrar tenés que regresar.</p><button className="impostor-action impostor-action--primary" disabled={busy} onClick={() => void act(action("return_cadaver_room"))}>Regresar a la sala</button></> : state.status === "lobby" ? <>
      <p>Compartí el código y esperen a todos. Cada persona escribirá una vez por ronda.</p>
      <button className="impostor-action" onClick={() => { void navigator.clipboard?.writeText(formatRoomJoinCode(state.code)).then(() => setError(null)).catch(() => setError("No pudimos copiarlo. Podés seleccionar el código.")); }}>Copiar código</button>
      <label className="impostor-field">Cantidad de rondas<select value={state.roundCount} disabled={!state.isHost || busy} onChange={e => void act(action("configure_cadaver_room", { requested_round_count: Number(e.target.value) }))}>{[3,5,7].map(n => <option key={n} value={n}>{n} rondas</option>)}</select></label>
      {state.isHost ? <button className="impostor-action impostor-action--primary" disabled={busy || state.participants.length < 2} onClick={() => setConfirm(action("start_cadaver_session", { expected_lobby_version: state.lobbyVersion, operation_id: crypto.randomUUID() }))}>Revisar participantes e iniciar</button> : <p role="status">Esperando al anfitrión.</p>}
    </> : state.status === "writing" ? ownTurn ? <>
      <h2>Es tu turno</h2>{state.hint ? <div className={styles.hint}><p>Las últimas tres palabras</p><strong>{state.hint}</strong></div> : <p>Inventá el comienzo de la historia.</p>}
      <form onSubmit={e => { e.preventDefault(); setConfirm(action("submit_cadaver_contribution", { target_session_id: state.sessionId, expected_turn: state.turn, operation_id: crypto.randomUUID(), contribution_text: draft })); }}>
        <div className="impostor-field"><label htmlFor="cadaver-contribution">Tu aporte</label><textarea id="cadaver-contribution" value={draft} onChange={e => edit(e.target.value)} rows={6} disabled={busy || !!pending} aria-describedby="cadaver-count cadaver-help" /></div>
        <p id="cadaver-count" aria-live="polite">{count} de 50 palabras · mínimo 3</p><p id="cadaver-help">Continuá la historia sin repetir la pista. Una vez enviado, no se puede cambiar.</p>
        <button className="impostor-action impostor-action--primary" disabled={busy || !!pending || count < 3 || count > 50}>Revisar y enviar</button>
      </form>
    </> : <p role="status">Esperando a {writer?.nickname}{writer && !writer.present ? " (abandonó la sala)" : " para continuar la historia"}.</p> : state.status === "completed" ? <Link className="impostor-action impostor-action--primary" href={`/cadaver-exquisito/historia/${state.sessionId}`}>Leer la historia completa</Link> : <p>Los aportes fueron eliminados. Esta partida no aparece en el historial.</p>}
    {!terminal(state) && <><h2>{state.status === "lobby" ? "Participantes" : "Orden de escritura"}</h2><ol className={styles.roster}>{state.participants.map(p => <li key={p.playerId}>{p.nickname}{p.isSelf ? " (vos)" : ""}{p.isHost ? " · Anfitrión" : ""} · {!p.present ? "Abandonó la sala" : p.connected ? "Conectado" : "Sin conexión reciente"}</li>)}</ol></>}
    {!terminal(state) && state.occupied && <div className={styles.actions}><button className="impostor-action" disabled={busy} onClick={() => setConfirm(action("leave_cadaver_room"))}>Abandonar sala</button>{state.isHost && <button className="impostor-action" disabled={busy} onClick={() => setConfirm(action("cancel_cadaver_room"))}>Cancelar partida</button>}</div>}
    <Link href="/cadaver-exquisito/historial">Historias del grupo</Link>
    {confirm && <Confirmation onCancel={() => setConfirm(null)}>
      <h2 id="cadaver-confirm-title">{confirm.operation === "start_cadaver_session" ? "¿Empezamos con estas personas?" : confirm.operation === "submit_cadaver_contribution" ? "¿Enviar este aporte definitivo?" : confirm.operation === "leave_cadaver_room" ? "¿Abandonar la sala?" : "¿Cancelar para todos?"}</h2>
      {confirm.operation === "start_cadaver_session" ? <><ul>{state.participants.map(p => <li key={p.playerId}>{p.nickname} · {p.connected ? "Conectado" : "Sin conexión reciente"}</li>)}</ul><p>{state.roundCount} rondas. Después del inicio no se suman escritores.</p></> : confirm.operation === "submit_cadaver_contribution" ? <p>{normalizeContribution(String(confirm.args.contribution_text))}</p> : confirm.operation === "leave_cadaver_room" ? <p>Tu borrador se descarta y tu lugar queda libre.{state.status === "writing" && " La historia conserva tu turno y puede quedar esperando hasta que regreses o venza."}</p> : <p>Se borrarán todos los aportes y se liberarán los lugares. No habrá historia en el historial.</p>}
      <div className={styles.actions}><button className="impostor-action" autoFocus onClick={() => setConfirm(null)}>Volver</button><button className="impostor-action impostor-action--primary" disabled={busy || (confirm.operation === "start_cadaver_session" && confirm.args.expected_lobby_version !== state.lobbyVersion)} onClick={() => void act(confirm)}>Confirmar</button></div>
      {confirm.operation === "start_cadaver_session" && confirm.args.expected_lobby_version !== state.lobbyVersion && <p role="alert">Cambió la lista o configuración. Volvé a revisarla.</p>}
    </Confirmation>}
  </section>;
}
function Confirmation({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="cadaver-confirm-title" onCancel={onCancel}>{children}</dialog>;
}
