# Tutti Frutti — Product Decisions

## 1. Purpose

This document records the product decisions made for Tutti Frutti within Juegos Familia.

Its purpose is to preserve:

* the context behind each decision;
* alternatives considered;
* the selected direction;
* the reasoning;
* relevant tradeoffs;
* decisions intentionally postponed.

This document should be treated as a decision log, not as an implementation specification.

When later technical work introduces pressure to change one of these decisions, the preferred approach is to revisit the decision explicitly rather than silently altering product behavior.

---

# 2. Game Priority

## Context

Dictionary had previously been considered as the next game after Impostor.

During product discussion, family preference changed and Tutti Frutti became the preferred next game.

## Alternatives Considered

1. Continue with Dictionary because some design work had already been done.
2. Build Tutti Frutti first and postpone Dictionary.
3. Attempt to design or implement both games in parallel.

## Decision

Tutti Frutti becomes the next prioritized game after Impostor.

Dictionary is postponed but not discarded.

## Rationale

Tutti Frutti currently has stronger real-user interest and fits naturally within the existing synchronous multiplayer platform.

Dictionary remains valuable as a potential future asynchronous game and should not be removed from the product roadmap.

## Tradeoff

Existing Dictionary design work will not immediately result in implementation.

However, prioritizing a game with actual family demand is considered more valuable than following the previous roadmap mechanically.

---

# 3. Game Selection Happens Before Room Creation

## Context

The existing Impostor experience is game-specific: players enter Impostor and create or join a room for that game.

A possible alternative would be to make rooms generic and choose which game to play only after entering the room.

## Alternatives Considered

### A. Game-specific room flow

```text
Games
  ↓
Tutti Frutti
  ↓
Create / Join room
```

### B. Generic room flow

```text
Create / Join generic room
  ↓
Choose game
  ↓
Tutti Frutti / Impostor / ...
```

### C. Persistent “game night” room

Players remain in one social room and launch several games from it.

## Decision

Players select Tutti Frutti before creating or joining a room.

The room is conceptually associated with Tutti Frutti.

## Rationale

This preserves the current product mental model and avoids redesigning room behavior for a use case that has not yet been demonstrated.

A generic room or “game night” concept could become valuable later if real usage shows that the same group commonly moves through several games in one session.

## Tradeoff

Some future cross-game flows may require an additional abstraction.

That complexity is intentionally deferred until there is evidence that it is needed.

---

# 4. Shared Infrastructure Must Be Proven by the Second Game

## Context

Impostor was the first implemented game and therefore some apparently generic concepts may actually contain assumptions specific to Impostor.

Tutti Frutti is the first opportunity to test those boundaries.

## Decision

Existing room, session, presence, liveness, reconnect, and host-succession concepts should be reused only where Tutti Frutti demonstrates that they are genuinely shared.

Game-specific rules must remain in the Tutti Frutti domain.

## Rationale

Premature abstraction would risk turning Impostor implementation details into permanent platform constraints.

The second real game provides concrete evidence for deciding what belongs in shared infrastructure.

## Tradeoff

Some duplication may temporarily be preferable to an incorrect shared abstraction.

Refactoring may occur only after common behavior has been demonstrated.

---

# 5. Categories Are Configured Before the Game

## Context

Traditional Tutti Frutti can use many different category combinations.

Keeping a fixed category list would simplify implementation but reduce much of the game's flexibility and family character.

## Alternatives Considered

1. Fixed categories only.
2. Selectable predefined categories.
3. Selectable predefined categories plus simple custom categories.
4. Full reusable category-management system.

## Decision

The initial product should support:

* selectable preset categories;
* simple custom categories defined for the current game.

The initial preset catalog is Name, Animal, Food, Place, Object, Country,
City, Profession, Famous person, and Movie or series, in that order. A game
uses 3–6 active categories total, including custom categories, and initially
suggests Name, Animal, Food, Place, and Object.

Custom names are game-local, trimmed and normalized to NFC, and contain 1–40
printable Unicode characters without control characters. Names are unique
ignoring case and surrounding whitespace against every preset and every other
custom name; comparisons distinguish accents. There is no separate custom
category allowance beyond the six-category total.

Before the host's first explicit save, the defaults are visible to all Room
members without creating a persisted row. The host can save only in `lobby`;
members can read the last confirmed configuration after the Room leaves lobby.
Realtime changes invalidate server state. An unsaved local draft remains
visible and is marked stale until the host reloads or saves successfully.

## Rationale

Category choice is central to the identity of Tutti Frutti.

Custom categories add significant expressive value while remaining relatively inexpensive if the system treats them only as labels and does not attempt semantic understanding.

## Tradeoff

Configuration becomes slightly more complex than a fixed-list implementation.

That additional complexity is considered justified by the gameplay value.

---

# 6. Custom Categories Are Game-Local

## Context

Once custom categories exist, they could evolve into a much larger feature involving saved collections, favorites, sharing, public packs, and discovery.

## Decision

Custom categories initially exist only within the current game configuration.

They are not permanent platform entities.

## Rationale

This preserves the useful part of customization without introducing a category-management subsystem.

## Explicitly Deferred

* saved category libraries;
* favorites;
* reusable personal categories;
* public category packs;
* search;
* sharing;
* category statistics;
* AI-generated categories.

---

# 7. Categories Are Frozen Once the Game Starts

## Context

Allowing categories to change between rounds could increase flexibility.

However, it would make rounds less comparable and complicate scoring, state consistency, reconnect behavior, and UX.

## Decision

The category set becomes immutable when the game starts.

Every round in the game uses the same categories.

## Rationale

A stable category set gives the game a clear contract and keeps all players competing under equivalent conditions.

## Tradeoff

Players who later regret a category choice must finish the current game or start a new one.

This is preferred over mid-game configuration complexity.

---

# 8. A Game Contains Multiple Rounds

## Decision

A Tutti Frutti game consists of multiple rounds.

Each round uses:

* one letter;
* the configured category set;
* one answer per player per category;
* review;
* scoring.

The host selects the number of rounds before starting.

## Decision

Available presets:

* 3 rounds;
* 5 rounds;
* 10 rounds.

The initial selection is 5 rounds.

---

# 9. Letters Are Selected From a Controlled Pool

## Context

Not every letter produces a good experience in Spanish.

Using every letter equally could generate frustrating or nearly impossible rounds.

## Decision

Letters are selected randomly from a predefined playable pool.

Played and skipped letters do not appear again during the same game.

## Rationale

The goal is not alphabetic purity but enjoyable gameplay.

## Confirmed Initial Pool

The initial session pool is **CONFIRMED** as:

```text
A B C D E F G H I J L M N O P R S T U V
```

K, Ñ, Q, W, X, Y, and Z are intentionally excluded from the initial pool.
Letters already selected, accepted, or skipped cannot be selected again
during the same session. Before accepting a skip, the server checks that the
unused pool after discarding the current candidate still has at least as many
letters as the configured rounds remaining, including the current round. If
not, the skip is unavailable and the current letter is accepted on timeout.

---

# 10. Players May Skip an Unsuitable Letter

## Context

Even with a curated pool, some letter/category combinations may still produce poor rounds.

Allowing only the host to skip would give one participant excessive control.

Requiring unanimity for larger groups could create unnecessary friction.

## Alternatives Considered

1. Host decides unilaterally.
2. Unanimous vote.
3. Simple majority.
4. Host proposes and others confirm.

## Decision

Letter skipping is a group decision using a strict majority:
floor(frozen session roster size / 2) + 1.

For exactly two players, both players must agree.

The denominator is the roster frozen at session start. Disconnecting or
leaving the mutable Room roster does not remove a voter or lower the threshold.
If too few players remain connected to reach the threshold, the candidate is
accepted when the window expires.

Each player may cast one fixed vote per candidate; votes cannot be withdrawn
or changed. The UI shows only the aggregate vote count and threshold, never
individual voter identities. A replacement candidate starts with zero votes.

## Rationale

Simple majority is easy to understand and prevents one player from controlling the letter selection.

With two players, allowing one vote to skip would effectively make skipping unilateral, so unanimity is required.

## Example

```text
2 players → 2 votes required
3 players → 2 votes required
4 players → 3 votes required
5 players → 3 votes required
```

---

# 11. Letter Skip Uses a Short Pre-Round Window

## Context

Without a time limit, letter discussion could stall the beginning of each round.

## Decision

There should be a short pre-round period during which players may request skipping the selected letter.

## Confirmed Duration

5 seconds.

If the required majority is not reached, the round starts automatically.

## Rationale

This keeps the interaction lightweight and avoids adding a second explicit “accept letter” action.

## Status

The 5-second duration is CONFIRMED for Increment 8.

---

# 12. “Tutti Frutti” Means “I Finished”

## Context

The traditional verbal call of “Tutti Frutti” indicates that one player completed their sheet.

A digital implementation could either immediately stop everyone or use the call to initiate a final period.

## Decision

The button represents:

> the player declares that they have completed their categories.

It does not immediately terminate the round.

## Rationale

Immediate termination would be too punishing on mobile devices, where typing speed varies significantly.

---

# 13. First Tutti Frutti Starts a Shared Countdown

## Alternatives Considered

1. Immediate round termination.
2. Fixed global timer from the start.
3. First finisher triggers a short final timer.
4. No timer; wait for all players.

## Decision

The first valid Tutti Frutti call starts a shared final countdown.

## Current Hypothesis

45 seconds.

For Increment 10, 45 seconds is the confirmed initial value. It remains
tunable after observing real play; clients cannot change a running deadline.

## Rationale

This preserves the pressure created by someone finishing first while giving the rest of the group a reasonable opportunity to complete their answers.

A countdown also prevents a slow or distracted player from blocking the round indefinitely.

## Tradeoff

The exact duration may require adjustment after real gameplay.

---

# 14. No Speed Bonus

## Context

The first player to call Tutti Frutti could theoretically receive bonus points.

## Decision

No additional points are awarded for finishing first.

## Rationale

A speed bonus would create an incentive to prioritize rushing over answer quality and could encourage players to enter weak answers simply to trigger the timer.

The countdown itself already provides sufficient competitive pressure.

---

# 15. Initial Tutti Frutti Eligibility Requires All Fields Completed

## Context

A player could theoretically trigger the timer while deliberately leaving categories empty.

## Alternatives Considered

1. Allow the button at any time.
2. Require a minimum number of fields.
3. Require every active category to contain an answer.

## Decision

The current preferred rule is:

> a player may call Tutti Frutti only when every active category contains a non-empty answer.

This condition must eventually be server-enforced, not only represented in the UI.

## Rationale

The button should preserve its semantic meaning: “I finished.”

## Status

Considered the preferred product rule, subject to gameplay validation.

Confirmed for Increment 10: the server requires a persisted non-empty answer
in every active category before accepting the first call. Unsaved drafts do
not qualify.

---

# 16. Calling Tutti Frutti Is Irreversible

## Decision

Once the first player triggers the countdown:

* the countdown cannot be cancelled;
* it cannot be restarted;
* later Tutti Frutti calls do not extend it.

## Rationale

The round needs one authoritative deadline.

Allowing players to restart or cancel the timer would introduce strategic manipulation and synchronization complexity.

---

# 17. Players May Continue Editing During the Countdown

## Context

A strict interpretation of “finished” could freeze the answers of the player who called Tutti Frutti.

## Alternatives Considered

1. First finisher immediately locks their answers.
2. Every player locks individually when they mark finished.
3. All answers remain editable until the shared round deadline.

## Decision

All players, including the player who called Tutti Frutti, may continue editing until the round becomes locked.

## Rationale

This allows:

* typo correction;
* last-second reconsideration;
* consistent behavior for every player;
* a simpler shared locking model.

## Important Consequence

“Finished” is not equivalent to “answers locked.”

The only irreversible answer state is the shared round lock.

---

# 18. Round Ends Early If Everyone Finishes

## Decision

If all relevant connected participants complete their categories before the countdown reaches zero, the round may close early.

## Rationale

There is no gameplay value in forcing everyone to watch an unused timer.

## Disconnect Qualification

A disconnected participant should not cause the system to wait indefinitely for explicit completion.

The countdown remains the guaranteed progress mechanism.

Increment 10 intentionally closes only at the deadline. Individual completion
markers and early close remain outside that increment until their presence and
reversal policy is decided.

---

# 19. Semantic Validation Is Social, Not Automatic

## Context

Automatically determining whether arbitrary text is a valid answer would require dictionaries, named-entity knowledge, category semantics, regional rules, and many edge cases.

Custom categories would make this even more difficult.

## Alternatives Considered

1. Automatic dictionary validation.
2. AI validation.
3. Host validates everything.
4. Dedicated rotating referee.
5. Social review among players.

## Decision

The application does not attempt full semantic validation.

Answer validity is resolved socially by the players.

## Rationale

Disagreement over unusual answers is part of the traditional game's social experience.

Automating semantic judgment would create significant technical complexity while potentially producing worse decisions than the group itself.

---

# 20. Answers Are Valid by Default

## Context

Requiring explicit approval for every answer could turn the review phase into a long administrative process.

## Decision

Every non-empty answer begins review as valid.

Only disputed answers require further interaction.

## Rationale

Most answers will be obvious.

The system should focus player attention on exceptions rather than forcing confirmation of normal cases.

---

# 21. Players May Challenge Answers

## Decision

During review, players may challenge an answer they believe should not count.

A challenge does not immediately invalidate the answer.

It opens a group decision.

## Rationale

The system acts as a facilitator for disagreement rather than an automated referee.

---

# 22. With Three or More Players, Challenges Use Majority Voting

## Decision

For games with at least three players:

* the answer author does not vote on their own answer;
* other eligible players vote valid or invalid;
* simple majority determines invalidity.

## Rationale

Excluding the author reduces direct self-interest while still distributing authority among the group.

Majority voting avoids assigning permanent referee power to the host or another participant.

---

# 23. Tied Challenge Votes Leave the Answer Valid

## Context

A tied vote means the group has failed to establish that the answer is incorrect.

## Decision

If a challenge vote is tied, the answer remains valid.

## Guiding Principle

> When in doubt, it counts.

## Rationale

The burden is effectively on the challenge to establish invalidity.

This avoids unnecessary punitive outcomes in ambiguous cases.

---

# 24. Two-Player Games Use Mutual Agreement Instead of Formal Voting

## Context

With exactly two players, excluding the answer author leaves only one eligible voter.

That would allow the opponent to unilaterally invalidate any challenged answer.

## Alternatives Considered

1. Let the opponent decide.
2. Give the host tie-breaking power.
3. Disable challenges in two-player games.
4. Require mutual agreement.

## Decision

Two-player games are supported.

For disputed answers, invalidation requires mutual agreement between the two players.

If no agreement is reached, the answer remains valid.

## Rationale

This preserves the same product principle used in larger groups:

> an answer should not be invalidated without sufficient agreement.

## Tradeoff

The application cannot always resolve disagreement mechanically.

This is acceptable because Tutti Frutti is fundamentally a social game.

---

# 25. Minimum Player Count Is Two

## Decision

Tutti Frutti should support games starting with two players.

## Rationale

Family usage may frequently involve only two available participants.

Requiring three players solely to simplify challenge voting would unnecessarily restrict the game.

The validation model is adapted instead.

---

# 26. Duplicate Detection Is Automatic

## Decision

The system automatically detects duplicate answers within the same:

* round;
* category.

## Rationale

This is an objective comparison problem and does not require social judgment.

Automatic detection reduces review effort and makes scoring reliable.

---

# 27. Duplicate Detection Uses Normalized Values

## Decision

Comparison uses a normalized representation rather than literal raw text.
Increment 9 confirms normalization version 1 for persisted answers: NFC,
trim external Unicode whitespace, and compare without case distinctions while
preserving accents, punctuation, and internal whitespace. The original
player-entered text remains visible. Plural/singular equivalence and spelling
tolerance remain open for later product decisions.

## Example

These should normally compare as the same answer:

```text
Mono
mono
 Mono
```

## Important Constraint

The original player-entered text remains visible.

Normalization exists only for comparison.

---

# 28. Validation Happens Before Final Duplicate Scoring

## Context

Suppose two players both submit the same answer, but one answer is later invalidated.

The remaining valid answer is no longer duplicated.

## Decision

Final uniqueness and duplicate scoring must be calculated from the set of valid answers after challenge resolution.

## Example

Initial answers:

```text
Camila → Mono
Pedro  → Mono
```

If both are valid:

```text
Camila = 5
Pedro  = 5
```

If Pedro's answer is invalidated:

```text
Camila = 10
Pedro  = 0
```

## Rationale

Scoring should reflect final accepted answers, not merely the original text submissions.

---

# 29. Initial Scoring Model Is 10 / 5 / 0

## Decision

Initial scoring:

* valid unique answer: 10 points;
* valid duplicated answer: 5 points;
* empty answer: 0 points;
* invalid answer: 0 points.

## Rationale

This is simple, familiar, and easy to explain.

## Status

This is considered the initial product rule.

Complex configurable scoring systems are not part of the first version.

---

# 30. Review Should Focus Only on Exceptions

## Decision

The review experience should avoid making players manually approve every response.

The system should:

1. display answers;
2. identify duplicates;
3. allow challenges;
4. resolve only challenged entries;
5. calculate scores.

## Rationale

The review phase must remain part of the game rather than becoming administrative overhead.

---

# 31. Disconnect Does Not Remove Round Participation

## Context

Mobile devices may temporarily lose connectivity.

Treating every disconnect as a player leaving the game would make gameplay fragile.

## Decision

A temporary disconnect does not automatically remove the player from the round.

The player's:

* answers;
* score;
* participation;
* prior actions;

remain intact.

## Rationale

Presence and gameplay participation are distinct concepts.

This follows lessons already learned while implementing multiplayer recovery for Impostor.

---

# 32. Reconnection Restores the Active Round

## Decision

If a player reconnects before answers are locked, they should recover:

* current round;
* selected letter;
* current phase;
* countdown deadline if active;
* previously persisted answers.

They may continue editing while the round still allows it.

## Rationale

A temporary network interruption should not unnecessarily destroy player progress.

---

# 33. Last Persisted Answers Survive a Missed Reconnection

## Decision

If a player does not reconnect before the round locks:

* their latest persisted answers are used;
* incomplete fields remain empty;
* empty fields score zero.

## Rationale

This gives predictable behavior without requiring the round to stop or be restarted.

---

# 34. Countdown Guarantees Progress During Disconnects

## Context

A disconnected player may never explicitly indicate that they finished.

## Decision

The final countdown remains authoritative and ends the round even if one participant is disconnected.

A disconnected participant must not cause an indefinite wait.

## Rationale

Network state should not be capable of deadlocking gameplay.

---

# 35. Presence and Completion Remain Separate Concepts

## Decision

The model should distinguish:

```text
presence
```

from:

```text
round completion
```

A participant may be disconnected while still remaining part of the current round.

## Rationale

Merging these concepts would make reconnect and scoring behavior inconsistent.

This is considered both a product and architectural boundary worth preserving.

---

# 36. Host Is a Player, Not a Permanent Referee

## Context

The host already has lifecycle responsibilities such as game configuration and starting the game.

It would be technically easy to also assign all validation authority to the host.

## Decision

The host participates as a normal player and does not automatically become the answer referee.

## Rationale

The host should not spend the game performing administrative work.

Validation is a group responsibility.

---

# 37. Host Succession Reuses Platform Behavior

## Decision — CONFIRMED

In `lobby`, a successor may be any eligible RoomParticipant with valid
authoritative liveness; no session roster exists yet. In `playing`, when the
current host becomes stale according to server-checked liveness, the successor
must simultaneously be a current RoomParticipant, a member of the active
session's frozen roster, and liveness-valid. The server selects among eligible
successors deterministically. Presence may trigger an evaluation, but never
transfers authority by itself. A brief Presence loss need not make the host
stale while `last_seen_at` remains within its active window.

Succession changes only Room host authority (`rooms.host_player_id` in the
current schema). It does not change session participation, roles, current
round, selected letter, answers, votes, countdown, challenges, review state,
or scores. During `PLAYING`, `FINAL_COUNTDOWN`, `REVIEWING`, or `RESULT`, only
the actor permitted to perform host-only actions changes; the Tutti Frutti
state machine does not advance or reset because of succession.

If the former host returns after replacement, they remain a participant but
do not automatically regain host authority. If no successor is eligible,
there is no transfer; host-only actions may wait for an eligible host. This
does not remove absent players from the frozen roster or change voting quorum.

The versioned Impostor RPC implements the `playing` roster check using
`session_players`; its deployed behavior has not been independently verified.
When shared session infrastructure exists, the Room succession guard must
consult the minimal shared session roster instead of Impostor-specific
columns. This decision does not promote Impostor gameplay into shared state.

## Rationale

Host ownership is a Room lifecycle concern, not a Tutti Frutti gameplay state.
Restricting a successor to the active roster prevents a Room member who is not
playing the current session from acquiring its host-only authority.

---

# 38. Game Configuration Is Frozen but Gameplay State Must Recover

## Decision

Static configuration such as:

* categories;
* round count;

is frozen once the game begins.

Dynamic gameplay state such as:

* current round;
* selected letter;
* answers;
* countdown;
* challenge state;

must be recoverable after reconnect.

## Rationale

This separation reduces ambiguity between configuration and runtime state.

---

# 39. No Automatic Dictionary or AI Validation in MVP

## Decision

The first version will not require:

* dictionary APIs;
* RAE integration;
* external semantic databases;
* AI answer adjudication.

## Rationale

These systems would add substantial complexity and could still fail on:

* proper nouns;
* regional words;
* brands;
* custom categories;
* spelling variations;
* disputed interpretations.

Social resolution is considered a better initial product fit.

---

# 40. Explicitly Deferred Product Features

The following are not part of the initial Tutti Frutti scope:

* asynchronous mode;
* matchmaking;
* bots;
* global leaderboards;
* historical player statistics;
* public category packs;
* permanent custom category libraries;
* AI-generated categories;
* automatic semantic validation;
* advanced configurable scoring;
* complex moderation;
* persistent cross-game “game night” rooms.

These may be reconsidered after real usage.

---

# 41. Current Parameters and Status

The following parameters have different decision statuses:

```text
CONFIRMED: minimum players = 2
CONFIRMED: scoring = 10 / 5 / 0 for the initial product
CONFIRMED FOR INCREMENT 10: initial final countdown = 45 seconds; tunable after real play
CONFIRMED: letter-skip window = 5 seconds
CONFIRMED: skip threshold = floor(frozen session roster size / 2) + 1
```

The working durations are tunable; none of these values is a shared-platform rule.

---

# 42. Decisions Still Open

The following details remain intentionally unresolved:

## Review UX

* category-by-category review versus complete-round view;
* whether several challenges may be opened before voting;
* sequential versus parallel challenge resolution.

## Normalization

* plural/singular equivalence;
* spelling tolerance.

## Presence and voting

* exact voter eligibility when a player disconnects during review;
* challenge timeout or abstention behavior.

## Post-game lifecycle

* who may initiate the next match, including whether only the host may do so;
* whether prior configuration is preselected as a UX convenience;
* what happens when a participant leaves between matches;
* the exact post-game lobby presentation and actions.

These decisions should be resolved before the corresponding implementation increment, but they do not currently block the high-level product model.

---

# 43. Design Principles Established So Far

The emerging Tutti Frutti design follows several broader principles:

1. Preserve the social character of the physical game.
2. Automate objective mechanics, not subjective judgment.
3. Avoid making the host an administrator during gameplay.
4. Prefer valid-by-default behavior over excessive confirmation.
5. Use multiplayer consensus only where disagreement exists.
6. Separate connectivity state from gameplay participation.
7. Keep the server authoritative for shared game state.
8. Reuse platform infrastructure only where the second game proves it is genuinely shared.
9. Avoid building future abstractions without current product evidence.
10. Optimize the first version for real family play rather than theoretical completeness.

---

# 44. Related Design Artifacts

The player journey is in `user-flow.md`, the state model in
`game-state-model.md`, the conceptual relationships in
`conceptual-data-model.md`, and the proposed technical and physical contracts
in `technical-requirements.md` and `physical-data-model.md`. These proposals
must follow the product decisions here rather than forcing Tutti Frutti into
the existing Impostor schema.

---

# 45. Finished Session Returns the Same Room to Lobby

## Context

Impostor currently finishes its session and closes its Room. Tutti Frutti needs
to support another match among the same room participants without resetting a
completed session or forcing everyone to enter a new Room.

## Decision — CONFIRMED

After the final configured round has been scored, the Tutti Frutti session
becomes `FINISHED` and immutable. In the same authoritative lifecycle
transition, its Room moves from `playing` back to `lobby`. The Room remains
available to its participants. Ending a session does not close that Room.

A rematch in that Room creates a distinct Tutti Frutti session with a new
configuration snapshot and roster. Previous configuration values may be
offered as a UX convenience, but the completed session and its gameplay records
are neither reset nor reused. Closing the Room is a separate action.

This decision applies to Tutti Frutti. Impostor retains its current behavior:
its session completion closes its Room until a separate product decision
changes that contract.

## Open Follow-ups

* who may initiate a rematch and whether that action is host-only;
* whether previous configuration values appear preselected;
* what happens when a participant leaves between matches;
* the exact post-game lobby presentation and actions.

# 46. Answers Are Private and Persisted Per Round

## Context

Players need to enter answers on their own devices and recover them after a
refresh or reconnect. Showing an answer to another player before review would
change the game's simultaneous-entry dynamic.

## Decision — CONFIRMED

During the active answer-entry phase, a participant can read and edit only
their own answers. Answers remain associated with the round in which they
were entered. Empty or whitespace-only input means that category has no
answer, and that empty state is persisted.

The answer text shown to its author is preserved. Comparison uses a
session-pinned normalization rule: NFC, trim external Unicode whitespace,
and case-insensitive comparison while retaining accents, punctuation, and
internal whitespace. The first rule is version 1. An answer is limited to
200 Unicode code points after NFC. The entry form autosaves after 500 ms.

Increment 9 currently permits editing only in `PLAYING`. It does not include
the countdown, answer lock, review, or scoring. Any later decision to keep
editing during a countdown must explicitly extend the server phase guard.

## Rationale

Server-backed private reads preserve a player's work through refresh and
reconnection without revealing it early. Per-round rows preserve history and
make future review and scoring independent of later edits.

## Tradeoff

Unsaved drafts are held only in page memory. If connectivity is lost before a
save is confirmed, the player must keep that page open; there is no offline
queue. Comparison normalization defines only textual equivalence and does
not attempt to decide whether an answer is valid for its category.
