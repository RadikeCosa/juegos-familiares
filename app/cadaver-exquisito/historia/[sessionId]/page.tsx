import Link from "next/link";
import { CadaverHistory } from "../../cadaver-history";
export const metadata = { title: "Historia | Cadáver exquisito" };
export default async function StoryPage({ params }: { params: Promise<{ sessionId: string }> }) { const { sessionId } = await params; return <main className="impostor"><a className="skip-link" href="#contenido">Saltar al contenido</a><div className="impostor-shell" id="contenido"><nav className="impostor-nav"><Link className="impostor-back" href="/cadaver-exquisito">Cadáver exquisito</Link></nav><CadaverHistory key={sessionId} sessionId={sessionId} /></div></main>; }
