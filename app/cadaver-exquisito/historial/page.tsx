import Link from "next/link";
import { CadaverHistory } from "../cadaver-history";
export const metadata = { title: "Historias del grupo | Cadáver exquisito" };
export default function HistoryPage() { return <main className="impostor"><a className="skip-link" href="#contenido">Saltar al contenido</a><div className="impostor-shell" id="contenido"><nav className="impostor-nav"><Link className="impostor-back" href="/cadaver-exquisito">Cadáver exquisito</Link></nav><CadaverHistory /></div></main>; }
