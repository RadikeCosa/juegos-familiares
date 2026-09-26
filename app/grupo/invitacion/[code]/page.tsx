import type { Metadata } from "next";
import Link from "next/link";
import { PlatformGroupJoinByLinkActions } from "../../../platform-group-onboarding-actions";

export const metadata: Metadata = {
  title: "Unirse a grupo | Juegos Familiares",
  description: "Aceptá una invitación a un grupo de Juegos Familiares."
};

type GroupInvitationPageProps = { params: Promise<{ code: string }> };

export default async function GroupInvitationPage({ params }: GroupInvitationPageProps) {
  const { code } = await params;
  return (
    <main className="home">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="home-shell" id="contenido">
        <nav className="impostor-nav" aria-label="Navegación de Juegos Familiares">
          <Link className="impostor-back" href="/">Juegos Familiares</Link>
        </nav>
        <section className="home-platform-context" aria-labelledby="group-invitation-title">
          <p className="impostor-kicker">Invitación</p>
          <h1 id="group-invitation-title">Te invitaron a un grupo</h1>
          <PlatformGroupJoinByLinkActions invitationCode={code} />
        </section>
      </div>
    </main>
  );
}
