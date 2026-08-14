import type { Metadata } from "next";
import Link from "next/link";
import { ImpostorJoinByLinkActions } from "../../anonymous-onboarding-actions";

export const metadata: Metadata = {
  title: "Unirse a grupo | Impostor",
  description: "Aceptá una invitación a un grupo de Juegos Familiares."
};

type ImpostorJoinPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function ImpostorJoinPage({
  params
}: ImpostorJoinPageProps) {
  const { code } = await params;

  return (
    <main className="impostor">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="impostor-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación del juego">
          <Link className="impostor-back" href="/impostor">
            Impostor
          </Link>
        </nav>

        <section className="impostor-hero" aria-labelledby="impostor-join-title">
          <div className="impostor-hero__content">
            <p className="impostor-kicker">Invitación</p>
            <h1 id="impostor-join-title">Impostor</h1>
            <p className="impostor-lede">
              Te invitaron a un grupo de Juegos Familiares.
            </p>
            <ImpostorJoinByLinkActions invitationCode={code} />
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
      </div>
    </main>
  );
}
