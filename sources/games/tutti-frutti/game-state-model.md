# Tutti Frutti — Game State Model

## 1. Purpose

This document defines the conceptual state model for Tutti Frutti.

It describes:

* game-level states;
* round-level states;
* legal transitions;
* transition triggers;
* player completion state;
* answer state;
* challenge state;
* invariants;
* recovery expectations.

These are domain states.

They do not imply a specific database schema, enum layout, RPC structure, or client implementation.

---

# 2. State Authority

The multiplayer game should use authoritative shared state.

Clients may optimistically update local input where appropriate, but transitions such as:

* round start;
* letter skip;
* countdown start;
* answer lock;
* review start;
* challenge resolution;
* scoring;
* game completion;

must be determined by authoritative server-side state.

Clients must not independently infer or advance the canonical game phase.

---

# 3. Game-Level Lifecycle

Conceptual flow across Room setup and one Session:

```text
ROOM: LOBBY (no active Session)
  ↓
SESSION: IN_PROGRESS / ROOM: PLAYING
  ↓
SESSION: FINISHED / ROOM: LOBBY
```

`LOBBY` belongs to Room coordination and configuration before a Session
starts, and again after a Tutti Frutti Session finishes. `FINISHED` belongs to
that Session and never changes back to `IN_PROGRESS` for a rematch.

Optional terminal state:

```text
CANCELLED
```

if the platform lifecycle requires it; this remains `OPEN`.

## LOBBY (Room)

The game session has not started.

Allowed operations include:

* join;
* leave;
* configure categories;
* configure number of rounds;
* start game.

## IN_PROGRESS (Session)

At least one round has started.

Game configuration is frozen.

The game contains an active or completed round.

## FINISHED (Session)

All configured rounds have been scored.

Final ranking is available.

No additional round may start within the same completed session.

---

# 4. Round Lifecycle

Proposed conceptual round states:

```text
PREPARING
  ↓
LETTER_PENDING
  ↓
PLAYING
  ↓
FINAL_COUNTDOWN
  ↓
LOCKED
  ↓
REVIEWING
  ↓
SCORING
  ↓
RESULT
```

Alternative path:

```text
LETTER_PENDING
  ↓
LETTER_SKIPPED
  ↓
LETTER_PENDING
```

A skipped letter does not create a completed round.

---

# 5. PREPARING

Purpose:

* initialize the next round;
* determine round number;
* establish eligible players;
* establish remaining letter pool;
* prepare category references.

Entry conditions:

* game is `IN_PROGRESS`;
* no unresolved prior round exists;
* configured round count has not been reached.

Exit:

```text
PREPARING
  ↓
LETTER_PENDING
```

---

# 6. LETTER_PENDING

Increment 7 initializes the first round in this state with one server-selected
pending candidate and a frozen session roster. Increment 8 adds a 5-second
server deadline and a fixed vote per roster member. Any authorized game-state
read resolves an expired candidate, so recovery does not depend on a separate
timer RPC. The client countdown and 1-second polling are for presentation and
aggregate tally refresh only; the server decides the result.

A candidate letter has been selected but answer entry has not started.

State contains conceptually:

* selected letter;
* current round number;
* frozen session-player roster;
* aggregate skip-vote count and threshold (individual voter identities are not returned);
* the 5-second server deadline for the current candidate.

Allowed actions:

* vote/request skip;
* accept the letter and enter PLAYING when the deadline expires without a strict majority.

Not allowed:

* submit playable answers;
* call Tutti Frutti;
* challenge answers.

---

# 7. LETTER SKIP

If skip threshold is reached:

```text
LETTER_PENDING
  ↓
discard selected letter
  ↓
select new unused letter
  ↓
LETTER_PENDING
```

The skipped letter becomes unavailable for the rest of the game.

`CONFIRMED`: skipping requires floor(frozen roster size / 2) + 1 votes;
with exactly two players, both must agree. Disconnection and Room departure do
not change the denominator; if connected members cannot reach it, timeout
accepts the current candidate.

Invariants:

* skipped letter does not increment round number;
* skipped letter is never reused anywhere in the session;
* each replacement starts with zero votes;
* no answers are persisted for a skipped candidate letter;
* a skip is blocked if it would leave fewer unused session letters than
  configured rounds remaining.

---

# 8. PLAYING

The letter has been accepted and answer entry is active.

Each active player may:

* enter answers;
* edit their answers;
* submit their latest values;
* call Tutti Frutti if eligible.

Other players' answers remain hidden.

The round remains `PLAYING` until the first valid Tutti Frutti action.

Increment 9 persists an answer for each `(round, participant, category
position)` and keeps prior rounds' rows as history. An unanswered category
reads as an empty value; saving empty text or only surrounding whitespace
persists an empty row. Each participant reads only their own answers. The
server permits edits only while the active round phase is `PLAYING`. The
client autosaves after 500 ms and reloads the authorized state on entry,
reconnection, or answer invalidation. Other tabs' unsaved drafts are retained
and marked stale until the player saves or reloads the server value. No
countdown, lock, review, or score transition is implemented by this increment.

Increment 10 subsequently adds the first-call transition to
`FINAL_COUNTDOWN`, allows writes strictly before the 45-second server
deadline, and advances autonomously to a locked `REVIEWING` phase. It does
not yet expose another participant's answers; the review read is Increment 11.

Increment 11 adds a read-only, frozen-roster review snapshot after the committed
lock. It exposes original answers and provisional duplicate groups, including
empty answers, without changing validation or score state.

---

# 9. Player Completion State

Completion and presence are separate dimensions. A participating player may
conceptually have:

```text
completion = ANSWERING or FINISHED
presence = CONNECTED or DISCONNECTED
```

For example, a player may be:

```text
completion = ANSWERING
presence = DISCONNECTED
```

Completion and presence should remain separate concepts.

This prevents presence recovery logic from corrupting game progress.

---

# 10. Tutti Frutti Eligibility

`WORKING HYPOTHESIS` (preferred product rule, pending gameplay validation):

```text
player may call Tutti Frutti
IFF
all active category answers are non-empty
```

If adopted for implementation, the server must validate this condition.

The client disabling the button is not sufficient enforcement.

---

# 11. First Tutti Frutti Transition

When the first eligible player calls Tutti Frutti:

```text
PLAYING
  ↓
FINAL_COUNTDOWN
```

The transition records conceptually:

* calling player;
* countdown start time;
* countdown deadline.

Example:

```text
countdown_started_at
countdown_ends_at
called_by_player_id
```

Exact representation is implementation-specific.

---

# 12. FINAL_COUNTDOWN

The countdown has started.

Initial duration confirmed for Increment 10:

```text
45 seconds
```

During this state:

* all players, including the first caller, may continue editing answers (`CONFIRMED`);
* players may mark themselves finished;
* the original countdown deadline cannot be cancelled or changed (`CONFIRMED`);
* subsequent Tutti Frutti actions do not reset or extend the timer (`CONFIRMED`).

Possible exits:

```text
FINAL_COUNTDOWN
  ↓
deadline reached
  ↓
LOCKED
```

or:

```text
FINAL_COUNTDOWN
  ↓
all eligible active players finished
  ↓
LOCKED
```

---

# 13. Countdown Authority

The countdown must be derived from an authoritative timestamp.

Clients should calculate visual remaining time from:

```text
countdown_ends_at
```

rather than each client maintaining an independent canonical timer.

This avoids divergence when:

* a client reconnects;
* a tab sleeps;
* device clocks vary;
* network latency occurs.

---

# 14. LOCKED

The round has stopped accepting answer changes.

Invariant:

> no answer mutation is legal after the round becomes locked.

The system finalizes the submitted answer snapshot.

Empty values remain empty.

After the answer snapshot is stable:

```text
LOCKED
  ↓
REVIEWING
```

`LOCKED` may be a short-lived transition state rather than a user-visible screen.

---

# 15. Answer State

Each answer conceptually contains:

```text
text
normalized_value
is_empty
duplicate_group
validation_status
```

Possible validation states:

```text
VALID
CHALLENGED
INVALID
```

Initially:

```text
non-empty → VALID
empty → no valid answer / zero-score state
```

A non-empty answer remains valid unless challenged and invalidated.

In the Increment 9 implementation, each answer also stores the original
display text, a normalized comparison value, and the server update timestamp.
The session pins normalization version 1: normalize to NFC, trim external
Unicode whitespace, and lowercase for comparison while preserving accents,
punctuation, and internal spaces. The original text is shown to its owner;
input is limited to 200 Unicode code points after NFC. A value that becomes
empty after trimming is stored as an empty string. Final validity, challenge
state, and points remain for later increments.

---

# 16. Normalization

Normalization is used for comparison, not display.

The original input must remain preserved.

Implemented normalization version 1 for comparison:

```text
original text
  ↓
NFC
  ↓
trim external Unicode whitespace
  ↓
lowercase, preserving accents/punctuation/internal whitespace
```

Plural/singular equivalence and spelling tolerance remain open.

Normalization must be deterministic and identical for all players.

---

# 17. Duplicate Detection

Duplicate detection occurs within:

```text
same round
+
same category
```

Example:

```text
"Mono"
"mono"
" Mono "
```

may belong to the same duplicate group after normalization.

A duplicate group affects scoring only if the corresponding answers remain valid.

An invalidated answer should no longer contribute as a valid duplicate.

This implies final scoring should occur after challenge resolution.

---

# 18. REVIEWING

During review:

* answers are visible;
* duplicate status may be shown;
* players may challenge eligible answers;
* at most one dispute may be open at a time; each answer may be challenged once;
* an open dispute resolves by vote, agreement, or its server deadline.

Answers cannot be edited.

Resolving a challenge updates that answer's validity but does not score or
advance the round. Scoring and round advancement are later transitions.

---

# 19. Challenge State Model

A challenge may conceptually have:

```text
OPEN
RESOLVED_VALID
RESOLVED_INVALID
```

Flow:

```text
answer VALID
  ↓ challenge created
answer CHALLENGED

challenge OPEN
  ↓ vote resolution
  ├─ RESOLVED_VALID
  │      ↓
  │   answer VALID
  │
  └─ RESOLVED_INVALID
         ↓
      answer INVALID
```

A resolved challenge must not remain open.

---

# 20. Challenge Eligibility

Only a non-empty answer can be challenged, and the challenger must be a
different participant from its author. The frozen session roster determines
participation; disconnection and Presence do not change it. Each answer can be
challenged once and only one challenge may be open in a round. Duplicate
answers remain separately challengeable.

---

# 21. Challenge Voting

For sessions with three or more players, eligible voters are:

```text
eligible players
minus
answer author
```

Votes:

```text
VALID
INVALID
```

Resolution:

```text
INVALID votes > half of all eligible players
    → RESOLVED_INVALID

otherwise, once all votes are in or invalidity is impossible
    → RESOLVED_VALID
```

The challenger's `INVALID` vote is recorded when opening. Exactly half is a tie
and leaves the answer valid. The author cannot vote in this branch. For two
players, no majority is calculated: the challenger has already recorded
`INVALID`, and only the answer author may explicitly record `INVALID`
(agreement) or `VALID` (rejection). The decision resolves immediately.

Every challenge has a 30-second server deadline. A missing vote is an
abstention; timeout resolves an undecided challenge as valid. A late vote is
rejected. Roster membership, not connection state, controls eligibility.

---

# 22. Two-Player State Problem

Two-player games expose a structural challenge.

If:

```text
players = 2
```

then:

```text
eligible voters for an opponent's answer = 1
```

The multi-player rule would allow a single opponent to invalidate the answer,
so it does not apply. Both players must agree to invalidate a disputed answer;
otherwise it stays valid. The same vote table records the challenger's
automatic `INVALID` and the author's explicit decision, using a separate
resolution branch.

---

# 23. Review Completion Invariant

The round may leave `REVIEWING` only if:

```text
open_challenges == 0
```

and all answer validation states are final.

The current Room host explicitly closes review. The server rejects the close
while an open challenge remains, then scores and marks the round `RESULT` in
one transaction. A repeated request for that round returns its stored result.

Then:

```text
REVIEWING
  ↓
SCORING
```

---

# 24. SCORING

Scoring is calculated from immutable locked answers and final validation state.

Initial scoring rules:

```text
empty              → 0
invalid            → 0
valid + unique     → 10
valid + duplicated → 5
```

The scoring calculation must be authoritative and deterministic.

Clients should display the result rather than independently calculate canonical scores.

---

# 25. Duplicate Recalculation After Invalidity

Consider:

```text
Camila → Mono
Pedro  → Mono
Ramiro → Mamut
```

If both `Mono` answers remain valid:

```text
Camila = 5
Pedro  = 5
```

If Pedro's `Mono` becomes invalid:

```text
Camila's Mono becomes unique
```

Therefore Camila should receive:

```text
10
```

not `5`.

This produces an important invariant:

> uniqueness must be determined from final valid answers, not from the original locked answer set.

---

# 26. RESULT

Once scoring is complete:

```text
SCORING
  ↓
RESULT
```

Round result contains:

* per-player round score;
* cumulative game score;
* current ranking.

No further answer or challenge mutation is allowed.

---

# 27. Next Round Transition

If:

```text
completed_rounds < configured_rounds
```

then:

```text
RESULT
  ↓
PREPARING
```

Otherwise:

```text
RESULT
  ↓
GAME FINISHED
```

---

# 28. Game Completion

When the configured number of rounds has been scored:

```text
game.state = FINISHED
```

Final state includes:

* total player scores;
* ranking;
* winner or tied winners.

No new round may be added to the same completed game session.

`CONFIRMED`: session completion and Room lifecycle are distinct. After final
scoring, the Tutti Frutti session becomes `FINISHED` and immutable, and its
Room returns from `playing` to `lobby` as one authoritative, consistent
transition. The Room remains available to its participants; it is not closed
by session completion.

A rematch in the same Room creates a new session, with a new roster and
configuration snapshot. It does not reset the finished session or its rounds.
Closing the Room is a separate action. Who may initiate the rematch and the
exact post-game lobby behavior remain `OPEN`. Impostor's current close-on-finish
contract is unaffected.

---

# 29. Letter Pool State

The game conceptually tracks:

```text
available_letters
played_letters
skipped_letters
```

Invariant:

```text
available ∩ played = ∅
available ∩ skipped = ∅
played ∩ skipped = ∅
```

When selected:

```text
available → candidate
```

If skipped:

```text
candidate → skipped
```

If played:

```text
candidate → played
```

A letter cannot return to `available` during the same game.

---

# 30. Category State

Categories are created/configured before the game starts.

Once:

```text
game.state = IN_PROGRESS
```

the category set becomes immutable.

Invariant:

```text
round.categories == game.categories
```

for every round in the game.

---

# 31. Presence vs Participation

Presence and participation must remain distinct.

A player can be:

```text
participant = true
presence = connected
```

or:

```text
participant = true
presence = temporarily_disconnected
```

Temporary disconnect must not automatically erase:

* answers;
* score;
* round participation;
* voting history.

---

# 32. Disconnect During PLAYING

If a participant disconnects:

```text
PLAYING
  ↓
player presence lost
```

The round itself remains active.

The player may reconnect and continue if:

```text
round still in PLAYING
or
round still in FINAL_COUNTDOWN
```

Previously persisted answers must survive reconnect.

---

# 33. Disconnect During FINAL_COUNTDOWN

A disconnected player's participation creates an important completion problem.

If “all players finished” includes disconnected players forever, early close could become impossible.

Therefore the eventual model must define one of:

### Model A — snapshot participation

All players active at round start count until timer expires.

Pros:

* stable.

Cons:

* disconnected player prevents early finish.

### Model B — current active presence

Disconnected players stop counting toward early finish after liveness timeout.

Pros:

* game continues smoothly.

Cons:

* presence state affects game mechanics.

### Model C — abandonment state

Player remains participant until explicitly marked abandoned/inactive by platform recovery logic.

Likely the cleanest model if supported.

This remains an implementation-design decision.

The timer still guarantees eventual progress regardless.

---

# 34. Disconnect During REVIEWING

A disconnected voter remains in the frozen eligible roster. An open challenge
expires after 30 seconds, and an absent vote counts as an abstention. If the
invalidity threshold has not been reached, timeout leaves the answer valid.

---

# 35. Host Succession

Host identity is a platform-level responsibility.

If host succession occurs during any active Tutti Frutti state:

```text
old host unavailable
  ↓
platform selects successor
```

The following must remain unchanged:

* current round;
* selected letter;
* answers;
* countdown;
* review state;
* scores.

Only host-authorized lifecycle actions transfer to the successor.

---

# 36. Idempotency Expectations

Network retries must not cause duplicated transitions.

Examples:

Multiple calls to:

```text
call_tutti_frutti()
```

must not create multiple countdowns.

Multiple start-round actions must not create multiple rounds.

Repeated challenge votes must not count twice for the same voter.

Repeated scoring execution must not duplicate accumulated points.

Server operations should therefore be designed as idempotent or transactionally guarded.

---

# 37. Transition Guards

Conceptual guards include:

## Start game

Allowed only if:

```text
room = LOBBY
no active session
configuration valid
host authorized
minimum players satisfied
```

## Call Tutti Frutti

Allowed only if:

```text
round = PLAYING
player participates
completion requirements satisfied
```

## Edit answer

Allowed only if:

```text
round = PLAYING or FINAL_COUNTDOWN
player owns answer
round not locked
```

## Challenge answer

Allowed only if:

```text
round = REVIEWING
answer non-empty
answer currently VALID
challenger != answer author
```

## Vote challenge

Allowed only if:

```text
challenge = OPEN
voter eligible
voter has not already voted
```

## Score round

Allowed only if:

```text
round = REVIEWING
open challenges = 0
```

---

# 38. Illegal Transitions

Examples that must be rejected:

```text
LOBBY → REVIEWING

PLAYING → RESULT

FINAL_COUNTDOWN → PLAYING

LOCKED → PLAYING

RESULT → REVIEWING

FINISHED → PREPARING
```

A client request must never override canonical state-machine rules.
The last transition is illegal within one session; a rematch creates another
session while the Room is in `lobby`.

---

# 39. Conceptual Full State Flow

```text
ROOM: LOBBY
   ↓ start

SESSION: IN_PROGRESS / ROOM: PLAYING

ROUND: PREPARING
   ↓
ROUND: LETTER_PENDING
   ├─ skip approved
   │     ↓
   │   LETTER_PENDING with new letter
   │
   └─ letter accepted
         ↓
      PLAYING
         ↓ first valid Tutti Frutti
      FINAL_COUNTDOWN
         ├─ all finished
         └─ deadline reached
               ↓
             LOCKED
               ↓
            REVIEWING
               ↓
       resolve all challenges
               ↓
             SCORING
               ↓
              RESULT
               ├─ rounds remain → PREPARING
               └─ no rounds remain
                       ↓
                 SESSION: FINISHED / ROOM: LOBBY
```

---

# 40. Decision Status

`CONFIRMED` by `product-decisions.md`:

* minimum of two players;
* simple majority to skip a letter, with agreement from both players in a two-player game;
* two-player challenge invalidation only by mutual agreement;
* the first valid Tutti Frutti call starts one irreversible countdown;
* all players may edit until the shared lock, including the first caller;
* disconnect does not remove round participation or persisted answers;
* the authoritative countdown guarantees progress even if a player disconnects;
* the latest persisted answers are used if the player does not reconnect before lock.
* a finished Tutti Frutti session is immutable, its Room returns to `lobby`,
  and a rematch in that Room creates a new session; closing the Room is separate.
* the initial category catalog and 3–6 category limit, custom-name rules, and
  3/5/10 round options with 5 selected initially are confirmed in
  `product-decisions.md`.
* letter-skip window is 5 seconds; required votes are floor(frozen roster / 2) + 1;
* disconnected participants remain in the denominator, votes are fixed and
  private, and clients receive aggregate counts only;
* a skip is blocked when the global unused pool would not cover all remaining
  configured rounds; any authorized read accepts an expired candidate lazily.

`WORKING HYPOTHESIS`:

* 45-second final countdown;
* all active category answers must be non-empty to call Tutti Frutti, pending gameplay validation;

`CONFIRMED` for the initial session pool: `A B C D E F G H I J L M N O P R
S T U V`; K, Ñ, Q, W, X, Y, and Z are intentionally excluded. Increment 7
snapshots this pool in each session.

`OPEN` before the corresponding implementation increment:

* eligibility for early close when presence changes, without removing participation;
* whether an individual completion indication can be reversed before lock (the countdown cannot);
* normalization details and review ordering;
* who may initiate a rematch, optional configuration preselection, participant
  departure between matches, and exact post-game lobby behavior;
* relationship between existing `game_sessions`, `rooms`, and the Tutti Frutti state machine.

---

# 41. Design Principle

The Tutti Frutti state model should remain independent enough to express its own gameplay while reusing only platform concepts proven to be shared across games.

The existence of Tutti Frutti as the second implemented game should be used to test and refine the existing boundary between:

* platform room lifecycle;
* shared multiplayer infrastructure;
* game-specific domain state.
