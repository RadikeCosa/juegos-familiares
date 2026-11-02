import Link from "next/link";
import { DictionaryRoom } from "../../dictionary-room";
export const metadata = { title: "Sala | Diccionario" };
export default async function DictionaryRoomPage({ params, searchParams }: {
    params: Promise<{
        code: string;
    }>;
    searchParams: Promise<{
        lobby?: string;
    }>;
}) { const { code } = await params; const query = await searchParams; return <main className="impostor impostor--room"><a className="skip-link" href="#contenido">Saltar al contenido</a><div className="impostor-shell" id="contenido"><nav className="impostor-nav"><Link className="impostor-back" href="/diccionario">Diccionario</Link></nav><DictionaryRoom key={code} code={code} initialLobby={query.lobby === "1"}/></div></main>; }
