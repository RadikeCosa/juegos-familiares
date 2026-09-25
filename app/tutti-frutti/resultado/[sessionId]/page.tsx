import type { Metadata } from "next";
import Link from "next/link";
import { TuttiFruttiFinalResult } from "./tutti-frutti-final-result";

export const metadata: Metadata = {
  title: "Resultado final | Tutti Frutti",
  description: "Resultado final de una partida de Tutti Frutti."
};

export default async function TuttiFruttiFinalResultPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <main className="impostor impostor--room">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación del resultado">
          <Link className="impostor-back" href="/tutti-frutti">Tutti Frutti</Link>
        </nav>
        <TuttiFruttiFinalResult sessionId={sessionId} />
      </div>
    </main>
  );
}
