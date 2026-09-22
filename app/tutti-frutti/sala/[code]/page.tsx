import type { Metadata } from "next";
import Link from "next/link";
import { TuttiFruttiRoomEntry } from "./tutti-frutti-room-entry";

export const metadata: Metadata = {
  title: "Sala | Tutti Frutti",
  description: "Sala de Tutti Frutti."
};

export default async function TuttiFruttiRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main className="impostor impostor--room">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación de la sala">
          <Link className="impostor-back" href="/tutti-frutti">Tutti Frutti</Link>
        </nav>
        <TuttiFruttiRoomEntry code={code} />
      </div>
    </main>
  );
}
