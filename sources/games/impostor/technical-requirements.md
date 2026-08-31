# Impostor — Requisitos técnicos

## Propósito

Este documento deriva requisitos técnicos del diseño actual de Impostor.

Impostor es el primer juego dentro de Juegos Familiares.

Algunos requisitos pertenecen a la aplicación contenedora, como PWA, compatibilidad iOS/Android, identidad liviana y grupo.

Otros requisitos, como salas, rondas, votos, palabra secreta, impostor, realtime y presencia, derivan específicamente de Impostor.

Responde:

> ¿Qué capacidades técnicas necesita realmente el MVP para soportar correctamente el producto que diseñamos?

Este documento nació como marco de requisitos independiente de proveedor. Por eso, en su formulación conceptual original no definía:

* stack;
* base de datos;
* proveedor realtime;
* hosting;
* autenticación concreta;
* APIs;
* tablas;
* arquitectura final.

Para el MVP actual, la implementación ya eligió Next.js y Supabase. La selección tecnológica vigente se desarrolla en `sources/architecture.md` y `sources/implementation-plan.md`; los requisitos de este documento siguen siendo útiles para evaluar si esa implementación respeta las capacidades, límites y riesgos del producto.

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

# 17. Reconexión autoritativa

## Incremento 4: reconstrucción de lobby

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

## Incremento 13.0: contrato documental

Incremento 13.0 define el contrato autoritativo de reconexión para implementar y validar 13.1 a 13.5. No cambia RPCs, Realtime, Presence, heartbeat, RLS ni modelo de datos.

La regla central es:

```text
servidor / DB = autoridad
frontend = cache temporal / presentación
```

Después de cualquier reconexión relevante, el estado autoritativo vigente reemplaza estado local stale. El estado local anterior nunca debe sobreescribir autoridad actual ni habilitar acciones de una fase pasada.

### Qué cuenta como reconexión

Para Incremento 13, reconexión significa cualquier evento que obligue al cliente a reconciliar su vista con servidor porque pudo haber perdido eventos, timers o contexto local:

* mount inicial de `/impostor/sala/[code]`;
* refresh;
* reapertura de pestaña o navegador;
* reapertura de PWA instalada;
* `visibility hidden → visible`;
* retorno desde lock screen o app switching;
* `offline → online`;
* recuperación después de resuscripción Realtime;
* retry manual luego de error recuperable.

Estos triggers pueden tener implementaciones distintas, pero deben converger hacia una misma reconciliación autoritativa. `focus` no queda como trigger obligatorio en 13.0: sólo debe agregarse en 13.1 si aporta cobertura real no resuelta por `visibility`/`online` y no duplica eventos sin control.

Múltiples triggers cercanos deben coalescerse mediante single-flight, dedupe o mecanismo equivalente para evitar tormentas de refetch, resuscripción o evaluación de sucesión.

### Orden de reconstrucción

El orden conceptual después de reconectar es:

```text
1. recuperar sesión Auth actual
2. reconstruir Player / Group con bootstrapPlatformContext()
3. recuperar Room activa con getMyActiveRoom()
4. reconciliar Room.status, host y participants
5. si Room.status = playing, recuperar GameSession vigente con getMyGameState()
6. si no hay Room activa, intentar reconstruir resultado finished permitido con getMyGameState()
7. recuperar fase vigente de GameSession
8. recuperar estado privado autorizado del caller
9. recuperar acción propia persistida
10. limpiar estado local incompatible o stale
11. restablecer Realtime / Presence para la Room activa cuando corresponda
12. refrescar liveness con refreshMyRoomLiveness() cuando haya Room activa
13. solicitar reassignRoomHostIfStale() cuando haya ausencia candidata o recovery relevante
14. renderizar UI desde el estado actual del servidor
```

`Room` va primero porque contiene pertenencia activa, estado `lobby|playing|closed`, host actual, participants, liveness y Presence. `GameSession` va después para fase y vista privada. La excepción documentada es `finished`: una Room cerrada deja de ser activa, pero un `SessionPlayer` histórico debe poder reconstruir el resultado final desde `get_my_game_state()` aunque `get_my_active_room()` ya no devuelva Room activa.

Si la URL `/impostor/sala/[code]` no coincide con la Room activa del Player, la UI no debe fingir que esa sala está viva. Debe aceptar el estado remoto: recuperar la Room activa real si existe, mostrar que no hay Room activa si la Room del enlace ya cerró, o permitir volver al grupo según el comportamiento vigente.

### Estado que debe reconstruirse

La reconciliación debe recuperar, cuando corresponda y si el caller está autorizado:

* `AuthIdentity`;
* `Player`;
* `Group`;
* Room activa;
* host actual;
* `Room.status`;
* participants de Room;
* número de ronda;
* fase vigente;
* rol vigente del caller;
* palabra vigente del caller si corresponde a su rol y fase;
* voto propio ya enviado;
* `my_vote_target_player_id` cuando el read model lo devuelve;
* elegibilidad para intento final del impostor;
* score;
* resultado `finished`.

### Estado local que puede perderse

No se consideran bugs de reconexión si se pierden:

* reveal abierto/cerrado;
* modal abierto;
* selección de voto todavía no enviada;
* input de guess no enviado;
* feedback temporal;
* estado visual efímero.

El reveal privado vuelve inicialmente oculto después de refresh/reconnect. Esto es aceptable y deseado. El rol y la palabra vigentes deben seguir siendo correctos para la ronda actual. Si la ronda cambió, ningún secreto anterior debe quedar visible.

### Contrato por fase

| Fase | Estado compartido autoritativo | Estado privado | Acción propia persistida | UI esperada al reconectar |
| --- | --- | --- | --- | --- |
| `lobby` | Room `lobby`, host, participants, código/enlace, Presence efímera | ninguno | pertenencia a Room | lobby actual o salida al grupo si Room cerró |
| `role_reveal` | Room `playing`, GameSession, Round, roster, round number | rol y palabra sólo para no-impostor | ninguna confirmación persistida | reveal oculto; botón para ver rol/palabra vigente |
| `discussion` | fase, host, roster, round number | misma vista privada autorizada del caller | ninguna | conversación vigente; reveal local oculto salvo estado efímero preservado en mismo montaje |
| `voting_first` | fase y candidatos desde `SessionPlayers` | rol/word según reglas vigentes, sin parciales | voto propio de `voting_round = 1` | votar si no votó; espera si `has_voted = true`; fase siguiente si avanzó |
| `tie_discussion` | resultado agregado de primera votación y candidatos empatados derivados | ningún secreto adicional | voto de primera etapa ya cerrado | ver empate vigente; host actual puede iniciar segunda votación si read model lo permite |
| `voting_second` | candidatos empatados autorizados, sin parciales | ningún secreto adicional | voto propio de `voting_round = 2` | votar si no votó; espera si `has_voted = true`; usar `my_vote_target_player_id` si llega |
| `impostor_guess` | impostor identificado, fase vigente, palabra aún oculta | `can_submit_impostor_guess` sólo para impostor | guess ya enviado si la fase avanzó a resultado | form sólo si sigue elegible; espera para los demás; no reofrecer submit tras guess persistido |
| `round_result` | ganador de ronda, palabra revelada, guess si existió, resultado agregado | sin secretos pendientes | votos/guess ya cerrados | resultado vigente; no habilitar acciones de votación/guess |
| `scoreboard` | scores acumulados, host actual, disponibilidad de nueva ronda/cierre | sin secretos pendientes de ronda cerrada | ninguna acción individual abierta | marcador vigente; CTA host-only según read model |
| `finished` | historial mínimo, scores finales, ganadores, rondas, `finished_at` | sin secretos pendientes | tanda cerrada | resultado final compartido aun sin Room activa; sin nueva ronda ni terminar tanda |

### Fase que avanza mientras el Player está fuera

Si el Player sale en fase A, otros avanzan a fase B y el Player vuelve, debe ver fase B. No se restaura fase A desde cache local.

Ejemplos:

```text
discussion → voting_first
voting_first/voting_second → scoreboard o fase posterior
role_reveal → discussion
scoreboard → role_reveal de nueva ronda
scoreboard → finished
```

### Room cerrada y finished

Si una Room activa pasa a `closed` mientras el Player está fuera:

```text
getMyActiveRoom()
→ no Room activa
```

La ruta `/impostor/sala/[code]` no debe quedarse mostrando una sala viva. Si existe una `GameSession finished` para ese Player, `get_my_game_state()` debe reconstruir el resultado final histórico permitido. Si no hay resultado final recuperable, la UI debe ofrecer volver al Group y permitir crear o unirse a otra Room según el estado actual.

### Foreground, lock screen y app switching

`hidden → visible`, desbloquear el teléfono y volver desde otra app son variantes de suspensión/background. Los timers pueden no haber corrido; no se debe confiar en heartbeat, polling ni Presence durante la suspensión.

Al volver, el cliente debe reconciliar suficiente estado para corregir:

* fase vieja;
* host viejo;
* Room vieja;
* liveness stale;
* suscripciones Realtime perdidas.

### Offline corto y largo

Offline corto puede conservar el último estado compartido visible con feedback de conectividad si existe, pero al recuperar `online` debe ejecutar reconciliación autoritativa. No se promete gameplay offline.

Offline largo, suficiente para que liveness quede stale o ocurra sucesión de host, debe aceptar el estado actual del servidor. Si el host original vuelve después de una sucesión, vuelve como participante normal y no recupera host automáticamente.

### Presence, liveness y Realtime

La separación obligatoria es:

```text
Presence = señal efímera Realtime
liveness = estado autoritativo basado en last_seen_at
Room membership = DB
authorization = auth.uid() + RLS/RPC
```

Presence no es fuente de autorización ni de host. Realtime invalida o avisa; RPC/read model reconstruye verdad actual. Después de resuscripción Realtime, el estado inicial debe venir de RPC/read model, no de eventos pendientes ni payloads perdidos.

El heartbeat vigente es de 30 segundos. Si el browser fue suspendido, puede faltar. Foreground recovery debe refrescar liveness. El threshold DB de stale sigue siendo 90 segundos y el throttling de escritura sigue siendo aproximadamente 10 segundos. La evaluación cliente de sucesión conserva el recheck lento inicial de 30 segundos.

### Host succession

La DB decide la sucesión. El cliente sólo puede solicitar evaluación.

Contrato vigente:

```text
host stale = last_seen_at null o now() - last_seen_at > 90s
candidato = RoomParticipant active
           excluye host actual
           y en playing pertenece a SessionPlayers
orden = joined_at ASC, player_id ASC
sin candidato = no-op
host original vuelve = participante normal
```

No existe reclaim automático del host original.

### Multi-tab y multi-device

Mismo Player con varias pestañas o conexiones puede producir múltiples refs de Presence. La UI debe deduplicar por Player lógico. Mientras una pestaña válida siga refrescando liveness, el Player puede seguir active. Cerrar una sola pestaña no debería conceptualmente desconectar al Player si otra sigue activa.

Multi-device con la misma identidad no es flujo normal fuerte del producto. Si ocurre, se trata como múltiples conexiones del mismo Player y queda como validación best-effort dentro del Incremento 13.

La expectativa multi-tab/multi-device queda como contrato esperado pendiente de validación práctica en 13.3/13.5.

### UI reconnecting/offline y errores

Incremento 13 puede definir estados locales de UI:

```text
reconnecting
offline
error
retry
```

No requiere un sistema global. Deben mantenerse locales a Room/gameplay si alcanza.

Durante reconciliación:

* no mostrar información privada stale como si fuera vigente;
* no habilitar acciones potencialmente incorrectas;
* se puede conservar estado compartido anterior con indicador visual si queda claro que está reconciliando;
* no borrar estado autoritativo válido ante fallas parciales si puede ofrecer retry.

Política mínima:

| Falla | Efecto |
| --- | --- |
| Auth failure | bloquea gameplay protegido; volver a flujo sin contexto reconocido |
| Player/Group fetch failure | bloquea Room/gameplay; mostrar error reintentable |
| Room fetch failure | bloquea acciones de Room; conservar último compartido sólo como stale indicado |
| Game state failure | bloquea acciones de gameplay y privados; retry |
| Presence failure | degrada disponibilidad visual; no bloquea estado autoritativo |
| liveness failure | mostrar o registrar degradación si afecta host recovery; retry, no borrar Room |
| host succession evaluation failure | no bloquear gameplay del no-host; mantener host autoritativo leído y reintentar evaluación cuando corresponda |

### Matriz mínima de validación 13

| Escenario | Validación esperada |
| --- | --- |
| refresh en `role_reveal` | desktop + mobile real; reveal oculto y secreto vigente correcto |
| refresh en `voting_first` después de votar | DB/integration + browser; `has_voted` y voto propio recuperados |
| refresh en `voting_second` después de votar | DB/integration + browser; `my_vote_target_player_id` de segunda etapa recuperado |
| refresh en `scoreboard` | browser; marcador y permisos host-only reconstruidos |
| refresh en `finished` | DB/integration + browser; resultado final sin Room activa |
| background corto guest | mobile real; vuelve a fase/Room actual |
| background corto host | mobile real; liveness refresh sin sucesión indebida |
| background largo host con succession | mobile real + DB; nuevo host autoritativo, host original vuelve normal |
| offline corto en votación | manual smoke; al volver recupera voto/fase vigente |
| fase avanza mientras Player está fuera | manual smoke + browser; vuelve a fase B |
| Room termina mientras Player está fuera | DB/integration + browser; no sala viva falsa, `finished` si corresponde |
| host original vuelve después de succession | DB/integration + manual; no reclaim automático |
| multi-tab mismo Player | browser smoke; Presence dedupe y liveness por Player |

### Alcance de subincrementos

* 13.0: contrato documental.
* 13.1: triggers de reconstrucción autoritativa para mount, retry, foreground, online y recovery Realtime implementados técnicamente; smoke manual focal pendiente.
* 13.2: UI mínima `reconnecting/offline/error/retry` y bloqueo seguro de acciones implementados técnicamente; smoke manual focal pendiente.
* 13.3: recovery foreground de Presence/liveness, resubscribe y multi-tab.
* 13.4: recovery de host succession ante stale, retorno del host original y concurrencia.
* 13.5: matriz final de tests, DB validators, smoke físico acotado y documentación final.

No se prevé backend nuevo salvo que la validación revele un caso no representable con los read models actuales.

### Fronteras con 14 y 15

Incremento 13 no convierte Impostor en offline-capable. Quedan fuera: service worker, estrategia de cache, offline shell, asset caching, update behavior, install behavior, background sync, cache de secretos y quirks específicos de plataforma PWA. Eso pertenece al Incremento 14.

Incremento 15 conserva playtest amplio, ergonomía, stress final y polish visual. Incremento 13 sí requiere smoke físico mínimo para suspensión/reconnect por el riesgo del lifecycle móvil.

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

Los candidatos empatados de la segunda votación son estado derivado. No se agrega una tabla, columna ni array JSON persistido para `tie_candidates`. La autoridad los reconstruye desde `round_votes` de la ronda actual con `voting_round = 1`, calculando quiénes comparten la cantidad máxima de votos.

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

En `tie_discussion`, el conjunto de candidatos empatados necesario para Incremento 9 se reconstruye desde `round_votes` de `voting_round = 1`. En `impostor_guess`, puede revelarse quién era el impostor, pero no la palabra secreta. En `round_result`, conceptualmente `winner = impostor`, sin implementar todavía puntos, scoreboard, historial, next round ni fin de tanda.

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

## Requisito de Incremento 9

El Incremento 9 cubre exclusivamente la rama posterior a un empate de primera votación:

```text
tie_discussion
→ start_second_round_voting()
→ voting_second
→ submit_round_vote(target_player_id)
→ resolución automática
→ impostor_guess | round_result
```

### Estado durable

`GameSession.state` debe incorporar:

```text
voting_second
```

No se introduce `Round.status`.

### Candidatos empatados

La lista de candidatos de segunda votación se reconstruye autoritativamente desde:

```text
round_votes
WHERE round_id = ronda actual
AND voting_round = 1
```

El sistema agrupa por `target_player_id`, calcula la cantidad máxima de votos y considera empatados a todos los jugadores con esa cantidad.

No se persiste una lista separada porque duplicaría información derivable y podría desincronizarse con los votos reales.

### start_second_round_voting()

RPC prevista:

```text
start_second_round_voting()
```

Contrato:

```text
sin argumentos
authenticated only
host actual only
estado requerido = tie_discussion
estado resultante = voting_second
```

La autoridad deriva server-side desde:

```text
auth.uid()
→ Player
→ active Room
→ rooms.host_player_id actual
→ GameSession actual
```

La operación:

* no acepta `room_id`, `game_session_id`, `player_id`, `host_player_id`, `group_id` ni lista de candidatos;
* valida que existe una GameSession consistente en `tie_discussion`;
* valida que el empate puede reconstruirse desde `voting_round = 1`;
* no crea votos;
* no persiste candidatos;
* no revela `secret_word`, `normalized_secret_word`, `impostor_player_id`, votos individuales ni palabra al impostor;
* puede ser idempotente si el estado ya es `voting_second`.

### submit_round_vote() extendida

`submit_round_vote(target_player_id uuid)` mantiene un único contrato público y determina internamente la etapa:

```text
GameSession.state = voting_first  → voting_round = 1
GameSession.state = voting_second → voting_round = 2
```

Durante `voting_second`, guards adicionales:

```text
caller ∈ SessionPlayers
target ∈ candidatos empatados reconstruidos desde voting_round = 1
target != caller
sin voto previo distinto para round_id/voting_round=2/voter
```

Los votantes requeridos siguen siendo todos los `SessionPlayers`. Presence, liveness, `RoomParticipants` conectados o disponibilidad actual no modifican el denominador.

### Resolución de segunda votación

Cuando todos los `SessionPlayers` registraron voto con `voting_round = 2`, el último voto dispara el conteo autoritativo.

Regla:

* impostor único más votado → `impostor_guess`;
* cualquier otro resultado → `round_result` con victoria conceptual del impostor.

`Cualquier otro resultado` incluye:

* nuevo empate;
* jugador no impostor como único más votado;
* cualquier caso donde el impostor no sea el único jugador con mayor cantidad de votos.

No existe tercera votación.

### Read model

`get_my_game_state()` debe discriminar la etapa vigente.

Durante `tie_discussion`:

* `vote_results` muestra el agregado completo de `voting_round = 1`;
* `candidates` muestra los jugadores empatados en el máximo de `voting_round = 1`;
* la respuesta contiene información suficiente para que el cliente determine si el caller puede mostrar el CTA host-only de segunda votación;
* no se exponen votos individuales, palabra secreta adicional ni secretos de host.

Durante `voting_second`:

* `candidates` muestra candidatos empatados autorizados para recibir votos;
* si el caller está entre los empatados, se excluye su propio Player por no auto-voto;
* `has_voted` y `my_vote_target_player_id` se calculan únicamente desde `voting_round = 2`;
* `vote_results = null` mientras la votación está abierta;
* no se exponen parciales, votos individuales ajenos ni `impostor_player_id`.

Después de resolver:

```text
vote_results representa la votación que produjo la resolución vigente de la ronda
```

Por lo tanto:

* resolución en primera votación → resultados de `voting_round = 1`;
* resolución después de segunda votación → resultados de `voting_round = 2`.

### Sync y recovery

Incremento 9 mantiene polling lento de `get_my_game_state()` como mecanismo de gameplay. No introduce Broadcast, Realtime de gameplay ni publicación de `round_votes`.

Refresh, respuesta perdida o retry deben reconstruirse desde el estado autoritativo y el voto propio persistido.

No se exponen errores SQL internos al usuario. Self-vote puede agruparse como `invalid_vote_target`, pero debe tener validación específica.

---

# Requisito de Incremento 10

El Incremento 10 cubre exclusivamente la rama posterior a una acusación correcta:

```text
impostor_guess
→ submit_impostor_guess(guess_text)
→ comparación autoritativa
→ round_result
```

No cubre scoring, scoreboard, nueva ronda, historial, deploy ni Realtime/Broadcast de gameplay.

## Estado durable

`GameSession.state = impostor_guess` representa que:

* el impostor fue señalado como único jugador más votado;
* la ronda todavía no tiene ganador definitivo;
* falta un único intento final del impostor.

Después de resolver el intento:

```text
GameSession.state = round_result
```

## submit_impostor_guess()

RPC prevista:

```text
submit_impostor_guess(guess_text text)
```

Payload público:

```text
guess_text
```

La RPC no acepta:

```text
room_id
game_session_id
round_id
player_id
impostor_player_id
secret_word
normalized_secret_word
is_correct
winner
```

La autoridad deriva server-side desde:

```text
auth.uid()
→ Player
→ active Room
→ GameSession actual
→ Round actual
→ impostor_player_id
```

Contrato:

```text
authenticated only
estado requerido = impostor_guess
caller debe ser el impostor de la ronda
un solo intento por Round
estado resultante = round_result
```

Los demás jugadores, incluido el host si no es el impostor, no pueden enviar el guess.

## Normalización y comparación

La comparación debe ser server-side.

Regla conceptual de normalización:

* trim;
* colapsar espacios internos;
* comparar sin sensibilidad a mayúsculas/minúsculas;
* coincidencia exacta contra `normalized_secret_word`.

La implementación futura debe usar la misma semántica conceptual que la normalización de palabras del grupo y del snapshot de ronda.

Queda fuera del MVP:

* matching difuso;
* tolerancia a typos;
* sinónimos;
* equivalencias por singular/plural;
* decisiones del cliente sobre acierto/error.

## Resultado

Si el intento normalizado coincide:

```text
winner = impostor
final_guess_correct = true
```

Si no coincide:

```text
winner = group
final_guess_correct = false
```

En ambos casos:

```text
GameSession.state = round_result
```

`round_result` debe poder distinguir:

* impostor gana porque no fue identificado;
* impostor gana porque fue identificado y acertó la palabra;
* grupo gana porque identificó al impostor y el impostor falló.

Datos conceptuales necesarios:

```text
winner
accused_player_id
impostor_was_accused
final_guess_text
final_guess_correct
finished_at
```

`final_guess_text` es el texto visible original o sanitizado para display. No debe usarse como autoridad para decidir luego de persistir el resultado.

## Privacidad

Durante `impostor_guess`:

* el impostor no recibe `secret_word`;
* ningún caller recibe `normalized_secret_word`;
* no se expone un hash, pista o derivado de comparación;
* el cliente no recibe datos suficientes para evaluar localmente si el guess es correcto.

Después de resolver:

* la palabra secreta puede revelarse en `round_result`;
* el guess visible puede mostrarse a todos;
* el ganador conceptual puede mostrarse a todos;
* `normalized_secret_word` sigue sin exponerse.

## Read model

`get_my_game_state()` durante `impostor_guess` debe exponer:

* `state = impostor_guess`;
* `impostor_player_id` o representación pública equivalente del impostor señalado;
* `can_submit_impostor_guess` para el caller;
* datos suficientes para mostrar espera a los demás jugadores;
* `secret_word = null`;
* sin `normalized_secret_word`;
* sin resultado de guess.

`get_my_game_state()` durante `round_result` debe exponer:

* `winner`;
* `impostor_player_id`;
* `accused_player_id`;
* `impostor_was_accused`;
* `secret_word` revelada;
* `final_guess_text` cuando haya existido;
* `final_guess_correct` cuando haya existido;
* `vote_results` de la votación que produjo la resolución vigente.

Si la ronda llegó a `round_result` sin `impostor_guess`, `final_guess_text` y `final_guess_correct` deben ser `null`.

## Idempotencia, retries y errores

No debe haber múltiples intentos.

Si el mismo caller reintenta después de una respuesta perdida y el intento ya fue registrado, la respuesta debe reconstruirse desde `round_result`.

Errores conceptuales esperables:

```text
not_in_impostor_guess
not_impostor
invalid_guess_text
guess_already_submitted
inconsistent_game_state
```

No se exponen errores SQL internos.

## UI mínima futura

La UI de Incremento 10 debe cubrir:

* vista `impostor_guess`;
* formulario de un solo campo para el impostor;
* CTA de enviar intento solo para quien puede enviarlo;
* estado de espera para jugadores no autorizados;
* bloqueo visual durante submit;
* resultado con palabra revelada, guess y ganador.

---

# 22. Puntuación, marcador y nueva ronda

## Requisito de dominio

La ronda no otorga la misma cantidad de puntos individuales en ambos bandos.

Si `round_winner = group`, reciben punto todos los jugadores no impostores de la ronda.

Si `round_winner = impostor`, recibe 2 puntos solo el impostor de la ronda.

`round_winner` debe representarse como:

```text
impostor | group
```

No representa un `player_id` ni un nombre de equipo persistente.

Representa el ganador final de ronda, no solo el resultado de votación.

La resolución debe cubrir estos casos:

* grupo no señaló al impostor → `round_winner = impostor`;
* segunda votación no deja al impostor como único más votado → `round_winner = impostor`;
* impostor señalado y guess correcto → `round_winner = impostor`;
* impostor señalado y guess incorrecto → `round_winner = group`.

## Persistencia operativa

El marcador activo de la tanda vive en `SessionPlayer.score`.

No se introduce inicialmente una entidad `Scoreboard` separada.

`GameSession` representa la tanda activa.

`GameSession.state = scoreboard` representa la fase observable de marcador entre rondas.

Al cierre técnico de Incremento 11.1, `SessionPlayer.score` y el estado `scoreboard` quedan preparados físicamente.

Incremento 11.2 implementa la aplicación autoritativa de puntos mediante `advance_round_result_to_scoreboard()`. La RPC no recibe `room_id`, `game_session_id`, `round_id`, `player_id`, `winner` ni puntajes desde el cliente: deriva el contexto desde `auth.uid()`, la Room activa y la ronda vigente.

La idempotencia operativa de scoring se marca en `Round.scored_at`. Si la ronda ya tiene `scored_at`, repetir la RPC devuelve `scoreboard` sin volver a sumar puntos. Si la ronda está en `round_result` y tiene `round_winner` válido, la RPC suma puntos y mueve la `GameSession` a `scoreboard` en la misma operación transaccional. También tolera el caso recuperable `scoreboard` sin `scored_at`, aplicando el scoring pendiente si existe un ganador final válido.

Incremento 11.4 completa el read model y la UI operativa de marcador y nueva ronda.

`Round` representa cada ronda dentro de esa tanda.

El read model de marcador se deriva de los `SessionPlayers` de la `GameSession`.

## Cierre de ronda

Una ronda está cerrada para scoring cuando:

* la `GameSession` entra en `round_result`;
* la ronda vigente tiene `round_winner` definido;
* el resultado ya no requiere input de jugadores.

La aplicación de puntos debe ser server-side, atómica e idempotente.

Un retry o refresh no puede sumar puntos dos veces.

La operación autoritativa de scoring puede ser disparada por cualquier `SessionPlayer` de la tanda activa porque no acepta decisiones del cliente; solo solicita cerrar el resultado ya decidido server-side hacia `scoreboard`.

Después de cerrar la ronda y aplicar el scoring, el lifecycle normal es:

```text
round_result
→ scoreboard
```

## Nueva ronda

Solo `rooms.host_player_id` actual puede iniciar una nueva ronda.

La nueva ronda:

* reutiliza la misma `GameSession`;
* reutiliza el mismo roster congelado de `SessionPlayers`;
* conserva los scores existentes;
* crea un `Round` con `number + 1`;
* selecciona palabra server-side;
* selecciona impostor server-side;
* deja a la `GameSession` nuevamente en `role_reveal`.

Para balance operativo, `SessionPlayer.impostorCount` se persiste como contador de veces que el jugador fue impostor dentro de la tanda. La operacion de nueva ronda reconcilia ese contador desde `Round.impostor_player_id` antes de seleccionar y luego incrementa solo al nuevo impostor.

El cliente nunca elige:

* puntos;
* ganador;
* palabra;
* impostor;
* número de ronda.

La palabra no puede repetirse dentro de la misma tanda. La disponibilidad debe calcularse server-side contra las palabras ya usadas por las rondas de esa `GameSession`.

Si no hay palabras disponibles no utilizadas:

* no se crea una nueva ronda;
* la respuesta debe explicar que faltan palabras disponibles;
* el host puede terminar la tanda;
* el grupo puede agregar palabras válidas al banco y volver a intentar.

No se define todavía fin automático por puntaje objetivo, cantidad de rondas ni agotamiento de palabras.

## Read model

`get_my_game_state()` en resultado y marcador debe exponer datos suficientes para mostrar:

* ganador de la ronda;
* palabra revelada solo cuando corresponda;
* scoreboard individual acumulado;
* número de ronda actual;
* si el caller puede iniciar nueva ronda;
* si hay palabras disponibles para iniciar nueva ronda.

`get_my_game_state()` en `scoreboard` debe exponer además:

* `state = scoreboard`;
* ranking o lista de jugadores ordenable por score;
* `can_start_next_round` solo para el host actual;
* `can_end_session = true` sólo para el host actual cuando la ronda vigente está puntuada;
* razón de indisponibilidad de nueva ronda cuando no hay palabras.

En Incremento 11.4, la razón de bloqueo operativa de nueva ronda se expone como `not_host`, `no_words`, `session_not_ready` o `unknown`. La UI puede traducir esos valores a mensajes, pero no debe recalcular permisos ni disponibilidad.

Durante la preparación transaccional de una nueva ronda, el read model no debe revelar la nueva palabra ni el nuevo impostor antes de `role_reveal`. Si la preparación es observable, debe responder como estado transitorio sin secretos o reconstruirse directamente como `role_reveal` una vez creada la ronda.

En la nueva `role_reveal`, el read model debe preservar la privacidad existente:

* el impostor no recibe `secret_word`;
* ningún caller recibe `normalized_secret_word`;
* el cliente no recibe datos suficientes para inferir la palabra antes de tiempo.

## Fuera de alcance técnico de Incremento 11

No se implementa ni se cierra en este incremento:

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

---

# 23. Terminar tanda e historial mínimo

## Requisito de dominio

Incremento 12 define y luego implementa el cierre explícito de una tanda de Impostor.

En la primera versión, una tanda sólo puede terminar desde `scoreboard`, después de una ronda cerrada, puntuada y visible para todos.

No se permite terminar desde estados intermedios:

* `role_reveal`;
* `discussion`;
* `voting_first`;
* `tie_discussion`;
* `voting_second`;
* `impostor_guess`;
* `round_result`.

Sólo `rooms.host_player_id` actual puede terminar la tanda.

La transición de `GameSession` es:

```text
scoreboard
→ finished
```

`finished_at` es el timestamp server-side que marca el cierre exitoso de la tanda. Debe definirse en la misma operación autoritativa que cambia el estado a `finished` y conserva el historial mínimo.

La Room asociada queda cerrada:

```text
Room.status = closed
```

La Room no se reutiliza para otra tanda. Para jugar otra tanda, el grupo crea una nueva Room.

## Resultado final

El ganador final de tanda se calcula server-side desde `SessionPlayer.score`.

El resultado final está compuesto por todos los jugadores con el mayor puntaje.

Si una sola persona tiene el mayor puntaje, hay ganador único.

Si varias personas empatan en el mayor puntaje, hay múltiples ganadores.

No se define desempate automático por host, orden de join, cantidad de victorias, azar ni historial de impostor.

El cliente no decide:

* ganador final;
* scores finales;
* cantidad de rondas;
* historial;
* timestamp de cierre;
* cierre de Room.

## Historial mínimo

El historial mínimo existe para estadísticas futuras, sin construir estadísticas en Incremento 12.

El historial de tanda debe conservar:

* grupo;
* referencia a la `GameSession` cerrada, si se conserva operacionalmente;
* fecha/hora de inicio;
* fecha/hora de finalización;
* roster final;
* scores finales por jugador;
* ganador o ganadores finales;
* cantidad de rondas jugadas;
* host que cerró la tanda.

El historial de ronda debe conservar:

* número de ronda;
* impostor;
* `round_winner`;
* si el impostor fue descubierto por votación;
* si hubo intento final del impostor;
* si el impostor adivinó la palabra;
* resumen de puntos aplicados o datos suficientes para derivarlo.

Los votos individuales históricos quedan fuera.

Las palabras completas usadas quedan fuera del historial mínimo inicial. La palabra puede seguir existiendo en `Round` mientras el estado operativo exista, pero no se replica al historial permanente salvo decisión futura explícita.

No se persiste historial de host por ronda. Sólo se guarda el host que cerró la tanda como auditoría mínima.

## Operación autoritativa

La RPC de cierre es 0-args:

```text
end_session()
```

Debe derivar contexto desde:

```text
auth.uid()
→ Player
→ Room activa
→ GameSession vigente
→ SessionPlayers
→ Rounds
```

Debe validar:

* caller autenticado;
* caller resuelve `Player`;
* caller participa de la Room activa;
* Room está `playing`;
* caller es host actual;
* existe `GameSession`;
* `GameSession.state = scoreboard`;
* la ronda vigente está puntuada;
* hay roster y al menos una ronda.

Incremento 12.2 implementa `end_session()` como operación autoritativa. Cierra sólo desde `scoreboard`, fija `finished_at`, mueve la `GameSession` a `finished`, cierra la Room, crea `game_session_history` y `round_history`, y no recibe ganador, scores, ids de ronda ni snapshots desde el cliente.

La operación es idempotente. Un retry después de un cierre exitoso no puede duplicar historial, cambiar `finished_at`, cambiar ganadores ni volver a cerrar otra Room.

Incremento 12.5 validó además que un retry tardío de `end_session()` no afecte una Room nueva creada posteriormente por el grupo.

## Read model `finished`

`get_my_game_state()` en `finished` devuelve una vista compartida, sin secretos pendientes:

* `state = finished`;
* `round_count`;
* `finished_at`;
* scores finales;
* ganador o ganadores finales;
* resumen de rondas suficiente para mostrar cierre;
* `can_start_next_round = false`;
* `can_end_session = false`.

Host y no-host ven el mismo resultado final.

Incremento 12.3 implementa esta vista desde `game_session_history` y `round_history`, incluso cuando la Room ya está `closed` y no quedan slots activos. Sólo pueden leerla jugadores que hayan sido `SessionPlayers` de la tanda cerrada. El resumen de rondas no incluye votos individuales ni `secret_word`/`normalized_secret_word`.

Durante el hardening 12.5 se corrigió el permiso de cierre en el read model activo: en `scoreboard`, `can_end_session = true` sólo para el host actual con ronda vigente puntuada. En `finished`, `can_end_session = false` y `can_start_next_round = false`.

## UI final y validación de cierre

Incremento 12.4 implementa la UI de cierre y resultado final:

* el host ve `Terminar tanda` sólo cuando `can_end_session` llega desde el read model;
* la acción pide confirmación antes de llamar `end_session()`;
* mientras se ejecuta, deshabilita acciones incompatibles;
* ante error conserva el marcador y permite reintentar;
* tras éxito refresca con `get_my_game_state()` y renderiza `finished`;
* si la Room ya no está activa, el frontend intenta recuperar primero un resultado histórico `finished`;
* no construye el resultado final con datos locales ni respuesta optimista.

La vista `finished` del MVP muestra resultado final, ganador único o ganadores empatados, clasificación completa, puntajes finales, cantidad de rondas y `Volver al grupo`. No muestra detalle ronda por ronda, votos históricos ni palabras.

Incremento 12.5 cerró la validación adversarial DB de multironda/cierre contra Supabase local: precondiciones, autorización, cierre exitoso, historial único, privacidad histórica, idempotencia, empates, read model para participantes, denegación a no participantes, no reutilización de Room cerrada y creación posterior de nueva Room sin alterar el historial.

La UI puede ofrecer volver al grupo o crear otra Room desde el grupo, pero no iniciar nueva ronda desde esa tanda cerrada.

## Fuera de alcance técnico de Incremento 12 inicial

No se implementa:

* estadísticas visuales;
* ranking histórico entre tandas;
* desempates automáticos;
* múltiples tandas en una misma Room;
* reutilización de Room cerrada;
* votos individuales históricos;
* historial completo de palabras usadas;
* historial de hosts por ronda;
* exportación de resultados;
* analíticas.

---

# 24. Offline

## Requisito MVP

Debe quedar explícito:

* PWA sí;
* cache progresivo cuando aporte valor;
* una partida multi-dispositivo completamente offline no es requisito del MVP;
* no se diseña peer-to-peer offline.

La sincronización entre teléfonos requiere conectividad en la primera versión jugable.

Esta necesidad de sincronización corresponde a Impostor.

## Incremento 14.0: contrato PWA/cache

Incremento 14.0 define el contrato previo a implementar hardening PWA. No
implementa service worker, no agrega dependencias, no cambia comportamiento
runtime, no modifica Supabase/RPCs y no introduce migrations.

Estado real al iniciar 14.0:

* existe `app/manifest.ts` con `name`, `short_name`, `start_url`,
  `display = standalone`, `background_color`, `theme_color` e iconos PNG de
  192 y 512;
* existe metadata base en `app/layout.tsx`, incluyendo `appleWebApp`;
* existe `app/manifest.test.ts`;
* existen `public/icons/icon-192.png`, `public/icons/icon-512.png`,
  `app/apple-icon.png`, `app/favicon.ico` y `app/icon.svg`;
* no existe service worker, registration, Workbox, `next-pwa`, Serwist,
  estrategia de cache propia, offline shell ni update lifecycle propio;
* no existen headers/cache custom en `next.config.ts`.

La invariante central de PWA para Juegos Familiares / Impostor es:

```text
PWA cache != game-state authority
```

La autoridad de Room, GameSession, fase, host, palabra, impostor, votos,
marcador y permisos sigue siendo Supabase/Postgres/RLS/RPCs. La cache de PWA
puede mejorar carga del shell y assets, pero nunca puede sustituir
`authoritative refetch` ni presentar datos dinámicos como vigentes.

Después de offline, background, reapertura o update, cualquier estado compartido
o privado de Impostor debe reconstruirse con el contrato de Incremento 13:

```text
interruption / reconnect
-> authoritative refetch
-> current valid Room/GameState
```

### Recursos cacheables y no cacheables

| Recurso | Estrategia propuesta | Motivo | Riesgo | Comportamiento offline |
| --- | --- | --- | --- | --- |
| JS/CSS estáticos versionados de Next | Cache first o precache versionado, con limpieza de versiones | Son assets de build y no contienen estado de partida por sí mismos | Mezcla de versiones si el update lifecycle es agresivo o incompleto | Pueden permitir renderizar shell, pero no gameplay autoritativo |
| Fuentes generadas/servidas por Next | Cache first con assets versionados | Mejoran carga visual y no contienen datos sensibles | Bajo; degradación visual si faltan | La UI puede usar fallback o fuente cacheada |
| Iconos, favicon, apple icon e imágenes estáticas propias | Cache first | Son estáticos y no sensibles | Bajo; icono stale no afecta autoridad | Disponibles para instalación/shell |
| Manifest | Network first con fallback cacheado o precache versionado | Necesario para instalación y metadata; cambia poco | Stale tolerable si no altera rutas críticas sin update | Instalación o reapertura pueden conservar metadata previa |
| Shell HTML de `/` e `/impostor` | Network first; fallback offline sólo si queda claro que no hay datos remotos vigentes | Son entradas de plataforma/juego con contenido mayormente estático | Mostrar `Player/Group` viejo si se cachea HTML o hydration state dinámico | Puede mostrar shell mínima y mensaje de conexión; no debe afirmar grupo vigente |
| Shell HTML de `/grupo`, `/impostor/grupo`, `/impostor/sala/[code]` | Network first o fallback offline controlado; datos dinámicos siempre network only | Son superficies de contexto remoto o gameplay | Room, Group o fase stale presentados como vigentes | Mostrar falta de conexión/retry; bloquear acciones conectadas |
| Auth/session state | Network only; no cache PWA | Define identidad técnica vigente | Recuperar una sesión vieja como autoridad | Sin red, no habilita gameplay protegido nuevo |
| Player/Group remoto | Network only; no cache PWA | Depende de Auth, RLS y estado remoto actual | Grupo o permisos stale | Mostrar error/retry o contexto no verificado |
| `get_my_active_room()` / Room / host / participants | Network only; no cache PWA | Room y host son estado operativo autoritativo | Sala viva falsa, host viejo, permisos incorrectos | Bloquear acciones de Room; refetch al volver online |
| `get_my_game_state()` / GameSession / Round / role / word / votes / scoreboard live | Network only; no cache PWA | Contiene fase vigente, secretos autorizados y acciones propias persistidas | Privacidad e integridad: palabra, rol, voto o marcador stale | No mostrar privados como vigentes; refetch al volver online |
| Presence y liveness | No cache | Presence es efímera; liveness es autoridad server-side por `last_seen_at` | Conexión/host stale | Recuperar Presence/liveness al volver foreground/online |
| RPCs/mutaciones Supabase | Network only; sin Background Sync para gameplay | Las acciones son intenciones autoritativas y dependen de fase/actor actual | Duplicados, acciones fuera de fase, votos o transiciones tardías | Bloquear y permitir retry explícito cuando haya conexión |

Nunca deben servirse desde cache como estado vigente:

* Auth/session state;
* Player/Group remoto;
* Room;
* GameSession;
* Round;
* host;
* Presence/liveness;
* role;
* word;
* votes;
* scoreboard live;
* `get_my_active_room()`;
* `get_my_game_state()`;
* cualquier RPC o mutación Supabase.

### Offline UX de MVP

Offline en el MVP significa:

* abrir una shell mínima si corresponde;
* informar falta de conexión;
* bloquear gameplay conectado;
* conservar, como máximo, estado compartido previo marcado explícitamente como
  no confiable/reconectando cuando eso ayude a orientar al usuario;
* al volver online, ejecutar `authoritative refetch` como en Incremento 13.

Offline no significa:

* jugar una tanda multi-dispositivo sin conexión;
* simular avance de fase;
* encolar votos, intentos finales, nuevas rondas o cierre de tanda;
* reconstruir privados desde cache;
* usar LocalIdentity, Presence o cache como autorización.

### Update lifecycle

Incremento 14 no debe introducir recarga automática en medio de una tanda activa.
La política preferida para 14.2/14.3 es:

* instalar una nueva versión de service worker en background;
* no activar una actualización destructiva sin control del usuario mientras haya
  Room/GameSession activa;
* mostrar una acción explícita de actualización cuando corresponda;
* si la actualización se aplica, reconstruir estado con `authoritative refetch`;
* limpiar caches viejas para evitar versiones indefinidamente stale.

Pregunta abierta para 14.2/14.3:

* decidir implementación concreta de service worker manual vs herramienta
  dedicada, sin agregar dependencias antes de aprobación explícita.

### Criterios de aceptación 14.1-14.4

14.1 Manifest/install hardening:

* la aplicación sigue funcionando desde navegador sin instalación obligatoria;
* manifest, metadata e iconos cubren instalación básica en Android/iOS dentro
  de sus límites reales;
* no se declara un asset maskable, screenshot, shortcut o capability PWA sin
  asset/verificación real;
* ningún cambio de manifest altera autoridad, routing de gameplay ni Supabase.

14.2 Service worker y cache estática segura:

* service worker no intercepta Supabase como fuente cacheada;
* Auth/session, `get_my_active_room()`, `get_my_game_state()` y mutaciones RPC
  son network only;
* la cache se limita a assets/shell permitidos por la matriz;
* existe limpieza de caches versionadas;
* una falla offline no muestra privados, fase, host, votos ni scoreboard live
  como vigentes desde cache.

14.3 Offline/update UX:

* offline muestra feedback claro y bloquea acciones conectadas;
* `online`, foreground o reapertura ejecutan reconstrucción autoritativa;
* una actualización disponible no recarga automáticamente una tanda activa;
* aplicar actualización fuerza o acompaña un refetch autoritativo;
* la instalación sigue siendo opcional.

14.4 Validación PWA final:

* smoke en navegador no instalado pasa sin service worker stale;
* smoke standalone valida reapertura, background/foreground y navegación básica
  donde exista dispositivo real disponible;
* smoke offline durante gameplay no permite votar, revelar privados stale ni
  avanzar fases desde cache;
* cambio de ronda después de reconexión no muestra la palabra anterior;
* Android Chrome real queda validado o queda documentado como pendiente externo;
* iOS Safari/Add to Home Screen queda validado razonablemente o queda
  documentado como pendiente externo;
* Incremento 13 conserva la invariante de recovery autoritativo.

### Cierre de Incremento 14

Estado:

`INCREMENT 14 CLOSED WITH EXTERNAL MANUAL SMOKE PENDING`

Al cierre documental:

* 14.0 contrato PWA/cache queda cerrado;
* 14.1 manifest/install hardening queda cerrado;
* 14.2 service worker static-safe queda cerrado;
* 14.3 offline/update UX mínima queda cerrado;
* 14.4 Chromium desktop smoke queda cerrado.

Validado:

* validaciones automáticas del incremento;
* Chromium desktop smoke sobre manifest, service worker registrado, Cache
  Storage acotado a assets seguros, corte de red fuera/dentro de sala,
  exclusión de Supabase/RPC/gameplay authority y update manual sin recarga
  automática durante sala.

Pendientes externos antes de beta:

* Android Chrome installed PWA smoke;
* iOS Safari Add to Home Screen smoke;
* real multi-actor round transition/offline/reconnect smoke.

Este cierre no declara offline gameplay, no autoriza cache de estado de juego,
no declara validados Android/iOS reales y no convierte al service worker en
autoridad. La autoridad de Auth/session, Player/Group remoto, Room,
GameSession, Round, host, presence/liveness, role, word, votes, scoreboard
live, `get_my_active_room()`, `get_my_game_state()` y cualquier RPC/mutación
Supabase permanece en backend/refetch autoritativo.

---

# 25. Escala

## Requisito MVP

El diseño técnico debe optimizar para el caso real inicial:

* grupo familiar pequeño;
* normalmente cuatro jugadores;
* rango aproximado de tres a ocho jugadores;
* pocas salas simultáneas;
* volumen pequeño o medio de palabras e historial.

No se debe optimizar prematuramente para comunidades públicas, matchmaking o gran escala.

---

# 26. Experiencia de desarrollo y aprendizaje

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

Este criterio no eligió por sí mismo framework, proveedor ni infraestructura. Esa selección se cerró después para el MVP con Next.js y Supabase.

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
* Políticas avanzadas de abandono, timeout o recuperación más allá del contrato 13.
* Presencia más sofisticada.
* Offline más amplio si aparece una necesidad real.
* Optimización para comunidades grandes.

---

# Decisiones todavía abiertas

El cierre técnico del Incremento 12 resolvió creación de grupo, invitación, sala/lobby, estado compartido mínimo, gameplay autoritativo, cierre de tanda e historial mínimo.

Siguen abiertas o pendientes para incrementos posteriores:

* comportamiento detallado cuando un jugador pierde conexión durante gameplay;
* entrada o salida de jugadores durante una tanda;
* estrategia concreta de PWA para diferencias iOS/Android;
* robustez final de reconexión;
* alcance de estadísticas o ranking histórico si se decide construirlos después del MVP.

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
