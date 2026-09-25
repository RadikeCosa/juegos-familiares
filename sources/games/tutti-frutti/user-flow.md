# Tutti Frutti — User Flow

## 1. Purpose

This document describes the expected player-facing flow for Tutti Frutti within Juegos Familia.

It focuses on:

* navigation;
* room lifecycle;
* game configuration;
* round interaction;
* letter skipping;
* answer entry;
* countdown behavior;
* answer review;
* challenges;
* scoring;
* game completion;
* recovery situations.

It intentionally avoids defining persistence or database implementation details.

Current local `main` includes the shared lobby and configuration, session
start, letter skipping, and private answer entry. Players can see the code,
members, host, and visual connection indicators, recover on refresh, leave, or
close as host. The host configures and saves rounds and categories; members see
the last confirmed configuration. Increment 7 starts with at least two
participants and freezes the configuration and roster. Increment 8 resolves
the 5-second skip vote. Increment 9 lets each player save and recover their
own answers during `PLAYING`; countdown, lock, review, and scoring are not yet
implemented.

---

# 2. Entry Point

The player enters Tutti Frutti from the platform game list.

```text
Home
  ↓
Games
  ↓
Tutti Frutti
```

From the Tutti Frutti entry screen, the player can:

* create a Tutti Frutti room;
* join an existing Tutti Frutti room.

A room belongs conceptually to Tutti Frutti.

The player does not enter a generic room and choose the game afterward.

---

# 3. Create Room Flow

```text
Tutti Frutti
  ↓
Create room
  ↓
Room created
  ↓
Host enters lobby
```

The creator becomes the room host.

The lobby displays:

* room name, if supported;
* room code or invitation mechanism;
* host;
* connected players;
* game status;
* configuration action for the host;
* leave-room action where applicable.

Other players may join while the room remains in lobby state.

---

# 4. Join Room Flow

```text
Tutti Frutti
  ↓
Join room
  ↓
Enter/select room
  ↓
Join
  ↓
Lobby
```

The joining player becomes a normal participant.

They cannot start the game unless they are or become host according to the platform's room lifecycle rules.

---

# 5. Lobby Flow

The lobby represents a room before the Tutti Frutti game starts.

All players can see:

* current participants;
* host identity;
* whether the game is ready to start.

The host additionally sees:

* configure game;
* start game.

Expected flow:

```text
Lobby
  ↓
Host reviews shared defaults or edits configuration
  ↓
If edited, host explicitly saves and members see the confirmed configuration
  ↓
Host starts with a valid configuration
```

Before the first save, all members see the same defaults without a persisted
configuration row. Reading those defaults does not write the draft. The game
cannot start until its effective configuration is valid.

---

# 6. Game Configuration

The host configures:

* 3, 5, or 10 rounds (5 selected initially);
* 3–6 active categories total, including custom categories;
* preset or game-local custom categories.

The preset catalog, validation rules, and selected defaults are defined in
`product-decisions.md`. A successful save adopts the server response. Realtime
invalidates the displayed state for other members; an unsaved host draft is
kept and marked stale until the host reloads or saves successfully.

Example:

```text
Rounds
( ) 3
(x) 5
( ) 10

Categories
[x] Name
[x] Animal
[x] Food
[x] Place
[x] Object
[ ] Profession

+ Add custom category
```

Custom category example:

```text
Something found in the kitchen
```

Configuration is editable while the room remains in lobby.

Once the game starts:

> the category set is frozen for the entire game.

The initial implementation should not allow categories to change between rounds.

---

# 7. Start Game

When the host starts the game:

```text
Lobby
  ↓
Game starts
  ↓
Round 1 — letter pending
```

The current participants enter the frozen session roster.

The system prepares:

* current round number;
* remaining rounds;
* active category set;
* the first pending letter from the session's frozen pool.

The host's start action is serialized with Room membership changes. If the
Room is no longer in `lobby`, a repeated start by the recorded initiator
returns the existing session without replacing its roster or letter. Each
participant reconstructs state from the authorized session read; Realtime
serves as invalidation, and opening or reconnecting triggers a fresh read.

---

# 8. Round Preparation

At the beginning of each round, the system selects a letter from the remaining letter pool.

Example:

```text
Round 2 of 5

Letter:

H
```

The letter should not have:

* already been played;
* already been skipped.

Before answer entry begins, players may be given a short opportunity to reject the letter.

---

# 9. Letter Skip Flow

Initial preferred flow:

```text
Letter selected
  ↓
Players may request skip
  ↓
Skip threshold reached?
  ├─ No → round begins
  └─ Yes
       ↓
     Letter discarded
       ↓
     New letter selected
```

A skipped letter does not count as a completed round.

`CONFIRMED`: skipping requires floor(frozen roster size / 2) + 1 votes.
With exactly two players, both must agree. The frozen roster still counts
after a disconnect or Room departure. The 5-second deadline accepts the
current letter if the connected players cannot reach the threshold. Votes are
fixed per candidate and the UI shows an aggregate only, without voter names.
The server also blocks a skip if it would leave fewer unused letters than
configured rounds remaining.

Example:

```text
Skip H?

Votes to skip: 2 / 3
5 seconds remaining
```

A skip request should only be possible during the pre-round letter phase.

Once answer entry begins, the letter cannot be changed.

---

# 10. Start Round

Once the letter is accepted:

```text
LETTER_SELECTED
  ↓
PLAYING
```

All players receive the same:

* letter;
* category set;
* round number.

Each category has one answer field.

Example:

```text
Letter: M

Name       [              ]
Animal     [              ]
Food       [              ]
Place      [              ]
Object     [              ]

[ TUTTI FRUTTI ]
```

Players enter answers independently and simultaneously.

During `PLAYING`, each category has its own answer field. Answers autosave
after 500 ms without typing and show saving, saved, or error feedback. A player
can retry a failed save; the retry uses the current field value. The field
shows the count of up to 200 Unicode code points after NFC. Original text is
preserved for display, except empty or whitespace-only text is saved as an
empty answer. A server-confirmed save is authoritative.

On opening or returning to the page, and after network reconnection or a
private invalidation, the player reloads their own server-confirmed answers.
If another tab saved a newer value while this tab has local edits, those edits
stay visible and are marked stale. The player can reload the saved value or
save the current draft. Drafts that have not reached the server remain only in
memory and are not queued offline.

---

# 11. Answer Entry

During the active round:

* players can enter answers;
* players can edit their own answers;
* players cannot see other players' answers;
* the server remains authoritative for the round state.

A player may leave some fields incomplete while the round is active.

---

# 12. Calling Tutti Frutti

The preferred initial rule is:

> the Tutti Frutti button becomes available only when all category fields contain a non-empty answer.

Example:

```text
Name       Martina
Animal     Mono
Food       Milanesa
Place      Madrid
Object     Mesa

[ TUTTI FRUTTI ]
```

When the first player presses the button:

```text
PLAYING
  ↓
FINAL COUNTDOWN
```

The round does not immediately end.

---

# 13. Final Countdown

Initial duration hypothesis:

> 45 seconds.

All players see a shared countdown.

Example:

```text
Camila finished.

00:42 remaining
```

During the countdown:

* all players, including the first caller, may continue editing their own answers until the round locks;
* the countdown is authoritative and shared;
* new calls to Tutti Frutti do not restart or extend the countdown.

A player who completes all categories during the countdown may mark themselves as finished.

---

# 14. All Players Finish Early

If every active player finishes before the countdown expires:

```text
FINAL_COUNTDOWN
  ↓
all active players finished
  ↓
ANSWERS LOCKED
```

The round closes immediately.

There is no reason to wait for the remaining countdown.

---

# 15. Countdown Expires

If the timer reaches zero:

```text
FINAL_COUNTDOWN
  ↓
timer = 0
  ↓
ANSWERS LOCKED
```

Any unanswered categories remain empty.

All player answers become immutable.

The round enters review.

---

# 16. Review Entry

Players enter a shared review phase.

The system shows submitted answers grouped by category.

Example:

```text
Animal — M

Camila      Mono
Pedro       Mono
Ramiro      Murciélago
```

The application automatically identifies:

* empty answers;
* duplicate answers;
* unique answers.

It does not automatically decide semantic validity.

---

# 17. Valid by Default

Every non-empty answer begins review as valid.

Players do not need to approve obvious answers.

Example:

```text
Name — M

Camila      María       Valid
Pedro       Martín      Valid
Ramiro      Manuel      Valid
```

This keeps review lightweight.

---

# 18. Challenge Flow

A participant may challenge a non-empty answer.

Example:

```text
Food — M

Ramiro      McDonald's

[ Challenge ]
```

The answer becomes disputed.

Flow:

```text
Valid answer
  ↓
Challenge submitted
  ↓
Disputed
  ↓
Group decision
  ↓
Valid / Invalid
```

A challenge does not immediately invalidate the answer.

---

# 19. Challenge Voting

`CONFIRMED` for sessions with three or more players:

* the answer author cannot vote on their own answer;
* other active players vote valid or invalid;
* simple majority determines invalidity;
* if invalidity does not obtain a majority, the answer remains valid.

Example:

```text
Does "McDonald's" count as Food with M?

Valid       Invalid

Camila        ✓
Pedro                     ✓
```

If the vote ties:

> the answer remains valid.

Guiding rule:

> when in doubt, it counts.

---

# 20. Two-Player Challenge Case

`CONFIRMED`: disputed answers stay valid unless both players agree to
invalidate them. The interaction and persistence mechanism remain `OPEN`.

With exactly two active players:

* one player owns the answer;
* only one other player could vote.

Giving that opponent a deciding vote would allow unilateral invalidation, so
the multi-player vote rule does not apply. If they do not agree, the answer
remains valid.

---

# 21. Completing Review

Review ends when:

* all submitted challenges have been resolved;
* no unresolved disputed answers remain.

Then the system calculates points.

---

# 22. Scoring

Initial model:

```text
Valid + unique      = 10
Valid + duplicated  = 5
Empty               = 0
Invalid             = 0
```

Example:

```text
Animal — M

Camila   Mono          5
Pedro    Mono          5
Ramiro   Murciélago   10
```

Scoring is automatic after validation state is final.

---

# 23. Round Result

Players see:

* score for the completed round;
* cumulative game score;
* current ranking.

Example:

```text
Round 3 result

Camila      +40     120
Ramiro      +45     115
Pedro       +35      95
```

The host can then advance.

---

# 24. Next Round

If rounds remain:

```text
ROUND RESULT
  ↓
Host continues
  ↓
Next round preparation
  ↓
New unused letter
```

Previously played and skipped letters remain unavailable.

The category set remains unchanged.

---

# 25. Final Round

After the configured final round:

```text
ROUND RESULT
  ↓
No rounds remaining
  ↓
FINAL RESULT
```

---

# 26. Final Result

Players see:

* final ranking;
* total score;
* winner;
* tied winners if applicable.

Example:

```text
Final result

1. Camila    245
2. Ramiro    230
3. Pedro     215
```

`CONFIRMED`: after the final round has been scored, this session becomes
`FINISHED` and immutable while the same Room returns from `playing` to `lobby`.
The Room remains available to its participants. The result may still be shown
from the finished session; returning to the lobby does not erase it.

A rematch in that Room starts a new session with a new roster and configuration
snapshot. Previous configuration values may be offered as a convenience, but
no gameplay record from the finished session is reset or reused. Closing the
Room is a separate action. Who initiates the rematch, the exact lobby
presentation, and behavior when someone leaves between matches remain `OPEN`.

---

# 27. Disconnect During Lobby

The existing platform presence and recovery behavior should be reused where possible.

If a player temporarily disconnects:

* the room should not immediately remove them;
* their presence may transition to disconnected/inactive according to the platform liveness rules;
* reconnect should restore the player to the room where possible.

---

# 28. Disconnect During Active Round

Desired behavior:

```text
Player disconnects
  ↓
Round continues
  ↓
Player reconnects before lock
  ↓
Current game state restored
  ↓
Player continues answering
```

Their already persisted answers should remain available.

If they do not return before answer lock:

* their last persisted answers are used;
* incomplete categories score zero;
* they do not block round completion indefinitely.

Exact active-player semantics must be defined in the state model.

---

# 29. Disconnect During Review

A disconnected player should not indefinitely block challenge resolution.

The eventual design must establish:

* when a player stops counting as an active voter;
* whether ongoing votes recalculate their threshold;
* how reconnecting affects already-resolved disputes.

This should reuse platform liveness semantics rather than creating an unrelated Tutti Frutti presence model.

---

# 30. Host Disconnect

Tutti Frutti should rely on the platform's host succession behavior rather than implement a separate host-recovery mechanism.

If host succession occurs:

* the new host may perform host-only lifecycle actions;
* current round state must remain unchanged;
* ownership transfer must not restart or reset the game.

---

# 31. Main Flow Summary

```text
Games
  ↓
Tutti Frutti
  ↓
Create / Join room
  ↓
Lobby
  ↓
Configure
  ↓
Start
  ↓
Select letter
  ↓
Optional skip
  ↓
Answer entry
  ↓
First Tutti Frutti
  ↓
45 s countdown
  ↓
Lock answers
  ↓
Review
  ↓
Challenges
  ↓
Scoring
  ↓
Round result
  ↓
Next round
  ↓
Final result
```

---

# 32. Decisions Still Required

`CONFIRMED`: minimum of two players, mutual agreement for two-player challenge
invalidation, simple-majority letter skipping (both votes with two players),
editing by every player until lock, one irreversible countdown, and preserved
participation and persisted answers across disconnects.

`CONFIRMED`: 5-second letter-skip window.
`WORKING HYPOTHESIS`: 45-second final countdown,
and all active categories non-empty before calling Tutti Frutti.

`OPEN` before the corresponding implementation increment:

* default letter pool;
* review layout;
* whether challenges are resolved sequentially or in parallel;
* eligibility and timeout during challenge voting when presence changes;
* early-close eligibility when presence changes;
* who may initiate a rematch and whether that action is host-only;
* whether previous configuration is preselected;
* what happens when someone leaves between matches;
* exact post-game lobby presentation and actions.
