# Impostor — Requisitos técnicos

## Propósito

Este documento deriva requisitos técnicos del diseño actual de Impostor.

Impostor es el primer juego dentro de Juegos Familiares.

Algunos requisitos pertenecen a la aplicación contenedora, como PWA, compatibilidad iOS/Android, identidad liviana y grupo.

Otros requisitos, como salas, rondas, votos, palabra secreta, impostor, realtime y presencia, derivan específicamente de Impostor.

Responde:

> ¿Qué capacidades técnicas necesita realmente el MVP para soportar correctamente el producto que diseñamos?

No define todavía:

* stack;
* base de datos;
* proveedor realtime;
* hosting;
* autenticación concreta;
* APIs;
* tablas;
* arquitectura final.

Los requisitos buscan preservar:

* simplicidad;
* infraestructura proporcional;
* privacidad por diseño;
* mobile-first;
* PWA;
* aprendizaje progresivo;
* bajo costo cognitivo y operativo.

---

# 1. Cliente mobile-first

## Requisito MVP

La experiencia principal de Juegos Familiares debe funcionar correctamente en teléfonos.

Impostor debe integrarse dentro de esa experiencia mobile-first.

El cliente debe soportar:

* uso desde navegador;
* experiencia PWA instalada cuando esté disponible;
* pantallas móviles pequeñas;
* controles táctiles claros;
* lectura rápida en contexto social presencial;
* baja fricción para crear sala, unirse, votar y avanzar ronda.

La instalación de la PWA no debe ser obligatoria para jugar.

---

# 2. Compatibilidad PWA

## Requisito MVP

Juegos Familiares tiene objetivo PWA y debe contemplar explícitamente:

* iOS / Safari;
* Android / Chrome;
* uso sin instalación;
* uso como PWA instalada.

## Aspectos a considerar

La arquitectura futura debe permitir evaluar diferencias reales entre plataformas respecto de:

* instalación;
* manifest;
* service workers;
* cache;
* almacenamiento;
* actualización;
* segundo plano / primer plano;
* recuperación de sesión.

No se definen todavía soluciones técnicas concretas.

---

# 3. Estado compartido

## Requisito MVP

Debe existir estado compartido consistente entre dispositivos para:

* sala;
* participantes;
* host;
* tanda;
* ronda;
* fase global;
* confirmaciones individuales;
* votación;
* resultado;
* marcador.

Los teléfonos no deben decidir independientemente en qué etapa está la partida.

---

# 4. Realtime

## Requisito MVP

En Incremento 4, la entrada, salida y cierre del lobby deben propagarse con poca demora entre dispositivos mediante:

```text
Postgres Changes
→ aviso de cambio persistido
→ refetch autoritativo del lobby
```

El payload de Realtime no es fuente de verdad. Ante reconexión o eventos perdidos se ejecuta un refetch completo.

Para el lobby de Incremento 4:

* `room_participants INSERT` invalida y relee el lobby autoritativo;
* `rooms UPDATE` invalida y relee para cubrir el lifecycle persistido `lobby|closed`;
* `room_participants DELETE` invalida y relee cuando un participante no-host sale.

La autorización de Postgres Changes debe depender de RLS: un participante puede leer únicamente la
Room y membresías de su Room activa; otro Group, o un Player del mismo Group que no participa en esa
Room, no debe recibir filas útiles aunque intente suscribirse manualmente.

La sincronización de host por desconexión, fases, roles, votación, resultado y marcador pertenece a incrementos posteriores.

## RPCs de Room vigentes

Incremento 4 expone estas operaciones autoritativas:

```text
create_room()
join_room_by_code(room_code)
get_my_active_room()
leave_room()
close_room()
```

Salvo el código de join, las RPCs no reciben identificadores de ownership. La identidad, Player y Group se derivan desde `auth.uid()`.

`create_room()` recupera la Room activa existente si el Player ya pertenece a una. `join_room_by_code(room_code)` valida que la Room exista, esté en `lobby` y pertenezca al mismo Group. `get_my_active_room()` reconstruye el estado compartido autorizado de la Room activa del Player. `leave_room()` elimina la membresía de un no-host y cierra la Room si quien sale es el host mientras la Room sigue en lobby. `close_room()` solo puede ejecutarla el host de su Room activa mientras corresponde al lifecycle de lobby.

La garantía de una Room activa por Player se sostiene con una estructura técnica de slots activos. Esa estructura no es parte del dominio visible, pero evita que un Player quede en dos Rooms activas. El join bloquea la fila de Room antes de validar `lobby`, para que una carrera entre join y close no deje slots activos en una Room cerrada.

Las mutaciones directas sobre `rooms`, `room_participants` y slots activos no son API de cliente. El cliente solicita intenciones mediante RPCs.

## No requiere sincronización continua

No hace falta sincronizar digitalmente:

* conversación presencial;
* quién está hablando;
* contenido de pistas;
* duración exacta de intervenciones.

Realtime no se considera una capacidad obligatoria universal para todos los juegos futuros de Juegos Familiares.

---

# 5. Autoridad del sistema

## Requisito MVP

Debe existir una fuente autoritativa para las reglas compartidas.

Los clientes pueden solicitar acciones, pero no deben decidir unilateralmente:

* palabra seleccionada;
* impostor;
* resultado de votación;
* ganador;
* puntuación;
* transiciones de fase;
* reasignación del host.

La preparación de una ronda y la resolución de una votación deben ocurrir de forma coherente desde esa autoridad conceptual.

---

# 6. Identidad liviana

## Requisito MVP

El MVP no usa cuentas tradicionales con email y contraseña.

Debe reconocer de forma estable:

* jugador;
* grupo;
* identidad o sesión correspondiente.

Identidad, jugador y grupo pueden ser compartidos por distintos juegos dentro de Juegos Familiares.

La identidad local permite recordar qué jugador usa el dispositivo, pero no equivale por sí sola a autorización.

---

# 7. Autorización

## Requisito MVP

Las acciones protegidas deben validarse conceptualmente según capacidades.

## Administrador

Puede:

* consultar integrantes;
* eliminar integrantes.

En el Incremento 3 no tiene una excepción para consultar el banco completo.

## Host

Puede:

* iniciar tanda;
* iniciar votación;
* iniciar segunda votación;
* avanzar resolución;
* iniciar nueva ronda;
* terminar tanda.

## Participante

Puede:

* entrar a sala;
* confirmar rol;
* votar;
* consultar su información privada.

## Autor de palabra

Puede:

* consultar sus propias palabras;
* borrar sus propias palabras.

No se diseña todavía RBAC técnico.

---

# 8. Privacidad por jugador

## Requisito MVP

El sistema debe permitir vistas distintas según identidad y capacidad.

Debe cumplirse:

* el impostor no recibe la palabra;
* cada jugador recibe solamente su rol e información privada correspondiente;
* los votos individuales permanecen privados durante la votación;
* los resultados agregados se revelan cuando corresponde;
* ningún integrante necesita consultar el banco completo en el Incremento 3;
* cada integrante puede consultar la cantidad total disponible;
* el autor puede consultar y borrar sus propias palabras.

La privacidad no puede depender solamente de ocultar datos en la UI.

Las operaciones futuras del banco deben derivar pertenencia y autoría desde `auth.uid()`, `Player` y `Group`, sin confiar en identificadores enviados por el cliente.

La normalización y los duplicados triviales deben tener una garantía remota, no solamente validación visual en el cliente.

---

# 9. Persistencia duradera

## Requisito MVP

Debe persistir como mínimo:

* grupo;
* jugadores;
* banco de palabras;
* historial mínimo de tandas;
* historial mínimo de rondas.

Estos datos sobreviven entre partidas.

---

# 10. Estado operativo temporal

## Requisito de Incremento 4

Debe existir estado operativo persistible para coordinar:

* Room activa;
* Room cerrada;
* participación actual en Room;
* host inicial;
* lobby compartido.

Tanda, ronda, votos, estado de conexión y marcador pertenecen a incrementos posteriores.

## Requisito de Incremento 6

El lifecycle conceptual vigente de Room incorpora:

```text
lobby
playing
closed
```

Incremento 6 cerró el schema y las operaciones de Room para que `playing` sea físicamente representable sin romper invariantes existentes.

`start_session()` cambia la Room de `lobby` a `playing` de forma atómica. Una Room en `playing` no admite nuevos joins.

Una Room activa debe entenderse como:

```text
lobby OR playing
```

Por lo tanto:

* `lobby -> playing` conserva `player_active_room_slots`;
* `playing -> closed` libera `player_active_room_slots`;
* `create_room()` no debe crear una segunda Room si el Player ya está en una Room `playing`;
* `get_my_active_room()` debe poder reconstruir `lobby` y `playing` sin secretos;
* `leave_room()` y `close_room()` siguen siendo operaciones de lobby y no terminan gameplay;
* `RoomParticipant`, liveness, Presence autorizada y host succession siguen existiendo durante `playing`.

La Room sigue siendo necesaria durante gameplay para host actual, `RoomParticipant`, liveness, Presence, `joinedAt` y reconstrucción del contexto compartido. `GameSession` no copia ni reemplaza esa responsabilidad.

Aunque una implementación futura pudiera persistir técnicamente parte de este estado, conceptualmente debe distinguirse del historial permanente.

---

# 11. Historial mínimo

## Requisito MVP

Desde las primeras partidas debe conservarse suficiente información para estadísticas futuras.

## Tanda

Debe contemplar:

* grupo;
* participantes;
* inicio;
* fin;
* rondas jugadas;
* puntuación final.

## Ronda

Debe contemplar:

* número de ronda;
* impostor;
* ganador;
* si el impostor fue descubierto;
* si adivinó la palabra.

No se requiere conservar votos individuales históricos.

La UI de estadísticas no es parte obligatoria del primer MVP.

---

# 12. Consistencia

## Requisito MVP

Las operaciones compuestas deben completarse coherentemente.

Ejemplo: iniciar tanda y preparar Round 1 implica conceptualmente:

* validar caller;
* bloquear/serializar Room;
* validar host actual;
* actualizar actividad del caller antes del snapshot;
* determinar participantes elegibles;
* validar mínimo de 3;
* validar palabra disponible;
* crear GameSession;
* crear snapshot de SessionPlayers;
* seleccionar palabra;
* seleccionar impostor;
* crear Round 1;
* pasar Room a `playing`;
* dejar GameSession en `ROLE_REVEAL`.

No debería existir un estado parcial donde haya GameSession sin Round, Round sin palabra, Round sin impostor o GameSession sin SessionPlayers.

---

# 13. Concurrencia

## Requisito MVP

Debe contemplar acciones simultáneas de pocos dispositivos.

Casos mínimos:

* doble toque al crear o unirse a una Room;
* join y cierre de Room ocurriendo al mismo tiempo;
* START_SESSION compitiendo con join, leave, close o sucesión de host;
* salida de participante y cierre de Room ocurriendo al mismo tiempo;
* varios votos llegando casi al mismo tiempo;
* último voto disparando resolución;
* doble toque del host en `Nueva ronda`;
* doble toque del host al iniciar votación;
* reconexión de un jugador durante una fase activa.

El contexto inicial es un grupo familiar pequeño, normalmente cuatro jugadores.

No se diseña para escala masiva.

---

# 14. Idempotencia y prevención de duplicados

## Requisito MVP

El sistema debe evitar:

* dos Rooms activas para el mismo Player;
* slot activo en una Room cerrada;
* dos GameSessions para una misma Room;
* dos Rounds número 1 para una misma GameSession;
* voto duplicado;
* creación de dos rondas por reintento;
* iniciar dos veces la votación;
* ejecutar dos veces una transición importante;
* registrar dos veces el resultado final de una ronda.

Las transiciones críticas deben poder tolerar reintentos o dobles acciones del usuario sin romper el estado compartido.

---

# 15. Presencia

## Fuera de Incremento 4

Incremento 4 no necesita Presence para distinguir membresía de conexión. Incremento 5.1 cerró Presence básica para:

* conectado;
* desconectado.

Debe quedar separada de la pertenencia persistida:

```text
RoomParticipant = pertenencia a Room
Presence = disponibilidad efímera
```

La Presence del lobby debe estar acotada a la Room activa. El identificador interno preferido del canal es `roomId`, no `joinCode`.

Solo un Player autenticado que sea RoomParticipant de esa Room puede participar u observar su Presence.

Varias conexiones del mismo Player, como dos pestañas, deben representar un único Player lógico para `connected | disconnected`.

Presence no es autoridad suficiente para modificar `host_player_id` y un evento de pérdida de Presence no equivale inmediatamente a abandono.

5.1 validó esta Presence como canal privado de Room, autorizado por `RoomParticipant` y visible en lobby. No agregó heartbeat persistido, `last_seen_at`, threshold de stale ni sucesión.

Presence no se considera una capacidad obligatoria universal para todos los juegos futuros.

---

# 16. Liveness autoritativo y reasignación del host

## Incremento 5.2

5.2 cerró una señal backend verificable para determinar active/stale sin reasignar todavía el host.

La representación conceptual aprobada es:

```text
room_participants.last_seen_at
```

`last_seen_at` representa evidencia autoritativa de actividad reciente del Player dentro de esa Room.

No representa:

* Presence;
* conexión;
* abandono;
* host;
* ready;
* estado de juego.

Una nueva participación comienza con liveness reciente: `last_seen_at = now()`. La migration 5.2 aplica backfill acotado a Rooms en `lobby` y no fabrica liveness activo para Rooms cerradas.

La escritura usa una RPC `SECURITY DEFINER`:

```text
refresh_my_room_liveness()
```

El cliente no suministra:

* `player_id`;
* `room_id`;
* timestamp.

La RPC deriva:

```text
auth.uid()
→ Player
→ active Room
→ RoomParticipant propio
```

y utiliza tiempo server-side/Postgres.

Debe rechazar o no operar cuando:

* no hay Auth válida;
* no existe Player;
* no existe Room activa;
* el Player no pertenece a la Room;
* la Room no está activa.

El cliente refresca liveness como mínimo:

* al establecer o reconstruir correctamente la Room activa;
* al establecer correctamente Presence;
* periódicamente cada 30 segundos mientras la Room esté activa;
* al volver a foreground.

No debe refrescar por cada interacción de usuario.

La implementación puede evitar escrituras si `last_seen_at` fue actualizado hace menos de aproximadamente 10 segundos. Esto es protección técnica, no regla de producto.

La definición inicial es:

```text
active =
  last_seen_at no es null
  and now() - last_seen_at <= 90s

stale =
  last_seen_at es null
  or now() - last_seen_at > 90s
```

El reloj autoritativo es server-side/Postgres. El threshold inicial de 90 segundos reemplaza la hipótesis previa de 60 segundos por el margen necesario frente a heartbeat de 30 segundos, throttling, red y suspensión de timers móviles. No es una regla configurable ni una regla del juego.

Liveness es por Player-en-Room, no por conexión/tab. Dos pestañas pueden refrescar la misma fila.

No se expone una RPC pública `is_player_stale()` para frontend. La implementación encapsula el cálculo active/stale en una función SQL de soporte para tests y sucesión, sin alimentar UI.

## Incremento 5.3

5.3 cerró la sucesión autoritativa de host con una RPC `SECURITY DEFINER`:

```text
reassign_room_host_if_stale()
```

La RPC no recibe `player_id`, `room_id`, `host_player_id`, timestamp ni ningún argumento de ownership. Deriva autoridad desde:

```text
auth.uid()
→ Player
→ active Room
```

Cualquier `RoomParticipant` de la Room activa puede solicitar la evaluación. El caller no necesita ser host ni admin, pero tampoco puede elegir sucesor.

El cliente puede solicitar la evaluación cuando el host desaparece de Presence, cuando reconstruye lobby, al volver a foreground/reconectar o mediante un recheck lento inicial de 30 segundos mientras el host siga ausente. El backend revalida siempre antes de cambiar `host_player_id`.

Si el host deja de estar disponible, el sistema:

* observa una ausencia candidata desde cliente/Presence;
* revalida server-side el host actual y su liveness;
* aplica el threshold inicial de 90 segundos con reloj Postgres;
* identifica participantes restantes con liveness active;
* excluye al host actual y a participantes stale;
* si la Room está en `playing`, limita candidatos a `SessionPlayers` de la GameSession;
* ordena por `joined_at ASC, player_id ASC`;
* persiste el sucesor en `rooms.host_player_id` de forma autoritativa, consistente y resistente a carreras.

`player_id` es únicamente desempate técnico determinístico y no criterio visible de producto.

Si:

```text
Presence host = disconnected
last_seen_at todavía active
```

no hay sucesión.

Si el host está stale y no hay candidatos active válidos, la operación es no-op: la Room conserva su estado, el host actual permanece persistido, `host_player_id` no queda `null` y la Room no se cierra automáticamente.

Si el host original vuelve, vuelve como participante normal y no recupera automáticamente el rol.

No existe recuperación automática, `previous_host`, historial de hosts, host manual ni cierre automático por ausencia.

La implementación serializa la operación mediante locking de Room y revalidación de host/liveness dentro de la operación autoritativa. La validación cubrió dos callers simultáneos, B/C/D simultáneos, una sola transición efectiva, convergencia al mismo candidato determinístico, idempotencia posterior y revival vs sucesión según orden de serialización.

El cambio de host se propaga por el modelo existente:

```text
rooms.host_player_id cambia
→ Realtime invalida
→ get_my_active_room() vuelve a leer
→ todos observan el nuevo host
```

No se agregó Broadcast. Presence no se convierte en fuente de verdad del lobby persistente y el retorno de la RPC no reemplaza la reconstrucción autoritativa del lobby.

---

# 17. Reconexión

## Incremento 4: reconstrucción

La PWA debe poder recuperarse razonablemente de:

* refresh;
* cambio de aplicación;
* bloqueo del teléfono;
* pérdida breve de red;
* reapertura.

Debe poder reconstruir:

* identidad;
* grupo;
* sala activa, si corresponde;
* Room activa;
* host;
* participantes;
* estado de lobby.

La reconexión de Presence, estado online/offline, background móvil y fases de una partida queda fuera de Incremento 4.

---

# 18. Banco de palabras

## Requisito MVP

Antes de crear una ronda debe existir una palabra válida no utilizada en esa tanda.

Si no quedan palabras:

* no se crea nueva ronda;
* se permite agregar palabras;
* se permite terminar tanda;
* no se reutilizan automáticamente palabras ya usadas en esa tanda.

El banco debe validar entradas simples:

* valores vacíos;
* espacios innecesarios;
* duplicados triviales;
* diferencias de mayúsculas/minúsculas;
* límites razonables de longitud.

---

# 19. Selección aleatoria y balance

## Requisito MVP

La selección de palabra e impostor debe ocurrir en el lado autoritativo.

Para impostor:

* contar cuántas veces fue impostor cada `SessionPlayer` dentro de la `GameSession`;
* determinar el menor conteo;
* obtener jugadores elegibles;
* elegir aleatoriamente entre ellos.

El objetivo es combinar azar, variedad y distribución razonablemente equilibrada.

No hace falta persistir conceptualmente `impostorCount` si puede derivarse de rondas anteriores.

---

# 20. START_SESSION y vistas privadas

## Requisito de Incremento 6

`START_SESSION` debe ser una operación autoritativa, atómica e idempotente.

La autorización deriva server-side desde:

```text
auth.uid()
→ Player
→ Room
→ rooms.host_player_id actual
```

El cliente no demuestra autoridad enviando `host_player_id`, `player_id` ni `group_id`.

La lectura compartida de Room, incluida `get_my_active_room()` o su evolución compatible, no debe incorporar secretos:

* palabra secreta;
* impostor;
* asignación privada.

La vista privada se recupera mediante una lectura autoritativa específica del caller:

```text
get_my_game_state()
```

Debe derivar:

```text
auth.uid()
→ Player
→ Room
→ GameSession
→ SessionPlayer
→ Round actual
→ vista privada del caller
```

Realtime no debe transmitir filas o payloads con `secretWord` o `impostorPlayerId` a todos los participantes. Puede actuar como señal de invalidación o cambio compartido seguro. No se introduce Broadcast específico en Incremento 6.

En el cierre de Incremento 6 no se agregó Realtime de gameplay ni Broadcast. Las tablas `game_sessions`, `session_players` y `rounds` permanecen cerradas al cliente: RLS enabled, sin policies directas de cliente y sin grants CRUD de cliente.

## Requisito de Incremento 7

La transición siguiente de gameplay es:

```text
GameSession.state = role_reveal
→ discussion
```

No se usa `playing` como `GameSession.state`, porque `Room.status = playing` ya representa que la Room está dentro de gameplay y no admite nuevos joins.

El MVP no persiste:

```text
roleAcknowledged
role_acknowledged_at
allRolesSeen
```

La coordinación de que todos vieron su información ocurre presencialmente. La transición la solicita el host actual mediante una RPC específica:

```text
start_round_discussion()
```

La RPC es 0-args y deriva autoridad server-side:

```text
auth.uid()
→ Player
→ active Room
→ current rooms.host_player_id
→ SessionPlayer
```

Guards:

```text
authenticated caller
Player válido
active Room
Room.status = playing
caller = current Room host
caller ∈ SessionPlayers
GameSession coherente
current GameSession.state = role_reveal
current Round coherente
```

La transición es idempotente para retry:

```text
state = role_reveal → discussion, advanced = true
state = discussion → no-op exitoso, already_in_phase = true
otro state → transición inválida
```

El orden conceptual de locks mantiene Room como lock principal:

```text
resolver active Room
→ lock Room FOR UPDATE
→ validar current host
→ resolver/lock GameSession
→ transition
```

`get_my_game_state()` sigue siendo el read model autoritativo y admite:

```text
state = role_reveal | discussion
```

sin devolver datos públicos nuevos. La vista privada durante `discussion` permanece igual:

```text
normal → role = player, word = secret_word
impostor → role = impostor, word = null
```

No debe devolver `impostor_player_id`, `normalized_secret_word` ni roles de otros.

Como `role_reveal → discussion` no modifica `Room.status`, Incremento 7 sincroniza por polling lento de `get_my_game_state()` mientras `Room.status = playing`, con valor inicial de aproximadamente 3 segundos. El host que ejecuta la transición hace refetch autoritativo inmediato tras respuesta exitosa.

No se publica `game_sessions`, `session_players` ni `rounds` por Postgres Changes en Incremento 7. No se usa Room como bus artificial y no se agrega Broadcast. Broadcast privado de invalidación puede reevaluarse en incrementos posteriores, sin transportar secretos.

---

# 21. Votación

## Requisito MVP

Debe soportar:

* primera votación;
* segunda votación si corresponde;
* un voto por jugador por etapa;
* sin auto-voto;
* candidatos restringidos en segunda votación;
* conteo autoritativo;
* privacidad hasta la revelación.

La segunda votación es definitiva: el grupo solamente identifica al impostor si el impostor queda como único jugador con mayor cantidad de votos.

## Requisito de Incremento 8

El Incremento 8 cubre exclusivamente la primera votación como vertical completo:

```text
discussion
→ voting_first
→ todos los SessionPlayers votan una vez
→ resolución automática
→ tie_discussion | impostor_guess | round_result
```

No introduce `Round.status`. Durante gameplay, `Room.status = playing` y la fase global pertenece a `GameSession.state`.

Estados durables a admitir conceptualmente:

```text
voting_first
tie_discussion
impostor_guess
round_result
```

`tie_discussion` pertenece a Incremento 8 como resultado posible de la primera resolución. La segunda votación, su resolución, el intento final del impostor, reveal de palabra, acierto/error, scoring, scoreboard, nueva ronda y fin de tanda quedan fuera.

## Inicio de primera votación

Durante:

```text
GameSession.state = discussion
```

el host actual puede ejecutar:

```text
start_round_voting()
```

La RPC no recibe parámetros. La autoridad deriva desde:

```text
auth.uid()
→ Player
→ Room activa
→ rooms.host_player_id actual
→ GameSession actual
```

No autoriza al administrador del Group, al creador original ni a un host anterior. Debe ser idempotente frente a retry o respuesta perdida cuando la transición `discussion → voting_first` ya ocurrió.

## Quién vota

Los votantes requeridos son todos los `SessionPlayers` de la GameSession.

No se usa como denominador:

```text
RoomParticipants conectados
Presence activos
players active por liveness
```

Membership y availability permanecen separados. Presence/liveness pueden servir para UX o sucesión de host, pero no reemplazan el roster congelado ni deciden completion de votación.

Un `SessionPlayer` desconectado sigue perteneciendo a la tanda, sigue siendo candidato, puede votar si vuelve y conserva su voto si ya votó. Si no votó y no vuelve, la primera versión puede quedar esperando. Timeouts, override del host, expulsión de SessionPlayer y votación solo con conectados son políticas pendientes de hardening.

## Reglas del voto

Cada `SessionPlayer` vota exactamente una vez por Round y etapa de votación. El impostor también vota. El host también vota y no tiene voto especial.

No se puede votar a uno mismo. El voto es secreto, inmutable y no se puede cambiar una vez registrado. No se muestran resultados parciales.

La persistencia prevista es `RoundVote` o futura tabla `round_votes`:

```text
round_id
voting_round
voter_player_id
target_player_id
created_at
```

`voting_round` admite conceptualmente `1` y `2`, aunque Incremento 8 solo utiliza `1`. Puede existir redundancia técnica como `game_session_id` si ayuda a integridad referencial, sin convertirla en concepto de producto.

La identidad lógica debe garantizar un solo voto por:

```text
round_id
voting_round
voter_player_id
```

La futura implementación debe garantizar estructuralmente:

```text
voter ∈ SessionPlayers de esa GameSession
target ∈ SessionPlayers de esa GameSession
voter != target
máximo un voto por voter/round/voting_round
```

## Submit vote

RPC prevista:

```text
submit_round_vote(target_player_id uuid)
```

El `target_player_id` es una elección de dominio proporcionada por el usuario. No es ownership ni autorización confiada al cliente.

El servidor deriva desde `auth.uid()`:

```text
caller
Player
GameSession
Round actual
voter
```

y valida el target contra `SessionPlayers`.

Guards mínimos:

```text
caller ∈ SessionPlayers
GameSession.state = voting_first
target ∈ SessionPlayers
target != caller
sin voto previo distinto para round_id/voting_round/voter
```

Caso idempotente:

```text
A vota B
respuesta se pierde
A vuelve a mandar voto B
```

Debe ser éxito idempotente o resultado equivalente recuperable.

Caso no permitido:

```text
A ya votó B
A intenta votar C
```

Debe rechazarse como voto ya registrado/cambio no permitido. La unicidad estructural protege carreras simultáneas del mismo voter.

## Fin y resolución de primera votación

La votación termina automáticamente cuando todos los `SessionPlayers` registraron voto con `voting_round = 1`.

El host no cierra manualmente la votación. El último voto dispara la resolución autoritativa dentro de la misma operación/transacción lógica. No debe existir como estado estable:

```text
todos votaron
pero GameSession.state sigue voting_first
esperando otra RPC manual
```

Después del último voto requerido, el sistema cuenta votos autoritativamente:

* empate en el máximo → `tie_discussion`;
* impostor único más votado → `impostor_guess`;
* otro jugador único más votado → `round_result`.

En `tie_discussion`, debe conservarse o poder reconstruirse el conjunto de candidatos empatados necesario para Incremento 9. En `impostor_guess`, puede revelarse quién era el impostor, pero no la palabra secreta. En `round_result`, conceptualmente `winner = impostor`, sin implementar todavía puntos, scoreboard, historial, next round ni fin de tanda.

## Privacy y read model de voting

Durante `voting_first`, el jugador puede conocer:

```text
state
round_number
candidatos autorizados
su propio voto / si ya votó
```

No puede conocer:

```text
votos individuales ajenos
target de otro jugador
conteos parciales por candidato
quién votó a quién
impostor_player_id
secret_word si caller es impostor
```

El host no tiene acceso informativo extra. Su autoridad es capacidad de transición, no acceso a secretos.

Se prefiere extender `get_my_game_state()` en lugar de crear una lectura separada solo para voting. La función sigue representando la vista autorizada del caller y debe discriminar por `GameSession.state`. Los candidatos se derivan de:

```text
SessionPlayers
JOIN Player
```

No de `RoomParticipants` actuales.

Después de cerrar la primera votación pueden exponerse resultados agregados:

```text
nickname/candidato
cantidad de votos
```

Nunca es necesario exponer quién votó a quién.

## Sync y recovery

Incremento 8 mantiene polling lento de:

```text
get_my_game_state()
```

con valor inicial aproximado de 3 segundos.

No introduce:

```text
Broadcast
Realtime gameplay
Postgres Changes para game_sessions
Postgres Changes para round_votes
```

`round_votes` permanece privada al cliente: sin SELECT/INSERT/UPDATE directos y sin publicación Realtime.

Si `start_round_voting()` cambia `discussion → voting_first` pero la respuesta se pierde, el cliente debe recuperar éxito releyendo `get_my_game_state()`. Si `submit_round_vote()` registra el voto pero la respuesta se pierde, el caller debe poder releer `get_my_game_state()` y descubrir su voto persistido.

Refresh durante voting debe reconstruir:

```text
state
candidates
my_vote
resultado si voting ya terminó
```

sin depender de eventos históricos del cliente.

## Concurrencia prevista

`start_round_voting()` debe validar host actual y fase de forma consistente. Locking esperado:

```text
Room FOR UPDATE
→ GameSession FOR UPDATE
```

`submit_round_vote()` no necesita bloquear Room por cada voto. Lock mínimo recomendado:

```text
resolver caller/GameSession/Round
→ GameSession FOR UPDATE
→ validar state
→ insertar voto
→ comprobar cantidad
→ resolver si fue el último
```

Para grupos de 3 a 8 jugadores, esta serialización breve por GameSession es proporcional y auditable. La constraint única protege doble voto concurrente.

Errores de dominio mínimos:

```text
not_host
not_in_voting
not_session_player
invalid_vote_target
already_voted
inconsistent_game_state
```

No se exponen errores SQL internos al usuario. Self-vote puede agruparse como `invalid_vote_target`, pero debe tener validación específica.

---

# 22. Offline

## Requisito MVP

Debe quedar explícito:

* PWA sí;
* cache progresivo cuando aporte valor;
* una partida multi-dispositivo completamente offline no es requisito del MVP;
* no se diseña peer-to-peer offline.

La sincronización entre teléfonos requiere conectividad en la primera versión jugable.

Esta necesidad de sincronización corresponde a Impostor.

---

# 23. Escala

## Requisito MVP

El diseño técnico debe optimizar para el caso real inicial:

* grupo familiar pequeño;
* normalmente cuatro jugadores;
* rango aproximado de tres a ocho jugadores;
* pocas salas simultáneas;
* volumen pequeño o medio de palabras e historial.

No se debe optimizar prematuramente para comunidades públicas, matchmaking o gran escala.

---

# 24. Experiencia de desarrollo y aprendizaje

## Criterio para comparar arquitecturas

La futura solución técnica debería favorecer:

* TypeScript;
* documentación clara;
* testing;
* desarrollo local razonable;
* observabilidad básica;
* poco boilerplate;
* costos bajos;
* comprensión progresiva de los conceptos.

El costo cognitivo debe formar parte de la comparación de arquitecturas.

Esto no elige todavía framework, proveedor ni infraestructura.

---

# Requisitos obligatorios del MVP

1. Cliente mobile-first usable desde navegador en teléfonos.
2. Compatibilidad objetivo con iOS / Safari y Android / Chrome.
3. Experiencia PWA instalable sin que la instalación sea obligatoria.
4. Estado compartido consistente de sala, tanda, ronda, fase, participantes, host, votación, resultado y marcador.
5. Propagación con poca demora de cambios de fase, lobby, votos completados, resultados, marcador y host.
6. Fuente autoritativa para palabra, impostor, resultados, puntuación y transiciones.
7. Identidad liviana estable para jugador y grupo, separada de autorización.
8. Autorización conceptual para administrador, host, participante y autor de palabra.
9. Vistas privadas por jugador, sin enviar secretos al dispositivo equivocado.
10. Persistencia duradera de grupo, jugadores, banco de palabras e historial mínimo.
11. Estado operativo temporal para salas, tandas, rondas, votos, disponibilidad efímera y marcador activo.
12. Historial mínimo de tandas y rondas finalizadas para estadísticas futuras.
13. Consistencia en operaciones compuestas como preparar ronda y resolver votación.
14. Concurrencia básica para pocos dispositivos actuando al mismo tiempo.
15. Prevención de duplicados en votos, rondas y transiciones críticas.
16. Presencia básica conectado/desconectado acotada a Room activa.
17. Reasignación autoritativa del host usando liveness verificable, threshold inicial y `joinedAt`.
18. Recuperación razonable ante refresh, reapertura, segundo plano y pérdida breve de red.
19. Validación y privacidad del banco de palabras.
20. Selección autoritativa y balanceada del impostor.
21. Votación secreta de primera y segunda etapa.
22. Alcance offline acotado: PWA y cache progresivo, sin partida multi-dispositivo offline.

---

# Capacidades deseables / futuras

* Interfaz de estadísticas.
* Estadísticas históricas complejas.
* Moderación avanzada de palabras.
* Límites de aportes o aprobación de palabras.
* Perfiles públicos.
* Matchmaking.
* Ranking global.
* Chat.
* Partidas remotas fuera del contexto presencial.
* Reglas avanzadas de reconexión.
* Presencia más sofisticada.
* Offline más amplio si aparece una necesidad real.
* Optimización para comunidades grandes.

---

# Decisiones todavía abiertas

* Cómo se crea inicialmente un grupo.
* Cómo se invita a otro dispositivo al grupo.
* Cómo se crea y comparte una sala.
* Si conviene código, enlace, QR o combinación.
* Comportamiento detallado cuando un jugador pierde conexión.
* Entrada o salida de jugadores durante una tanda.
* Forma técnica de persistir historial mínimo.
* Mecanismo concreto para estado compartido y realtime.
* Estrategia concreta de PWA para diferencias iOS/Android.

---

# Preguntas para evaluar tecnologías

## Persistencia

* ¿Permite persistir grupo, jugadores, banco de palabras e historial mínimo sin complejidad excesiva?
* ¿Permite distinguir claramente estado operativo temporal e historial permanente?
* ¿Qué costo introduce para migrar o ajustar el modelo?

## Realtime

* ¿Puede propagar cambios de sala y partida con poca demora para grupos pequeños?
* ¿Permite mantener una progresión autoritativa de estados?
* ¿Qué complejidad agrega frente a alternativas más simples?

## Privacidad

* ¿Permite entregar vistas distintas por jugador?
* ¿Evita que la palabra llegue al impostor?
* ¿Evita exponer votos individuales durante la votación?
* ¿Evita exponer el banco completo en el Incremento 3?
* ¿Permite consultar cantidad total y aportes propios sin revelar aportes ajenos?

## Autorización

* ¿Puede representar capacidades de administrador, host, participante y autor sin sobrediseño?
* ¿Cómo evita que la identidad local se convierta indebidamente en autoridad?

## Consistencia

* ¿Puede ejecutar de forma coherente operaciones compuestas como preparar ronda o resolver votación?
* ¿Cómo evita estados parciales inválidos?

## Concurrencia

* ¿Cómo maneja votos simultáneos?
* ¿Cómo evita doble creación de ronda o doble transición por reintentos?
* ¿Es suficiente para pocos dispositivos sin diseñar para escala masiva?

## Presencia

* ¿Permite distinguir conectado/desconectado de manera simple?
* ¿Permite acotar Presence a una Room activa y autorizarla por RoomParticipant?
* ¿Cómo deduplica varias conexiones del mismo Player?
* ¿Qué tan confiable es en navegador móvil?
* ¿Qué señal remota verificable de liveness permite validar staleness sin confiar en otro cliente?

## Reconexión

* ¿Puede recuperar identidad, grupo, sala activa y fase actual tras refresh o reapertura?
* ¿Qué ocurre al volver desde segundo plano?
* ¿Qué responsabilidad queda en el cliente y cuál en la fuente autoritativa?

## PWA iOS/Android

* ¿Funciona bien desde Safari en iOS y Chrome en Android?
* ¿Qué limitaciones tiene para instalación, cache, almacenamiento y actualización?
* ¿Cómo se comporta al pasar a segundo plano y volver?

## Historial

* ¿Permite conservar el resumen mínimo desde las primeras partidas?
* ¿Evita guardar votos individuales históricos sin necesidad?
* ¿Permite derivar estadísticas futuras sin rediseñar todo?

## Costos

* ¿Cuál es el costo inicial para un grupo familiar pequeño?
* ¿Qué costos aparecen si hay más grupos o más historial?
* ¿Hay costos fijos aunque el uso sea bajo?

## Complejidad operativa

* ¿Cuánto mantenimiento exige?
* ¿Requiere configurar demasiadas piezas para el MVP?
* ¿Qué tan fácil es depurar una partida real?

## Experiencia de desarrollo

* ¿Favorece TypeScript, testing y desarrollo local?
* ¿Tiene buen soporte para errores y observabilidad básica?
* ¿Reduce boilerplate o lo aumenta?

## Aprendizaje

* ¿Permite entender progresivamente cliente/servidor, estado compartido, realtime, privacidad y PWA?
* ¿Las decisiones importantes siguen siendo explicables?

## Lock-in

* ¿Qué tan difícil sería cambiar de proveedor o estrategia después?
* ¿El dominio del juego queda separado de la infraestructura?
* ¿Las reglas pueden probarse sin depender del proveedor elegido?
