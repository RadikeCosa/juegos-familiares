import type { Metadata } from "next";
import Link from "next/link";
import { TuttiFruttiEntryShell } from "./tutti-frutti-entry-shell";

export const metadata: Metadata = {
  title: "Tutti Frutti | Juegos Familiares",
  description: "Creá o encontrá una sala de Tutti Frutti."
};

export default function TuttiFruttiPage() {
  return (
    <main className="impostor">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación del juego">
          <Link className="impostor-back" href="/">Juegos Familiares</Link>
        </nav>
        <section className="impostor-hero" aria-labelledby="tutti-frutti-title">
          <div className="impostor-hero__content">
            <p className="impostor-kicker">Juego presencial</p>
            <h1 id="tutti-frutti-title">Tutti Frutti</h1>
            <p className="impostor-lede">Elegí una sala para jugar con tu grupo.</p>
            <TuttiFruttiEntryShell />
          </div>
        </section>
      </div>
    </main>
  );
}
