import type { Metadata } from "next";
import Link from "next/link";
import { ImpostorRoomLobbyShell } from "./room-lobby-shell";

export const metadata: Metadata = {
  title: "Sala | Impostor",
  description: "Lobby de una sala de Impostor.",
};

type ImpostorRoomPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function ImpostorRoomPage({
  params,
}: ImpostorRoomPageProps) {
  const { code } = await params;

  return (
    <main className="impostor impostor--room">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación de la sala">
          <Link className="impostor-back" href="/impostor/grupo">
            Tu grupo
          </Link>
        </nav>

        <ImpostorRoomLobbyShell roomCode={code} />
      </div>
    </main>
  );
}
