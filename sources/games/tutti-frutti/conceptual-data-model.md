# Tutti Frutti — Conceptual Data Model

## 1. Purpose

This document defines the conceptual data model required to support Tutti Frutti within Juegos Familia.

Its goals are to identify:

* which concepts belong to the shared platform;
* which concepts belong specifically to Tutti Frutti;
* how game configuration, rounds, answers, challenges, votes, and scores relate;
* which existing Impostor-era abstractions may be reusable;
* where premature generalization should be avoided.

This is a conceptual model.

It does not yet define:

* SQL tables;
* column names;
* indexes;
* foreign keys;
* Supabase RPC signatures;
* RLS policies;
* migrations.

Those belong to later technical design.

---

# 2. Design Principle

Tutti Frutti is the second implemented game in Juegos Familia.

This creates an important architectural opportunity:

> shared platform concepts should now be validated against a second real game instead of inferred from Impostor alone.

The conceptual model should therefore distinguish between:

```text
Platform domain
```

and:

```text
Tutti Frutti domain
```

without assuming that all existing Impostor structures are already correctly generalized.

---

# 3. High-Level Domain Boundaries

Conceptually:

```text
Platform
│
├── Group
├── Player
├── Room
├── Room Membership / Participation
├── Presence / Liveness
├── Host Ownership
└── Game Session
        │
        ├── Impostor domain
        │
        └── Tutti Frutti domain
```

The platform owns multiplayer coordination.

The game domain owns gameplay rules.

---

# 4. Shared Platform Concepts

The following concepts appear likely to be shared across Impostor and Tutti Frutti.

They should still be verified against the existing implementation before being declared fully generic.

---

# 5. Group

A Group represents the persistent social grouping already used by Juegos Familia.

Conceptually:

```text
Group
 ├── Players
 └── Rooms
```

Tutti Frutti does not currently introduce new Group behavior.

The existing group model should preferably remain unchanged.

---

# 6. Player

A Player represents a participant identity within the platform/group context.

Tutti Frutti relies on the existing player identity for:

* room membership;
* host ownership;
* round participation;
* answer ownership;
* challenge authorship;
* voting;
* scoring.

No Tutti-Frutti-specific player entity should be introduced unless implementation analysis proves it necessary.

---

# 7. Room

A Room represents the multiplayer space in which a specific game is played.

Product behavior establishes:

> players choose Tutti Frutti before creating or joining its room.

Therefore a room conceptually knows which game it belongs to.

Possible conceptual relationship:

```text
Room
 ├── game type
 ├── host
 ├── participants
 └── lifecycle status
```

The exact implementation may use a shared `rooms` entity if it can correctly express both Impostor and Tutti Frutti.

The conceptual model does not require separate physical tables per game.

---

# 8. Room Game Type

A room should conceptually identify its game.

Example:

```text
game_type =
  impostor
  tutti_frutti
```

This is preferable to inferring game type indirectly from attached session data.

The exact representation remains a technical decision.

---

# 9. Room Lifecycle

Existing concepts such as:

```text
lobby
playing
closed
```

appear likely to remain shared.

However, Tutti Frutti should not force its internal round state into the room lifecycle.

For example:

```text
Room.status = playing
```

may contain a Tutti Frutti session currently in:

```text
FINAL_COUNTDOWN
```

or:

```text
REVIEWING
```

Those are game-domain states, not room states.

`CONFIRMED` for Tutti Frutti: after final scoring, its Session becomes
`FINISHED` and immutable while the same Room returns from `playing` to
`lobby`. A later match in that Room uses a new Session. Closing the Room is a
separate action. Impostor retains its existing finish-and-close behavior.

---

# 10. Room Participant

The platform already needs to know who belongs to the room.

Conceptually:

```text
RoomParticipant
 ├── player
 ├── room
 ├── joined state
 ├── presence
 └── host relationship where relevant
```

Tutti Frutti should not duplicate this as a game-specific membership system.

---

# 11. Presence

Presence represents current connectivity or liveness.

Important distinction:

```text
Presence != Participation
```

A player may be temporarily disconnected but remain a participant in:

* the current game;
* the current round;
* scoring;
* previously submitted answers.

Presence should therefore remain a shared infrastructure concern.

---

# 12. Host Ownership

Host succession is also expected to remain a platform concern.

The host controls lifecycle actions such as:

* configuring the game before start;
* starting the game;
* advancing where host action is required.

The host is not the authoritative semantic referee for Tutti Frutti answers.

---

# 13. Game Session

A Game Session represents one concrete playthrough of a game within a room.

Conceptually:

```text
Room
  ↓
GameSession
```

Examples:

```text
Impostor Session
Tutti Frutti Session
```

Each Tutti Frutti match in a Room has a distinct session identity. Finishing
one does not close the Room or reuse its session identity for the next match.

---

# 14. Shared Game Session Identity

A shared platform-level Game Session may reasonably contain:

* session identity;
* room identity;
* game type;
* lifecycle state;
* start time;
* finish time.

Game-specific configuration and runtime state should remain outside the generic session unless proven shared.

---

# 15. Tutti Frutti Domain Overview

The game-specific conceptual model can be represented as:

```text
TuttiFruttiSession
│
├── GameConfiguration
│     └── Categories
│
├── SessionParticipants
│
├── LetterPool
│
├── Rounds
│     ├── RoundParticipants
│     ├── Answers
│     ├── Challenges
│     │     └── Votes
│     └── RoundScores
│
└── FinalScores
```

Not every concept necessarily requires its own persistence entity.

This model describes responsibilities and relationships.

---

# 16. Tutti Frutti Session

A TuttiFruttiSession represents the game-specific state attached to the shared game session.

Conceptually it owns:

* frozen game configuration;
* configured round count;
* current round;
* letter usage;
* game-specific status;
* cumulative scoring.

Relationship:

```text
GameSession
   1
   │
   1
TuttiFruttiSession
```

A shared Game Session should not need to understand Tutti Frutti categories, letters, answers, or challenges.

---

# 17. Game Configuration

Configuration exists before gameplay begins and becomes immutable when the session starts.

Conceptually:

```text
GameConfiguration
 ├── round_count
 └── categories
```

Potential future configuration fields may include timer values or scoring rules, but these should not be generalized prematurely.

---

# 18. Configuration Snapshot

A critical design principle is:

> the running game should preserve the configuration with which it started.

Therefore configuration should behave as a session snapshot.

If platform-level preset categories change later, an existing session must not silently change.

---

# 19. Category

A Category represents one answer dimension in the game.

Examples:

```text
Name
Animal
Food
Place
Object
```

and custom values such as:

```text
Something found in a kitchen
```

Conceptually:

```text
Category
 ├── id
 ├── label
 ├── type
 └── order
```

Possible category type:

```text
PRESET
CUSTOM
```

The application should not need semantic knowledge of the label.

---

# 20. Session-Local Categories

Categories belong to the specific Tutti Frutti session configuration.

This is especially important for custom categories.

Conceptually:

```text
TuttiFruttiSession
   1
   │
   *
Category
```

Custom categories are not initially reusable platform objects.

---

# 21. Category Order

Category display order should be stable throughout the game.

Therefore order is part of session configuration.

Example:

```text
1 Name
2 Animal
3 Food
4 Place
5 Object
```

All players should receive categories in the same order.

---

# 22. Session Participant

Although room membership is shared infrastructure, the game may require a session-level participant snapshot.

Conceptually:

```text
TuttiFruttiSessionParticipant
 ├── player
 ├── participation status
 └── cumulative score
```

This should not automatically duplicate every room-player property.

Its purpose is to capture who participates in this specific game session.

---

# 23. Why Session Participation Matters

Room membership and session participation may diverge.

For example:

* a player joins the room before the next match;
* a player disconnects temporarily;
* a player was present in a previous session but not the new one.

Therefore the conceptual relationship is:

```text
Room participants
      ↓
Game starts
      ↓
Session participant set
```

The exact snapshot semantics need technical validation against current room behavior.

---

# 24. Letter Pool

A Tutti Frutti session uses a finite letter pool.

Conceptually:

```text
LetterPool
 ├── available
 ├── candidate
 ├── played
 └── skipped
```

This does not necessarily require a dedicated entity per letter.

The important domain invariant is that each letter belongs to one state within the session.

---

# 25. Letter

A Letter represents a playable round letter.

The default pool may come from application configuration.

The session must preserve enough state to ensure that:

* played letters are not reused;
* skipped letters are not reused.

---

# 26. Round

A Round represents one scored letter cycle.

Conceptually:

```text
Round
 ├── number
 ├── letter
 ├── state
 ├── countdown metadata
 ├── participants
 ├── answers
 ├── challenges
 └── scores
```

Relationship:

```text
TuttiFruttiSession
   1
   │
   *
Round
```

---

# 27. Candidate Letter vs Round

A skipped candidate letter should not necessarily create a completed Round.

Conceptually:

```text
candidate letter
    ↓
accepted
    ↓
Round
```

or:

```text
candidate letter
    ↓
skipped
    ↓
new candidate
```

This avoids polluting the round history with non-played rounds.

Implementation may persist candidate state elsewhere if necessary.

---

# 28. Round State

The Round owns the Tutti Frutti gameplay phase.

Conceptual states:

```text
PREPARING
LETTER_PENDING
PLAYING
FINAL_COUNTDOWN
LOCKED
REVIEWING
SCORING
RESULT
```

These states should not be encoded as room lifecycle states.

---

# 29. Countdown Metadata

Once the first player calls Tutti Frutti, the round requires authoritative timing data.

Conceptually:

```text
Round
 ├── countdown_started_at
 ├── countdown_ends_at
 └── triggered_by_player
```

The client derives remaining visual time from the authoritative deadline.

---

# 30. Round Participant

The session participant set may be reflected into each round when necessary.

Conceptually:

```text
RoundParticipant
 ├── round
 ├── player
 ├── completion state
 └── participation status
```

The exact need for a separate round-participant record depends on implementation.

It may instead be derivable from session participation plus round-specific events.

---

# 31. Completion State

Completion is separate from presence.

Conceptually:

```text
completion =
  answering
  finished
```

A player may be:

```text
finished + connected
```

or:

```text
answering + disconnected
```

Calling Tutti Frutti marks completion but does not lock answers.

---

# 32. Answer

An Answer belongs to:

* one round;
* one player;
* one category.

Conceptually:

```text
Answer
 ├── round
 ├── player
 ├── category
 ├── original_text
 ├── normalized_value
 └── validation_state
```

Uniqueness invariant:

```text
one answer
per round
per player
per category
```

---

# 33. Answer Persistence

Answers should be persisted during active gameplay rather than existing only in local client memory.

This supports:

* reconnect;
* refresh;
* device interruption;
* authoritative locking.

The exact write strategy remains a technical decision.

Possible approaches include:

* save on change with debounce;
* explicit field commit;
* batch autosave.

---

# 34. Original vs Normalized Answer

The model distinguishes:

```text
original_text
```

from:

```text
normalized_value
```

The original value is shown to players.

The normalized value is used for objective comparison.

This separation avoids altering player-visible input merely to support duplicate detection.

---

# 35. Answer Validation State

Conceptual states:

```text
VALID
CHALLENGED
INVALID
```

An empty answer may either use a separate state or be represented by absence/empty value.

The exact persistence representation remains open.

---

# 36. Duplicate Group

Duplicate status is derived from final valid normalized answers within the same:

```text
round + category
```

A dedicated persistent Duplicate entity is probably unnecessary.

Conceptually:

```text
duplicate_group = derived
```

This is an important distinction:

> duplicatedness is a property calculated from answers, not necessarily a first-class domain object.

---

# 37. Challenge

A Challenge represents a dispute about one answer.

Relationship:

```text
Answer
  1
  │
  0..1 open challenge
```

Conceptually:

```text
Challenge
 ├── answer
 ├── created_by
 ├── status
 └── resolution
```

Possible states:

```text
OPEN
RESOLVED_VALID
RESOLVED_INVALID
```

---

# 38. One Open Challenge Per Answer

The preferred invariant is:

> an answer can have at most one unresolved challenge.

If several players disagree with the same answer, they participate in the same dispute rather than opening duplicate disputes.

---

# 39. Challenge Vote

For sessions with three or more players, a Challenge may contain votes.

Conceptually:

```text
ChallengeVote
 ├── challenge
 ├── player
 └── decision
```

Decision:

```text
VALID
INVALID
```

Uniqueness invariant:

```text
one vote per player per challenge
```

---

# 40. Answer Author Cannot Vote

For multi-player challenge voting:

```text
vote.player != answer.player
```

The answer author's opinion is implicit in having submitted the answer.

This rule prevents the author from directly voting to preserve their own disputed entry.

---

# 41. Two-Player Challenge Resolution

Two-player sessions use different semantics.

A normal majority vote should not be applied because it would give one opponent unilateral invalidation power.

Conceptually:

```text
challenge
  ↓
mutual agreement
  ├── agreed invalid → INVALID
  └── no agreement → VALID
```

The exact data representation for this agreement remains open.

It does not necessarily require the same voting structure as 3+ player games.

---

# 42. Round Score

After review completes, the system calculates a score for each participant.

Conceptually:

```text
RoundScore
 ├── round
 ├── player
 └── points
```

This score should be treated as authoritative output from final validated answers.

---

# 43. Answer-Level Score Derivation

Each answer contributes:

```text
valid + unique     → 10
valid + duplicated → 5
invalid            → 0
empty              → 0
```

The final RoundScore is:

```text
sum(answer points)
```

for that player.

---

# 44. Scoring Must Follow Validation

Conceptual dependency:

```text
Answers locked
   ↓
Review
   ↓
Challenges resolved
   ↓
Final valid answer set
   ↓
Duplicate calculation
   ↓
Score calculation
```

This order must not be inverted.

---

# 45. Cumulative Score

The game needs a cumulative total.

This may conceptually be represented as either:

```text
sum(RoundScores)
```

or stored as:

```text
SessionParticipant.total_score
```

The preferred source of truth should be decided during technical design.

Derived totals reduce duplication.

Persisted totals may simplify some queries but introduce synchronization requirements.

---

# 46. Final Ranking

Final ranking is derived from cumulative player scores after the final round.

Conceptually:

```text
Session
  ↓
RoundScores
  ↓
Cumulative totals
  ↓
Ranking
```

A separate persistent Ranking entity is probably unnecessary.

---

# 47. Final Score Tie

The model should support multiple players with the same final score.

Therefore:

```text
winner
```

should not necessarily assume a single player.

Conceptually:

```text
winner set
```

or ranking with tied positions.

---

# 48. Reconnect Data Requirements

To support reconnect, authoritative persisted state must allow reconstructing:

* session identity;
* room identity;
* current round;
* current round phase;
* selected letter;
* categories;
* countdown deadline;
* player's current answers;
* completion state;
* open challenges;
* resolved votes where relevant;
* current score.

The client should not require hidden local state to reconstruct the active game.

---

# 49. Presence Is Not Stored in Answers

Answer ownership and existence must not depend on current presence.

For example:

```text
player disconnected
```

must not imply:

```text
delete player's answers
```

or:

```text
remove player's round participation
```

Presence belongs to platform infrastructure.

Gameplay persistence belongs to the game domain.

---

# 50. Host Change Does Not Change Session Ownership

Host succession should update platform host authority.

It should not change:

* ownership of existing answers;
* session identity;
* round identity;
* challenge history;
* score.

The host is a lifecycle role, not the owner of game data.

---

# 51. Proposed Conceptual Relationship Map

```text
Group
  │
  ├── Player
  │
  └── Room
        │
        ├── RoomParticipant
        │
        └── GameSession
              │
              └── TuttiFruttiSession
                    │
                    ├── SessionParticipant
                    │
                    ├── Category
                    │
                    ├── LetterPool
                    │
                    └── Round
                          │
                          ├── RoundParticipant
                          │
                          ├── Answer
                          │     │
                          │     └── Challenge
                          │             │
                          │             └── ChallengeVote
                          │
                          └── RoundScore
```

This diagram represents conceptual ownership, not required table structure.

---

# 52. Likely Shared vs Game-Specific Boundary

## Likely Shared

```text
Group
Player
Room
Room participant
Room lifecycle
Presence / liveness
Host succession
Game session identity
Game type
Reconnect entry point
```

## Tutti-Frutti-Specific

```text
categories
letter pool
round lifecycle
answers
completion
Tutti Frutti countdown
answer normalization
duplicate detection
challenges
challenge votes
round scoring
final ranking rules
```

---

# 53. Concepts That Should Not Be Generalized Yet

The following should remain game-specific until another game demonstrates the same need:

* round;
* category;
* answer;
* challenge;
* challenge vote;
* score rule;
* countdown behavior;
* letter pool.

Some future games may also have rounds or scores, but similar names do not automatically imply equivalent domain behavior.

---

# 54. Existing Impostor Model Audit Findings

The read-only repository audit found:

* `rooms` has no explicit game type; its `lobby`, `playing`, and `closed` states
  are plausible shared coordination states, while creation and navigation
  currently assume Impostor;
* `get_my_active_room()` returns a single active room and its participants but
  no game identity;
* the current `game_sessions.state` contains Impostor phases and one session is
  allowed per room; `session_players` contains Impostor scoring data;
* Presence and liveness are room-scoped but the Presence topic and client
  adapter are named for Impostor;
* reconnect routing and private state loading assume Impostor;
* host succession during `playing` has documentation/code drift recorded in
  `sources/project-status.md` and must not be treated as verified platform
  behavior.

These findings describe source code and migrations, not a verified remote DB.

---

# 55. Architectural Consequence

Room coordination needs an explicit game identity and game-aware discovery.
The current `game_sessions` and `session_players` must not be reused as-is for
Tutti Frutti. A minimal shared session identity is a design candidate, while
each game's phases, rounds, participants' game data, and scoring remain in its
own domain. The physical representation is not decided here.

---

# 56. Avoiding a Universal Game Schema

The project should avoid a generic structure such as:

```text
game_data JSON
```

containing arbitrary game state solely to avoid modeling each game.

Likewise, it should avoid trying to make every game fit a universal:

```text
round
action
vote
score
```

schema before those concepts have proven equivalent.

Game domains may share infrastructure without sharing all persistence.

---

# 57. Transaction Boundaries

The following operations are likely to require authoritative transactional behavior:

* starting a game;
* selecting or skipping a letter;
* starting the countdown;
* locking answers;
* opening a challenge;
* recording a challenge vote;
* resolving a challenge;
* scoring a round;
* advancing to the next round;
* finishing the game.

Exact RPC or database transaction design belongs to technical requirements.

---

# 58. Concurrency-Sensitive Concepts

Tutti Frutti introduces several concurrency-sensitive operations:

## First Tutti Frutti Call

Several players may press nearly simultaneously.

Only one authoritative countdown should begin.

## Letter Skip

Multiple skip votes may cross the threshold concurrently.

Only one replacement letter should be selected.

## Challenge Vote

Several votes may complete a challenge at nearly the same time.

Resolution must occur once.

## Round Scoring

Scoring must not execute twice and duplicate cumulative totals.

These concerns reinforce the need for server-authoritative transitions.

---

# 59. Derived Data

The model should prefer deriving values where practical.

Likely derived data includes:

* duplicate groups;
* round score from answer states;
* cumulative score from round scores;
* ranking;
* winner set;
* remaining letters.

Persisting derived data may still be justified for performance or authoritative snapshots, but should be explicit.

---

# 60. Data That Must Be Durable

The following should survive refresh/reconnect:

* session configuration;
* participant set;
* selected/used/skipped letters;
* current round;
* answers;
* countdown deadline;
* challenges;
* challenge votes;
* resolved validation state;
* scored rounds.

Purely visual client state does not need persistence.

---

# 61. Data Visibility

During `PLAYING` and `FINAL_COUNTDOWN`:

> players must not see other players' answers.

During `REVIEWING`:

> locked answers become visible to all relevant participants.

This implies that data access rules may need to depend on round state.

The exact enforcement mechanism belongs to security and technical requirements.

---

# 62. Answer Ownership

During answer-entry states:

```text
player may mutate only their own answers
```

After lock:

```text
no player may mutate any answer
```

Review decisions must operate through challenge mechanics rather than direct answer editing.

---

# 63. Challenge Ownership

A player may create a challenge against another player's eligible answer.

The answer author should not be able to erase the challenge.

Challenge resolution occurs through game rules.

---

# 64. Score Immutability

Once a round reaches `RESULT`, its score should be immutable under normal gameplay.

Reopening a finished round is outside the MVP.

This keeps cumulative scoring deterministic.

---

# 65. Session Immutability After Finish

Once the Tutti Frutti session reaches `FINISHED`:

* configuration remains immutable;
* rounds remain immutable;
* answers remain immutable;
* scores remain immutable.

A rematch should create a new session rather than reset history in place.
The same Room returns to `lobby` after the finished session's final scoring;
Room closure is a separate operation.

---

# 66. Open Conceptual Questions

The following still require design:

## Shared architecture

* how a minimal shared session identity coexists with the current Impostor tables;
* how the confirmed `playing → lobby` transition is enforced atomically for
  Tutti Frutti while Impostor retains `playing → closed`;
* how a shared roster identity avoids Impostor-specific `session_players` data.

## Categories

* whether preset category definitions live in code or persistent data;
* whether a session stores full category labels or references plus snapshots.

## Letter candidates

* whether skip votes require a persisted candidate-letter entity or can remain session runtime state.

## Completion

* whether player completion needs its own stored field or can be derived.

## Two-player challenges

* exact persistence mechanism for mutual agreement.

## Scoring

* derived versus persisted cumulative totals.

## Reconnect

* how active game discovery selects the correct game-specific state loader.

---

# 67. Recommended Next Step

The next step should not yet be schema implementation.

The repository audit, Room/Session boundary design, and post-game lifecycle
decision are complete. `technical-requirements.md` and
`physical-data-model.md` propose the next technical contract. An incremental
implementation plan should precede any physical schema change; this
conceptual document does not prescribe migrations.

---

# 68. Current Conceptual Conclusion

The preferred architecture is:

> shared multiplayer infrastructure + explicit game-specific domain models.

Tutti Frutti should reuse the platform's identity, room, presence, host, and session coordination capabilities where they genuinely fit.

Its gameplay concepts — categories, letters, rounds, answers, challenges, votes, and scoring — should remain explicit Tutti Frutti domain concepts rather than being forced into abstractions derived from Impostor.
