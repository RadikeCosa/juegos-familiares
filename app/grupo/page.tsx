import type { Metadata } from "next";
import Link from "next/link";
import { PlatformGroupContextShell } from "./platform-group-context-shell";

export const metadata: Metadata = {
  title: "Tu grupo | Juegos Familiares",
  description: "Integrantes e invitacion del grupo de Juegos Familiares."
};

export default function PlatformGroupPage() {
  return (
    <main className="impostor impostor--group">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegacion del grupo">
          <Link className="impostor-back" href="/">
            Juegos Familiares
          </Link>
          <Link className="impostor-action" href="/impostor">
            Impostor
          </Link>
        </nav>

        <PlatformGroupContextShell />
      </div>
    </main>
  );
}
