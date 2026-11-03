import Link from "next/link";
import { CadaverEntry } from "./cadaver-entry";
export const metadata = { title: "Cadáver exquisito | Juegos Familiares", description: "Una historia entre todos, de a tres palabras de pista." };
export default function CadaverPage() {
  return <main className="impostor"><a className="skip-link" href="#contenido">Saltar al contenido</a><div className="impostor-shell" id="contenido">
    <nav className="impostor-nav"><Link className="impostor-back" href="/">Juegos Familiares</Link><Link href="/cadaver-exquisito/historial">Historias del grupo</Link></nav>
    <section className="impostor-hero"><div className="impostor-hero__content"><p className="impostor-kicker">Escritura compartida · desde 2 personas</p><h1>Cadáver exquisito</h1>
    <p className="impostor-lede">Una historia entre todos. Solo tres palabras para seguirla.</p><p>Por turnos, escriban entre 3 y 50 palabras. La historia completa se revela al final y queda en el historial del grupo.</p><CadaverEntry /></div></section>
  </div></main>;
}
