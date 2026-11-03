"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import { cadaverRpc, parseCadaverHistory, parseCadaverStory, type CadaverStory, type CadaverStorySummary } from "../../lib/supabase/cadaver-exquisito";
import styles from "./cadaver.module.css";
export const storyTitle = (date: string) => `Historia del ${new Date(date).toLocaleString("es-AR")}`;
export function CadaverHistory({ sessionId }: { sessionId?: string }) {
  const [stories, setStories] = useState<CadaverStorySummary[] | null>(null), [story, setStory] = useState<CadaverStory | null>(null);
  const [offset, setOffset] = useState(0), [retry, setRetry] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const client = createBrowserSupabaseClient();
    void (sessionId ? cadaverRpc(client, "get_cadaver_story", { target_session_id: sessionId }) : cadaverRpc(client, "list_cadaver_stories", { page_offset: offset })).then(data => {
      if (!live) return;
      if (sessionId) setStory(parseCadaverStory(data)); else setStories(parseCadaverHistory(data));
      setError(null);
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : "No pudimos recuperar las historias."); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [sessionId, offset, retry]);
  function page(value: number) { setLoading(true); setOffset(value); }
  if (error) return <section className={styles.content}><h1>Historias del grupo</h1><p role="alert">{error}</p><button className="impostor-action" onClick={() => { setLoading(true); setRetry(v => v+1); }}>Reintentar</button><Link href="/">Ir a mi grupo</Link></section>;
  if (loading) return <p role="status">Recuperando historias…</p>;
  return <section className={styles.content}>{story ? <><h1>{storyTitle(story.finishedAt)}</h1><p>{story.roundCount} rondas · {story.contributions.length} aportes</p><ol className={styles.story}>{story.contributions.map(c => <li key={c.turn}><p>{c.text}</p><small>{c.author}</small></li>)}</ol><Link href="/cadaver-exquisito/historial">Ver todas las historias</Link></> : <>
    <h1>Historias del grupo</h1><p>Las historias terminadas quedan aquí para todos los integrantes del grupo.</p>
    {!stories?.length ? <p>Todavía no hay historias en esta página.</p> : <ol className={styles.story}>{stories.map(s => <li key={s.sessionId}><h2><Link href={`/cadaver-exquisito/historia/${s.sessionId}`}>{storyTitle(s.finishedAt)}</Link></h2><p>{s.participants.join(", ")} · {s.roundCount} rondas</p></li>)}</ol>}
    <nav className={styles.actions} aria-label="Páginas del historial"><button className="impostor-action" disabled={offset===0} onClick={() => page(Math.max(0,offset-20))}>Anteriores</button><button className="impostor-action" disabled={!stories || stories.length<20} onClick={() => page(offset+20)}>Siguientes</button></nav>
  </>}</section>;
}
