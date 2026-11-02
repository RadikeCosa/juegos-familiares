"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import { leaveDictionaryRoom, dictionaryRpc, normalizeDictionaryDefinition, type DictionaryOperation, type DictionaryState } from "../../lib/supabase/dictionary";
import styles from "./dictionary.module.css";
type PendingAction = {
    operation: DictionaryOperation;
    args: Record<string, unknown>;
};
const endMessages: Record<string, string> = {
    completed: "Partida completada", host_ended: "El anfitrión finalizó la partida",
    inactivity: "La sala venció tras 24 horas sin actividad", duration: "La partida alcanzó su duración máxima de 72 horas", host_closed: "El anfitrión cerró la sala"
};
export function DictionaryRoom({ code, sessionId, initialLobby = false }: {
    code?: string;
    sessionId?: string;
    initialLobby?: boolean;
}) {
    const router = useRouter();
    const [state, setState] = useState<DictionaryState | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [definition, setDefinition] = useState(""), [selection, setSelection] = useState("");
    const [lobby, setLobby] = useState(initialLobby), [confirm, setConfirm] = useState<PendingAction | null>(null), [pending, setPending] = useState<PendingAction | null>(null);
    const sequence = useRef(0), actionActive = useRef(false), identity = useRef(0), lastRound = useRef<string | null>(null);
    const request = useCallback(async (operation: DictionaryOperation, args: Record<string, unknown>) => {
        const n = ++sequence.current;
        const value = await dictionaryRpc(createBrowserSupabaseClient(), operation, args);
        if (n === sequence.current) {
            setState(value);
            setConnectionError(null);
            if (value.round?.id !== lastRound.current) {
                lastRound.current = value.round?.id ?? null;
                setDefinition("");
                setSelection("");
                setConfirm(null);
                setPending(null);
            }
            if (value.roomStatus === "playing")
                setLobby(false);
        }
        return value;
    }, []);
    const load = useCallback(() => request("get_dictionary_state", sessionId ? { target_session_id: sessionId } : { room_code: code }), [request, sessionId, code]);
    useEffect(() => {
        let alive = true;
        const id = ++identity.current;
        let refreshing = false;
        async function refresh() {
            if (!alive || refreshing || actionActive.current || document.visibilityState !== "visible") return;
            refreshing = true;
            try { await load(); }
            catch (e) {
                if (alive && identity.current === id) setConnectionError(e instanceof Error ? e.message : "No pudimos cargar la partida.");
            } finally { refreshing = false; }
        }
        void refresh();
        const timer = setInterval(() => void refresh(), 5000);
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("online", refresh);
        return () => { alive = false; ++sequence.current; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
    }, [load]);
    const roomId = state?.roomId, roomStatus = state?.roomStatus;
    useEffect(() => {
        if (!roomId || roomStatus === "closed" || sessionId)
            return;
        let live = true;
        async function heartbeat() {
            if (!live || document.visibilityState !== "visible")
                return;
            try {
                await request("heartbeat_dictionary_room", { target_room_id: roomId });
            }
            catch { /* The state poll surfaces recovery failures. */ }
        }
        void heartbeat();
        const timer = setInterval(() => void heartbeat(), 30000);
        document.addEventListener("visibilitychange", heartbeat);
        return () => { live = false; clearInterval(timer); document.removeEventListener("visibilitychange", heartbeat); };
    }, [roomId, roomStatus, sessionId, request]);
    useEffect(() => {
        if (!roomId)
            return;
        const client = createBrowserSupabaseClient();
        const channel = client.channel(`dictionary-signal:${roomId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "dictionary_signals", filter: `room_id=eq.${roomId}` }, () => { void load().catch(() => { }); }).subscribe();
        return () => { void client.removeChannel(channel); };
    }, [roomId, load]);
    async function act(action: PendingAction) {
        if (actionActive.current)
            return;
        actionActive.current = true;
        setBusy(true);
        setError(null);
        setConfirm(null);
        setPending(action);
        try {
            await request(action.operation, action.args);
            setPending(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "No pudimos confirmar la acción.");
        }
        finally {
            actionActive.current = false;
            setBusy(false);
        }
    }
    function action(operation: DictionaryOperation, args: Record<string, unknown> = {}) { return { operation, args: { target_room_id: state?.roomId, ...args } }; }
    async function exit() {
        if (busy || !state)
            return;
        setBusy(true);
        try {
            await leaveDictionaryRoom(createBrowserSupabaseClient(), state.roomId);
            router.push("/diccionario");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "No pudimos salir.");
            setBusy(false);
        }
    }
    function submitDefinition(e: FormEvent) { e.preventDefault(); if (!state?.round)
        return; setConfirm(action("submit_dictionary_definition", { target_round_id: state.round.id, definition_text: definition })); }
    const visibleError = error ?? connectionError;
    if (!state)
        return <section className={styles.content}>{visibleError ? <><p role="alert">{visibleError}</p><button className="impostor-action" onClick={() => void load().catch(e => setError(e.message))}>Reintentar</button><Link href="/diccionario">Volver a Diccionario</Link></> : <p role="status">Comprobando sala…</p>}</section>;
    const round = state.round;
    const isLobby = state.roomStatus === "lobby" && (!state.sessionId || lobby);
    const ended = !!state.endedReason || state.roomStatus === "closed";
    const preview = normalizeDictionaryDefinition(definition), length = Array.from(preview).length;
    const roster = isLobby ? state.lobbyParticipants : state.participants;
    return <section className={styles.content} aria-labelledby="dictionary-heading">
    <header className={styles.header}><div><p className="impostor-kicker">Diccionario · Sala {state.code}</p><h1 id="dictionary-heading">{isLobby ? "Listos para inventar" : ended ? "Resultado de la partida" : `Ronda ${round?.number ?? 1} de ${state.roundCount}`}</h1></div></header>
    {visibleError && <div role="alert"><p>{visibleError}</p>{pending && <button className="impostor-action" disabled={busy} onClick={() => void act(pending)}>Reintentar la misma acción</button>}</div>}
    {isLobby ? <>
      <p>Se necesitan al menos 3 jugadores. El anfitrión inicia cuando estén todos.</p>
      <label className="impostor-field">Cantidad de rondas<select value={state.configuration} disabled={!state.isHost || busy} onChange={e => void act(action("save_dictionary_configuration", { requested_round_count: Number(e.target.value) }))}>{[3, 5, 10].map(n => <option key={n} value={n} disabled={!state.availableRounds.includes(n)}>{n} rondas</option>)}</select></label>
      {!state.availableRounds.includes(state.configuration) && <p>No alcanzan las palabras nuevas para esa cantidad. Elegí menos rondas o esperá una ampliación del catálogo.</p>}
      {!state.enabled && <p>Estamos preparando el catálogo. El inicio está deshabilitado.</p>}
      {state.isHost ? <button className="impostor-action impostor-action--primary" disabled={busy || !state.enabled || roster.length < 3 || !state.availableRounds.includes(state.configuration)} onClick={() => void act(action("start_dictionary_session", { request_id: crypto.randomUUID() }))}>Iniciar partida</button> : <p>Esperando al anfitrión.</p>}
    </> : ended ? <>
      <p role="status">{endMessages[state.endedReason ?? state.closedReason ?? ""] ?? "La sala está cerrada"}.</p>
      <p>{state.resolvedRounds === 0 ? "No hubo rondas resueltas. La ronda incompleta no se revela ni suma puntos." : `${state.resolvedRounds} ronda${state.resolvedRounds === 1 ? "" : "s"} resuelta${state.resolvedRounds === 1 ? "" : "s"}.`}</p>
      {state.round?.phase === "RESULT" && <section><h2>Última ronda: {state.round.word}</h2><ol className={styles.results}>{state.round.options.map(o => <li key={o.id}><strong>{o.isReal ? "Definición verdadera" : o.author}</strong><p>{o.text}</p><span>{o.votes} votos</span></li>)}</ol></section>}
      <Ranking state={state}/>
      {state.roomStatus === "lobby" ? <button className="impostor-action" onClick={() => { if (sessionId)
            router.push(`/diccionario/sala/${encodeURIComponent(state.code)}?lobby=1`);
        else
            setLobby(true); }}>Volver al lobby</button> : <Link className="impostor-action" href="/diccionario">Crear o buscar otra sala</Link>}
    </> : round && <>
      <p className={styles.word}>{round.word}</p>
      {round.phase === "WRITING" ? <>
        {round.ownDefinition ? <div><h2>Definición enviada</h2><p>{round.ownDefinition}</p><p role="status">Esperando las demás definiciones.</p></div> : <form onSubmit={submitDefinition}>
          <label className="impostor-field">Tu definición inventada<textarea value={definition} onChange={e => setDefinition(e.target.value)} disabled={busy} rows={4} aria-describedby="definition-help definition-length"/></label>
          <p id="definition-length">{length}/300 caracteres al enviar.</p>
          <div id="definition-help" className={styles.tips}><h2>Para que suene creíble</h2><ul><li>Escribí breve e impersonalmente.</li><li>Revisá la ortografía con el corrector de tu teléfono.</li><li>Evitá referencias propias o frases que te identifiquen.</li><li>Probá: «Instrumento que sirve para…», «Acción y efecto de…» o «Dicho de una persona que…».</li></ul></div>
          <p>Una vez enviada, no se puede cambiar.</p><button className="impostor-action impostor-action--primary" disabled={busy || !preview || length > 300}>Revisar y enviar</button>
        </form>}
      </> : round.phase === "VOTING" ? <>
        <h2>¿Cuál es la verdadera?</h2><p>Las opciones están en el mismo orden para todos. Tu definición no se puede votar.</p>
        <fieldset className={styles.options} disabled={busy || !!round.ownVote}><legend>Elegí una definición</legend>{round.options.map(o => <label className={styles.option} key={o.id}><input type="radio" name="definition" value={o.id} checked={(round.ownVote ?? selection) === o.id} disabled={!o.canVote || !!round.ownVote} onChange={() => setSelection(o.id)}/><span><strong>Opción {o.position}</strong><br />{o.text}{!o.canVote && <small>Tu definición</small>}</span></label>)}</fieldset>
        {round.ownVote ? <p role="status">Voto confirmado. Esperando a los demás.</p> : <><p>Una vez confirmado, no se puede cambiar.</p><button className="impostor-action impostor-action--primary" disabled={!selection || busy} onClick={() => setConfirm(action("submit_dictionary_vote", { target_round_id: round.id, target_option_id: selection }))}>Confirmar voto</button></>}
      </> : <>
        <h2>La verdadera y sus autores</h2><ol className={styles.results}>{round.options.map(o => <li key={o.id}><strong>{o.isReal ? "Definición verdadera" : o.author}</strong><p>{o.text}</p><span>{o.votes} voto{o.votes === 1 ? "" : "s"}</span></li>)}</ol><Ranking state={state}/>
        {state.isHost ? <button className="impostor-action impostor-action--primary" disabled={busy} onClick={() => void act(action("advance_dictionary_round", { target_round_id: round.id }))}>Siguiente ronda</button> : <p>Esperando al anfitrión para avanzar.</p>}
      </>}
    </>}
    {!ended && <details className={styles.roster} open={isLobby}><summary>Jugadores ({roster.length})</summary><ul>{roster.map(p => <li key={p.playerId}>{p.nickname}{p.isSelf ? " (vos)" : ""}{p.isHost ? " · Anfitrión" : ""}{!isLobby && round?.phase === "WRITING" ? (p.hasSubmitted ? " · Envió" : " · Falta enviar") : !isLobby && round?.phase === "VOTING" ? (p.hasVoted ? " · Votó" : " · Falta votar") : ""}</li>)}</ul></details>}
    {!isLobby && !ended && state.deadlineAt && <p className={styles.deadline}>Duración máxima: hasta {new Date(state.deadlineAt).toLocaleString("es-AR")}. La sala también vence tras 24 horas sin actividad de nadie.</p>}
    {isLobby ? <button className="impostor-action" disabled={busy} onClick={() => { if (window.confirm(state.isHost ? "¿Cerrar esta sala?" : "¿Salir de esta sala?"))
        void exit(); }}>{state.isHost ? "Cerrar sala" : "Salir de la sala"}</button> : !ended && state.isHost && <button className="impostor-action" disabled={busy} onClick={() => setConfirm(action("finish_dictionary_session", { target_session_id: state.sessionId }))}>Finalizar partida</button>}
    {state.sessionId && ended && !sessionId && <Link href={`/diccionario/resultado/${state.sessionId}`}>Enlace al resultado</Link>}
    {confirm && <Confirmation onCancel={() => setConfirm(null)}>
      <h2 id="confirmation-title">{confirm.operation === "submit_dictionary_definition" ? "¿Enviar esta definición?" : confirm.operation === "submit_dictionary_vote" ? "¿Confirmar este voto?" : "¿Finalizar la partida?"}</h2>
      {confirm.operation === "submit_dictionary_definition" ? <p>{normalizeDictionaryDefinition(String(confirm.args.definition_text))}</p> : confirm.operation === "submit_dictionary_vote" ? <p>{round?.options.find(o => o.id === confirm.args.target_option_id)?.text}</p> : <p>Se conservan las rondas resueltas. La ronda incompleta no se revela ni puntúa.</p>}
      <p>{confirm.operation !== "finish_dictionary_session" ? "Este envío es definitivo." : "Podrán iniciar otra partida desde el lobby."}</p>
      <div className={styles.actions}><button autoFocus className="impostor-action" onClick={() => setConfirm(null)}>Volver</button><button className="impostor-action impostor-action--primary" disabled={busy} onClick={() => void act(confirm)}>Confirmar</button></div>
    </Confirmation>}
  </section>;
}
function Ranking({ state }: {
    state: DictionaryState;
}) {
    return <section><h2>Clasificación</h2><ol className={styles.ranking}>{state.totals.map((p) => { const position = state.totals.findIndex(q => q.totalPoints === p.totalPoints) + 1; return <li value={position} key={p.playerId}><span>{p.nickname}</span><span>{p.totalPoints} puntos{state.round?.phase === "RESULT" ? ` (+${p.roundPoints} esta ronda)` : ""}</span></li>; })}</ol></section>;
}
function Confirmation({ children, onCancel }: {
    children: ReactNode;
    onCancel: () => void;
}) {
    const element = useRef<HTMLDialogElement>(null);
    useEffect(() => { const dialog = element.current; dialog?.showModal(); return () => dialog?.close(); }, []);
    return <dialog ref={element} aria-labelledby="confirmation-title" className={styles.confirmation} onCancel={onCancel}>{children}</dialog>;
}
