import Image from "next/image";
import { PlatformHomeContextShell } from "./platform-home-context-shell";

export default function Home() {
  return (
    <main className="home">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="home-shell" id="contenido">
        <section className="home-intro" aria-labelledby="app-title">
          <Image
            aria-hidden="true"
            className="home-symbol"
            src="/icon.svg"
            alt=""
            width={64}
            height={64}
            priority
          />
          <div>
            <h1 id="app-title">Juegos Familiares</h1>
            <p className="home-copy">
              Juegos simples para compartir en familia o con amigos.
            </p>
          </div>
        </section>

        <div className="home-game-stack">
          <PlatformHomeContextShell />
        </div>
      </div>
    </main>
  );
}
