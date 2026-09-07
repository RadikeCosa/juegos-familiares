# Impostor — Decisiones de producto

## Propósito

Este documento registra decisiones de producto que consideramos suficientemente estables como para orientar el diseño y la implementación.

No contiene todas las posibilidades futuras. Su objetivo es evitar rediscutir decisiones ya tomadas y distinguir claramente entre decisiones confirmadas y cuestiones todavía abiertas.

---

# Contexto inicial

La primera versión está pensada para un grupo pequeño y conocido de jugadores.

El grupo inicial de referencia es:

* Ramiro
* Pedro
* Camila
* Victoria

El producto debe poder admitir eventualmente más participantes y otros grupos, pero no diseñaremos el MVP alrededor de problemas propios de una comunidad pública o masiva.

---

# Plataforma

## Decisión

Impostor se desarrollará dentro de Juegos Familiares.

Juegos Familiares será una aplicación web mobile-first con objetivo de funcionar como PWA.

Debe funcionar correctamente en iOS y Android.

La PWA debe contemplar específicamente Safari en iOS y Chrome en Android.

La instalación no debe ser obligatoria para poder jugar.

La aplicación debe seguir funcionando desde el navegador.

## Motivo

Cada participante utilizará principalmente su teléfono.

La PWA permite:

* acceso mediante URL;
* instalación en el dispositivo;
* experiencia similar a una aplicación;
* evolución progresiva del soporte offline;
* distribución sencilla sin depender inicialmente de tiendas.

El proyecto se utilizará también para aprender progresivamente los conceptos técnicos asociados a PWAs.

Debemos considerar diferencias reales entre plataformas respecto de instalación, manifest, service workers, cache, almacenamiento, ciclo de vida, actualización y comportamiento al pasar a segundo plano o volver a primer plano.

En esta etapa conceptual inicial todavía no se habían definido soluciones
técnicas concretas para esas diferencias. Incremento 14 implementó el hardening
PWA static-safe; la validación física Android/iOS continúa pendiente.

---

# Identidad

## Decisión

No exigiremos cuentas tradicionales en el MVP.

Cada jugador tendrá una identidad sencilla dentro de su grupo.

La identidad, el jugador y el grupo son capacidades que pueden ser compartidas por distintos juegos de Juegos Familiares.

El dispositivo podrá recordar:

* identificador del jugador;
* nombre o nick;
* grupo al que pertenece.

## Motivo

La aplicación está pensada inicialmente para grupos conocidos y partidas casuales.

Email, contraseña o autenticación social introducirían fricción sin resolver un problema relevante del MVP.

## Principio

Sin cuenta no significa sin identidad.

La aplicación necesita reconocer al jugador, pero no necesita inicialmente una identidad global.

La identidad almacenada localmente permite recordar qué jugador utiliza el dispositivo, pero no constituye por sí sola la autoridad para ejecutar acciones protegidas.

Las acciones protegidas deben validarse contra el estado compartido del sistema.

En esta etapa conceptual inicial todavía no se diseñaban RBAC, tokens,
autenticación, RLS ni mecanismos técnicos concretos. La implementación posterior
adoptó Supabase Auth anónima, RLS y RPCs autoritativas sin introducir RBAC general.

---

# Grupo

## Decisión

Existe un grupo persistente independiente de las partidas.

El grupo puede pertenecer al nivel compartido de Juegos Familiares.

Impostor lo utiliza para participantes, permisos y banco de palabras.

El grupo mantiene:

* participantes;
* banco de palabras;
* configuración básica.

## Motivo

Las mismas personas pueden jugar en diferentes momentos y el banco de palabras debe poder crecer entre partidas.

---

# Administrador del grupo

## Decisión

En la etapa actual del MVP, solo el admin de plataforma puede crear grupos.

Cuando el admin de plataforma crea un grupo, queda inicialmente como administrador de ese Group.

Los usuarios comunes no crean grupos autónomamente: entran a grupos existentes por invitación.

## Permisos iniciales

El administrador puede:

* consultar integrantes;
* eliminar integrantes.

En el MVP del banco de palabras, el administrador no tiene una excepción para explorar el banco completo.

## Motivo

El contexto familiar permite mantener una administración sencilla sin construir un sistema complejo de roles.

La moderación completa del banco queda diferida hasta que aparezca un problema real de contenido.

La restricción de creación de grupos surge del `Smoke UX/Product #2`: para una beta curada, reduce complejidad operativa, evita grupos duplicados o basura y mantiene el onboarding enfocado en unirse por invitación.

Esta decisión puede revisarse más adelante con whitelist, solicitud de creación o creación autónoma si el producto necesita abrirse a más grupos.

---

# Capacidades protegidas

## Decisión

Las operaciones protegidas deben distinguir conceptualmente al menos estas capacidades.

### Administrador del grupo

Puede:

* consultar integrantes;
* eliminar integrantes.

En el Incremento 3, sus permisos sobre el banco son los mismos que los de cualquier integrante: agregar palabras, consultar cantidad total, consultar sus propios aportes y borrar sus propios aportes.

### Host de sala

Puede:

* iniciar la tanda;
* iniciar la votación;
* avanzar las etapas de resolución de ronda;
* iniciar una nueva ronda;
* terminar la tanda.

### Participante de la sala

Puede:

* recibir su propia información privada;
* confirmar que está listo;
* votar;
* participar de la ronda.

### Autor de palabra

Puede:

* consultar sus propias palabras;
* borrar sus propias palabras.

## Motivo

Estas capacidades ordenan permisos del MVP sin convertirlos todavía en un sistema técnico de autorización.

---

# Sala

## Decisión

Las salas son temporales.

Una sala representa a las personas que están jugando en ese momento.

No todos los integrantes del grupo deben participar de todas las salas.

---

# Entrada manual a una sala

## Decisión

Cuando un Player reconocido no tiene una Room activa, `Unirme a una sala` inicia un paso explícito y mobile-first. Ese paso reemplaza las acciones iniciales y muestra:

```text
Unirse a una sala
Ingresá el código de la sala
Pedíselo a la persona que creó la sala.
Código de sala
Entrar a la sala
Volver
```

Entrar en este paso no es un error y no usa tratamiento rojo. El error aparece únicamente después de un intento fallido, dentro del mismo formulario, que permanece disponible para corregir el código y reintentar. `Volver` restaura las acciones iniciales.

La decisión se aplica de forma consistente en `/impostor` y `/impostor/grupo`. Un enlace directo válido conserva su flujo propio y no obliga a escribir manualmente el código.

## Motivo

En una pantalla táctil, dejar el control activado en rojo y agregar un input debajo sin explicación se interpreta fácilmente como fallo. Reemplazar el bloque por un paso contextual comunica avance, reduce ambigüedad y mantiene un único foco de acción.

---

# Host de la sala

## Decisión

La persona que crea la sala actúa como host inicial.

El host actual de una Room se representa por `rooms.host_player_id` y puede cambiar por sucesión.

El host puede ser cualquier integrante del grupo y no necesita ser administrador.

El administrador del Group y el host de una Room son roles distintos. Ser administrador del Group no autoriza automáticamente a cerrar una Room creada por otro Player.

## Motivo

La administración permanente del grupo y la conducción temporal de una partida son responsabilidades diferentes.

Esto permite que cualquier integrante pueda iniciar una partida aunque el administrador no participe.

---

# Lifecycle mínimo de Room

## Decisión

En Incremento 4 una Room puede estar en:

```text
lobby
closed
```

Una Room cerrada deja de considerarse activa.

Un participante no-host puede abandonar el lobby. El host puede cerrar el lobby. Si el host quiere abandonar durante este incremento, la Room se cierra.

El cierre explícito de una Room solo corresponde al host. Al cerrar, la Room pasa a `closed`, deja de ser activa y libera a sus participantes para crear o unirse a otra Room. Las filas de `RoomParticipant` pueden preservarse como rastro técnico de quién participó, pero eso no constituye una pantalla ni feature de historial.

No existe expiración automática ni sucesión automática del host en Incremento 4. Liveness autoritativo quedó cerrado en 5.2; la sucesión autoritativa por host stale quedó cerrada en 5.3.

## Persistencia

Aunque Room es temporal en el dominio, se persiste técnicamente para refresh, concurrencia, reconstrucción y sincronización entre dispositivos.

# Presence y sucesión de host

## Decisión

Incremento 5.1 cerró el uso de Supabase Realtime Presence para mostrar disponibilidad efímera `connected | disconnected` de los participantes de la Room activa.

`RoomParticipant` sigue representando pertenencia persistida a una Room. No se convierte conceptualmente en una conexión.

La separación de producto queda así:

```text
RoomParticipant = pertenece a la Room
Presence = está disponible ahora de forma efímera
last_seen_at = evidencia autoritativa de actividad reciente
rooms.host_player_id = host actual autoritativo
```

Varias conexiones del mismo Player, por ejemplo dos pestañas, cuentan como un único Player lógico.

La pérdida de Presence no significa abandono inmediato y no reasigna por sí sola el host.

Presence básica ya quedó validada como canal privado acotado por Room, autorizado contra `RoomParticipant` y visible en el lobby como `conectado/desconectado`.

## Sucesión

Incremento 5.3 cerró la sucesión autoritativa de host. Si el host deja de estar disponible, la sucesión requiere validación autoritativa de staleness; Presence puede disparar la intención, pero no decide.

La decisión inicial de 5.2 fue usar `room_participants.last_seen_at` como evidencia verificable de actividad reciente del Player dentro de esa Room. No representa Presence, conexión, abandono, host, ready ni estado de juego.

Una nueva participación inicia con liveness reciente. El cliente refresca ese liveness mediante una intención autoritativa, sin enviar `player_id`, `room_id` ni timestamp.

El heartbeat inicial es 30 segundos mientras el lobby esté activo. Además se refresca al reconstruir lobby, al establecer Presence y al volver a foreground. No se refresca por cada interacción de usuario.

El threshold inicial de stale es 90 segundos:

```text
active = last_seen_at existe y now() - last_seen_at <= 90s
stale  = last_seen_at es null o now() - last_seen_at > 90s
```

Los 90 segundos reemplazan la hipótesis previa de 60 segundos por el margen necesario frente a heartbeat de 30 segundos, throttling técnico, red y suspensión de timers móviles. Sigue siendo un parámetro técnico a validar, no una regla definitiva del juego ni una configuración para usuarios.

El recheck cliente de sucesión usa una cadencia lenta inicial de 30 segundos mientras el host siga ausente. Ese recheck solo solicita evaluación; el backend decide otra vez en cada intento.

La regla implementada es:

```text
si host actual está stale:
  considerar RoomParticipants restantes
  excluir host actual
  excluir participantes stale
  ordenar por joined_at ASC, player_id ASC
  persistir el primer candidato como rooms.host_player_id
```

`player_id` es solo desempate técnico determinístico y no criterio visible de producto.

Si el host está fuera de Presence pero `last_seen_at` todavía está active, no hay sucesión.

Si el host está stale y no hay candidatos active, la operación es no-op: la Room sigue `lobby`, el host actual permanece persistido y no hay cierre automático.

Si el host original vuelve después de haber sido reemplazado, vuelve como participante normal y no recupera el rol automáticamente.

El cambio de host debe sentirse liviano: la interfaz identifica al host actual y muestra feedback breve, no bloqueante, cuando cambia. No debe mostrar métricas técnicas, heartbeat ni `last_seen_at`.

La acción explícita del host para cerrar/abandonar sigue usando el lifecycle vigente. Desconexión/staleness y cierre explícito no son el mismo concepto.

## Motivo

Queremos que una ausencia breve, un bloqueo de pantalla o una transición background/foreground móvil no cierre ni desordene el lobby.

También queremos evitar que un cliente pueda decidir el host solo porque observó una pérdida de Presence. El host es un rol persistido y cambia mediante una decisión autoritativa derivada desde `auth.uid() -> Player -> Room`, sin aceptar IDs de ownership enviados por cliente.

# Reconexión y estado stale

## Decisión

En Incremento 13, después de refresh, reapertura, retorno desde background, desbloqueo, app switching, pérdida de red o resuscripción Realtime, la aplicación debe aceptar el estado actual del servidor.

La decisión de producto es:

```text
estado autoritativo actual
→ reemplaza estado local stale
```

Nunca:

```text
estado local viejo
→ restaura fase, host, Room, voto, palabra o acción anterior
```

Si un jugador se fue en una fase y vuelve cuando el grupo avanzó, ve la fase vigente. Ejemplos:

```text
role_reveal → discussion
discussion → voting_first
voting_first/voting_second → scoreboard
scoreboard → role_reveal de nueva ronda
scoreboard → finished
```

## Estado local efímero

Puede perderse legítimamente al reconectar:

* reveal abierto/cerrado;
* modal abierto;
* selección de voto todavía no enviada;
* input de intento final no enviado;
* feedback temporal;
* estado visual efímero.

El reveal privado vuelve inicialmente oculto después de refresh o reconexión. Esto es deseado porque reduce exposición física. El rol y la palabra autorizada deben seguir correspondiendo a la ronda actual. Si la ronda cambió, ningún secreto anterior debe quedar visible.

## Acciones persistidas

Las acciones ya confirmadas por servidor deben reconstruirse desde el read model:

* voto propio en primera votación;
* voto propio en segunda votación;
* elegibilidad o no para el intento final del impostor;
* marcador;
* cierre `finished`.

Si el Player ya votó, la UI no debe presentarlo como si aún pudiera votar. Cuando el read model devuelva `my_vote_target_player_id`, puede usarse para mostrar la elección propia sin exponer votos ajenos.

Durante `impostor_guess`, si el intento ya fue enviado y la fase avanzó a resultado, no se vuelve a ofrecer submit. Si todavía es elegible, el impostor ve el formulario. Si la fase avanzó por otro camino, se muestra la fase vigente.

## Room cerrada y resultado final

Si una Room se cerró mientras el Player estaba fuera, la aplicación no debe seguir simulando una sala viva. `get_my_active_room()` deja de devolver Room activa.

Si la tanda terminó, el resultado final debe poder reconstruirse para los `SessionPlayers` desde `get_my_game_state()` aunque la Room ya no esté activa. Si no hay resultado final recuperable, el destino esperado es volver al Group y permitir el flujo normal de crear o unirse a otra Room.

## Motivo

Reconexión robusta no significa volver al punto exacto visual donde quedó cada teléfono. Significa volver a una vista segura, actual y autorizada que preserve lo importante de la partida sin inventar estado local ni exponer secretos viejos.

# GameSession y comienzo de tanda

## Decisión

Incremento 6 introduce `GameSession` como la tanda concreta jugada por un conjunto fijo de participantes dentro de una `Room`.

La separación conceptual queda así:

```text
Group = quiénes somos habitualmente
Room = dónde estamos jugando ahora
GameSession = tanda competitiva concreta
Round = una ronda dentro de la tanda
```

Para el MVP actual, una Room produce como máximo una GameSession:

```text
Room 1 → 0..1 GameSession
```

No se diseña reutilización de una misma Room para múltiples tandas.

`GameSession` no reemplaza a `Room`. Durante gameplay, Room sigue siendo necesaria para host actual, `RoomParticipant`, liveness, Presence, `joinedAt` y reconstrucción del contexto compartido.

No se copia el host en `GameSession`. La única autoridad de host sigue siendo:

```text
rooms.host_player_id
```

Al ejecutar `START_SESSION`, la autoridad congela el roster de la tanda a partir de los `RoomParticipant` autoritativamente activos en ese momento, según el mecanismo vigente de liveness.

El slicing de implementación preservó esta atomicidad:

* 6.2 prepara el lifecycle físico `lobby | playing | closed` y las invariantes de Room necesarias para gameplay;
* 6.3 implementa el `START_SESSION` de producto completo, con snapshot, palabra, impostor y Round 1.

El cierre completo de Incremento 6 deja implementado el flujo vertical:

```text
Room lobby
→ host actual pulsa "Iniciar tanda"
→ start_session()
→ snapshot de RoomParticipants activos
→ SessionPlayers congelados
→ palabra e impostor server-side
→ Round 1
→ GameSession.state = role_reveal
→ Room.status = playing
→ get_my_active_room()
→ get_my_game_state()
→ tap-to-reveal local
```

La separación queda:

```text
RoomParticipant = pertenencia a la Room
SessionPlayer = participante estable de esta tanda
```

Presence puede ayudar a la UX, pero no es autoridad final para decidir el roster.

Una desconexión posterior no elimina `SessionPlayer` ni modifica automáticamente el roster.

Un `RoomParticipant` que quedó fuera del snapshot no ingresa después a la tanda aunque vuelva a estar activo. Puede reconstruir el estado compartido de Room, pero no obtiene vista privada de gameplay.

Durante `playing`, la sucesión de host elige candidatos activos que además pertenezcan a `SessionPlayers`. Así, un RoomParticipant excluido nunca adquiere autoridad de gameplay.

Solo el host actual puede iniciar la tanda. No pueden iniciarla por sí mismos el administrador del Group, el creador original de la Room si ya no es host ni cualquier participante no-host.

La autorización se deriva server-side desde:

```text
auth.uid()
→ Player
→ Room
→ rooms.host_player_id actual
```

El cliente no demuestra autoridad enviando `host_player_id`, `player_id` ni `group_id`.

Los guards conceptuales mínimos son:

```text
caller tiene identidad válida
caller resuelve Player válido
caller pertenece a Room activa
Room está en lobby
caller es host actual
no existe otra GameSession para esa Room
connected/active participants >= 3
available words >= 1
```

`START_SESSION` cambia la Room de `lobby` a `playing`. Desde ese momento la Room no admite nuevos joins.

No debe existir como estado durable exitoso una Room en `playing` sin Round 1, una GameSession sin Round, una Round sin palabra, una Round sin impostor ni una GameSession sin SessionPlayers.

Las operaciones de lifecycle de lobby no se interpretan automáticamente como salida o cierre de la tanda mientras `Room.status = playing`. El cierre normal futuro de gameplay será mediante `END_SESSION`; la política detallada de abandono durante gameplay queda fuera de Incremento 6.

# Transición de role reveal a discussion

## Decisión

En Incremento 7, el MVP no persistirá confirmaciones individuales de rol.

No se agregan:

```text
roleAcknowledged
role_acknowledged_at
allRolesSeen
```

La coordinación de que todos hayan visto su rol ocurre presencialmente. El host actual avanza la fase:

```text
role_reveal
→ discussion
```

La acción visible implementada es:

```text
Empezar ronda
```

La consulta de información privada conserva el mismo patrón en `role_reveal` y `discussion`: comienza oculta, usa una única superficie táctil amplia, revela la palabra autorizada o `IMPOSTOR` con un tap y vuelve a ocultarla al tocar la misma superficie. No se muestra directamente la palabra con un botón separado debajo.

La guía de fase, la indicación de quién empieza y las acciones del host permanecen fuera de esa superficie privada.

No se usa `playing` como `GameSession.state`, porque `Room.status = playing` ya significa que la Room está dentro de gameplay y no admite nuevos joins.

`discussion` significa:

```text
la Round actual está en conversación/pistas presenciales
la identidad del impostor sigue privada
la palabra sigue privada
la app no controla turnos
la app no controla timer
la votación todavía no comenzó
```

## Motivo de la interacción privada

El mismo gesto y la misma jerarquía visual en ambas fases reducen aprendizaje y errores durante el pase físico del teléfono. El estado oculto por defecto protege la privacidad; permitir volver a ocultar conserva el control del jugador sin agregar estado persistido.

La autoridad es siempre el host actual persistido en:

```text
rooms.host_player_id
```

No el administrador del Group, el creador original de la Room ni el host que inició la GameSession si ya fue reemplazado por sucesión.

La fase global continúa viviendo en `GameSession.state`. No se agrega `Round.status` mientras duplicaría el mismo estado.

## Motivo

Impostor es un juego social presencial. La aplicación debe digitalizar solo aquello que aporta coordinación real.

El grupo puede resolver verbalmente:

```text
¿Estamos todos?
```

Persistir acknowledgements individuales agregaría más estado distribuido, casos de refresh, bloqueos por disconnect, reglas para jugadores offline y sincronización adicional sin aportar suficiente valor al MVP.

## Sincronización inicial

El cambio `role_reveal → discussion` no modifica `Room.status`. Por lo tanto, el `UPDATE rooms` usado por `START_SESSION` ya no sirve como invalidación natural.

En Incremento 7 se usa polling lento de:

```text
get_my_game_state()
```

mientras:

```text
Room.status = playing
```

El polling reconstruye siempre estado autoritativo y no transporta secretos por un canal aparte. Un valor inicial sugerido es aproximadamente cada 3 segundos; es un detalle técnico configurable, no una regla de producto permanente.

No se publican `game_sessions`, `session_players` ni `rounds` por Postgres Changes en Incremento 7. Tampoco se usa Room como bus artificial ni se agrega Broadcast.

Broadcast privado queda como posibilidad futura de invalidación, por ejemplo `game-state-invalidated`, sin transportar nunca `word`, `role` ni `impostor`.

## Palabra, impostor y privacidad

La palabra de la ronda se selecciona server-side, autoritativamente y de forma aleatoria entre palabras del banco del Group que no hayan sido utilizadas antes en la misma GameSession.

No se introduce todavía `group_words.active`, `group_words.used`, `rotation_weight`, `last_used_at` ni una entidad `UsedWord`.

La ronda conserva un snapshot conceptual de la palabra efectivamente usada, incluyendo una forma normalizada suficiente para sostener la regla de no repetición durante la tanda aunque el `GroupWord` original se borre y luego se vuelva a agregar con diferencias triviales de mayúsculas o espacios.

La selección de impostor mantiene la regla vigente:

1. calcular cuántas veces fue impostor cada `SessionPlayer` dentro de la `GameSession`;
2. obtener el menor conteo;
3. elegir únicamente entre quienes tengan ese menor conteo;
4. seleccionar aleatoriamente entre esos candidatos.

Para Round 1 todos comienzan empatados en cero.

El estado compartido puede indicar que existe una GameSession, la fase actual, el número de ronda, participantes y host actual. No debe exponer `secretWord` ni `impostorPlayerId` antes del momento de revelación correspondiente.

La vista privada del caller debe derivarse de una lectura autoritativa específica. `get_my_active_room()` conserva su responsabilidad de Room, host, participants y lifecycle compartido; no incorpora palabra, impostor ni asignación privada.

# Sincronización de lobby

## Decisión

En Incremento 4, Realtime usa Postgres Changes solo como señal de invalidación:

```text
INSERT room_participants
DELETE room_participants
UPDATE rooms
→ get_my_active_room()
```

El payload de Realtime no es fuente de verdad. El lobby visible se reconstruye siempre desde la lectura autoritativa.

# Rooms activas

## Decisión

Un Player puede pertenecer a una sola Room activa de Impostor.

Un Group puede tener varias Rooms activas simultáneamente.

Si el Player ya pertenece a una Room activa y solicita crear otra, la operación devuelve la Room existente en lugar de crear una segunda Room ambigua.

# Código y enlace de Room

## Decisión

Cada Room tiene un código opaco de 8 caracteres, no secuencial. El código y el enlace son dos representaciones de la misma Room.

La ruta conceptual es:

```text
/impostor/sala/[code]
```

No existe `RoomInvitation` separada. QR queda fuera de Incremento 4.

---

# Banco de palabras

## Decisión

Las palabras o frases cortas pertenecen al grupo y no a una partida concreta.

Pueden agregarse en cualquier momento, incluso cuando no existe una sala activa.

La entidad persistente concreta del banco es `GroupWord`.

## Motivo

Queremos que el banco crezca progresivamente y se convierta en contenido propio del grupo.

---

# Fuentes de palabras

## Decisión

En el Incremento 3, el banco se alimenta con palabras creadas por los integrantes.

Inicialmente no necesitamos organizar obligatoriamente las palabras por categorías.

Las palabras precargadas quedan diferidas fuera del Incremento 3.

La opción futura preferida es un catálogo global separado, por ejemplo `default_words`, sin copiar automáticamente palabras iniciales a cada grupo.

---

# Visibilidad del banco

## Decisión

Ningún integrante puede explorar libremente el banco completo en el MVP del Incremento 3.

Cualquier integrante, incluido el administrador, puede conocer:

* las palabras que ellos mismos agregaron;
* la cantidad total disponible.

También puede borrar sus propios aportes.

## Motivo

Mostrar todas las palabras reduciría la sorpresa de rondas futuras.

Esta decisión evoluciona la política anterior: aunque el administrador podía consultar el banco completo en una versión conceptual inicial, en el MVP se elimina esa excepción porque el administrador también puede jugar y conocer todas las palabras le daría una ventaja innecesaria.

La moderación suficiente para esta etapa combina:

* borrado de aportes propios;
* duplicados automáticos;
* grupo cerrado por invitación.

---

# Alta de palabras

## Decisión

Cualquier integrante del grupo puede agregar palabras sin que exista una partida activa.

En el contexto inicial, las palabras ingresan directamente al banco.

## Motivo

Agregar palabras debe ser una acción espontánea y de baja fricción.

No queremos convertir al administrador en un cuello de botella.

---

# Validación automática

## Decisión

La aplicación debe resolver automáticamente los problemas sencillos de calidad de datos.

Inicialmente:

* impedir palabras vacías;
* normalizar espacios;
* comparar sin distinguir mayúsculas y minúsculas;
* impedir duplicados triviales;
* limitar longitud entre 2 y 40 caracteres;
* conservar tildes, `ñ` y puntuación;
* rechazar emojis.

La normalización no debe ser lingüísticamente agresiva. Por ejemplo, `Camion` y `Camión` son entradas distintas, mientras que `Elefante`, `elefante` y `ELEFANTE` son duplicados.

## Motivo

Estas comprobaciones son determinísticas y no requieren criterio humano.

El administrador no debería dedicar tiempo a tareas que el software puede resolver.

---

# Moderación

## Decisión

No habrá aprobación obligatoria de palabras en el MVP familiar.

En el Incremento 3 no se incorpora un panel administrativo para revisar y eliminar contenido de otros integrantes.

Cada autor podrá borrar sus propios aportes.

## Evolución posible

Si el producto se utiliza posteriormente en grupos menos controlados, podemos incorporar:

* palabras pendientes;
* aprobación;
* rechazo;
* límites de aportes;
* moderación adicional.

No implementaremos esas capacidades anticipadamente.

---

# Persistencia

## Decisión

Debemos distinguir dos tipos de estado.

### Persistente

Debe sobrevivir entre partidas:

* grupo;
* jugadores;
* banco de palabras.

### Temporal

Pertenece principalmente a una sesión:

* sala;
* participantes actuales;
* ronda;
* palabra seleccionada;
* impostor;
* votos;
* marcador de la tanda.

### Historial mínimo

Al finalizar una tanda debemos conservar un resumen histórico mínimo de la tanda y sus rondas.

El objetivo es poder construir más adelante estadísticas divertidas del grupo sin guardar datos innecesarios.

El historial de tanda debe preservar al menos:

* identificador;
* grupo;
* fecha/hora de inicio;
* fecha/hora de finalización;
* participantes;
* cantidad de rondas;
* puntuación final.

El historial de ronda debe preservar al menos:

* tanda;
* número de ronda;
* impostor;
* ganador (`group` o `impostor`);
* si el impostor fue descubierto;
* si el impostor adivinó la palabra.

No necesitamos conservar votos individuales históricos salvo que aparezca una razón concreta.

Este historial no define tablas, schemas ni base de datos.

---

# Privacidad de la ronda

## Decisión

Cada dispositivo debe recibir solamente la información privada necesaria para su jugador.

Un jugador normal recibe la palabra.

El impostor recibe únicamente su rol.

No debemos basar la privacidad solamente en ocultar información que ya fue enviada al navegador.

---

# Selección del impostor

## Decisión

En cada ronda existe exactamente un impostor.

La selección combina azar con balance.

Mientras existan jugadores que hayan sido impostores menos veces durante la tanda, tendrán prioridad frente a quienes ya ocuparon ese rol más veces.

Entre los jugadores elegibles, la selección es aleatoria.

## Motivo

Buscamos evitar repeticiones injustas sin hacer predecible quién será el próximo impostor.

---

# Selección de palabras

## Decisión

Una palabra utilizada no vuelve a aparecer durante la misma tanda.

Continúa perteneciendo al banco y puede utilizarse nuevamente en una tanda futura.

Para iniciar una ronda debe existir al menos una palabra del banco disponible que todavía no haya sido utilizada durante la tanda actual.

Si no quedan palabras disponibles, no puede comenzar una nueva ronda. La aplicación debe permitir agregar nuevas palabras o terminar la tanda, sin reutilizar automáticamente palabras ya usadas en esa misma tanda.

---

# Interacción durante la ronda

## Decisión

Después de distribuir la palabra y el rol, la conversación ocurre principalmente fuera de la aplicación.

La aplicación no controla:

* turnos;
* cantidad de pistas;
* duración;
* conversación.

Existe una primera vuelta en la que cada jugador participa al menos una vez y luego conversación libre.

## Motivo

La interacción social presencial es el centro del juego.

---

# Inicio de conversación

## Decisión

La aplicación selecciona autoritativamente quién da la primera pista de cada ronda, mediante azar equilibrado dentro de la `GameSession` actual. Primero considera a quienes hayan comenzado menos veces. Si varias personas empatan en ese mínimo, evita al impostor cuando existe otra alternativa y sortea entre las restantes. Si el impostor es la única persona con el conteo mínimo, puede empezar para preservar el balance. La selección no otorga ningún privilegio al host.

Después de esa primera intervención, el grupo continúa físicamente hacia la derecha. La aplicación no controla, registra ni avanza los turnos posteriores.

## Motivo

El azar equilibrado evita repeticiones injustas sin necesidad de coordinación presencial adicional. El desempate que evita al impostor reduce una ventaja accidental sin volver predecible a una única persona, y preserva el resto de la conversación libre fuera de la aplicación.

---

# Votación

## Decisión

La votación se realiza desde los dispositivos.

Cada jugador vota secretamente por quien considera impostor.

No puede votarse a sí mismo.

No se muestran resultados parciales.

El impostor vota como cualquier participante.

El host vota y no tiene voto especial.

Los resultados agregados se revelan cuando todos los `SessionPlayers` de la tanda registraron su voto.

La pertenencia a la tanda no depende de Presence ni liveness durante la votación. Un `SessionPlayer` desconectado sigue perteneciendo a la tanda, sigue siendo candidato y conserva su voto si ya votó. Si no vuelve y todavía no votó, la primera versión puede quedar esperando; timeouts, override del host o votación solo con conectados son políticas pendientes, no parte de la regla actual.

## Motivo

La votación secreta es uno de los momentos donde tener un teléfono por participante aporta valor real al juego.

---

# Empates

## Decisión

Si la primera votación termina empatada entre los jugadores con más votos:

1. se informa el empate;
2. el grupo puede discutir nuevamente;
3. se realiza una segunda votación;
4. solamente participan como candidatos los jugadores empatados.

En la segunda votación, el grupo solamente identifica al impostor si el impostor queda como único jugador con mayor cantidad de votos.

Cualquier otro resultado da la victoria al impostor.

Esto incluye:

* un nuevo empate;
* otro jugador como único más votado;
* cualquier resultado donde el impostor no sea el único más votado.

No hay más rondas de desempate.

Los candidatos empatados no se persisten como una lista separada.

La fuente autoritativa para reconstruirlos es la primera votación de la ronda:

```text
round_votes
WHERE round_id = ronda actual
AND voting_round = 1
```

El sistema calcula quiénes comparten la cantidad máxima de votos. Esta decisión evita duplicar estado derivable y mantiene una sola fuente de verdad para la segunda votación.

---

# Contrato documental de Incremento 8

## Decisión

El Incremento 8 cubre la primera votación completa:

```text
discussion
→ voting_first
→ voto secreto de todos los SessionPlayers
→ resolución automática
→ tie_discussion | impostor_guess | round_result
```

El host actual inicia la votación con `start_round_voting()`. La autoridad es `rooms.host_player_id` actual, no el administrador del Group, el creador original ni quien inició la tanda si luego fue reemplazado.

Cada voto se registra por Round y etapa. El voto es secreto, inmutable y único por voter/Round/votingRound.

La resolución ocurre automáticamente cuando entra el último voto requerido. No hay acción manual del host para cerrar la primera votación.

## Motivo

La primera votación debe ser un vertical completo para que el producto no quede en un estado intermedio donde todos votaron pero el sistema todavía espera otra acción. Al mismo tiempo, la segunda votación y el intento final del impostor se mantienen fuera para preservar slices pequeños.

La separación entre membership y availability evita que una desconexión cambie silenciosamente el cuerpo electoral de la tanda. Presence y liveness siguen siendo útiles para UX y sucesión de host, pero no son autoridad del roster congelado.

## Alcance excluido

Incremento 8 no implementa:

* segunda votación;
* resolución de segunda votación;
* intento final del impostor;
* reveal de palabra;
* scoring;
* scoreboard;
* nueva ronda;
* fin de tanda;
* Realtime/Broadcast de gameplay.

---

# Contrato documental de Incremento 9

## Decisión

El Incremento 9 cubre exclusivamente la rama de empate:

```text
tie_discussion
→ voting_second
→ voto secreto de todos los SessionPlayers
→ resolución automática definitiva
→ impostor_guess | round_result
```

El host actual inicia la segunda votación con:

```text
start_second_round_voting()
```

La RPC no recibe identificadores de ownership. La autoridad se deriva desde `auth.uid()` hacia `Player`, Room activa, `rooms.host_player_id` actual y GameSession.

Durante `voting_second`, `submit_round_vote(target_player_id)` registra `voting_round = 2`. El target debe pertenecer al conjunto de empatados reconstruido desde `voting_round = 1` y no puede ser el propio caller.

Todos los `SessionPlayers` votan también en segunda votación. El impostor vota, el host vota sin voto especial y los jugadores empatados votan. Presence y liveness no cambian el denominador.

La segunda votación no abre otra rama de desempate:

* si el impostor queda como único jugador más votado, la ronda pasa a `impostor_guess`;
* cualquier otro resultado pasa a `round_result` con victoria conceptual del impostor.

## Motivo

El empate necesita una segunda conversación presencial y una nueva decisión secreta, pero no necesita una entidad persistida adicional para candidatos.

Como la primera votación ya quedó registrada y completa antes de `tie_discussion`, reconstruir los empatados desde `round_votes` evita que dos representaciones del mismo dato se desincronicen.

## Alcance excluido

Incremento 9 no implementa:

* intento final del impostor;
* guess input;
* reveal de palabra;
* scoring;
* scoreboard;
* nueva ronda;
* historial;
* fin de tanda;
* Realtime/Broadcast de gameplay.

---

# Contrato documental de Incremento 10

## Decisión

El Incremento 10 cubre exclusivamente la etapa posterior a una identificación correcta del impostor:

```text
impostor_guess
→ submit_impostor_guess(guess_text)
→ comparación server-side
→ round_result
```

Solo el `SessionPlayer` que es el impostor de la ronda actual puede enviar el intento final.

La RPC futura recibe un único payload de producto:

```text
guess_text
```

No recibe `room_id`, `game_session_id`, `round_id`, `player_id`, `impostor_player_id`, `secret_word`, `normalized_secret_word`, `is_correct` ni `winner`.

La autoridad se deriva server-side desde:

```text
auth.uid()
→ Player
→ active Room
→ GameSession actual
→ Round actual
→ impostorPlayerId
```

El intento es único. Después de registrar un intento, no hay corrección, reemplazo ni segundo guess. Un retry del mismo request perdido debe reconstruirse desde el resultado ya persistido, no crear otra evaluación.

El servidor normaliza `guess_text` con la misma regla conceptual usada para `normalizedSecretWord`:

* trim;
* colapsar espacios internos;
* comparar sin sensibilidad a mayúsculas/minúsculas;
* comparación exacta del texto normalizado.

No se incorpora matching difuso, tolerancia ortográfica, sinónimos ni equivalencias semánticas en el MVP.

Si el texto normalizado coincide con la palabra secreta normalizada:

```text
winner = impostor
```

Si no coincide:

```text
winner = group
```

Luego la GameSession pasa a:

```text
round_result
```

## Privacidad y seguridad

Antes del intento, el impostor no recibe `secret_word`.

Los demás jugadores no pueden enviar el guess.

El cliente no decide si acertó.

La comparación ocurre en servidor.

No se expone `normalized_secret_word`.

La palabra secreta solo puede revelarse después de resolver el intento, dentro de `round_result`.

## Read model

Durante `impostor_guess`, `get_my_game_state()` debe exponer:

* estado `impostor_guess`;
* identidad pública del impostor señalado correctamente;
* indicador de si el caller puede enviar el intento final;
* ningún `secret_word`;
* ningún `normalized_secret_word`;
* ningún dato que permita inferir la palabra antes del intento.

Después de resolver, `get_my_game_state()` en `round_result` debe exponer:

* ganador conceptual `impostor | group`;
* si hubo intento final;
* texto visible del intento final;
* si el intento fue correcto;
* palabra secreta revelada;
* impostor real;
* resultado agregado de la votación que llevó a la resolución.

No expone `normalized_secret_word` ni necesita exponer el guess normalizado.

## Datos de resultado

`round_result` necesita datos adicionales para distinguir:

* victoria del impostor porque no fue identificado;
* victoria del impostor porque fue identificado y adivinó;
* victoria del grupo porque identificó al impostor y el impostor falló.

El resultado conceptual debe poder expresar:

```text
winner = impostor | group
impostorWasAccused = true | false
finalGuessText = texto visible o null
finalGuessCorrect = true | false | null
secretWord = revelable en round_result
```

`finalGuessCorrect = null` representa una ronda que no pasó por `impostor_guess`.

## UI mínima futura

Incrementos posteriores necesitan una pantalla `impostor_guess` con:

* mensaje claro de que el impostor fue señalado;
* formulario de un solo campo para el impostor;
* CTA de enviar intento solo para el impostor;
* pantalla de espera para los demás jugadores;
* prevención visual de doble envío;
* resultado posterior con palabra, intento y ganador.

## Alcance excluido

Incremento 10.0 no implementa:

* código;
* SQL;
* migrations;
* tests;
* UI;
* scoring;
* scoreboard;
* nueva ronda;
* historial;
* deploy;
* Realtime/Broadcast de gameplay.

---

# Última oportunidad del impostor

## Decisión

Si el impostor es descubierto, tiene una oportunidad para adivinar la palabra.

Primero se revela quién era el impostor.

La palabra permanece oculta.

El impostor envía un único intento desde la aplicación.

Después el servidor revela la palabra en `round_result` y registra autoritativamente si acertó.

## Motivo

Mantiene al impostor involucrado durante toda la conversación y evita que ser descubierto cierre automáticamente la ronda.

---

# Condiciones de victoria

## Victoria del impostor

El impostor gana si:

* el grupo acusa a otro jugador;
* en la segunda votación, el impostor no queda como único jugador con mayor cantidad de votos;
* es descubierto pero adivina correctamente la palabra.

## Victoria del grupo

El grupo gana si:

* identifica correctamente al impostor;
* y el impostor no logra adivinar la palabra.

---

# Puntuación

## Decisión

La puntuación inicial debe mantenerse deliberadamente sencilla.

### Victoria del impostor

El impostor recibe:

`+2 puntos`

Los jugadores normales no reciben puntos.

### Victoria del grupo

Cada jugador normal recibe:

`+1 punto`

El impostor no recibe puntos.

La ronda no otorga la misma cantidad de puntos en ambos casos: el impostor recibe 2 puntos cuando gana; cada jugador normal recibe 1 punto cuando gana el grupo.

La puntuación es individual. Si gana el grupo, puntúan todos los jugadores no impostores de la ronda; si gana el impostor, puntúa solo el impostor.

`round_winner` se representa como:

```text
impostor | group
```

No se introduce un ganador individual distinto de los jugadores que reciben puntos.

`round_winner` es el ganador final de la ronda, no el resultado intermedio de una votación. En particular:

* si el grupo acusa a otro jugador, `round_winner = impostor`;
* si la segunda votación no señala al impostor como único más votado, `round_winner = impostor`;
* si el grupo descubre al impostor y el impostor adivina la palabra, `round_winner = impostor`;
* si el grupo descubre al impostor y el impostor falla su intento final, `round_winner = group`.

La ronda queda cerrada para scoring cuando entra en `round_result` con `round_winner` definido.

Después del scoring, el lifecycle normal continúa:

```text
round_result
→ scoreboard
```

El marcador se acumula dentro de la tanda mediante el `score` de cada `SessionPlayer`.

No se introduce una entidad `Scoreboard` separada en la primera versión. `GameSession` mantiene la tanda y su fase `scoreboard`; `SessionPlayer` mantiene la puntuación individual acumulada; el scoreboard visible es un read model derivado del roster congelado y sus scores.

El cliente nunca calcula puntos ni decide ganadores. Solo la autoridad server-side muta scores a partir de `round_winner`.

## Motivo

Queremos que el marcador agregue continuidad y competencia sin convertir la partida en una optimización compleja de puntos individuales.

La diferencia `+2` para el impostor y `+1` para cada jugador normal compensa que el grupo reparte su victoria entre varios participantes, mientras el impostor juega solo.

---

# Duración de la tanda

## Decisión

No existe inicialmente un número fijo de rondas.

Después de cada ronda el host puede:

* iniciar otra ronda;
* terminar la tanda.

La nueva ronda reutiliza la misma `GameSession` y el mismo roster congelado de `SessionPlayers`.

Cada nueva ronda crea un `Round` con el número siguiente al mayor número existente en la tanda.

La palabra y el impostor se eligen server-side.

La palabra debe salir del banco disponible del grupo y no puede repetir una palabra ya usada durante la misma tanda.

Para evitar repeticiones se usa el snapshot normalizado de palabras ya jugadas en las rondas de la `GameSession`, no una lista enviada por el cliente.

El nuevo impostor se elige server-side usando la regla de balance vigente: tienen prioridad los jugadores que fueron impostores menos veces durante la tanda, y entre ellos se selecciona aleatoriamente.

Si no quedan palabras suficientes, no se crea la ronda. El host puede terminar la tanda; el grupo puede agregar palabras válidas al banco y luego intentar iniciar la nueva ronda otra vez.

No se define todavía un final automático por puntaje objetivo, por cantidad máxima de rondas ni por agotamiento de palabras.

## Motivo

El juego debe adaptarse naturalmente al contexto presencial.

Mantener la misma tanda evita reconstruir lobby entre rondas y conserva continuidad competitiva.

---

# Fuera del Incremento 11

Puntuación, marcador y nueva ronda no cierran todavía:

* terminar tanda con historial persistente mínimo;
* estadísticas históricas;
* ganador final de tanda por puntos;
* cambios de participantes durante una tanda;
* objetivo fijo de puntos;
* fin automático por puntaje;
* ranking histórico;
* moderación avanzada;
* categorías;
* palabras precargadas.

El historial mínimo sigue previsto para Incremento 12. Las estadísticas, ranking histórico, moderación avanzada, categorías y palabras precargadas pertenecen a decisiones posteriores.

---

# Terminar tanda e historial mínimo

## Decisión

Incremento 12 cierra la tanda activa desde el marcador y conserva un historial mínimo para estadísticas futuras.

Solo el host actual puede terminar la tanda.

La primera versión permite terminar únicamente desde `scoreboard`, después de una ronda cerrada y puntuada.

No se termina desde:

* `role_reveal`;
* `discussion`;
* `voting_first`;
* `tie_discussion`;
* `voting_second`;
* `impostor_guess`;
* `round_result`.

La transición de producto es:

```text
scoreboard
→ finished
```

`GameSession.finished_at` representa el instante autoritativo en que la tanda fue cerrada. Debe ser definido server-side en la misma operación que marca la tanda como `finished` y persiste el historial mínimo.

La Room queda cerrada al terminar la tanda:

```text
Room.status = closed
```

Esa Room no se reutiliza para otra tanda. Para jugar otra tanda después del resultado final, el grupo crea una nueva Room.

El resultado final se calcula por puntos acumulados en `SessionPlayer.score`.

Ganan la tanda todos los jugadores que empatan en el mayor puntaje final.

Por lo tanto el resultado final puede tener:

* un ganador único;
* múltiples ganadores empatados.

No existe estado de “sin ganador” si la tanda llegó a `scoreboard` con al menos una ronda puntuada y roster válido.

El cliente no decide ganador final, no arma historial, no envía scores finales y no cierra Room/tanda por sí mismo. La operación `end_session()` deriva contexto desde:

```text
auth.uid()
→ Player
→ Room activa
→ rooms.host_player_id actual
→ GameSession vigente
→ estado scoreboard
```

El cierre debe ser idempotente. Si la respuesta se pierde y el host reintenta, la operación devuelve el cierre ya persistido sin duplicar historial ni modificar resultados.

`get_my_game_state()` en `finished` debe exponer lo necesario para la pantalla final:

* `state = finished`;
* número de rondas jugadas;
* scores finales por jugador;
* ganador o ganadores finales;
* `finished_at`;
* acciones disponibles.

Host y no-host ven el mismo resultado final. El host puede tener CTA para volver al grupo o crear otra Room, pero no una acción especial sobre la tanda ya cerrada.

`can_start_next_round = false` en `finished`.

`can_end_session = false` en `finished`, porque la tanda ya terminó.

En `scoreboard`, `can_end_session` es un permiso autoritativo del read model. Queda en `true` sólo para el host actual cuando la ronda vigente está puntuada. El cliente lo usa para mostrar la acción `Terminar tanda`, pero no calcula ese permiso por su cuenta.

El historial de tanda conserva:

* `groupId`;
* referencia a la `GameSession` cerrada, si se decide conservarla;
* `startedAt`;
* `finishedAt`;
* roster final de participantes;
* scores finales por jugador;
* ganador o ganadores finales;
* cantidad de rondas jugadas;
* host que cerró la tanda.

El historial de ronda conserva:

* número de ronda;
* impostor;
* `round_winner`;
* si el impostor fue descubierto por votación;
* si hubo intento final del impostor;
* si el impostor adivinó la palabra;
* puntaje aplicado por esa ronda, derivable o persistido como resumen.

Las palabras usadas completas quedan fuera del historial mínimo inicial. La palabra permanece en el estado operativo de `Round` mientras exista para reconstrucción inmediata, pero el historial permanente no necesita guardar texto de palabras para estadísticas futuras.

Los votos individuales históricos quedan fuera. Se pueden conservar resultados agregados mínimos si son necesarios para derivar “impostor descubierto”, pero no quién votó a quién.

No se persiste historial de hosts por ronda. Solo se conserva, como auditoría mínima, el host que cerró la tanda.

La UI final del MVP muestra resultado final, ganador único o ganadores empatados, clasificación completa, puntajes finales, cantidad de rondas jugadas y `Volver al grupo`. No muestra detalle ronda por ronda, votos históricos ni palabras usadas.

## Motivo

Terminar sólo desde `scoreboard` evita cerrar una ronda a medias, perder input pendiente o tener que definir cancelaciones parciales.

Cerrar la Room mantiene el contrato vigente de Room temporal y evita diseñar reutilización, reseteo de participants, liveness y host entre tandas dentro de la misma Room.

El empate múltiple es más honesto y simple que inventar desempates invisibles por orden de join, host o azar.

El historial mínimo debe habilitar estadísticas futuras sin guardar datos sensibles o innecesarios, especialmente votos individuales y palabras completas.

---

# Alcance offline y PWA

## Decisión

Juegos Familiares sigue teniendo objetivo PWA.

La instalación y las capacidades progresivas de cache forman parte del proyecto.

Una partida multijugador completamente funcional sin conectividad no es requisito del MVP.

No prometemos soporte offline completo para salas sincronizadas.

El objetivo PWA incluye navegador y experiencia instalada tanto en iOS como en Android.

## Motivo

El objetivo PWA acompaña el aprendizaje y la experiencia de instalación.

La sincronización entre teléfonos en Impostor requiere conectividad en la primera versión jugable.

---

# Estadísticas futuras

## Decisión

La interfaz de estadísticas no forma parte obligatoria del primer MVP.

Sin embargo, desde las primeras partidas conservaremos el historial mínimo necesario para poder construir estadísticas futuras.

Ejemplos de estadísticas derivables:

* partidas jugadas;
* rondas jugadas;
* victorias por jugador;
* rendimiento como impostor;
* veces que un impostor fue descubierto;
* veces que un impostor acertó la palabra;
* victorias del grupo vs victorias del impostor;
* rachas;
* puntuaciones acumuladas u otras estadísticas derivables.

## Alcance

Estos ejemplos son posibilidades futuras, no requisitos de UI actuales.

No agregaremos datos históricos adicionales si no son necesarios para el conjunto mínimo definido.

---

# Alcance inicial

## Incluido

* grupo persistente;
* identidad sencilla;
* administración básica;
* banco persistente de palabras;
* agregar palabras;
* validación automática;
* crear sala;
* unirse a sala;
* múltiples teléfonos;
* un impostor por ronda;
* selección balanceada del impostor;
* distribución privada de roles;
* conversación presencial;
* votación secreta;
* resolución de empates;
* intento final del impostor;
* puntuación;
* marcador de tanda;
* historial mínimo de tandas y rondas finalizadas.

## No incluido inicialmente

* registro por email;
* contraseña;
* perfiles públicos;
* ranking global;
* matchmaking;
* chat;
* contenido público;
* moderación avanzada;
* compras;
* anuncios;
* interfaz de estadísticas;
* estadísticas históricas complejas;
* inteligencia artificial durante las partidas.

---

# Decisiones pendientes

Room + Lobby quedó cerrado en Incremento 4. La creación inicial de Group, la
invitación a otros dispositivos y el comportamiento técnico de
reconexión/recovery también quedaron definidos e implementados posteriormente.

Permanecen abiertas o pendientes de validación:

* experiencia de primera instalación en Android/iOS reales;
* validación física general de pérdida y recuperación de conexión;
* política de entrada o salida de jugadores durante una tanda.

Estas cuestiones no modifican el contrato de Room + Lobby ni las reglas centrales de la primera variante jugable.
