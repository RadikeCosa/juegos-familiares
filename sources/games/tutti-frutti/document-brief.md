# Tutti Frutti — Product Brief

## 1. Purpose

Tutti Frutti is a synchronous multiplayer word game for the Juegos Familia platform.

The goal is to reproduce the familiar tabletop experience of Tutti Frutti in a simple mobile-first digital format: players receive a letter, complete a shared set of categories, compare their answers, resolve disputed entries together, and accumulate points across multiple rounds.

The game should preserve the social and conversational nature of the original game rather than attempting to fully automate semantic validation.

---

## 2. Product Position

Tutti Frutti is the second game planned for Juegos Familia after Impostor.

It should reuse platform capabilities only where they are genuinely shared, without prematurely turning Impostor-specific concepts into platform-wide abstractions.

The introduction of a second real game is an opportunity to identify which existing concepts belong to the shared platform and which belong exclusively to Impostor.

Dictionary remains a possible future game but is postponed while Tutti Frutti is prioritized.

---

## 3. Entry Flow

Players select the game before entering or creating a room.

Expected flow:

```text
Games
  ↓
Tutti Frutti
  ↓
Create room / Join room
  ↓
Lobby
  ↓
Configure game
  ↓
Start game
```

A room is therefore conceptually associated with a specific game.

Tutti Frutti should not initially introduce a generic room where participants join first and choose a game afterward.

A broader concept such as a reusable “game night” room may be considered later if actual usage demonstrates a need for it.

---

## 4. Players and Roles

The game is multiplayer and synchronous.

Initial assumptions:

* one player acts as room host;
* all players, including the host, participate normally in the game;
* the host configures and starts the game;
* the host should not become a permanent referee;
* validation decisions should preferably be distributed among participants.

Minimum player count remains to be confirmed.

Two-player support is desirable, but some validation rules may need specific behavior when only two players are present.

---

## 5. Game Structure

A game contains multiple rounds.

Each round uses:

* one letter;
* the same configured category set;
* one answer per player and category;
* a review phase;
* scoring.

Example:

```text
Letter: M

Name: Martín
Animal: Mono
Food: Milanesa
Place: Madrid
Object: Mesa
```

The number of rounds should be configured before the game starts.

Initial candidate presets:

* 3 rounds
* 5 rounds
* 10 rounds

The exact presets remain an implementation-level decision.

---

## 6. Game Configuration

Before starting the first round, the host configures the game.

Configuration includes at minimum:

* number of rounds;
* active categories;
* custom categories, if any.

Once the game begins, the configuration should remain fixed for all rounds.

Categories should not initially be editable between rounds.

This avoids inconsistencies between players and keeps scoring comparable throughout the game.

---

## 7. Categories

### 7.1 Preset categories

The game should provide a useful predefined category pool.

Initial candidates include:

* Name
* Animal
* Food
* Place
* Object
* Country
* City
* Profession
* Famous person
* Movie or series

The final initial catalog does not need to be large.

Players should be able to select which preset categories are active for a particular game.

---

### 7.2 Custom categories

Custom categories should be included in the initial product scope unless implementation analysis reveals disproportionate complexity.

Example:

```text
+ Add category

"Something Pedro says"
"Something found in a kitchen"
"Movie character"
```

Custom categories exist only as labels for the current game.

The application does not need to understand their semantics.

Because answer validity is socially determined rather than automatically validated against a dictionary or knowledge base, custom categories should not introduce major domain complexity.

Initially, custom categories should not become reusable platform entities.

Out of scope for the first version:

* saved category libraries;
* favorite categories;
* public category packs;
* category sharing;
* category search;
* category statistics;
* AI-generated categories.

---

## 8. Letter Selection

Each round uses one randomly selected letter.

A letter already played or skipped during the current game should not appear again.

The initial letter pool should prioritize letters that produce playable rounds in Spanish.

The exact default pool remains to be defined.

Rare or difficult letters may be excluded from the default pool.

Examples requiring explicit consideration include:

```text
K
Ñ
Q
W
X
Y
Z
```

---

## 9. Skipping a Letter

Players should have a mechanism to reject a particularly difficult or unsuitable letter.

A skipped letter:

* ends the pre-round letter-selection phase;
* is removed from the remaining pool;
* is replaced by another random letter;
* does not count as a played round.

The decision mechanism remains open.

Current preferred direction:

> skipping should be a group decision rather than an unrestricted host action.

Candidate rule:

* majority vote among active players.

Alternative:

* host proposes skipping and the remaining players confirm.

This should be resolved during user-flow and state-model design.

---

## 10. Playing a Round

Once a letter is accepted, all players enter answers simultaneously.

Each active category has one text input.

Players may edit their answers while the round remains open.

Example:

```text
Letter: M

Name        [ Martina       ]
Animal      [ Mono          ]
Food        [ Milanesa      ]
Place       [ Mendoza       ]
Object      [ Mesa          ]

           [ TUTTI FRUTTI ]
```

---

## 11. The “Tutti Frutti” Action

The “Tutti Frutti” button represents a player declaring that they have finished completing their answers.

The first player to press it does **not** immediately end the round.

Instead, it starts a shared final countdown.

Current working hypothesis:

> 45-second countdown.

The duration should initially be treated as a product hypothesis rather than a permanent rule.

Example:

```text
Camila finished.

45 seconds remaining
```

During the countdown:

* unfinished players may continue entering answers;
* completed players may still review or modify their own answers unless the state model later establishes otherwise;
* all players see the remaining time.

When the timer expires:

* all answers are locked;
* the round enters review.

If all active players finish before the timer expires, the round should close immediately.

---

## 12. Eligibility to Call “Tutti Frutti”

This remains an open decision.

Preferred initial direction:

> the button is enabled only when the player has entered a non-empty answer in every active category.

Advantages:

* prevents players from triggering the countdown strategically while leaving multiple fields empty;
* preserves the meaning of “I finished”;
* makes the action easy to understand.

However, empty answers during the countdown remain valid game outcomes for players who do not finish in time.

This rule should be confirmed during state-model design.

---

## 13. Round Closing

A round closes when either:

1. the final countdown reaches zero; or
2. all active players have declared completion.

At that point:

* answer editing stops;
* submitted values become immutable for the round;
* the review phase begins.

---

## 14. Answer Review

The application should avoid attempting full automatic semantic validation.

It should automatically handle only objective information such as:

* empty answers;
* equivalent duplicate answers;
* unique answers.

Answer validity should be social.

The guiding principle is:

> answers are considered valid by default unless challenged.

This avoids forcing players to manually approve every answer and preserves the conversational nature of Tutti Frutti.

---

## 15. Duplicate Detection

The system should detect when two or more players submitted the same answer for the same category.

Basic normalization may include:

* trimming leading/trailing spaces;
* case-insensitive comparison;
* potentially accent normalization, subject to later technical analysis.

Example:

```text
"Mono"
"mono"
" Mono "
```

should normally be treated as equivalent.

Normalization must not silently alter the displayed answer.

The original player input should remain visible during review.

---

## 16. Challenges

During review, any answer that is not empty can initially be treated as valid.

Players may challenge an answer they consider invalid.

Example:

```text
Food — M

Ramiro: McDonald's

[ Challenge ]
```

Only challenged answers require a decision.

This keeps review lightweight when answers are obvious.

Potential reasons for challenge include:

* answer does not match the required letter;
* answer does not belong to the category;
* spelling or interpretation makes the answer questionable;
* category-specific disagreement.

The application should organize the decision but should not attempt to resolve semantic disputes itself.

---

## 17. Resolving Challenges

Current preferred direction:

* players vote whether the challenged answer is valid;
* the author of the challenged answer does not vote on their own answer;
* a simple majority determines invalidity;
* if there is no majority to reject the answer, it remains valid.

Guiding rule:

> when the group cannot establish that an answer is invalid, the answer remains valid.

This can be expressed informally as:

> when in doubt, it counts.

Exact behavior for two-player games remains unresolved and must be designed explicitly.

---

## 18. Scoring

Initial scoring model:

* valid unique answer: **10 points**
* valid answer duplicated by another player: **5 points**
* empty answer: **0 points**
* invalidated answer: **0 points**

Scoring should be calculated automatically once review is complete.

No initial bonus should be awarded for being the first player to press “Tutti Frutti”.

This avoids creating an incentive to rush incomplete or low-quality answers merely to trigger the countdown.

---

## 19. Round Result

After review and scoring, players should see a concise round result.

Example:

```text
Round 2 — Letter M

Camila       45
Pedro        40
Ramiro       35

Total score

Camila      100
Ramiro       95
Pedro        85
```

Players should be able to understand both:

* points earned during the current round;
* cumulative game score.

The host then advances to the next round.

---

## 20. Final Result

After the configured number of rounds is complete, the game enters its final result state.

The final screen should show:

* final ranking;
* total points per player;
* winner or tied winners.

A new game may later be started from the same social context, but the exact post-game lifecycle should be aligned with the existing platform model during implementation planning.

---

## 21. Proposed Round Lifecycle

Initial conceptual state flow:

```text
PREPARING_ROUND
      ↓
LETTER_SELECTED
      ↓
optional skip decision
      ↓
PLAYING
      ↓
first player calls TUTTI_FRUTTI
      ↓
FINAL_COUNTDOWN
      ↓
ANSWERS_LOCKED
      ↓
REVIEWING
      ↓
CHALLENGES_RESOLVED
      ↓
SCORING
      ↓
ROUND_RESULT
      ↓
NEXT_ROUND / FINAL_RESULT
```

These are conceptual states only.

Final persistence and state-machine design belong in the game-state model and technical design.

---

## 22. MVP Scope

Initial MVP should include:

* game-specific room creation and joining;
* multiplayer lobby;
* host-controlled game start;
* configurable number of rounds;
* selectable preset categories;
* simple custom categories;
* one random letter per round;
* ability to skip unsuitable letters;
* simultaneous answer entry;
* “Tutti Frutti” completion action;
* shared final countdown;
* immediate closing when all players finish;
* answer locking;
* duplicate detection;
* challenge-based social validation;
* automatic scoring;
* cumulative scoreboard;
* final ranking.

---

## 23. Explicitly Out of Scope

The first version should not require:

* dictionary APIs;
* RAE integration;
* AI-based answer validation;
* automatic semantic validation;
* permanent category libraries;
* public category packs;
* matchmaking;
* bots;
* asynchronous play;
* historical statistics;
* global rankings;
* advanced moderation;
* complex configurable scoring systems.

These capabilities may be reconsidered after real gameplay.

---

## 24. Confirmed Product Decisions

The following decisions are currently considered established:

1. Tutti Frutti becomes the next game prioritized after Impostor.
2. Dictionary is postponed, not discarded.
3. Players select Tutti Frutti before creating or joining its room.
4. A room is conceptually associated with a specific game.
5. Categories remain constant during a game.
6. Preset category selection belongs in the initial scope.
7. Simple game-local custom categories should also be targeted for the initial scope.
8. The first player to complete their answers activates a final countdown rather than immediately ending the round.
9. The initial countdown hypothesis is 45 seconds.
10. If all active players finish before the countdown ends, the round closes immediately.
11. Semantic answer validity is not automatically determined by the system.
12. Answers are valid by default unless challenged.
13. Duplicate detection and scoring should be automatic.
14. Challenged answers should be resolved socially.
15. No speed bonus is awarded for calling “Tutti Frutti” first.
16. Players should be able to skip unsuitable letters.
17. Skipped and previously played letters should not reappear during the same game.

---

## 25. Working Hypotheses

The following are preferred directions but should still be validated during detailed design:

* “Tutti Frutti” can only be called after all category fields contain an answer.
* the countdown lasts 45 seconds;
* letter skipping uses a majority decision;
* challenges are resolved by majority vote;
* the answer author does not participate in the vote on their own answer;
* a tied challenge leaves the answer valid;
* scoring uses 10 / 5 / 0;
* preset round counts may initially be 3, 5, and 10.

---

## 26. Open Decisions

The next design phase should resolve:

### Players

* What is the minimum player count?
* How should answer challenges work with exactly two players?
* How are disconnected players treated during an active round?

### Categories

* What is the initial preset category catalog?
* Is there a maximum number of active categories?
* Is there a maximum number of custom categories?
* Are duplicate custom category names allowed?

### Letters

* What is the initial Spanish letter pool?
* Which difficult letters are excluded by default?
* Does skipping require majority, unanimity, or host proposal plus confirmation?
* How long does the group have to decide whether to skip?

### Playing

* Must every field be non-empty before calling “Tutti Frutti”?
* Can the player who triggered the countdown continue editing answers?
* Should a player have an explicit “finished” action during the countdown?

### Review

* Are answers reviewed category-by-category or on one complete review screen?
* Can several answers be challenged before voting begins?
* Are challenges resolved sequentially or in parallel?
* How should normalization treat accents, punctuation, plurals, and minor spelling variants?

### Recovery

* What happens if a player disconnects while entering answers?
* Can they reconnect and continue before the round closes?
* How should the game distinguish temporarily disconnected players from abandoned participants?

---

## 27. Next Design Artifacts

This product brief should serve as the basis for:

1. `user-flow.md`
2. `game-state-model.md`
3. `product-decisions.md`
4. conceptual data-model analysis
5. technical requirements
6. implementation increments

The next phase should focus on converting the product rules into explicit user flows and game states before implementation begins.

