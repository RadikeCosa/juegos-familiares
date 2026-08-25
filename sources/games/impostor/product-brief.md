# Impostor — Product Brief

## Idea

Impostor es el primer juego dentro de Juegos Familiares.

Es un juego social presencial para grupos en el que cada participante utiliza su propio teléfono.

Los jugadores forman parte de un grupo persistente y pueden agregar palabras a un banco compartido en cualquier momento, incluso cuando no hay una partida activa.

Cuando quieren jugar, uno de ellos crea una sala y los demás participantes presentes se unen desde sus dispositivos.

En cada ronda la aplicación:

1. selecciona una palabra;
2. selecciona un impostor;
3. muestra la palabra a todos los jugadores normales;
4. muestra únicamente `IMPOSTOR` al jugador seleccionado.

A partir de ese momento, el juego sucede principalmente en el mundo real: los participantes hablan, dan pistas, sospechan y tratan de descubrir al impostor.

Al finalizar la conversación, cada jugador vota secretamente desde su teléfono.

Si el impostor es descubierto, obtiene una última oportunidad para adivinar la palabra.

La aplicación resuelve el resultado y mantiene el marcador de la tanda de partidas.

---

# Objetivo del producto

Crear una experiencia social divertida, rápida y fácil de usar en reuniones familiares o de amigos.

La aplicación debe utilizar la tecnología solamente cuando aporta valor:

* reunir dispositivos;
* administrar grupos y salas;
* mantener un banco compartido de palabras;
* distribuir información privada;
* sincronizar estados;
* realizar votaciones secretas;
* resolver resultados;
* mantener el marcador.

La conversación y la parte principal del juego ocurren entre las personas.

---

# Alcance vigente

Al cierre técnico del Incremento 7, el producto ya soporta crear grupo, administrar banco de palabras, crear/unirse a Room, Presence/liveness/sucesión de host, iniciar tanda desde el host actual, revelar privadamente Round 1 y avanzar la GameSession de `role_reveal` a `discussion`.

El Incremento 7 decide no implementar `roleAcknowledged` ni acknowledgements persistidos para el MVP. La coordinación de que todos vieron su rol ocurre presencialmente y el host actual ejecuta `Empezar ronda`.

Durante `discussion`, cada jugador puede volver a revelar localmente su palabra o rol y volver a ocultarlo. La vista privada se oculta nuevamente al cambiar de fase y no se persiste ese reveal local.

Todavía no están implementados timer, votación, scoring, ganador, `END_SESSION`, Realtime de gameplay ni Broadcast.

---

# Contexto inicial

El grupo principal de referencia está formado por:

* Ramiro;
* Pedro;
* Camila;
* Victoria.

El producto debe funcionar especialmente bien para cuatro jugadores.

Debe permitir también partidas con otros grupos pequeños sin diseñar inicialmente alrededor de comunidades públicas o grandes cantidades de usuarios.

---

# Plataforma

Impostor se jugará dentro de Juegos Familiares, una aplicación web mobile-first con objetivo PWA.

La aplicación contenedora debe funcionar correctamente en teléfonos iOS y Android.

La PWA debe contemplar específicamente Safari en iOS y Chrome en Android.

Cada participante podrá acceder desde el navegador y, cuando el dispositivo lo permita, instalar la aplicación.

La instalación no debe ser obligatoria para poder jugar.

La PWA forma también parte del objetivo de aprendizaje del proyecto.

---

# Grupo

Existe un grupo persistente independiente de las partidas.

El grupo y la identidad del jugador pueden ser capacidades compartidas de Juegos Familiares.

Impostor utiliza ese grupo para su banco de palabras y sus partidas.

El grupo mantiene:

* participantes;
* banco de palabras;
* configuración básica.

Inicialmente no se requieren cuentas tradicionales con email y contraseña.

Cada dispositivo mantiene una identidad sencilla del jugador dentro de su grupo.

---

# Administrador

El creador del grupo actúa inicialmente como administrador.

Puede:

* consultar integrantes;
* eliminar integrantes.

En el MVP del banco de palabras no puede explorar el banco completo por ser administrador.

La moderación completa del banco queda diferida hasta que exista una necesidad real.

La administración permanente del grupo es independiente del rol temporal de host de una partida.

---

# Banco de palabras

Las palabras o frases cortas pertenecen al grupo y persisten entre partidas.

Los participantes pueden agregar palabras en cualquier momento desde la pantalla principal.

En el Incremento 3, el banco se alimenta con palabras agregadas por los integrantes.

Las palabras precargadas quedan diferidas para una etapa posterior.

Las palabras pueden relacionarse con personas, lugares, situaciones, objetos, recuerdos, personajes o referencias propias del grupo.

Esto permite que el contenido se vuelva progresivamente más personal y divertido.

---

# Privacidad del banco

Los integrantes no necesitan poder consultar la lista completa.

Pueden ver, por ejemplo:

`63 palabras disponibles`

y consultar las palabras que ellos mismos agregaron.

También pueden borrar sus propios aportes.

En el MVP del banco, el administrador tampoco explora el banco completo. Esta decisión preserva la sorpresa porque el administrador también puede participar de las partidas.

---

# Validación de palabras

La aplicación debe resolver automáticamente comprobaciones sencillas:

* valores vacíos;
* espacios innecesarios;
* duplicados triviales;
* diferencias de mayúsculas y minúsculas;
* límites de longitud entre 2 y 40 caracteres.

La normalización conserva tildes, `ñ` y puntuación, y no intenta corregir lingüísticamente las entradas.

Inicialmente las nuevas palabras no necesitan aprobación manual.

---

# Sala

Una sala representa a quienes están jugando en ese momento.

No todos los integrantes del grupo deben participar de todas las partidas.

La persona que crea la sala actúa como host inicial.

El host actual es el valor persistido de la Room y puede cambiar por sucesión.

El host no necesita ser administrador del grupo.

---

# Tanda

Una tanda reúne varias rondas consecutivas.

Durante la tanda se conservan:

* participantes;
* resultados;
* marcador;
* palabras utilizadas.

El grupo decide libremente cuándo terminar.

---

# Ronda

Cada ronda tiene:

* participantes;
* una palabra;
* un impostor;
* pistas presenciales;
* una votación;
* un resultado.

La palabra utilizada no vuelve a seleccionarse durante esa misma tanda.

Puede volver a aparecer en tandas futuras.

---

# Diferencial inicial

El banco de palabras compartido es una parte central del producto.

El grupo puede alimentarlo progresivamente entre encuentros.

Con el tiempo, el juego puede transformarse en una colección de referencias, recuerdos y conceptos propios de quienes juegan habitualmente.

También queremos conservar un historial mínimo de tandas y rondas finalizadas para poder construir más adelante estadísticas divertidas del grupo.

La interfaz de estadísticas no forma parte obligatoria del MVP visual.

---

# Principios del producto

1. Llegar a jugar debe requerir pocos pasos.
2. Cada participante utiliza su propio teléfono.
3. No exigir cuentas tradicionales sin una necesidad concreta.
4. El teléfono debe intervenir poco durante la conversación.
5. La información privada debe permanecer realmente privada.
6. La aplicación debe mantener un estado consistente entre dispositivos.
7. Agregar palabras debe ser rápido y espontáneo.
8. La administración no debe generar trabajo innecesario.
9. La experiencia debe diseñarse primero para mobile.
10. La infraestructura debe ser proporcional al problema.
11. El producto debe permitir aprender mientras se construye.
12. Las primeras decisiones deben poder revisarse después de jugar con personas reales.

---

# MVP

## Grupo

* crear grupo;
* identidad sencilla del jugador;
* recordar jugador y grupo;
* administración básica.

## Palabras

* agregar palabras propias;
* ver cantidad total disponible;
* consultar y borrar aportes propios;
* banco persistente;
* validación automática;
* evitar duplicados;
* privacidad del contenido del banco.

## Sala

* crear sala;
* unirse a sala;
* visualizar participantes;
* identificar al host;
* iniciar tanda.

## Ronda

* seleccionar palabra;
* seleccionar impostor;
* distribuir información privada;
* confirmar inicio;
* realizar conversación presencial;
* iniciar votación;
* votar secretamente;
* resolver empate;
* revelar impostor;
* permitir intento de adivinar la palabra;
* resolver ganador.

## Marcador

* actualizar puntuación;
* mostrar clasificación;
* iniciar nueva ronda;
* terminar tanda.

## Historial mínimo

* conservar resumen de tandas finalizadas;
* conservar resumen de rondas finalizadas;
* permitir estadísticas futuras derivables.

---

# Fuera del MVP inicial

* registro con email;
* contraseña;
* perfiles públicos;
* matchmaking;
* chat;
* partidas remotas;
* ranking global;
* compras;
* anuncios;
* moderación avanzada;
* interfaz de estadísticas;
* inteligencia artificial durante la partida;
* estadísticas históricas complejas;
* publicación en tiendas de aplicaciones.

---

# Pregunta central del MVP

¿Puede un grupo abrir la aplicación, reunirse en una sala y comenzar una ronda de Impostor rápidamente, sin que la tecnología interfiera con la diversión?
