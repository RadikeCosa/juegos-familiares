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

El Incremento 0 de la arquitectura multi-game está implementado y validado
solo en la rama `codex/tutti-frutti-increment-0` y Supabase local. Añade
identidad de juego inmutable a Room y la expone en discovery; no habilita
creación ni gameplay de Tutti Frutti. La regresión automatizada de Impostor y
el smoke local de creación, recuperación e inicio pasaron. El cierre visual
multidispositivo queda pendiente de revisión; la baseline productiva indicada
arriba no cambió.

Only observations confirmed against the current product should become active
improvement work. Historical UX findings are evidence to revalidate, not an
automatic backlog. No additional detailed post-beta UX/UI backlog is established
by this document today.

UX/UI refinement follows this cycle:

> real use → observation → friction → prioritization → small intervention →
> play again
