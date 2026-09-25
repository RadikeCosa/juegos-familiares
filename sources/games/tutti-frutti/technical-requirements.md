# Tutti Frutti — Technical Requirements and Room/Session Integration

## Purpose and authority

This document specifies Tutti Frutti gameplay requirements and records the
current implementation boundary. `CONFIRMED` means a product decision in
`product-decisions.md`; `RECOMMENDED` means a technical design choice to review
before migrations; `OPEN` means an unresolved product or policy question. The
proposed physical representation and alternatives are in
`physical-data-model.md`; the domain flow is in `game-state-model.md`.

The local `main` implements Impostor gameplay, game-aware Room routing, a
Tutti Frutti coordination lobby, shared lobby configuration, session start,
letter skipping, private persistent answer entry, and the authoritative final
countdown and answer lock. Increment 7 snapshots configuration and roster
while starting the first session and its initial
`LETTER_PENDING` candidate. Increment 8 adds the 5-second strict-majority skip
vote and lazy resolution on authorized state reads. Increment 9 adds
participant-private answer reads and writes during `PLAYING`. Increment 10
adds a first-call guard requiring every persisted category answer, a fixed
45-second server deadline, editing before expiry, and an autonomous lock that
enters `REVIEWING` without exposing other players' answers. Increment 11 adds
a roster-only review read of original answers and provisional duplicate groups
after the committed lock. Challenges and scoring remain future increments. The
`rooms` table
persists an immutable game type and active-Room discovery returns it; the
zero-argument create path remains Impostor-only.
`game_sessions.state` and
`session_players` contain Impostor rules. The
source baseline and the distinction between confirmed host-succession policy,
versioned Impostor code, and unverified deploy are recorded in
`sources/project-status.md`. No remote database was inspected for this design.

## Shared coordination requirements

1. A Room must identify exactly one game for its entire lifetime. The server
   must validate the game on create, join, start, routing-related reads, and
   game-specific operations. The UI route is not authority.
2. Preserve one active Room per Player across games. Existing
   `player_active_room_slots` and the active-host index provide the current
   concurrency boundary; `lobby` and `playing` both count as active.
3. Keep Room lifecycle at `lobby | playing | closed`. Game-specific phases
   must never be encoded in `rooms.status`. The Room's active session is a
   playthrough of its own game.
4. A Room in `playing` must have exactly one unfinished session; a Room in
   `lobby` or `closed` must have none. Session start and finish must preserve
   these invariants transactionally. Historical finished sessions remain
   associated with their Room.
5. `CONFIRMED`: finishing a Tutti Frutti session returns the same Room to
   `lobby` and retains RoomParticipants and active-room slots. Closing that
   Room is a separate action. Impostor keeps its current finish-and-close
   transition.
6. A Room can contain several sequential Tutti Frutti sessions, but never two
   unfinished sessions at once. A rematch receives a new session ID, roster,
   and configuration snapshot. No finished gameplay record is reset.
7. The active-room read model returns Room ID, code, game type, status, and
   enough host/current-actor information to route and show coordination. It
   must not become a universal gameplay read model.

## Create, join, and start boundaries

`RECOMMENDED`: evolve creation to accept a validated game intent, while
preserving the zero-argument Impostor path during rollout. An existing active
Room of the same game may be returned for an idempotent retry. An active Room
of the other game must cause an explicit conflict and must not be converted or
silently returned as the requested game. The actor's Player and Group are
derived from `auth.uid()`.

Join must check the normalized code, Group, `lobby`, expected game type, and
the actor's active-room slot under concurrent attempts. A code belonging to a
different Group must remain indistinguishable from an unknown code. The
existing Impostor join contract needs a compatibility path; exact future RPC
signatures remain design recommendations, not commitments.

Starting any game verifies Room membership, game type, host authority,
`lobby`, and absence of an unfinished session. In one transaction it freezes
the eligible roster, creates a session identity, creates game-specific state,
and moves the Room to `playing`. Impostor's existing minimum of three, word
bank, role assignment, and first round remain Impostor rules. Tutti Frutti
requires at least two players and a valid frozen configuration. Failed or
retried starts must not create duplicate sessions or leave a half-started Room.

For Tutti Frutti Increment 7, the Room lock precedes validation of the current
roster and minimum of two participants. One transaction snapshots the
effective lobby configuration and the approved 20-letter pool, freezes the
session roster, creates round 1 in `LETTER_PENDING` with one pending
candidate, and changes the Room to `playing`. The snapshot is independent of
later lobby changes. A start retry in `playing` returns the existing session
only to its recorded starter; it neither changes the roster nor draws a new
candidate. Session-state reads authorize against the frozen session roster,
not the mutable lobby membership.

`RECOMMENDED`: preserve the current no-join-during-`playing` behavior while
adding Tutti Frutti. Allowing late spectators or participants is a separate
product decision, not an implied result of multi-session Rooms.

## Tutti Frutti domain requirements

1. A Room-level draft configuration may be edited in `lobby`; the game start
   copies its round count, ordered categories, custom labels, and playable
   letter pool into an immutable session snapshot. Session data never depends
   on later app defaults or on mutable lobby configuration. The initial
   category catalog, 3–6 active-category limit, custom-name validation, and
   3/5/10 round options are confirmed in `product-decisions.md`.
2. One round number represents one scored letter cycle. Skipping candidate
   letters does not increment that number. Every played, accepted, or skipped
   letter is excluded from future selection across the whole session. Skip
   votes use the frozen session roster and strict majority floor(roster size /
   2) + 1; with two players, both must agree. A disconnected participant
   remains in the denominator, so the deadline may accept a candidate if
   connected players cannot reach the threshold.
3. Increment 8 fixes a 5-second server deadline, one immutable vote per
   participant/candidate, anonymous aggregate tally, and acceptance when the
   deadline expires without majority. A skip is rejected if the remaining
   unused pool would be smaller than the number of configured rounds still to
   play. The authorized state read resolves expired deadlines lazily; client
   polling never decides the outcome.
4. Increment 9 implements answers keyed by session round, frozen session
   participant, and category position. The original non-empty text is
   preserved; empty or whitespace-only input is persisted as empty. Only the
   author can read or write their answers through RPCs. Increment 9 allowed
   writes in `PLAYING`; Increment 10 extends the guard to `FINAL_COUNTDOWN`
   strictly before
   the server deadline; a queued write arriving later is rejected even if the
   scheduled lock has not yet run. Every round keeps its own
   answer history. The session stores immutable normalization version 1:
   NFC, trimmed Unicode whitespace and case-insensitive comparison, while
   preserving accents, punctuation, and internal spaces. Input is limited to
   200 Unicode code points after NFC, counted equally in client and server.
5. The answer-table read and write grants are revoked. The own-answer read RPC
   returns empty values for categories without rows and only the authenticated
   participant's rows. The save RPC derives session, round and participant,
   serializes with round writes, and returns the canonical persisted answer
   and timestamp. Stable SQLSTATEs distinguish invalid input (`P0041`),
   non-editable phase (`P0042`) and invalid category (`P0043`).
6. A participant's answer change updates a separate RLS-filtered Realtime
   signal without answer text. Other tabs reread through the own-answer RPC;
   load, visibility return and network reconnection also trigger a read.
   Unsaved local drafts remain in memory and are marked stale when another
   tab has a newer server value. Autosave waits 500 ms, serializes by category
   in one tab, and a retry uses the current draft. There is no offline queue.
7. The first server-valid Tutti Frutti call starts exactly one irreversible
   deadline. The all-fields-complete eligibility rule is confirmed for
   Increment 10. Only persisted non-empty answers qualify. Later calls cannot
   extend or reset the deadline. All players may edit until the server
   deadline. The initial 45-second duration may be revisited after real play;
   it is server-derived,
   never a client countdown.
8. The round locks once at the deadline or a valid early-close condition.
   A disconnected participant keeps their roster place, previous answers,
   and score. If absent at lock, their latest persisted answers are used.
   Presence alone never erases game participation. Eligibility for early
   close when presence changes remains `OPEN`.
9. Non-empty answers begin review valid. Only a different session participant
   may challenge a non-empty answer. The session roster frozen at start defines
   eligibility regardless of Presence. One challenge may be open per round;
   each answer can be challenged only once. Opening records the challenger's
   `INVALID` vote. For three or more players, the answer author cannot vote and
   invalidation requires more than half of all eligible players; a tie remains
   valid. With two players, only the answer author can explicitly accept
   (`INVALID`) or reject (`VALID`) invalidation. Challenges expire after 30
   seconds; no response is an abstention and leaves the answer valid unless
   invalidity already met its threshold. Majority outcomes resolve early in
   both directions.
10. The current Room host closes review after all challenges resolve. Scoring
   occurs in that same transaction: compare duplicates within one round and
   category using deterministic normalization, recomputing uniqueness from
   final valid answers. The rule is 10/5/0; the first caller receives no speed
   bonus. Persist immutable points on saved answers and `scored_at` on the
   round, constrained to 0/5/10. A retry for the same round returns its saved
   result. Round and game totals are derived in one grouped read joining the
   frozen roster and categories, so absent answers remain visible as zero.
   The round enters `RESULT` atomically with scoring.
11. From the latest scored `RESULT`, only the current Room host may advance
   while configured rounds remain. Lock Room → shared session → Tutti Frutti
   session → latest round; create the consecutive round and a letter not
   selected, accepted, or skipped earlier in the same transaction. The latest
   round is the one with greatest `round_number`. An immediate retry using the
   previous scored round returns its unique unscored successor; older bases
   fail. Roster and categories remain frozen, and result reads include scores
   only through their requested round. On unexpected pool exhaustion, roll
   back and keep the host on `RESULT` with an error. Reuse the roster-filtered
   result invalidation signal; refresh and reconnection rebuild state through
   authorized reads, with periodic recovery while on `RESULT`.
12. When the configured number of rounds has been scored, mark the session
   finished and immutable, detach it as the active session, and return its
   Room from `playing` to `lobby` in one transaction. Retain finished results
   for the frozen session roster. Until Increment 16 defines rematch, reject a
   new start in a Room with a finished Tutti Frutti session.

## Security and privacy requirements

All sensitive writes derive the actor from `auth.uid()` and check Group,
Room membership, Room game type, session identity, session roster, phase,
ownership, and current host where relevant. Client-supplied IDs, roles,
deadlines, vote outcomes, or scores cannot establish authority. Group
membership alone does not grant access to a session's private data.

Before `REVIEWING`, a participant can read only their own answers and the
shared non-secret round state. Other players' answers must not appear in
tables readable through client grants, Realtime payloads, or broad read RPCs.
Increment 9 revokes all direct client privileges on answer rows and uses
own-answer RPCs. Realtime emits only a separately protected invalidation
signal; each recipient rereads through the RPC.
During review, only authorized session participants may read the answer set
needed for social judgment. Challenge votes are private: the review RPC returns
only the caller's vote, the active target and deadline, and a resolved
per-answer outcome. It never returns other ballots, partial counts, or
normalized values. The Realtime review signal is roster-filtered and carries
no vote data; it only prompts an authorized reread. Impostor secret words,
roles, and individual votes remain isolated from Tutti Frutti routes and read
models. New schema surfaces require explicit RLS, grants, RPC checks, and tests
for unauthorized actors, cross-group access, cross-game access, and non-roster
RoomParticipants.

## Presence, host, Realtime, and recovery

Room Presence is an ephemeral visual signal. `last_seen_at` and its heartbeat
are remote evidence of recent activity; neither is session participation.
The local lobby implementation uses a separate `tutti-frutti-room-presence:`
topic. Its backend authorization checks Auth, Room membership, game identity,
and active Room status; the existing Impostor topic remains game-scoped.
Realtime notifies or invalidates Room reads, while a periodic refetch covers
missed events. Future game reads must use authorized game-specific loaders;
private answers are loaded through authorized game-specific reads, not
published before review.

Host ownership remains on Room. **CONFIRMED:** in `lobby`, a liveness-valid
RoomParticipant may succeed a stale host without a session-roster check. In
`playing`, the successor must also belong to the frozen active-session roster.
The server checks staleness and candidate liveness with its clock and selects
deterministically. Presence may prompt a check but does not transfer authority.
The future shared guard must use the minimal shared roster, not
Impostor-specific `session_players` fields. Succession changes only
`rooms.host_player_id`; it does not alter roster, roles, round, letter,
answers, votes, countdown, challenges, review phase, or score, including
during `FINAL_COUNTDOWN`, `REVIEWING`, and `RESULT`. The former host does not
automatically regain authority after reconnect; without an eligible successor
no transfer occurs and host-only actions may wait. The versioned Impostor RPC
uses `session_players` today; its deployed behavior remains unverified as
recorded in `sources/project-status.md`.

Reconnect follows Auth → Player/Group → active Room with game type → that
game's authorized loader. Tutti Frutti's loader reconstructs session, phase,
round, candidate or accepted letter, authoritative deadline, the actor's
answers, visible review/challenge state, and scores. A Room already returned
to `lobby` exposes the actor's latest finished result through a separate
roster-authorized read and stable session URL. Current Room membership controls
only whether the UI can return to that lobby.

## Concurrency and validation expectations

Every transition touching Room/session consistency must lock the Room and
current session in a consistent order. Uniqueness constraints should reject
concurrent starts, candidate reuse, duplicate answers, and duplicate votes.
Answer writes and round locking must serialize so a late write cannot appear
after lock. Challenge resolution and scoring must be guarded so retries do
not apply points twice. The operation matrix and candidate constraints are
specified in `physical-data-model.md`.

Before implementation, validate migrations in controlled local Supabase,
including backfill of existing Impostor Rooms, RLS/grants/RPCs, privacy by
actor, concurrency, refresh/direct-load recovery, missed Realtime events,
host succession, repeated Tutti Frutti sessions in one Room, and unchanged
Impostor completion. Do not apply remote migrations without separate explicit
authorization and destination confirmation.

## Unresolved decisions

`OPEN`: who initiates a rematch, whether it is host-only, configuration
preselection, departure between matches, and post-game lobby UI; challenge
voter eligibility and timeout/abstention on disconnect; early-close
eligibility under changing Presence; semantic normalization such as
plural/singular equivalence or spelling tolerance; review ordering; and the
precise individual-completion interaction. These must be resolved before
implementing the transitions they govern. They do not change the confirmed
Session-finish and Room-return lifecycle.
