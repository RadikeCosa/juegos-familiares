import Link from "next/link";
import { CadaverRoom } from "../../cadaver-room";
export const metadata = { title: "Sala | Cadáver exquisito" };
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <main className="impostor impostor--room"><a className="skip-link" href="#contenido">Saltar al contenido</a><div className="impostor-shell" id="contenido"><nav className="impostor-nav"><Link className="impostor-back" href="/cadaver-exquisito">Cadáver exquisito</Link></nav><CadaverRoom key={code} code={code} /></div></main>;
}
