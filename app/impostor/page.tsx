import type { Metadata } from "next";
import Link from "next/link";
import { ImpostorAnonymousOnboardingActions } from "./anonymous-onboarding-actions";

export const metadata: Metadata = {
  title: "Impostor | Juegos Familiares",
  description:
    "Un juego de pistas, sospechas y engaño para compartir en grupo."
};

export default function ImpostorPage() {
  return (
    <main className="impostor">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación del juego">
          <Link className="impostor-back" href="/">
            Juegos Familiares
          </Link>
        </nav>

        <section className="impostor-hero" aria-labelledby="impostor-title">
          <div className="impostor-hero__content">
            <p className="impostor-kicker">Juego presencial</p>
            <h1 id="impostor-title">Impostor</h1>
            <p className="impostor-lede">
              Un juego de pistas, sospechas y engaño para compartir en grupo.
            </p>
            <p className="impostor-copy">
              Todos conocen la palabra menos una persona. Hablen, sospechen y
              descubran quién es el impostor.
            </p>
            <ImpostorAnonymousOnboardingActions />
          </div>

          <div
            className="impostor-figure"
            aria-label="Cinco piezas geométricas, una distinta al resto"
            role="img"
          >
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className="impostor-note" aria-labelledby="impostor-app-role">
          <h2 id="impostor-app-role">La partida pasa entre ustedes.</h2>
          <p>
            Cada participante usa su teléfono. La app reparte los roles y se
            ocupa de la votación cuando llegue el momento.
          </p>
        </section>
      </div>
    </main>
  );
}
