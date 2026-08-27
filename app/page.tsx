import Image from "next/image";
import Link from "next/link";
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

        <PlatformHomeContextShell />

        <section className="game-entry" aria-labelledby="games-title">
          <div className="game-entry__art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="game-entry__content">
            <p className="game-entry__label" id="games-title">
              Juegos
            </p>
            <h2>Impostor</h2>
            <p>
              Encontrá al impostor sin revelar demasiado.
            </p>
            <Link className="game-entry__cta" href="/impostor">
              Jugar
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
