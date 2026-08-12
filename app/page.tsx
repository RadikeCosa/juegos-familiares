export default function Home() {
  return (
    <main className="home">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <section className="home-panel" id="contenido" aria-labelledby="app-title">
        <p className="home-kicker">Base visual</p>
        <h1 id="app-title">Juegos Familiares</h1>
        <p className="home-copy">Una base clara para empezar a jugar.</p>
      </section>
    </main>
  );
}
