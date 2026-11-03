# Diccionario — Primera versión

## Estado y alcance

Plan de producto e implementación aprobado el 2 de noviembre de 2026. Sustituye
la exploración inicial. Los documentos anteriores se conservan en
[el archivo histórico](../../archive/dictionary-2026-11-02/README.md) y no
gobiernan esta versión.

La habilitación requiere validación integral y revisión del catálogo. Para este
lanzamiento el usuario autorizó expresamente revisión asistida por IA con fuentes
y navegador móvil emulado, sustituyendo revisión humana y dispositivo físico.
También autorizó la publicación y activación en producción. La evidencia y el
destino confirmado se registran en [validation.md](validation.md).

## Entrada y configuración

Juego presencial, un teléfono por participante. Se elige Diccionario desde la
plataforma, se crea una sala o se ingresa por código y se espera en el lobby.

El anfitrión elige 3, 5 o 10 rondas (5 por defecto). Se requieren al menos tres
jugadores. El inicio congela participantes y configuración; nuevas personas
esperan otra partida. Se usan salas y sesiones neutrales existentes, manteniendo
las reglas, rondas, definiciones y puntuación dentro de Diccionario.

## Una ronda

1. Todos reciben la misma palabra y escriben una definición inventada.
2. Se espera a todos, sin temporizador. El envío confirmado es definitivo.
3. Se muestran juntas las inventadas y la verdadera, sin autores. Un sorteo
   fija posiciones compartidas para la ronda, conservadas tras recargar.
4. Cada jugador confirma un voto por una opción ajena. Es definitivo.
5. El último voto revela automáticamente la verdadera, los autores, los votos
   agregados y los puntos. El anfitrión avanza después de comentarlo.

Fases: `WRITING → VOTING → RESULT`. La última ronda termina la sesión y muestra
la clasificación final. Los empates comparten posición. Se puede volver al
lobby e iniciar otra partida con configuración y sesión nuevas.

Se suma un punto por acertar la verdadera y un punto por cada voto recibido en
una definición inventada. No se entregan votos individuales a otros jugadores.
En grupos pequeños los agregados y el voto propio pueden permitir inferencias;
la interfaz no promete imposibilidad de deducir elecciones.

### Coincidencias

Cada envío conserva su opción y sus votos, aunque coincida con otra definición
o con la verdadera. Sólo la opción original del catálogo es la verdadera.
Se acepta la ambigüedad: rechazar coincidencias exactas serviría para comprobar
la respuesta mediante envíos. No hay comparación ni moderación semántica.

## Escritura y presentación

Una única normalización, autoritativa en Postgres, se aplica a jugadores y
catálogo: Unicode NFC, eliminación de espacios exteriores, unificación de
espacios y saltos, primera letra en mayúscula y punto final cuando no existe
puntuación terminal. Entre 1 y 300 caracteres Unicode normalizados; no vacío.
No se corrige ortografía ni significado automáticamente.

Los consejos visibles recomiendan revisar ortografía, escribir breve e
impersonalmente y evitar referencias personales. Ejemplos: «Instrumento que
sirve para…», «Acción y efecto de…», «Dicho de una persona que…».

Las opciones tienen presentación uniforme. La normalización y los consejos
reducen pistas accidentales, pero no garantizan anonimato de estilo. El catálogo
variará estructuras y formalidad para evitar definiciones siempre “de manual”.

## Catálogo y reservas

Se requieren 300 entradas revisadas antes de habilitar. Cada entrada tiene
palabra, acepción, definición propia breve, dificultad y referencia de
verificación. La revisión asistida autorizada debe contrastar las acepciones
con fuentes y usar redacción propia, respetando las condiciones de consulta.
Dificultad variada, evitando palabras demasiado obvias, técnicas o
incómodas para grupos familiares.

Al inicio se reservan palabras para todas las rondas. Se excluyen las ya
presentadas al grupo y las reservadas por otras partidas activas del mismo
grupo. El inicio y las reservas concurrentes se serializan por grupo.

Una palabra se consume al presentarla, aunque la ronda se abandone sin revelar.
Sólo se liberan reservas nunca presentadas. Si no alcanzan, se elige una cantidad
menor entre 3, 5 y 10. Con menos de tres no se inicia. La salida es ampliar el
catálogo; esta versión no recicla ni reinicia el historial.

El catálogo y las respuestas no se incluyen en archivos públicos ni bundles.
Fixtures de desarrollo no equivalen a contenido revisado por personas.

## Desconexión y cierre

Desconectarse conserva participante y envíos confirmados. Al volver se reconstruye
el estado autorizado. Un borrador no enviado permanece en memoria sin garantía
tras cerrar la aplicación. Se muestra quién falta por enviar o votar, sin su
contenido ni elección.

El anfitrión puede finalizar anticipadamente con confirmación. Conserva puntos
de rondas resueltas; la incompleta no se revela ni puntúa. Se identifica el
resultado como interrumpido y se permite otra partida desde el lobby.

La sucesión usa liveness autoritativo y el roster neutral existentes. Sin
sucesor elegible no se transfiere autoridad; un regreso permite reevaluarla.
Un jugador pendiente puede bloquear a todos. No se expulsa ni saltea personas.
Si no hay anfitrión o sucesor ni regresa nadie, la salida automática es vencer.

### Vencimiento

Cerrar por el primero de estos límites:

- 24 horas sin actividad autorizada de ningún participante;
- 72 horas desde el inicio, aunque continúe la actividad.

Heartbeat cada 30 segundos sólo en primer plano. Acciones válidas también
cuentan; el servidor fija los tiempos. La interfaz informa la duración máxima.
El lobby tiene límite de inactividad; las 72 horas comienzan al iniciar.

Cron barre cada 15 minutos. Cada acceso, heartbeat o mutación comprueba antes el
vencimiento para impedir revivir salas. El cierre idempotente y transaccional
termina sala y sesión, libera slots y reservas no mostradas y conserva resultados
y palabras consumidas. Se serializa con actividad y acciones del juego.

Al volver se informa si terminó completa, por el anfitrión, por inactividad o
por duración máxima. Se muestran resultados conservados, incluso cero rondas
resueltas, sin revelar la incompleta. Se ofrece lobby cuando esté disponible o
crear/buscar otra sala cuando esté cerrada.

## Autoridad e interfaces

Postgres deriva actor y pertenencia de `auth.uid()`. Las RPCs validan anfitrión,
participación, fase y ronda esperada. RLS y grants niegan acceso directo a datos
sensibles. Reintentar recupera el resultado confirmado sin duplicar acciones.

Se bloquea la fila de ronda al enviar y votar. El último envío crea opciones una
sola vez; el último voto revela y puntúa una sola vez. El orden de locks es
Room, Group cuando se modifican reservas y Round.

Opciones con UUIDs aleatorios. Durante votación sólo se entregan identificador
opaco, posición, texto y elegibilidad propia: sin timestamps, autor, referencia
al catálogo o marca de verdadera. Realtime publica una señal genérica autorizada;
no tablas de respuestas, autores o votos. Refresh, foreground y reconexión releen
el estado autorizado. Polling visible cubre notificaciones perdidas.

## Habilitación

Flag persistido inicialmente desactivado. Se modifica mediante migration
administrativa autorizada para el destino, usando una función interna sin grants
a clientes; no habrá panel ni endpoint público de administración.

La activación verifica en backend al menos 300 entradas válidas `reviewed` con
responsable y fecha de revisión. Si faltan, falla sin activar. Crear salas e
iniciar requiere flag activo; iniciar verifica también el catálogo mínimo.
Desactivar conserva recuperación, resultados y finalización de partidas.

## Incrementos

1. Contratos, flag, tipo de juego, rutas, create/join, recuperación y lobby.
2. Catálogo protegido, reservas, historial e inicio con roster congelado.
3. Escritura, consejos, envío definitivo y transición automática.
4. Votación, orden persistido, rechazo de auto-voto y puntuación automática.
5. Avance, clasificación, cierres, vencimiento, sucesión y revancha.
6. Validación integral, revisión editorial y habilitación autorizada.

## Criterios de aceptación y validación

- Acceso por actor, grupo y fase, por RPC y por lectura directa con roles cliente.
- Sin respuesta verdadera, autores, votos individuales o metadatos indebidos.
- Normalización uniforme, límites, coincidencias y auto-voto.
- Envíos/votos simultáneos y reintentos: opciones, transición y puntuación únicas.
- Reservas concurrentes, agotamiento y liberación sólo de palabras no mostradas.
- Palabra presentada y no revelada sigue consumida tras abandono.
- Límites 24/72 h, segundo plano, carreras con barrido y ausencia de sucesor.
- Regreso tras cada cierre, incluso sin rondas resueltas.
- Activación rechazada con 299 revisadas y aceptada con 300 válidas.
- Revancha, histórico estable y regresiones de Impostor y Tutti Frutti.

Antes de habilitar: tests de aplicación, lint, build, validadores locales y una
partida completa con tres sesiones móviles aisladas, incluyendo recarga,
reconexión y sucesión. Verificar Cron en el destino autorizado.

La evidencia de ejecución y los pendientes viven en `validation.md`.
