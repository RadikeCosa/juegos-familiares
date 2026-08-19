import type { Metadata } from "next";
import Link from "next/link";
import { ImpostorWordBankShell } from "./word-bank-shell";

export const metadata: Metadata = {
  title: "Banco de palabras | Impostor",
  description: "Agregá y revisá tus palabras para Impostor."
};

export default function ImpostorGroupWordsPage() {
  return (
    <main className="impostor impostor--group">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación del banco">
          <Link className="impostor-back" href="/impostor/grupo">
            Tu grupo
          </Link>
        </nav>

        <ImpostorWordBankShell />
      </div>
    </main>
  );
}
