import type { Metadata } from "next";
import Link from "next/link";
import { ImpostorGroupContextShell } from "./group-context-shell";

export const metadata: Metadata = {
  title: "Tu grupo | Impostor",
  description: "Integrantes del grupo de Juegos Familiares."
};

export default function ImpostorGroupPage() {
  return (
    <main className="impostor impostor--group">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación del grupo">
          <Link className="impostor-back" href="/impostor">
            Impostor
          </Link>
        </nav>

        <ImpostorGroupContextShell />
      </div>
    </main>
  );
}
