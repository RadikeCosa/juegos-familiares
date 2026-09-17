# Tutti Frutti — Technical Requirements and Room/Session Integration

## Purpose and authority

This document is a proposed implementation contract, not an implemented
system. `CONFIRMED` means a product decision in `product-decisions.md`;
`RECOMMENDED` means a technical design choice to review before migrations;
`OPEN` means an unresolved product or policy question. The proposed physical
representation and alternatives are in `physical-data-model.md`; the domain
flow is in `game-state-model.md`.

The current repository implements Impostor gameplay only. Its `rooms` table now
persists an immutable game type and active-Room discovery returns it; the
zero-argument create path remains Impostor-only. Tutti Frutti create/join and
routing are still future increments. `game_sessions.state` and
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

`RECOMMENDED`: preserve the current no-join-during-`playing` behavior while
adding Tutti Frutti. Allowing late spectators or participants is a separate
product decision, not an implied result of multi-session Rooms.

## Tutti Frutti domain requirements

1. A Room-level draft configuration may be edited in `lobby`; the game start
   copies its round count, ordered categories, custom labels, and playable
   letter pool into an immutable session snapshot. Session data never depends
   on later app defaults or on mutable lobby configuration. Exact category
   catalog and limits remain `OPEN`.
2. One round number represents one scored letter cycle. Skipping candidate
   letters does not increment that number. Every played or skipped letter is
   excluded from future selection within that session. A server-chosen
   candidate, skip votes, acceptance, and replacement must be authoritative.
   Skip requires a simple majority; with two players, both must agree.
3. Answers are keyed by session round, session participant, and frozen
   category. The original text is preserved. Only its author may change it,
   and only while the round is `PLAYING` or `FINAL_COUNTDOWN` and not locked.
   Each accepted write is durable so reconnect can recover the latest
   persisted value. Autosave presentation and exact normalization remain
   outside this contract.
4. The first server-valid Tutti Frutti call starts exactly one irreversible
   deadline. The preferred all-fields-complete eligibility rule remains a
   `WORKING HYPOTHESIS` pending gameplay validation. Later calls cannot
   extend or reset the deadline. All players may edit until the shared lock.
   The 45-second duration is a tunable hypothesis; the authoritative deadline
   is server-derived, never a client countdown.
5. The round locks once at the deadline or a valid early-close condition.
   A disconnected participant keeps their roster place, previous answers,
   and score. If absent at lock, their latest persisted answers are used.
   Presence alone never erases game participation. Eligibility for early
   close when presence changes remains `OPEN`.
6. Non-empty answers begin review valid. A challenge targets one answer;
   at most one challenge on that answer may be open. For three or more
   players, the answer author is excluded and invalidity requires a simple
   majority; a tie leaves it valid. With two players, invalidation requires
   mutual agreement. Voter eligibility, timeout, and abstention on disconnect
   remain `OPEN` and block finalizing those transition guards.
7. Scoring occurs only after all challenges are resolved. Duplicate comparison
   is within one round and category, using deterministic normalization.
   Recompute uniqueness from final valid answers. The initial rule is
   10/5/0; the first caller receives no speed bonus. Persist an immutable
   scoring snapshot so later normalization or code changes cannot alter
   historical results. Round and game totals can be derived from it.
8. When the configured number of rounds has been scored, mark the session
   finished and immutable, detach it as the active session, and return its
   Room from `playing` to `lobby` in one transaction. Retain finished results
   for authorized session participants and create a new session for a rematch.

## Security and privacy requirements

All sensitive writes derive the actor from `auth.uid()` and check Group,
Room membership, Room game type, session identity, session roster, phase,
ownership, and current host where relevant. Client-supplied IDs, roles,
deadlines, vote outcomes, or scores cannot establish authority. Group
membership alone does not grant access to a session's private data.

Before `REVIEWING`, a participant can read only their own answers and the
shared non-secret round state. Other players' answers must not appear in
tables readable through client grants, Realtime payloads, or broad read RPCs.
During review, only authorized session participants may read the answer set
needed for social judgment. Challenge votes and their visibility must follow
the final product policy. Impostor secret words, roles, and individual votes
remain isolated from Tutti Frutti routes and read models. New schema surfaces
require explicit RLS, grants, RPC checks, and tests for unauthorized actors,
cross-group access, cross-game access, and non-roster RoomParticipants.

## Presence, host, Realtime, and recovery

Room Presence is an ephemeral visual signal. `last_seen_at` and its heartbeat
are remote evidence of recent activity; neither is session participation.
The existing `impostor-room-presence:` topic and its authorization require a
game-aware adaptation or a separate Tutti Frutti topic without weakening
membership checks. Realtime should notify or invalidate Room and game reads;
private answers are loaded through authorized game-specific reads, not
published before review. Polling or explicit refetch must cover lost events.

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
to `lobby` may still expose the actor's latest finished result through a
separate authorized session-history read; the exact post-game presentation is
`OPEN`.

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
eligibility under changing Presence; exact category and letter catalog and
limits; normalization beyond trim/case; review ordering; and the precise
individual-completion interaction. These must be resolved before implementing
the transitions they govern. They do not change the confirmed Session-finish
and Room-return lifecycle.
