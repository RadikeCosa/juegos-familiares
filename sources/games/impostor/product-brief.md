# Impostor — Product brief

## Propósito

Impostor es un juego social presencial de Juegos Familiares para grupos
pequeños. Cada participante usa su teléfono, pero la conversación, las pistas,
las sospechas y la mayor parte de la experiencia ocurren cara a cara.

La tecnología coordina lo que resulta engorroso resolver presencialmente:

- reunir a quienes juegan;
- elegir y distribuir información privada;
- sincronizar las fases;
- registrar votos secretos y resolverlos;
- calcular resultados y puntuación;
- reconstruir la tanda vigente después de una interrupción.

La aplicación no reemplaza la interacción social ni dirige cada turno de la
conversación.

## Experiencia actual

Impostor usa capacidades persistentes de plataforma —identidad liviana,
`Player` y `Group`— y agrega su propio dominio de juego.

El `Group` conserva sus integrantes y un banco privado de palabras entre
encuentros. Cualquier integrante puede aportar palabras o frases cortas y ver
sus propios aportes y la cantidad total disponible, pero no explorar el banco
completo. Esto mantiene la sorpresa y permite que el contenido acumule
referencias propias del grupo.

Para jugar, una persona crea una `Room` temporal y comparte su código o enlace.
Los demás integrantes que participarán se unen desde sus teléfonos. Al iniciar,
la tanda congela ese roster: una `GameSession` contiene múltiples rondas y
mantiene sus participantes, palabras usadas y marcador hasta que el host la
termina.

El ciclo productivo completo incluye:

1. crear o unirse a una Room;
2. revelar el rol o la palabra de cada participante;
3. conversar y dar pistas presencialmente;
4. realizar una primera votación secreta;
5. conversar y votar una segunda vez si hubo empate;
6. ofrecer un intento final al impostor si fue descubierto;
7. mostrar el resultado de la ronda;
8. aplicar y mostrar el marcador;
9. iniciar otra ronda o terminar la tanda;
10. mostrar ganadores, clasificación final y cantidad de rondas.

Para jugar otra tanda se crea una Room nueva; una Room terminada no se reutiliza.

## Capacidades existentes

- contexto de Group persistente y acceso por invitación;
- banco de palabras con validación, deduplicación y privacidad;
- Room temporal con host, código compartible y lobby multi-dispositivo;
- Presence visual, liveness persistida y sucesión de host en lobby;
- roster congelado al comenzar la tanda;
- selección autoritativa y balanceada de palabra, impostor y primer jugador;
- revelación privada y sincronización de todas las fases de juego;
- primera votación, desempate único y resolución del intento final;
- scoring, marcador, nuevas rondas y cierre de tanda;
- reconstrucción de la partida vigente y del resultado final;
- historial mínimo de tandas y rondas finalizadas.

## Límites de producto

- El caso principal son grupos pequeños y conocidos; no comunidades públicas.
- Cada participante usa su propio dispositivo y la partida compartida requiere
  conectividad.
- La instalación como PWA es opcional; el navegador sigue siendo una entrada
  válida.
- No hay cuentas tradicionales con email y contraseña. La identidad liviana no
  reduce los controles remotos de identidad, pertenencia o permisos. En grupos
  conocidos y partidas casuales evita una fricción que hoy no aporta valor.
- No existe un número obligatorio de rondas ni una meta de puntos: el host
  decide cuándo terminar desde el marcador.
- Presence expresa disponibilidad efímera, no pertenencia a la tanda ni
  autoridad sobre su estado.
- La beta aprobada describe un producto usable y observado en juego real; no
  implica product-market fit, UX terminada ni ausencia de defectos.

## Fuera de alcance actual

- partidas remotas o gameplay compartido sin conexión;
- matchmaking, chat, perfiles públicos o ranking global;
- registro tradicional, compras, anuncios o publicación en tiendas;
- timer obligatorio o control digital de cada intervención presencial;
- revancha automática o reutilización de una Room;
- entrada o salida dinámica de participantes durante una tanda;
- moderación avanzada o exploración completa del banco de palabras;
- categorías, catálogo precargado o inteligencia artificial durante la partida;
- interfaz de estadísticas históricas avanzadas.

Las capacidades futuras se incorporan sólo a partir de una necesidad observada;
este contrato no las convierte en backlog.

## Criterio de producto

Impostor cumple su propósito cuando un grupo puede reunirse, comenzar una tanda
con pocos pasos y completar varias rondas sin que la tecnología desplace la
diversión presencial.
