import type { Metadata } from "next";
import Link from "next/link";
import { TuttiFruttiRoomEntry } from "./tutti-frutti-room-entry";

export const metadata: Metadata = {
  title: "Sala | Tutti Frutti",
  description: "Sala de Tutti Frutti."
};

export default async function TuttiFruttiRoomPage({ params, searchParams }: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ postgame?: string | string[] }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const postgameSessionId = typeof query.postgame === "string" ? query.postgame : null;
  return (
    <main className="impostor impostor--room">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación de la sala">
          <Link className="impostor-back" href="/tutti-frutti">Tutti Frutti</Link>
        </nav>
        <TuttiFruttiRoomEntry code={code} postgameSessionId={postgameSessionId} />
      </div>
    </main>
  );
}
