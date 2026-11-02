import Link from "next/link";
import { DictionaryRoom } from "../../dictionary-room";
export const metadata = { title: "Resultado | Diccionario" };
export default async function DictionaryResultPage({ params }: {
    params: Promise<{
        sessionId: string;
    }>;
}) { const { sessionId } = await params; return <main className="impostor"><a className="skip-link" href="#contenido">Saltar al contenido</a><div className="impostor-shell" id="contenido"><nav className="impostor-nav"><Link className="impostor-back" href="/diccionario">Diccionario</Link></nav><DictionaryRoom key={sessionId} sessionId={sessionId}/></div></main>; }
