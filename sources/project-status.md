# Project status

This document describes the current product state. It is not a chronological
development log.

> Active documentation describes the current system. Git preserves
> implementation history.

## Product stage

Impostor has reached an approved beta, and that approved beta is currently
deployed to production.

```yaml
product: Impostor
stage: approved beta
production: main@7431605
deployment_status: confirmed in Vercel Production
observed_status: working correctly based on validation performed so far
```

The baseline is supported by a manually confirmed Vercel Production
deployment, repeated real-world use, positive human evaluation, and the correct
behavior observed so far.

In this context, approved beta means that the complete core game loop is
implemented, deployed to production, used repeatedly in real-world play, and
supported by positive human product evaluation.

Approved beta does not imply product-market fit, mass validation, finished
UX/UI, absence of bugs, or product completion.

## Integrated production-feedback refinements

```yaml
source_branch: pre-beta-production-feedback
source_SHA: ec730c5
merged_via: PR #40
merged_into: main
status: integrated / deployed to production / currently active
```

The integrated refinements prompted by observation of production use are:

- join-room UX refinement;
- unified private reveal/hide interaction;
- starting-player rule refinement to avoid selecting the impostor when an
  equally balanced alternative exists.

These changes are integrated into `main`, deployed to Production, and part of
the current production behavior. The active source of that behavior is the
production baseline above, not the historical source branch. The refinements
remain subject to observation and progressive improvement; their integration
does not mean the UX/UI is finished.

## Post-beta roadmap

1. Documentation consolidation
2. Narrative and professional material
3. Progressive UX/UI refinement through observation
4. Next Juegos Familiares utility

Documentation consolidation is the current workstream and establishes the new
active documentation baseline. Once it is closed, workstreams 2, 3, and 4 may
proceed in parallel. They must remain separated by explicit scope, evidence,
and change control through distinct branches or tasks.

The next Juegos Familiares utility is future exploration. It may be a game or
another kind of utility; the roadmap does not decide that in advance.

## Known limitations

- A SessionPlayer who disconnects during a session remains in the frozen
  roster and can prevent completion of actions that require full participation,
  including voting.
- Host succession during `playing` has a confirmed product/architecture policy
  and a matching versioned Impostor code path described below; its deployed
  behavior has not been independently verified.

These are known limitations or verification gaps, not an automatic backlog.
Leaving during a session, timeout or a host override remain future exploration.

### Host succession during `playing`: policy, code, and deploy evidence

Earlier wording in the Impostor game-state and technical-requirements documents
described automatic succession as lobby-only. The later
`20260824120000_start_session_6_3.sql` definition of
`reassign_room_host_if_stale()` also handles `playing`, restricts the successor
to a liveness-valid RoomParticipant in the current `session_players` roster,
and the room UI invokes that RPC without a lobby-only guard. The policy is now
**CONFIRMED**: after authoritative server liveness marks the current host
stale, select a liveness-valid RoomParticipant from the active session's frozen
roster deterministically and transfer only `rooms.host_player_id`. Presence
may prompt evaluation but does not transfer authority. The former host does
not automatically regain authority on return; without an eligible successor
there is no transfer. In `lobby`, no session roster restricts candidates.
Future shared coordination must use the minimal shared session roster, not
Impostor-specific `session_players` columns.

This versioned code belongs to the documented production source baseline.
The deployed DB definition and live behavior were **not independently
verified** during the audit; do not claim production matches the versioned
code until that check is performed. No functional change is implied here.

## Future exploration

These questions are not committed roadmap items:

- whether absence or departure during a session needs timeout, host override
  or another explicit policy;
- whether nickname changes, nickname ownership or transfer of Group
  administration need explicit product rules.

Architectural questions about multi-group membership, global versus
group-scoped Player identity and capabilities shared by future utilities live
only in `sources/architecture.md`. Impostor-specific future capabilities remain
classified in `sources/games/impostor/product-brief.md`. The next utility is
already owned by the roadmap above.

## Current improvement work

El `main` local integra los Incrementos 0–12 de Tutti Frutti y el traslado de
la gestión de grupos a la portada. Los Incrementos 7–9 se integraron desde
`codex/tutti-frutti-increment-9`. Este estado local no equivale a una
publicación: la baseline productiva indicada arriba no cambió y no se
aplicaron migrations remotas.

Los Incrementos 0–4 introducen el tipo de juego, create/join y lobby Tutti,
identidad y roster neutral, y el espejo transaccional de inicio/fin Impostor.
Sus migrations están en la historia local de `main`; el smoke de Impostor y
las pruebas focalizadas descritas en los cortes fueron confirmados en sus
respectivos incrementos.

El Incremento 5 implementa localmente la compatibilidad de sesiones legacy y
sucesión de host en `playing` contra el roster neutral. Su validación remota
de la RPC desplegada sigue pendiente; no se inspeccionó ni modificó
producción. Esta verificación continúa siendo una brecha antes de atribuir el
comportamiento al despliegue.

El Incremento 6 agrega una configuración Tutti por Room, guardada como un
borrador JSONB atómico, con lectura de defaults sin fila persistida, escritura
autorizada sólo para el host en lobby, validación en DB y actualización por
Realtime. El código y la migration están integrados en el `main` local. El
usuario confirmó la comprobación manual completa con dos identidades. No se
aplicó la migration fuera de Supabase local.

La portada local ahora gestiona creación y unión al grupo, integrantes e
invitación de administración; Impostor conserva sus salas y su banco de
palabras. Las pruebas automatizadas focalizadas, TypeScript y lint pasaron
para ese cambio; no se hizo una comprobación visual manual en dos navegadores.

Los Incrementos 7–9 agregan, respectivamente, inicio transaccional y snapshot
de sesión, votación para saltar letras, y entrada persistente de respuestas.
El Incremento 9 guarda cada respuesta bajo la ronda, participante y posición
de categoría; sólo su autor la lee mediante RPC y las respuestas no tienen
acceso directo desde clientes. La UI guarda tras 500 ms, conserva cambios no
confirmados en memoria y relee tras carga, reconexión o invalidación Realtime.
El Incremento 9 habilitó edición únicamente en `PLAYING`. Las migrations y
validadores de DB de estos incrementos se ejecutaron en Supabase local. Los
tests del proyecto y la regresión automatizada de Impostor pasaron; el
chequeo de tipos directo pasó. Lint terminó sin errores, con una advertencia
preexistente. El build
compiló el bundle, pero Next falló al interpretar `tsc --showConfig`. No se
completó el smoke visual del formulario con dos navegadores. No se limpiaron
los fixtures locales del validador, no se aplicaron migrations remotas ni se
modificó producción.

El Incremento 10 está integrado a `main` local. La primera
llamada requiere todas las categorías guardadas y no vacías; fija un plazo de
45 segundos. La DB permite editar durante la cuenta antes del vencimiento y
un job de Supabase Cron bloquea la ronda sin clientes. El validador local
comprobó privacidad, llamadas simultáneas, guardado en vuelo y bloqueo
autónomo. La UI conserva un resumen de respuestas confirmadas y ediciones sin
confirmar al cerrarse la ronda. Quedan pendientes el smoke visual de dos
navegadores, la validación operacional del job en un destino real y cualquier
aplicación remota. El `main` local sí integra `home-games-first`; la baseline
productiva no cambió.

El Incremento 11 está integrado al `main` local. La revisión
compartida se abre sólo tras el bloqueo confirmado, para el roster congelado.
Presenta originales, vacíos y participantes con coincidencias provisionales
por categoría sin exponer valores normalizados ni habilitar desafíos o
puntajes. La validación local incluyó acceso por actor y fase y una lectura
mientras la transición de
bloqueo estaba sin commit. Se revisó la UI móvil con una identidad; quedó
pendiente el smoke visual de dos sesiones aisladas. No se aplicó migration
remota.

El Incremento 12 está integrado al `main` local. Agrega impugnaciones durante
la revisión: en partidas de tres o más participantes decide la mayoría estricta
del roster congelado, y en partidas de dos decide el autor. La disputa vence a
los 30 segundos y la DB extiende el Cron existente con resolución autónoma. Los
validadores locales de Tutti Frutti 11 y 12 y la suite de aplicación pasan; el
lint conserva un warning previo y el build pasa. Quedan pendientes el smoke
visual con dos sesiones aisladas y la comprobación operacional de Cron en un
destino real. La migration no se aplicó remotamente y la baseline productiva no
cambió.

El Incremento 13 quedó integrado en `main` local desde
`codex/tutti-frutti-increment-13`.
El host cierra la revisión con una operación transaccional e idempotente que
guarda puntos 10/5/0 por respuesta y pasa la ronda a `RESULT`; la lectura
incluye el roster congelado y deriva los totales en una consulta agrupada. La
migration 13 y sus pruebas DB pasaron en Supabase local; también pasaron las
regresiones DB de los incrementos 11 y 12. Los 776 tests de aplicación,
TypeScript, lint y build con Webpack pasaron; lint conserva una advertencia
preexistente. No se completó un smoke visual manual con dos sesiones aisladas.
Los fixtures locales del validador se conservaron; no se reinició ni limpió la
DB. No se aplicó remotamente y la baseline productiva no cambió.

El Incremento 14 quedó integrado en `main` local desde
`codex/tutti-frutti-increment-14`. Agrega
avance host-only desde `RESULT`, selecciona la ronda vigente por número,
preserva resultados históricos y usa el invalidation signal existente para
recuperación. La migration y los validadores DB de los incrementos 12, 13 y 14
pasaron en Supabase local. Pasaron los 783 tests de aplicación, TypeScript y
build con Webpack; lint no reporta errores y conserva una advertencia
preexistente. El smoke visual manual con dos sesiones móviles y un canal
Realtime interrumpido está pendiente. No se reinició ni limpió la DB local; no
hubo cambios remotos y la baseline productiva no cambió.

El Incremento 15 quedó integrado en `main` local desde
`codex/tutti-frutti-increment-15`. La
puntuación de la última ronda finaliza la sesión y devuelve la Room al lobby en
una transacción; el roster congelado conserva acceso a una URL estable con el
ranking final. El lobby postpartida retiene participantes y slots, permite
cerrar o salir y bloquea revancha/configuración hasta el Incremento 16. La
migration se aplicó en Supabase local y pasaron el validador 15, las regresiones
Tutti Frutti 12–14 y el cierre Impostor 12.2. Pasaron 795 tests de aplicación,
TypeScript, build con Webpack y lint sin errores; persiste una advertencia
preexistente. El smoke visual mobile con dos sesiones aisladas no se completó:
el runtime Playwright de la guía local no está instalado. No se reinició ni
limpió la DB local, no hubo cambios remotos y la baseline productiva no cambió.

El Incremento 16 implementa revancha en la misma Room desde una sesión nueva:
el host actual puede editar el borrador y el roster se congela desde los
RoomParticipants registrados al iniciar. El score y los snapshots anteriores
no se reutilizan. La RPC conserva el retry del iniciador original y también
permite recuperar la sesión al host sucesor; separa config inválida (`P0038`)
de lifecycle inconsistente (`P0056`). La migration se aplicó a Supabase local;
pasaron los validadores Tutti Frutti 12–16 y cierre Impostor 12.2. Pasaron 802
tests de aplicación, TypeScript, build con Webpack y lint sin errores (queda
una advertencia preexistente). El smoke visual con dos sesiones no se completó:
se abrió una segunda sesión aislada, pero no se pudo establecer la identidad y
el flujo compartido desde esa sesión. No se reinició ni limpió la DB local, no
se aplicaron migrations remotas ni cambió la baseline productiva.

El Incremento 17 se auditó en la rama local `codex/tutti-frutti-increment-17`.
Pasaron los validadores de Tutti Frutti 7–16, el ciclo multironda de Impostor
12.5 y las validaciones de sucesión 5.3 y 6.3 en Supabase local; la suite de
aplicación pasó con 802 tests y también pasaron lint y build con Webpack. Se
añadió `validate-tutti-frutti-17.mjs` para comprobar sucesión real de host en
countdown y revisión, retorno del host anterior y ausencia de sucesor sin
alterar el estado de la partida. Ese validador pasó antes del reinicio del
entorno.

El smoke móvil de dos jugadores recorrió tres rondas, reload durante candidata
y después de avanzar ronda, revisión, puntuación, resultado final y retorno al
lobby; los dos clientes recuperaron el resultado compartido. En una revancha
con tres jugadores, todos reconstruyeron el roster y el estado tras reload, y
el tercer jugador recuperó sus respuestas después de que el host llamara
Tutti. El smoke de tres jugadores no llegó a resultado/cierre y no se completó
un ciclo manual de navegador de Impostor. La auditoría de Impostor se apoya en
sus validadores locales, no en una nueva sesión visual.

`npm run test:db` no pudo completar la suite desde cero porque su primera
validación exige una base sin Groups y la instancia local ya contenía 227. No
se reinició ni limpió esa base para preservar sus datos; los validadores
focalizados anteriores pasaron. Tras reiniciar el entorno, volver a ejecutar
el validador nuevo quedó impedido por falta de acceso al socket Docker, por lo
que la ejecución satisfactoria registrada es la previa al reinicio. La
revisión móvil observó las rutas principales a 390 px sin desborde horizontal,
manifest con `display: standalone` y una ruta de resultado inválida que mostró
su estado de recuperación sin datos privados. No se confirmó desde navegador
la activación del service worker ni se probó pérdida real de conectividad.

No se encontró una falla reproducible que justificara cambiar comportamiento
de producto o esquema. Los límites anteriores quedan como evidencia pendiente
de completar el smoke de tres jugadores, Impostor visual, conectividad real y
service worker. Todo lo verificado corresponde a entorno local; no se
consultaron ni modificaron servicios remotos y la baseline productiva no cambió.

### Despliegue de Tutti Frutti — 2026-09-26

El usuario informó que Tutti Frutti fue desplegado hoy. El dato se registra
como confirmación del usuario; no se consultó Vercel durante esta actualización.
No se dispone aquí del entorno exacto del despliegue ni del SHA del build, por
lo que no se atribuye el despliegue a un commit concreto ni se actualiza la
baseline de producción de Impostor (`main@7431605`).

La rama `codex/release-tutti-frutti` contiene los incrementos 0–17 integrados
en el `main` local, junto con los ajustes de release del 26/09: durante
`lobby` y `playing` Tutti Frutti mantiene heartbeat y evaluación autoritativa
de liveness/sucesión de host; Presence se usa para indicadores de conexión. La
PWA mantiene la actualización bajo acción explícita del usuario y aplaza la
recarga hasta salir de una ruta crítica de partida. Estos cambios corresponden
al código versionado de la rama; la asociación con el build desplegado queda
pendiente de confirmar con su SHA/detalle de deployment.

El despliegue informado no confirma por sí solo las validaciones operativas
pendientes: smoke de tres jugadores hasta cierre, smoke visual de Impostor,
pérdida real de red y activación del service worker.

En la revisión del smoke se observó que el bloque de sala competía con la grilla
de la ronda. Se compactó durante la sesión activa: código, conexión del cliente
y total del roster permanecen visibles; el roster con Presence individual se
pliega en un `<details>` nativo, inicialmente cerrado. La elección se conserva
al cambiar de fase; lobby y resultado final no cambian. La suite completa pasó
con 803 tests y pasaron lint y build. La ruta de una partida real quedó en
«Comprobando sala…» durante el intento de revisión a 390 × 844, por lo que la
última modificación todavía no tiene confirmación visual en navegador. El
smoke mobile previo corresponde al render anterior a este ajuste.

Only observations confirmed against the current product should become active
improvement work. Historical UX findings are evidence to revalidate, not an
automatic backlog. No additional detailed post-beta UX/UI backlog is established
by this document today.

UX/UI refinement follows this cycle:

> real use → observation → friction → prioritization → small intervention →
> play again
