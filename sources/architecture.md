# Juegos Familiares — Arquitectura actual

## Propósito

Este documento describe cómo está estructurado el sistema actual y dónde viven
la identidad, la autoridad y los límites de dominio. No es un historial de
implementación ni un diseño de arquitecturas futuras.

## Vista general

Juegos Familiares es una aplicación mobile-first construida con Next.js,
React y TypeScript. Usa Supabase Auth para identidad autenticada, Postgres para
estado persistente, Row Level Security para limitar lecturas y escrituras, y
RPCs de Postgres para operaciones autoritativas.

Supabase Realtime y Presence se usan para invalidación y disponibilidad
efímera donde el flujo lo requiere. Impostor mantiene su coordinación propia;
Tutti Frutti usa Presence en el lobby y una señal RLS-filtrada para invalidar
las respuestas del mismo participante. Esa señal no contiene texto ni
reemplaza una lectura autorizada por RPC. La aplicación también dispone de
manifest, service worker y shell PWA compartidos.

```text
Cliente Next.js / PWA
        │ intenciones y lecturas autorizadas
        ▼
Supabase Auth + Postgres
        │ RLS, RPCs y modelos de lectura
        ▼
Estado autoritativo
```

## Límite entre plataforma e Impostor

### Plataforma

- `AuthIdentity`;
- `Player`;
- `Group` y el contexto de pertenencia;
- `Room` y `RoomParticipant` para identidad de juego, Group, host,
  membership y lifecycle compartidos;
- navegación compartida y gestión de Group en `/`;
- shell mobile-first y capacidades PWA;
- adaptadores comunes de acceso a Supabase cuando corresponde.

### Impostor

- `GameSession` y `SessionPlayer`;
- rondas, roles, palabras y asignaciones privadas;
- votos, resultados, puntuación e historial del juego;
- coordinación actual de liveness y reconexión y transiciones de gameplay;
- uso de Realtime y Presence para su experiencia sincronizada.

Cada Room persiste un `game_type` inmutable (`impostor` o `tutti_frutti`). Las
Rooms históricas se identifican como Impostor y la creación sin
argumentos continúa creando Impostor. Las RPCs con intención de juego validan
create/join, rechazan una Room activa de otro juego y mantienen opaco el código
de otro Group. `get_my_active_room()` devuelve el tipo junto con la coordinación
autorizada; la navegación recupera la ruta del juego. Tutti Frutti tiene
entrada, lobby, configuración por Room, inicio de sesión, votación de letra,
respuestas privadas, countdown autoritativo y lectura compartida de revisión
sólo después del bloqueo. Su tópico Presence de lobby está autorizado por
membresía; una señal RLS-filtrada
invalida sólo las respuestas propias.
`player_active_room_slots` sigue imponiendo una sola Room activa
por Player en toda la plataforma.

El gameplay permanece en cada juego. No existe un motor genérico de juegos,
rondas, puntajes ni Realtime.

## Identidad y autorización

El modelo mantiene separadas cuatro identidades:

```text
AuthIdentity ≠ Player ≠ Group ≠ LocalIdentity
```

- `AuthIdentity` identifica técnicamente una sesión autenticada.
- `Player` representa el registro de participante asociado a su contexto actual
  de `Group`.
- `Group` representa su contexto social persistente.
- `LocalIdentity` es una caché o pista de UX en el dispositivo.

El contexto reconocido se reconstruye desde la sesión autenticada y lecturas
remotas autorizadas. Los identificadores o datos locales no prueban identidad,
ownership ni permisos. Si se pierde la sesión válida, `LocalIdentity` no puede
recuperar por sí sola el `Player` anterior.

La creación de grupos requiere una identidad incluida en
`platform_admins`. Los usuarios comunes se unen mediante invitación. La RPC de
creación deriva al actor desde `auth.uid()` y crea el grupo, su administrador
inicial y la invitación correspondiente como una operación protegida.

## Autoridad de datos

El navegador envía intenciones. Postgres, RLS y las RPCs validan identidad,
ownership, permisos, estado previo y transiciones sensibles.

El cliente no elige ni certifica como autoridad:

- IDs de actor, grupo, host o participante;
- rol secreto o palabra;
- resultado de una votación;
- ganador, puntuación o transición de fase;
- sucesión de host o vigencia de una sesión compartida.

Las lecturas privadas devuelven sólo la vista autorizada para el actor. Ocultar
un secreto en React o CSS no constituye privacidad; el dato no debe entregarse
al cliente no autorizado. Los votos individuales tampoco se exponen a otros
participantes.

## Superficie de grupo

La portada `/` es la superficie canónica de plataforma para el contexto
`AuthIdentity → Player → Group`, el listado protegido de integrantes y la
invitación activa visible únicamente para el administrador. `/grupo` redirige
a la portada por compatibilidad; `/grupo/invitacion/[code]` resuelve la
incorporación a un grupo. La pertenencia actual se representa mediante la
relación de `Player` con un `Group`; no existe una abstracción separada de
membership. La gestión de Group no es una `Room` ni contiene estado de
gameplay.

## Persistencia y operaciones

Postgres conserva tanto datos persistentes de plataforma como estado operativo
e histórico de Impostor. Que una entidad de juego esté persistida no la
convierte en capacidad de plataforma.

Las escrituras sensibles se encapsulan en RPCs acotadas que derivan el actor
desde `auth.uid()`. Las operaciones relevantes validan guards y mantienen
consistencia transaccional e idempotencia cuando los reintentos o la
concurrencia lo requieren.

Las reglas puras del dominio de Impostor se mantienen separadas de React y de
los adaptadores Supabase cuando es razonable. Postgres resuelve persistencia,
autorización y coordinación; el dominio define reglas y resultados.

## Realtime, Presence y reconstrucción

Realtime no es autoridad. En el lobby de Impostor, Postgres Changes notifica
cambios persistidos y el cliente vuelve a leer la `Room` autorizada. Presence
representa disponibilidad efímera; no reemplaza `RoomParticipant`, liveness ni
el host persistido.

El gameplay privado se reconstruye mediante RPCs/modelos de lectura
autorizados. Los secretos no se publican por Realtime. Donde no existe una
notificación de cambio, el cliente puede consultar periódicamente el estado
autoritativo.

Después de refresh, reconexión, foreground o resuscripción, el cliente relee el
estado remoto actual. Una caché local o un payload perdido no se usa para
simular continuidad ni reproducir autoridad.

## PWA

La capacidad PWA pertenece a Juegos Familiares. La implementación actual
incluye manifest instalable, registro de service worker en producción y un
mecanismo explícito de actualización que evita recargar durante una ruta
crítica de partida.

El service worker aplica caché `cache-first` sólo a recursos estáticos seguros
del mismo origen. No cachea llamadas Supabase, RPCs ni estado de gameplay.
Instalar la aplicación es opcional y una partida compartida autoritativa sigue
requiriendo conectividad. La UI cacheada nunca reemplaza el estado remoto.

## Preguntas abiertas de arquitectura

Estas preguntas son exploración, no deuda ni compromiso de implementación:

- si el producto necesitará pertenencia a múltiples grupos;
- si `Player` seguirá ligado a un grupo o evolucionará hacia una identidad
  global con pertenencias separadas;
- qué forma de recuperación de identidad será apropiada;
- qué políticas de expiración o limpieza necesita el estado temporal;
- qué capacidades demostrará como compartidas una próxima utilidad real.
