# Tutti Frutti — Proposed Physical Data Model

## Status and design criteria

This is a reviewable proposal, not executable SQL or an applied schema. Names,
keys, and constraints below are candidates for a later migration plan. Product
decisions are in `product-decisions.md`; shared/game ownership is in
`room-session-boundary.md`; operational guards are in
`technical-requirements.md`. `OPEN` items must not be silently decided by a
migration.

The Increment 3 local migration applies the recommended minimal session
identity and Impostor backfill with explicit linkage, atomic retry checks, and
closed-by-default access. It is not a production baseline: remote preflight
was unavailable, new writers are not mirrored until Increment 4, and the
application does not consume `room_sessions` yet.

The design must allow multiple sequential Tutti Frutti sessions in one Room,
preserve one active Room per Player, prevent simultaneous sessions in one
Room, and keep the current Impostor session and close-on-finish behavior.

## Shared session alternatives

| Criterion | A. New minimal `room_sessions` and roster | B. Only game-specific session tables |
| --- | --- | --- |
| Session identity and history | One stable ID and ordering across games; game payload stays separate. | Each game owns IDs and lookup rules. |
| Active-session constraint | One partial unique constraint on unfinished `room_sessions.room_id`. | Requires a Room pointer with conditional references or per-game checks. |
| Host succession in `playing` | Can use one frozen roster without querying Impostor-specific columns. | Needs a game switch or duplicated authorization paths. |
| Reconnect | Room game type selects the loader; shared identity locates the current playthrough. | Loader first selects a game-specific table. |
| Impostor compatibility | Requires a small mapping/backfill and guarded dual writes at start/end; existing gameplay tables remain. | Initially touches less Impostor code, but shared lifecycle constraints remain difficult to enforce. |
| Risk | Migration and consistency of two related Impostor records. | Polymorphic references, duplicated lifecycle coordination, and cross-game host logic. |

**RECOMMENDED: A.** Introduce a new, minimal `room_sessions` entity and a
minimal `room_session_participants` roster. Do **not** rename or repurpose the
existing `game_sessions`: it remains the physical Impostor domain table. The
shared identity carries no role, phase, word, answer, vote, or score. The
choice is justified by Tutti Frutti rematches in one Room and by the current
host-succession dependency on Impostor's `session_players`.

## Shared entity candidates and constraints

| Entity | Candidate data and ownership | Important constraints and behavior |
| --- | --- | --- |
| Existing `rooms` | Add an immutable `game_type`; keep Group, code, host, `lobby | playing | closed`. | `game_type` required and restricted to known values; existing Rooms become `impostor`. Server rejects game mismatch. A Room never changes game. |
| Existing `player_active_room_slots` | Keep one row per Player for Rooms in `lobby` or `playing`. | Existing `player_id` primary key remains global across games; the slot is not released on Tutti Frutti `playing → lobby`, only on Room close or permitted departure. |
| New `room_sessions` | `id`, `room_id`, `group_id`, `game_type`, `started_at`, nullable `finished_at`. Unfinished means active; no generic gameplay `state`. | FK must make Room, Group, and game type agree; `finished_at >= started_at`; at most one unfinished session per Room through a partial unique index. Session game type is immutable. Multiple finished sessions per Room are allowed. |
| New `room_session_participants` | `session_id`, `group_id`, `player_id`, snapshot membership time or order if needed. | Unique `(session_id, player_id)`; Player belongs to the session's Group. Freeze from eligible RoomParticipants at start. Do not cascade-delete history when someone later leaves the Room. No Impostor count or game score. |

`text` plus a named CHECK constraint is recommended for `rooms.game_type` in
the first migration: it matches the current text-status convention and allows
adding a later game by changing a constraint rather than coordinating a
Postgres enum migration. Values are deliberately limited to `impostor` and
`tutti_frutti`; this is not an unrestricted string. Existing rows require an
explicit Impostor backfill. A temporary default of `impostor` can protect the
old zero-argument create path during rollout; the final create path must pass
the game explicitly, after which that default can be removed. Direct client
writes to Rooms remain prohibited.

A candidate composite key on Room `(group_id, id, game_type)` permits a
composite session FK that prevents a Tutti Frutti session from pointing to an
Impostor Room. A uniqueness constraint on `(session_id, room_id)` supports
cross-checks where needed. Some invariants cross tables and cannot be stated
as a simple row CHECK: `playing` requires exactly one unfinished session;
`lobby` and `closed` require none. Start/finish RPCs must serialize on the Room
and update both entities in one transaction; a deferred consistency constraint
can be considered in the migration design if it remains safe with the existing
Impostor RPCs. No `rooms.active_session_id` is proposed: the single unfinished
session is derived from the unique indexed relation, avoiding two competing
active-session sources of truth.

Existing `rooms_active_host_player_key` and
`player_active_room_slots` should retain their global active definition.
Current slot-release logic already releases only when a Room leaves both
`lobby` and `playing`, so a Tutti Frutti return to lobby must not release
slots. The Room's host still has to be a RoomParticipant. Reopening a `closed`
Room remains prohibited.

## Impostor compatibility mapping

The existing `game_sessions` stays named and structured as it is for initial
compatibility. Its `unique(room_id)`, `state`, and `finished_at` remain valid
for Impostor because Impostor closes its Room after one session. Existing
`session_players` retains its score and `impostor_count`; neither column moves
into the shared roster.

`RECOMMENDED`: map each Impostor `game_sessions.id` to the same
`room_sessions.id`. Existing Impostor sessions can be backfilled into
`room_sessions` with `game_type = impostor`, matching Room, Group, start, and
finish times; their `session_players` seed the minimal shared roster. New
Impostor starts then create both records, with the same ID, and both rosters in
the same existing transaction. Impostor end updates both finished timestamps
and closes the Room in its current transaction. Existing Impostor read models,
phase transitions, rounds, votes, and scores continue using their original
tables. Preflight must check real DB consistency before backfill or adding
strict constraints; deployed DB state was not inspected in this design.

Each game-specific session record must be constrained to a shared session of
the matching game type, rather than relying on its name or a UI route. The
Impostor mapping and Tutti Frutti session identity must also agree on Room
and Group. A composite reference or a guarded deferred constraint is a
candidate for the later SQL design; this proposal does not choose its syntax.

This mapping can be introduced in small steps: first Room game type and
game-aware discovery while existing Impostor clients still work; then shared
session identity/backfill with validation; then Impostor start/end mirroring;
then Tutti Frutti creation and loaders. Compatibility-only columns or nullable
constraints may be necessary during the transition, with strict constraints
added after backfill. No historical migration is rewritten.

## Tutti Frutti entity candidates

| Candidate | Persist or derive? | Relationships and invariant |
| --- | --- | --- |
| `tutti_frutti_room_setup` | Persist a Room-scoped lobby draft. A small ordered category list can be JSON here because it is editable draft input, not history or an authorization boundary. | One draft per Tutti Frutti Room; editable only by authorized actor under the eventual product rule while Room is `lobby`. Store round count and selected/custom category labels. Prior-value preselection remains `OPEN`. |
| `tutti_frutti_sessions` | Persist one game-specific snapshot keyed by the shared `room_sessions.id`. | Immutable configured round count, letter-pool snapshot, scoring/normalization rule version, and any game-specific configuration. No Impostor phase. |
| `tutti_frutti_session_categories` | Persist ordered snapshot rows. | Belong to one Tutti Frutti session; immutable after start; unique position per session. Store display label and optional preset source key so later catalog edits cannot alter history. Limits and duplicate-name policy remain `OPEN`. |
| `tutti_frutti_rounds` | Persist one row per scored letter cycle, created when preparing its first candidate. | Unique `(session_id, number)` and at most one unresolved round per session. Owns game-specific phase, deadline, lock time, scoring time, and accepted letter reference. Skipping a letter leaves the same round number. |
| `tutti_frutti_letter_candidates` | Persist one row per selected candidate letter. | FK to session and round; unique `(session_id, letter)` across played and skipped letters, plus at most one pending candidate per round. Candidate status moves to skipped or accepted; letters never return to available. |
| `tutti_frutti_letter_skip_votes` | Persist votes for a pending candidate. | Unique `(candidate_id, player_id)` and roster membership; only the candidate's open window accepts votes. Majority is authoritative, with both votes required for a two-player session. |
| `tutti_frutti_answers` | Persist latest accepted original text during entry, deterministic normalized value, final validity, and immutable awarded points after scoring. | Unique `(round_id, player_id, category_id)` with composite session-consistency checks. Author can write only before lock. Missing/empty values score zero. Open challenge status can be derived. |
| `tutti_frutti_round_completions` | Persist one completion indication per round participant if early close is supported. | Unique `(round_id, player_id)`; the first valid call establishes the round's one deadline. Later calls do not change it. Individual completion reversal and early-close eligibility remain `OPEN`. |
| `tutti_frutti_challenges` | Persist the dispute and final outcome. | FK to one non-empty answer and challenger; challenger differs from answer author; at most one open challenge per answer, with final resolution immutable. |
| `tutti_frutti_challenge_votes` | Persist voter choices. | Unique `(challenge_id, voter_id)` and session roster membership. For 3+ players the answer author cannot vote; for two players mutual agreement must be represented without unilateral invalidation. Exact disconnect eligibility/timeout remains `OPEN`. |
| `tutti_frutti_round_scores` | **Do not add initially.** | Per-answer awarded points are immutable scoring snapshots. Per-player round totals and cumulative totals derive by summing them, including zero for absent/empty answers. Add a separate snapshot only if measured read or historical needs justify it. |

Draft configuration must not be the only source for a started session. At
start, validate and copy round count, ordered category labels, custom labels,
and letter pool into immutable session records. A rematch makes a new snapshot
even if its draft happens to have the same values. Optional timer settings
must also be copied if the product later makes them configurable; current
10/45-second values are working hypotheses, not platform settings.

## Letter pool and phase representation

| Letter model | Benefit | Cost |
| --- | --- | --- |
| Only arrays/JSON in session | Few rows. | Concurrent skip/selection and uniqueness rely on rewriting one blob; votes have no stable candidate identity. |
| Only rows for every available letter | Strong per-letter state. | Many immutable rows and more write volume for a small controlled pool. |
| **Session pool snapshot + candidate rows (recommended)** | Stable configured pool; unique chosen letters and candidate-specific skip votes; `available = pool − chosen candidates`. | Requires a candidate table and server membership guard against letters outside the snapshot. |
| Derive all use from scored rounds | Simple for played letters. | Cannot represent skipped or pending letters safely. |

The session snapshot owns the permitted pool; candidates record only letters
actually drawn. The server checks each candidate belongs to the snapshot.
`available` is derived. A round can see several skipped candidates before one
is accepted, without incrementing its number or creating a completed round.
The round's game-specific phase is one of the state-model phases; short-lived
`PREPARING`, `LOCKED`, or `SCORING` phases may be transactional rather than
separate user-visible states. Their guards remain mandatory either way.

## Answers, countdown, review, and scoring

Answer writes should serialize with round lock on the same round row. The
server stores original text and the most recent accepted value; it applies a
deterministic session-versioned normalization at write or lock. The exact
normalization beyond trim/case is `OPEN`. The private entry read model returns
only the actor's answers. At `REVIEWING`, an authorized session participant may
read the answer set and duplicate groups needed for review. Duplicate groups
are derived from final valid normalized answers in the same round/category,
not stored while validity can change.

The round stores one authoritative `countdown_started_at`, `countdown_ends_at`,
and `triggered_by` as candidates. A first valid call locks the round row,
checks eligibility, records the deadline, and advances to
`FINAL_COUNTDOWN`; later calls cannot rewrite those fields. Deadline expiry or
a valid early-close guard locks answers exactly once. Reconnect displays time
remaining from the authoritative deadline. A client timer cannot lock the
round. The first-call guard is a working product hypothesis until the
all-fields-complete rule is validated; the deadline uniqueness is confirmed.

Challenge resolution only changes an answer's final validity after authorized
votes or mutual agreement. The two-player case can use the same vote table
with the answer author allowed to record agreement, but this is a technical
candidate, not a decision about UI or timeout. The final eligibility snapshot
and absence policy must be decided before implementing resolution. Open
challenges block scoring.

**RECOMMENDED scoring source of truth:** after all challenges resolve, compute
10/5/0 from locked answers and final validity in one guarded transaction, then
persist each answer's awarded points and a round `scored_at` marker. A unique
round phase/marker makes retries return the existing result. Round totals,
cumulative scores, and ranking are derived from these immutable points; no
second mutable score counter is needed. This combines reproducible history
with a single scoring application. Deriving points afresh on every read would
risk changing old results after normalization or rule changes; persisting only
round totals would lose the per-answer explanation and complicate correction
of duplicates after invalidation.

## Session finish, lobby return, and rematch

In one transaction, the final-round scoring path must establish that all
configured rounds are scored, mark `room_sessions.finished_at`, freeze the
Tutti Frutti session and descendants, and change its Room from `playing` to
`lobby`. The unfinished-session lookup then becomes empty and the same
RoomParticipant rows and active-room slots remain. The operation is
idempotent: a retry sees the existing finished session and lobby Room and
returns the same result. A failure rolls back both entities; neither
`finished session + playing Room` nor `lobby Room + unfinished session` may be
committed. Closing the Room is a separate lobby operation. Retaining the
current host-only close permission is `RECOMMENDED`, pending confirmation of
the Tutti Frutti post-game action policy.

At rematch start, a new `room_sessions.id` and Tutti Frutti session snapshot
are created in the same Room. The new roster is frozen from eligible current
RoomParticipants and may differ from the prior roster. Finished results stay
addressable by authorized prior session participants. The active-room read
model reports the Room as `lobby`; a separate protected recent-session read
may show its last result without pretending it is still active. Who initiates
rematch, prior-config preselection, and departures between matches remain
`OPEN` product choices.

## Authorization, Realtime, and recovery

The Room type, Group, membership, session roster, and actor's answer ownership
must be verified by server operations. New tables should default to no client
table privileges with RLS enabled; explicit read models expose only authorized
views. A participant who joined the Room after a prior session may not read
that session's private history merely because they now belong to the Room.
A prior session participant who later leaves the Room must not be removed from
historical roster records. The exact finished-history access policy after
departure should be confirmed during security design, preserving at least the
current authorized roster principle.

Existing Realtime on `rooms` and `room_participants` can invalidate
coordination reads. For Tutti Frutti gameplay, a safe first design is
authorized read polling plus Room change notifications. If low-latency phase
updates later require another signal, use a game-specific invalidation that
carries no private answer or vote data, followed by an authorized re-read.
Do not publish answer rows during entry. Presence remains visual/ephemeral;
`last_seen_at` supports liveness and candidate host selection but cannot
delete answers or roster membership.

## Critical races and guards

| Operation | Main race | Required guard and atomicity |
| --- | --- | --- |
| Create / join | Two devices claim different active Rooms. | Derive actor; lock/read slot and rely on its unique Player key; return same-game retry or reject conflict. |
| Start / rematch | Two hosts or retries start twice. | Lock Room; require `lobby`, game type, host authority, valid draft, no unfinished session; unique active-session index; create roster/domain and set `playing` atomically. |
| Select / skip letter | Repeated draw or votes after window. | Lock session/round; unique `(session, letter)` and voter/candidate key; server time and phase guard. |
| First Tutti Frutti call | Simultaneous callers establish two deadlines. | Lock round; validate caller and phase; write deadline only if absent; later calls preserve it. |
| Edit versus lock | Late answer write lands after lock. | Serialize both through round lock and server deadline; reject writes once locked. |
| Challenge creation | Two challenges target one answer. | Lock answer/round; unique open-challenge constraint; review phase and challenger guards. |
| Vote / resolution | Duplicate vote or changing quorum. | Unique challenge/voter key, authorized eligibility policy, locked challenge; resolve once. Disconnect policy remains `OPEN`. |
| Score | Retry double-awards points. | Require locked answers and zero open challenges; lock round; apply immutable points once and mark `scored_at` in one transaction. |
| Finish / return lobby | Session and Room diverge. | Lock Room then session; mark finish and set `lobby` atomically; retry returns prior result. |
| Host succession | Two callers choose different successors. | Lock Room and host liveness; choose deterministically from Room members and, in `playing`, the frozen session roster under the confirmed policy. Verify the deployed RPC before implementation. |

## Validation before implementation

The next implementation plan should include controlled-local-DB migration
tests for type backfill, composite FKs, unique active session, repeated Tutti
Frutti sessions per Room, slot retention on `playing → lobby`, and unchanged
Impostor end behavior. It must include unauthorized and cross-game actor
tests, private-answer and vote exposure tests, concurrent retry tests, lost
Realtime/refresh recovery, deadline/lock races, and source-to-live checks of
host succession. This proposal performs none of those operations.
