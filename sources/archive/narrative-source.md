# Narrative source

> This file is narrative source material, not an active product or architecture
> contract. Current claims must be checked against active documentation and the
> production baseline before publication.

## Origin and motivation

Impostor began with a deliberately human problem: help a small group coordinate
private roles, a secret word, voting and scoring without turning the phones into
the center of an in-person conversation. The useful boundary was to digitize
what is awkward or unsafe to coordinate manually and let people handle clues,
suspicion, humor and pacing face to face.

Each participant using a phone made private information and secret voting
possible without physical cards. It also introduced the real product and
engineering challenge: several devices must converge on one shared progression
while each actor receives a different authorized view.

Juegos Familiares emerged as a small container around that first domain. The
project recognized identity, `Player`, `Group`, navigation and PWA lifecycle as
potentially shared capabilities, while keeping Room, GameSession, Round, votes,
host and scoring inside Impostor. A broader platform is intentionally deferred
until another real utility demonstrates reuse.

## Decision-story candidates

### Lightweight identity without lightweight authorization

Traditional accounts were judged too heavy for casual family play, but a
purely local identity could not protect remote data. The adopted mental model
separated `AuthIdentity`, `Player`, `Group` and `LocalIdentity`: anonymous Auth
supports remote authorization; the Player represents someone in the current
social context; LocalIdentity only improves UX. The lasting story is the
tension between low-friction entry and authority, not the current signatures
of particular RPCs.

### Group is not Room

`Group` answers “who are we over time?” while `Room` answers “who is playing
now?”. This distinction emerged through the onboarding work: merely belonging
to a Group was technically correct but did not initially give people an
obvious place or next action. Browser/mobile smoke exposed that gap, which
unit and database tests could not.

### The server decides; each phone sees a part

The defining technical constraint was that a manipulable client must not decide
roles, words, votes, winners, points, phase or host. Postgres, RLS and scoped
RPCs became the authority, deriving the actor from authenticated state. Private
read models provide only the caller's view; hiding a secret in UI was never
accepted as privacy.

### Realtime is a signal, not truth

Realtime was introduced where it improved synchronization, but an event only
invalidates local knowledge. Clients re-read authorized state after events,
responses, retries and interruptions. Presence answers who appears available;
persisted membership and liveness answer different questions.

### Liveness, succession and recovery

The project separated a transient Presence disappearance from abandonment.
Persisted recent activity supports an authoritative host-succession decision in
the lobby, with deterministic selection and concurrency protection. Recovery
was reframed from “restore the exact old screen” to “replace stale local state
with the current safe, authorized state”. That framing covers refresh,
foreground, reconnect, missed events and responses lost after a successful
mutation.

### PWA as progressive capability

The web/PWA direction favored access by URL, optional installation and simple
distribution. It did not promise offline synchronized gameplay. The durable
lesson is the boundary `PWA cache != game-state authority`: static shell assets
may be cached, while authenticated and live game state remain network-backed.

### Incremental delivery and real-use feedback

Work advanced in narrow vertical slices: decide a contract, implement a visible
capability, validate according to risk and use the result to choose the next
slice. Automated checks protected invariants; browser and real-use observation
found dead ends, unclear hierarchy and missing continuity. Later production-use
feedback produced small changes to Room joining, reveal/hide interaction and
the starting-player rule without reopening the whole design.

### AI-assisted workflow with human responsibility

AI tools helped inspect alternatives, draft scoped implementations, propose
tests and audit diffs. Product direction, architecture acceptance, UX judgment,
physical-device validation and final approval remained human responsibilities.
The intended professional story should show traceable decisions and rejected or
bounded suggestions, not portray AI output as autonomous authority.

## Evidence candidates

- The current approved-beta and production claims are owned by
  `sources/project-status.md`: production at `main@7431605`, repeated real-world
  use and positive human evaluation, with explicit limits on what “approved
  beta” means.
- Unit/component tests, migration-content tests, local database validators and
  Realtime smokes accumulated around authorization, privacy, transitions,
  concurrency, idempotency and recovery. Exact counts and current pass status
  must be regenerated rather than copied from old narrative documents.
- A September 2026 exploratory smoke used four isolated actors, including a
  physical Motorola device, and traversed the complete two-round flow through
  final result. It was exploratory evidence, not formal pre-beta acceptance;
  details live in `ux-ui-exploratory-smoke-2026-09.md`.
- The pre-beta runbook recorded P0 as `PASS` on 2026-09-02 for product code
  `973dc0d`, with the test-contract correction at `53e9799`. It did not record
  the broader scenario matrix or D1 as completed.
- Production feedback was integrated through the historical branch/PR recorded
  in `sources/project-status.md`; the current baseline, not that branch, owns
  the resulting behavior.

This evidence does not establish D1 PASS, product-market fit, mass validation,
flawless production or exhaustive physical-device coverage.

## Project-maturity transitions worth narrating

1. A game concept was separated into human interaction and software-assisted
   coordination.
2. A minimal platform boundary appeared around the first concrete domain.
3. Lightweight identity gained remote authority and privacy controls.
4. Group and Room became distinct persistent-social and temporary-play spaces.
5. The complete round/session state machine became authoritative and
   reconstructible.
6. Recovery, PWA lifecycle and production feedback shifted the work from
   technical completeness toward observed product maturity.
7. Repeated real use and later human evaluation supported approved beta even
   though the original formal pre-beta D1 record remained incomplete.

## Retrospective questions

These are prompts for later analysis, not resolved decisions or backlog:

- Did introducing `Group` early reduce later friction, or create complexity
  before another utility proved the need?
- If multi-group membership becomes real, should `Player` become global and a
  separate membership own group-scoped nickname and permissions?
- Which concepts, if any, should be extracted only after the next utility is
  understood?
- Which recovery and host policies would be designed differently after seeing
  real mobile suspension and absence during gameplay?
- Was minimum historical persistence the right privacy/utility trade-off for
  later statistics?
- Which validation layers found problems that the others could not?
- Where did AI assistance materially improve the work, and where did human
  product judgment constrain or reject it?
