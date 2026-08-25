# Juegos Familiares — Arquitectura conceptual

## Propósito

Este documento describe la arquitectura conceptual del sistema completo.

Juegos Familiares es la aplicación contenedora.

Impostor es el primer juego dentro de esa aplicación.

La arquitectura distingue:

* capacidades compartidas de plataforma;
* capacidades específicas de Impostor;
* infraestructura compartida;
* reglas de dominio;
* responsabilidades del cliente;
* responsabilidades autoritativas.

Debe orientar el futuro `sources/implementation-plan.md`, sin definir todavía tablas, migraciones, componentes, APIs ni código.

---

# 1. Decisiones tecnológicas

Para el MVP, la decisión actual es utilizar:

* aplicación web mobile-first;
* PWA;
* TypeScript;
* Supabase como backend gestionado;
* Supabase Auth para identidad liviana/anónima;
* Postgres como persistencia;
* Row Level Security para autorización;
* Supabase Realtime cuando el producto necesite sincronización;
* Presence para presencia efímera cuando corresponda, fuera del lobby inicial.

No reabrimos en este documento la comparación con Firebase, backend propio u otras alternativas.

---

# 2. Vista general del sistema

```text
Juegos Familiares PWA
│
├── Platform
│   ├── navegación general
│   ├── identidad
│   ├── grupos
│   ├── jugadores
│   └── lifecycle PWA
│
└── Games
    └── Impostor
        ├── banco de palabras
        ├── sala
        ├── tanda
        ├── ronda
        ├── votos
        ├── marcador
        └── historial
              │
              ▼
          Supabase
          ├── Auth
          ├── Postgres
          ├── RLS
          └── Realtime / Presence
```

Clientes simultáneos:

```text
PWA Ramiro ──┐
PWA Pedro ───┤
PWA Camila ──┼── backend compartido
PWA Victoria ┘
```

---

# 3. Platform vs Game

## Platform

Incluye únicamente capacidades que ya sabemos que son transversales:

* identidad;
* grupos;
* jugadores;
* navegación general;
* shell PWA;
* infraestructura común cuando corresponda.

## Impostor

Incluye reglas y datos propios del juego:

* banco de palabras;
* salas;
* tandas;
* rondas;
* selección de impostor;
* asignaciones privadas;
* votos;
* resolución;
* puntuación;
* historial específico.

No promovemos conceptos de Impostor al nivel de plataforma por anticipación.

---

# 4. Regla contra generalización prematura

No construir abstracciones genéricas para juegos futuros hasta que un segundo juego real demuestre una necesidad compartida.

Evitar por ahora:

```text
GenericGame
GameEngine
GenericRound
GenericRoom
GenericScore
GenericRealtimeGame
```

Cuando llegue Tutti Frutti, se evaluará qué capacidades son realmente reutilizables.

---

# 5. Responsabilidad del cliente PWA

El cliente puede encargarse de:

* renderizar UI;
* navegación;
* estado visual;
* formularios;
* interacción táctil;
* guardar identidad o preferencias locales permitidas;
* enviar intenciones;
* consultar estado autorizado;
* suscribirse a cambios compartidos;
* reaccionar a reconexión;
* lifecycle PWA;
* cache apropiado del shell.

El cliente no debe ser autoridad para decisiones sensibles.

En Impostor, no debe decidir unilateralmente:

* palabra;
* impostor;
* resultado de votación;
* ganador;
* puntos;
* cambio de fase;
* nuevo host.

---

# 6. PWA como capacidad de plataforma

La PWA pertenece a Juegos Familiares, no solamente a Impostor.

Debe contemplar:

* mobile-first;
* Safari/iOS;
* Chrome/Android;
* uso desde navegador;
* instalación opcional;
* manifest;
* service worker;
* estrategia de cache progresiva;
* actualizaciones;
* background/foreground;
* reconexión razonable.

PWA no equivale a offline completo.

Una partida multijugador sincronizada requiere conectividad en el MVP.

Futuros juegos pueden tener necesidades offline distintas.

---

# 7. Identidad como capacidad compartida

Supabase Auth debe resolver identidad técnica liviana.

El objetivo de UX sigue siendo:

* sin email;
* sin password;
* sin onboarding pesado.

La identidad debe permitir relacionar:

```text
Auth identity
→ Player
→ Group
```

Debe mantenerse explícitamente la separación conceptual:

```text
AuthIdentity
≠ Player
≠ Group
≠ LocalIdentity
```

La identidad local del dispositivo puede ayudar a recordar al jugador, pero no debe ser la fuente de autorización.

Regla:

```text
LocalIdentity
→ cache / pista UX

AuthIdentity + estado remoto
→ identidad verificable y autorización
```

Si se pierde la sesión anónima y ya no existe `AuthIdentity` válida, no debe recuperarse automáticamente el `Player` anterior usando datos locales.

La intención es que en el futuro el mismo `Player` pueda participar en otros juegos de Juegos Familiares.

---

# 8. Grupo y jugadores como conceptos de plataforma

`Group` y `Player` son conceptos transversales actuales.

Ejemplo:

```text
Familia
├── Ramiro
├── Pedro
├── Camila
└── Victoria
```

Estos jugadores pueden ser reutilizados por distintos juegos futuros.

No asumimos todavía:

* perfiles públicos;
* avatares complejos;
* amigos;
* matchmaking;
* múltiples grupos simultáneos;
* sistema social.

---

# 9. Navegación de plataforma

Orientación conceptual:

```text
/
→ Juegos Familiares

/impostor
→ Impostor

/impostor/grupo
→ contexto persistente del Group para Impostor
```

La portada permitirá acceder a juegos disponibles.

Un juego futuro podría usar:

```text
/tutti-frutti
```

No se diseñan todavía componentes, layouts ni estética.

`/impostor/grupo` pertenece a plataforma aplicada al primer juego: muestra `Group` y `Player` y ofrece entradas a Room, pero no es un lobby ni contiene el estado de una Room.

---

# 10. Supabase como infraestructura compartida

Supabase constituye infraestructura común, pero no todas sus capacidades son obligatorias para todos los juegos.

## Compartido claramente

* Auth;
* Postgres;
* autorización;
* persistencia.

## Dependiente del juego

* Realtime;
* Presence;
* operaciones sincronizadas;
* requerimientos específicos de privacidad.

Incremento 4 requiere Realtime para avisar cambios persistidos del lobby. Presence queda fuera de Room + Lobby y se introduce en Incremento 5.1 para conexión/desconexión. Liveness y sucesión de host quedan separados para 5.2+.

Un futuro juego podría no necesitarlos.

---

# 11. Postgres

Postgres será la fuente principal de persistencia compartida.

## Plataforma

Conceptualmente conserva:

* grupos;
* jugadores;
* relaciones necesarias para identidad y pertenencia `Player -> Group`.

Para el Incremento 2 no se introduce una entidad `Membership` separada.

Al cierre del Incremento 2, esta capa ya tiene persistencia concreta para `groups`, `players` e invitaciones de grupo, con RLS activa y escrituras encapsuladas en RPCs autoritativas.

También permite listar integrantes del propio grupo mediante lectura autorizada por RLS, y recuperar la invitación activa del administrador mediante una RPC sin parámetros basada en `auth.uid()`.

## Impostor

Conceptualmente conserva:

* `GroupWord`;
* estado operativo;
* rondas;
* votos;
* marcador;
* historial.

No se diseñan todavía:

* tablas;
* columnas;
* índices;
* constraints concretos;
* migrations.

---

# 12. Estado operativo vs histórico

## Persistente de plataforma

* `Group`
* `Player`

## Persistente de Impostor

* `GroupWord`
* `GameSessionHistory`
* `RoundHistory`

## Operativo de Impostor

* `Room`
* `RoomParticipant`
* `GameSession` activa
* `SessionPlayer`
* `Round` activa
* `Vote`
* `RoundResult` operativo

Operativo no significa necesariamente solo en memoria.

Puede persistirse técnicamente para facilitar consistencia y recuperación.

## Room + Lobby en Incremento 4

`Room` pertenece exclusivamente al dominio de Impostor.

```text
Group = quiénes somos
Room  = quiénes estamos jugando ahora
```

Una Room es temporal en el dominio, pero se persiste técnicamente para soportar concurrencia, refresh, reconstrucción y sincronización entre teléfonos.

El lifecycle mínimo de Incremento 4 es:

```text
lobby → closed
```

En Incremento 4 no se usan todavía `playing` ni `finished`; esos estados pertenecen a incrementos posteriores.

Desde Incremento 6, el lifecycle conceptual vigente de Room pasa a:

```text
lobby
playing
closed
```

Incremento 6 cerró físicamente este lifecycle. `start_session()` produce `lobby → playing` de forma atómica. Esto no representa fases detalladas de juego; solo indica que la Room ya no admite nuevos joins y que hay una tanda en curso. El detalle pertenece a `GameSession.state`.

Una Room activa es una Room en `lobby` o `playing`. Por lo tanto, los slots activos deben preservarse durante `playing` y liberarse al cerrar la Room. La transición `lobby → playing` no debe liberar `player_active_room_slots`.

Un Player puede pertenecer a una sola Room activa de Impostor. Un Group puede tener varias Rooms activas. El creador de una Room es su host inicial y también su participante. El host no recibe capacidades de gameplay en este incremento.

Un participante no-host puede salir del lobby. El host puede cerrar el lobby. Si el host quiere abandonarlo, la Room se cierra. No existe sucesión automática del host ni expiración automática en Incremento 4.

El cliente no envía como autoridad `player_id`, `group_id`, `host_player_id` ni `auth_user_id`. El backend deriva esos datos desde `auth.uid()`, `Player` y `Group`.

El lobby toma como fuente de verdad las filas persistidas de `Room` y `RoomParticipant`. Postgres Changes funciona como aviso para volver a leer el lobby; no es autoridad y no sustituye el refetch después de reconexión o eventos perdidos.

---

# 13. RLS y autorización

RLS protege acceso a datos compartidos.

## Plataforma

Debe permitir conceptualmente:

* que un jugador acceda solo a los grupos donde corresponde;
* que pertenencia y permisos no dependan del cliente.

En el Incremento 2, las escrituras directas a plataforma permanecen bloqueadas para el cliente. Crear grupo, unirse por invitación y recuperar invitación activa usan operaciones autoritativas acotadas.

## Impostor

Debe permitir conceptualmente:

* que un participante acceda a la sala correspondiente;
* que un integrante no consulte el banco completo;
* que el banco no sea explorable libremente por ningún integrante en el Incremento 3;
* que un autor pueda consultar y borrar sus propios aportes;
* que información privada no quede expuesta.

No se escriben políticas RLS concretas en este documento.

---

# 14. Admin de grupo vs Host de Impostor

## Group Admin

Rol persistente y transversal del grupo.

En el Incremento 2 se representa con `Group.adminPlayerId`.

No hace falta persistir también `Player.role` para administrador en esta etapa.

Puede:

* consultar integrantes;
* eliminar integrantes.

En el Incremento 3 no puede explorar el banco completo de Impostor por ser administrador. Sus permisos sobre palabras se limitan a los de cualquier integrante: agregar, ver cantidad total, consultar sus aportes y borrar sus aportes.

## Room Host

Rol temporal dentro de una sala de Impostor.

En Incremento 4 solo se representa visualmente. Las capacidades de gameplay se habilitan cuando exista `GameSession`.

Host no implica admin.

Admin no implica host.

---

# 15. Operaciones autoritativas

Debe existir una capa conceptual de operaciones autoritativas para acciones sensibles.

No decidimos todavía si cada operación será:

* función Postgres;
* RPC;
* server function;
* otra opción apropiada.

En Impostor deben proteger:

* iniciar tanda;
* preparar ronda;
* seleccionar palabra;
* seleccionar impostor;
* validar guards;
* registrar voto;
* resolver votación;
* resolver empate;
* actualizar puntuación;
* crear siguiente ronda;
* reasignar host;
* terminar tanda;
* persistir historial.

Principio:

```text
UI
→ intención
→ autoridad
→ validación
→ cambio de estado
→ sincronización
```

## Operaciones de Room

Incremento 4 cerró estas RPCs dentro del módulo de Impostor:

```text
create_room()
join_room_by_code(room_code)
get_my_active_room()
leave_room()
close_room()
```

Room no forma parte del bootstrap global de Platform ni de `LocalIdentity`. El bootstrap resuelve `AuthIdentity → Player → Group`; luego Impostor reconstruye o modifica Room desde ese contexto autoritativo.

Las operaciones de Room derivan ownership desde `auth.uid()`. El cliente no envía `player_id`, `group_id`, `room_id` ni `host_player_id`.

* `create_room()` crea Room sin argumentos de ownership o devuelve la Room activa existente si el Player ya pertenece a una;
* `join_room_by_code(room_code)` deriva Player y Group desde `auth.uid()` y valida que la Room esté en `lobby`;
* `get_my_active_room()` reconstruye la Room activa del Player sin recibir `player_id` ni `group_id`;
* `leave_room()` permite abandonar como participante no-host y cierra la Room si quien sale es el host mientras la Room sigue en lobby;
* `close_room()` cierra la Room solo si quien llama es el host mientras corresponde al lifecycle de lobby.

La creación incluye atómicamente Room, host y participación inicial. El join es idempotente y no duplica `RoomParticipant`.

Las lecturas del lobby devuelven únicamente la información necesaria para reconstruir la Room autorizada: Room, estado, host, nicknames, marca del participante propio y metadatos técnicos estrictamente necesarios para el lobby. Desde Incremento 5.1 pueden incluir `participant_player_id` para correlacionar cada `RoomParticipant` persistido con Presence efímera y deduplicar varias conexiones del mismo Player.

Ese identificador técnico no se muestra como dato de producto, no concede autoridad, no sustituye `auth.uid()`, no se acepta como ownership en mutaciones y no habilita enumeración pública de Players. Queda limitado a participantes autorizados de la Room. No existe una lectura pública de todas las Rooms. Supabase Realtime funciona como capa de invalidación: avisa `INSERT`/`DELETE` de participantes y `UPDATE` de Room para repetir una lectura autorizada. La autoridad sigue siendo Postgres + RPCs.

Desde Incremento 6, `get_my_active_room()` reconstruye una Room en `lobby` o `playing`, pero sigue siendo una lectura de estado compartido sin secretos. No devuelve palabra secreta, impostor ni asignación privada.

## Operación START_SESSION

Incremento 6.3 introdujo `start_session()`, una operación autoritativa de 0 argumentos para iniciar una tanda y preparar la primera ronda privada.

Debe derivar autorización desde:

```text
auth.uid()
→ Player
→ Room
→ rooms.host_player_id actual
```

No acepta `player_id`, `group_id` ni `host_player_id` enviados por cliente como prueba de autoridad.

Guards mínimos:

```text
caller tiene identidad válida
caller resuelve Player válido
caller pertenece a Room activa
Room está en lobby
caller es host actual
no existe otra GameSession para esa Room
RoomParticipants activos por liveness >= 3
available words >= 1
```

La operación debe ejecutarse como una unidad coherente. `PREPARING_ROUND` puede representar una fase transaccional interna para el inicio de la primera ronda, pero el resultado durable exitoso debe ser `ROLE_REVEAL`:

```text
validar caller
bloquear/serializar Room
validar host
actualizar actividad del caller si corresponde
determinar participantes elegibles
validar mínimo 3
validar palabra disponible
crear GameSession
crear snapshot SessionPlayers
seleccionar palabra
seleccionar impostor
crear Round 1
pasar Room a playing
dejar GameSession en ROLE_REVEAL
```

Si algo falla, no queda estado parcial.

No debe existir durablemente una Room en `playing` sin Round 1, una GameSession sin Round, una Round sin palabra, una Round sin impostor ni una GameSession sin SessionPlayers.

La idempotencia conceptual exige:

```text
máximo una GameSession por Room
máximo una Round número 1 por GameSession
```

Un retry tras respuesta perdida debe poder recuperar conceptualmente la sesión existente sin crear otra.

`start_session()` actualiza la liveness del caller antes del snapshot. Por eso, si el host actual toca "Iniciar tanda" y las demás condiciones son válidas, ese host se considera activo y queda incluido en `SessionPlayers`.

El roster congelado queda en `SessionPlayers`. Un `RoomParticipant` que queda fuera del snapshot no se convierte después en `SessionPlayer` aunque vuelva a estar activo.

La lectura privada se realiza con `get_my_game_state()`, también 0-args, derivada desde:

```text
auth.uid()
→ Player
→ active Room
→ GameSession
→ SessionPlayer
→ latest Round
```

Devuelve solamente la vista privada del caller:

```text
state
round_number
role
word
```

Para el impostor, `word = null`. No devuelve `normalized_secret_word`, `impostor_player_id` ni roles de otros jugadores. Host y Group admin no tienen privilegio privado adicional.

---

# 16. Dominio independiente de infraestructura

Las reglas puras de Impostor deberían mantenerse independientes de Supabase cuando sea razonable.

Ejemplos:

* normalizar palabras;
* determinar jugadores elegibles como impostor;
* elegir entre candidatos;
* resolver conteo de votos;
* determinar ganador;
* calcular puntuación.

Supabase debe resolver:

* persistencia;
* autorización;
* identidad;
* sincronización;
* coordinación.

Evitar mezclar reglas puras con llamadas a infraestructura.

---

# 17. Privacidad específica de Impostor

El sistema puede conocer:

```text
word
impostorPlayerId
```

pero cada participante debe recibir solo su información autorizada.

## Jugador normal

Puede recibir:

```text
role: player
word: ...
```

## Impostor

Puede recibir:

```text
role: impostor
```

y no la palabra.

No implementar privacidad así:

```text
enviar todo
→ ocultar palabra con CSS/React
```

El dato sensible no debe ser entregado al cliente no autorizado.

---

# 18. Votos privados

Los votos individuales deben permanecer privados durante la votación.

El cliente puede conocer:

* que ya votó;
* cuándo todos terminaron;
* resultado agregado cuando corresponda.

No necesita conocer votos individuales ajenos.

No mantener historial individual de votos después de la tanda en el MVP.

---

# 19. Realtime específico de Impostor

En Incremento 4, el único caso cerrado es el lobby:

```text
Postgres Changes
→ aviso de cambio persistido
→ refetch autoritativo de Room + RoomParticipant
```

La suscripción queda acotada por `room_id` de la Room activa reconstruida por `get_my_active_room()`.
Ese id es metadato técnico para filtrar el canal, no una autoridad de producto ni contenido visible
del lobby.

El payload no es fuente final de verdad. Ante `INSERT room_participants` o `UPDATE rooms`, el cliente
invalida el lobby y llama nuevamente a `get_my_active_room()`. Ante reconexión exitosa también relee
completo, porque Realtime no garantiza que todos los eventos intermedios hayan sido observados.

Los cambios persistidos de Room y RoomParticipants se usan como invalidación compartida. En Incremento 6, el `UPDATE rooms` de `lobby → playing` invalida clientes, que reconstruyen con `get_my_active_room()` y luego `get_my_game_state()` si corresponde.

No se agregó Realtime de gameplay ni Broadcast. `game_sessions`, `session_players` y `rounds` no se publican por Realtime, no tienen grants CRUD de cliente y se acceden mediante RPCs autoritativas. Los secretos nunca viajan por Realtime.

En Incremento 7, la transición `role_reveal → discussion` no modifica `Room.status`, por lo que no existe un `rooms UPDATE` natural para invalidar a todos los clientes. La sincronización inicial de gameplay es polling lento de `get_my_game_state()` mientras `Room.status = playing`.

El polling reconstruye estado autoritativo y no transporta secretos por un canal adicional. El valor inicial sugerido es aproximadamente cada 3 segundos, como detalle técnico configurable. Cuando el host ejecuta exitosamente la transición, su cliente hace refetch autoritativo inmediato.

No se publica en Incremento 7:

```text
game_sessions
session_players
rounds
```

por Postgres Changes. Tampoco se usa Room como bus artificial ni se agrega Broadcast. Broadcast privado de invalidación, sin secretos, queda como posibilidad futura.

Incremento 8 mantiene la misma estrategia para la primera votación. No se publica `round_votes` por Postgres Changes y no hay SELECT/INSERT/UPDATE directo de cliente sobre votos. La sincronización de `voting_first`, voto propio y resultado agregado se reconstruye mediante polling lento de `get_my_game_state()`.

Durante `voting_first`, el denominador de completion es el roster congelado de `SessionPlayers`, no Presence, liveness ni RoomParticipants conectados. Membership y availability permanecen separados: un `SessionPlayer` desconectado sigue siendo parte de la tanda, candidato y votante requerido.

---

# 20. Presence

Presence quedó fuera de Incremento 4.

Incremento 5.1 quedó cerrado con Supabase Realtime Presence para representar disponibilidad efímera de los `RoomParticipant` de una Room activa:

* conectado;
* desconectado.

Presence funciona como señal inmediata de disponibilidad. No reemplaza `RoomParticipant`, no reemplaza `Player` y no constituye autoridad para `hostPlayerId`.

Varias conexiones de un mismo Player se reducen a un único Player lógico.

El canal de Presence es privado, está identificado internamente por `roomId` y se autoriza contra `RoomParticipants` persistidos.

La separación conceptual del Incremento 5 es:

```text
RoomParticipant
= pertenencia persistida a una Room

Presence
= disponibilidad efímera connected/disconnected

room_participants.last_seen_at
= evidencia autoritativa de actividad reciente

rooms.host_player_id
= host autoritativo persistido
```

La Presence debe estar acotada a la Room activa. El identificador interno preferido del canal es `roomId`, no `joinCode`, porque el código pertenece al ingreso compartible y no debería funcionar como clave conceptual del canal.

Solo un Player autenticado que sea `RoomParticipant` de esa Room puede participar u observar su Presence.

Un evento de pérdida de Presence no equivale inmediatamente a abandono. La desconexión de un host no modifica `host_player_id` en 5.1 ni en 5.2, y desde 5.3 tampoco decide por sí sola la sucesión.

Incremento 5.2 cerró `room_participants.last_seen_at` como señal mínima de liveness autoritativo. Ese timestamp representa evidencia verificable de actividad reciente del Player dentro de esa Room. No representa Presence, conexión, abandono, host, ready ni estado de juego.

La escritura ocurre mediante la RPC autoritativa `refresh_my_room_liveness()`. El cliente no envía `player_id`, `room_id` ni timestamp. La autoridad deriva:

```text
auth.uid()
→ Player
→ active Room
→ RoomParticipant propio
```

y escribe tiempo server-side de Postgres.

La RPC debe rechazar o no operar cuando no hay Auth válida, no existe Player, no existe Room activa o el Player no pertenece a la Room. Desde Incremento 6, Room activa incluye `lobby` y `playing`.

`last_seen_at`:

* sirve solo para validar staleness;
* no es el estado visual principal de Presence;
* no es historial;
* no se muestra al usuario;
* no implica auditoría de conexiones;
* no debe convertirse en infraestructura genérica.

Una nueva participación comienza con liveness reciente: `last_seen_at = now()`. La migration 5.2 aplicó backfill acotado a Rooms en `lobby` y no fabricó liveness activo para Rooms cerradas.

La cadencia inicial del heartbeat es 30 segundos mientras el lobby esté activo. El cliente refresca liveness al establecer o reconstruir correctamente el lobby, al establecer correctamente Presence, periódicamente mientras el lobby esté activo y al volver a foreground. No refresca por cada interacción de usuario.

La implementación puede evitar escrituras si `last_seen_at` fue actualizado hace menos de aproximadamente 10 segundos. Ese throttling es protección técnica, no regla de producto.

El threshold inicial de stale es 90 segundos:

```text
active = last_seen_at no es null
         and now() - last_seen_at <= 90s

stale  = last_seen_at es null
         or now() - last_seen_at > 90s
```

El reloj autoritativo es server-side/Postgres. Los 90 segundos reemplazan la hipótesis previa de 60 segundos para la implementación inicial, porque dan más margen frente a heartbeat de 30 segundos, throttling, red y suspensión de timers móviles. Sigue siendo un parámetro técnico a validar, no una regla del juego ni una preferencia configurable.

Liveness es por Player-en-Room, no por conexión ni pestaña. Dos pestañas pueden refrescar la misma fila. Mientras alguna conexión válida del Player mantenga el heartbeat, el Player conserva liveness reciente.

Presence y liveness pueden discrepar temporalmente sin que sea un bug. Por ejemplo:

```text
Presence = disconnected
last_seen_at = hace 10 segundos

→ desconectado para UX
→ todavía no stale autoritativamente
```

Incremento 5.3 cerró la sucesión autoritativa de host mediante `reassign_room_host_if_stale()`. La RPC no recibe argumentos de ownership: deriva identidad desde `auth.uid() -> Player -> active Room`, valida server-side el host actual y usa `room_participants.last_seen_at` con reloj de Postgres para decidir si está stale.

La regla implementada, cuando el host actual está stale, es:

```text
RoomParticipants restantes
→ excluir host actual
→ excluir participantes stale
→ ordenar por joined_at ASC, player_id ASC
→ persistir un sucesor en rooms.host_player_id
```

`player_id` solo desempata de forma técnica y determinística. No es criterio visible de producto.

Si el host está ausente de Presence pero `last_seen_at` todavía está active, no hay sucesión:

```text
Presence host = disconnected
last_seen_at todavía active

→ no hay sucesión
```

Si no existe otro participante active, la operación es no-op: la Room sigue `lobby`, el host actual permanece persistido, `host_player_id` no queda `null` y la Room no se cierra automáticamente.

Si el host original vuelve después de haber sido reemplazado, vuelve como participante normal. No recupera host automáticamente y no existe prioridad especial, `previous_host` ni historial de hosts en 5.3.

La reasignación de host queda registrada en el estado autoritativo. El flujo sigue siendo:

```text
estado persistido cambia
→ Realtime invalida
→ get_my_active_room() vuelve a leer
→ todos observan el nuevo host
```

Presence no se convierte en fuente de verdad del lobby persistente. El retorno de la RPC tampoco reemplaza el estado autoritativo del lobby: los clientes reconstruyen desde `get_my_active_room()`.

---

# 21. START_ROUND_DISCUSSION

```text
Host actual toca "Empezar ronda"
        ↓
PWA envía intención
        ↓
autoridad valida:
- actor es host actual de Room
- Room.status = playing
- actor pertenece a SessionPlayers
- GameSession.state = role_reveal
- Round actual es coherente
        ↓
GameSession.state cambia a discussion
        ↓
host hace refetch inmediato
        ↓
demás participantes observan el cambio por polling
        ↓
cada participante muestra "Ronda en juego"
```

La RPC para esta transición es específica y sin argumentos:

```text
start_round_discussion()
```

No se utiliza una operación genérica como `advance_round_phase()`.

---

# 22. Ejemplo de Incremento 8: START_VOTING

```text
Host toca "Ir a votación"
        ↓
PWA envía intención
        ↓
autoridad valida:
- actor es host actual de Room
- GameSession.state = discussion
        ↓
GameSession.state cambia a voting_first
        ↓
host hace refetch inmediato
        ↓
demás participantes observan el cambio por polling
        ↓
cada participante muestra UI de votación
```

La RPC prevista es específica y sin argumentos:

```text
start_round_voting()
```

No se utiliza Group admin, creator original ni host histórico como autoridad.

## Ejemplo de Incremento 8: SUBMIT_ROUND_VOTE

```text
SessionPlayer elige candidato
        ↓
PWA envía submit_round_vote(target_player_id)
        ↓
autoridad deriva caller desde auth.uid()
        ↓
valida:
- caller pertenece a SessionPlayers
- GameSession.state = voting_first
- target pertenece a SessionPlayers
- caller != target
- no existe voto previo distinto
        ↓
guarda voto privado de voting_round = 1
        ↓
si faltan votos: permanece voting_first
        ↓
si votaron todos los SessionPlayers:
  cuenta votos autoritativamente
  cambia GameSession.state a tie_discussion | impostor_guess | round_result
```

El último voto resuelve dentro de la misma operación lógica. No existe una etapa estable donde todos votaron y otra RPC cierre manualmente la primera votación.

---

# 23. Ejemplo completo: START_SESSION + PREPARE_ROUND

```text
Host actual toca "Iniciar tanda"
        ↓
autoridad valida:
- caller deriva a Player válido
- Player pertenece a Room activa
- Room está en lobby
- caller es rooms.host_player_id actual
- no existe GameSession para esa Room
- participantes active >= 3
- palabra disponible
        ↓
congela SessionPlayers desde RoomParticipants active
        ↓
selecciona palabra
        ↓
calcula conteos derivados de rondas previas de la GameSession
        ↓
elige impostor aleatoriamente entre elegibles
        ↓
crea GameSession y Round 1 con snapshot de palabra e impostor
        ↓
Room.status pasa a playing
        ↓
GameSession.state pasa a ROLE_REVEAL
        ↓
cada cliente recupera su vista privada autorizada
```

---

# 23. Consistencia y concurrencia

La arquitectura debe contemplar pocos clientes concurrentes, pero correctamente.

Casos:

* `START_SESSION` vs join;
* `START_SESSION` vs leave;
* `START_SESSION` vs close;
* `START_SESSION` vs host succession;
* dos taps sobre `Nueva ronda`;
* varios votos simultáneos;
* último voto dispara resolución;
* reintentos de red;
* dos clientes reaccionando a desconexión de host.

Principio:

> Las operaciones importantes deben ser atómicas o consistentes e idempotentes cuando corresponda.

No definimos todavía implementación transaccional exacta.

---

# 24. Host disconnect

Comportamiento cerrado en 5.3:

Si el host deja de estar disponible, el cliente puede solicitar una evaluación cuando observa ausencia candidata por Presence, al reconstruir lobby, al volver a foreground/reconectar o mediante un recheck lento inicial de 30 segundos mientras el host siga ausente. El backend vuelve a decidir en cada intento.

La autoridad:

1. deriva caller y Room desde `auth.uid()`;
2. valida que la Room activa siga en `lobby` o `playing`;
3. revalida el host actual bajo la operación protegida;
4. aplica el threshold inicial de 90 segundos sobre `last_seen_at`;
5. excluye al host actual y a candidatos stale;
6. si la Room está en `playing`, intersecta candidatos con `SessionPlayers` de la GameSession de esa Room;
7. ordena candidatos active por `joined_at ASC, player_id ASC`;
8. registra el nuevo `host_player_id` de forma autoritativa si hay candidato.

No existe:

* cliente esperando exactamente 90 segundos y cambiando host;
* cliente eligiendo sucesor;
* Broadcast como autoridad;
* cierre automático por ausencia;
* recuperación automática del rol por el host original.

La implementación serializa la sucesión mediante locking de Room y revalidación de host/liveness. Las auditorías y validadores cubrieron callers simultáneos, convergencia a un único candidato e idempotencia posterior.

Revival y sucesión son consistentes según el orden de serialización:

* si el refresh del host gana antes de completar la sucesión, la revalidación detecta host active y no cambia host;
* si la sucesión gana, el nuevo host queda persistido y el host anterior vuelve como participante normal cuando refresca.

El lifecycle explícito no cambia: un no-host puede salir, el host puede cerrar la Room y el host que ejecuta la acción explícita de abandono/cierre conserva el comportamiento vigente. Desconexión/staleness y acción explícita son conceptos distintos.

Durante `playing`, esto preserva la invariante:

```text
rooms.host_player_id ∈ SessionPlayers
```

Un RoomParticipant excluido del snapshot no puede adquirir autoridad de gameplay por sucesión de host.

---

# 25. Reconexión

Cuando un cliente vuelve después de:

* refresh;
* lock/unlock;
* background;
* pérdida de red;
* cierre/reapertura;

la secuencia conceptual debe ser:

```text
recuperar identidad
↓
recuperar grupo
↓
detectar contexto activo
↓
consultar estado autoritativo
↓
recuperar vista privada
↓
re-suscribirse
```

No diseñamos todavía política avanzada de expiración o timeout.

---

# 26. Historial y estadísticas futuras

Al finalizar una tanda de Impostor:

* cerrar estado operativo;
* preservar `GameSessionHistory`;
* preservar `RoundHistory`;
* no conservar votos individuales históricos.

Esto permitirá estadísticas futuras.

La pantalla de estadísticas no forma parte obligatoria del primer MVP.

---

# 27. Futuro segundo juego

Tutti Frutti es solo un ejemplo arquitectónico futuro.

```text
Juegos Familiares
│
├── Platform
│   ├── Group
│   ├── Player
│   ├── Auth
│   └── PWA
│
├── Impostor
│   └── dominio actual
│
└── Tutti Frutti
    └── dominio futuro
```

Cuando se diseñe Tutti Frutti se decidirá qué infraestructura y conceptos puede reutilizar.

No diseñamos Tutti Frutti ahora.

---

# 28. Dependencia de Supabase

Supabase reduce complejidad operativa al proporcionar:

* Auth;
* Postgres;
* RLS;
* Realtime;
* Presence.

El trade-off es la dependencia del proveedor.

Mitigación conceptual:

* mantener dominio puro independiente;
* evitar que componentes de UI dependan directamente de detalles de infraestructura cuando no sea necesario;
* encapsular accesos a backend razonablemente;
* no construir capas abstractas innecesarias solo para evitar lock-in hipotético.

---

# 29. Límites del MVP

Quedan fuera:

* múltiples backends;
* microservicios;
* matchmaking;
* usuarios públicos;
* social network;
* offline multijugador;
* peer-to-peer;
* escalabilidad masiva;
* colas distribuidas;
* moderación avanzada;
* sistema de plugins para juegos;
* motor universal de juegos;
* abstracciones anticipadas para Tutti Frutti;
* analytics sofisticados.

---

# 30. Decisiones diferidas

Se difieren:

* framework frontend exacto si todavía no está formalmente decidido;
* estructura física definitiva de carpetas;
* schema SQL posterior a identidad/grupo/jugador;
* RLS concreto para banco de palabras, salas, rondas, votos y permisos de Impostor;
* RPC/Functions concretas posteriores a identidad, grupo e invitación;
* Postgres Changes vs Broadcast por evento;
* estrategia exacta service worker/cache;
* limpieza de salas;
* expiraciones;
* tolerancia precisa a desconexiones;
* recuperación avanzada;
* UI/design system.

No cerramos decisiones que todavía no fueron tomadas.

---

# 31. Relación con futura estructura del repositorio

Una futura estructura podría separar conceptualmente:

```text
app/
├── platform/shared
└── impostor
```

o equivalente.

Y dominio:

```text
domain/
└── impostor
```

No fijamos nombres de carpetas definitivos.

Lo importante es la separación de responsabilidades, no la estructura exacta.

---

# 32. Próximo paso

Con la arquitectura conceptual cerrada, el siguiente paso es crear:

```text
sources/implementation-plan.md
```

Ese plan deberá convertir arquitectura y dominio de Impostor en incrementos verticales pequeños, verificables y pedagógicos.
