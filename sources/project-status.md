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

El `main` local integra los Incrementos 0–6 de Tutti Frutti y el traslado de
la gestión de grupos a la portada. El Incremento 7 está implementado y
commiteado en la rama `codex/tutti-frutti-increment-7`, todavía no integrado
en `main`. Este estado de código local no equivale a una publicación: la
baseline productiva indicada arriba no cambió y no se aplicaron migrations
remotas.

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

El Incremento 7 agrega el inicio transaccional de Tutti Frutti: congela el
roster y la configuración efectiva, crea la sesión, la ronda
`LETTER_PENDING` y su candidata, y pasa la Room a `playing`. La lectura
autorizada reconstruye el estado usando el roster congelado; el inicio es
idempotente para el iniciador registrado. La migration y el validador de DB
se ejecutaron en Supabase local; también pasaron la suite de tests, lint y
build. No se hizo smoke visual manual en dos navegadores. El commit está en
la rama indicada, no en `main`; no se aplicaron migrations remotas ni se
modificó producción.

El Incremento 8 agrega la votación autoritativa para saltar candidatas, con
ventana de 5 segundos, umbral calculado sobre el roster congelado, tally sin
identidades y resolución perezosa al leer estado vencido. Los votos que llegan
a mayoría crean una candidata sin cambiar la ronda; los vencimientos aceptan
la letra. La migration, las pruebas concurrentes de DB local y las pruebas
focalizadas de UI/adaptador pasaron. También pasaron los 732 tests del proyecto,
el build y lint sin errores (con una advertencia preexistente). No se hizo
smoke visual manual: requiere dos identidades. La suite agregada de DB no pudo
ejecutarse porque exige comenzar sin grupos y la base local ya tenía 30; no se
limpió para preservar esos datos. El incremento está implementado en la rama
indicada, sin integrar a `main` ni aplicar migrations remotas.

Only observations confirmed against the current product should become active
improvement work. Historical UX findings are evidence to revalidate, not an
automatic backlog. No additional detailed post-beta UX/UI backlog is established
by this document today.

UX/UI refinement follows this cycle:

> real use → observation → friction → prioritization → small intervention →
> play again
