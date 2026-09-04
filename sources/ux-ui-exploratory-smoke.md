# UX/UI Exploratory Smoke

## 1. Purpose

This document is the living operational source for the local, multi-session
UX/UI exploratory smoke of Juegos Familiares / Impostor.

The smoke is intended to detect observable friction in the implemented mobile
interface before the formal pre-beta acceptance run with four physical
devices. It uses a small sample because its purpose is to find UX/UI problems
that do not require exhaustive device coverage: unclear flow, misplaced or
competing actions, weak hierarchy, excessive visual weight, density, scrolling,
copy, feedback, and inconsistent surfaces. It does not prove technical
contracts or device compatibility.

Questions worth asking include:

- Where does the user expect to find the next action?
- Which CTA dominates, and should it dominate at that moment?
- Does secondary information occupy too much space?
- Is the main action pushed below the fold?
- Are create, join, and return-to-Room actions distinguishable?
- Does the screen explain whether the actor should act or wait?
- Does the phone become unnecessarily prominent during discussion?
- Do round result, scoreboard, and Finished present the right visual order?

This document may progressively contain:

- operational preparation and environment details;
- the executable smoke runbook;
- execution notes and UX observations;
- KEEP, POLISH, INVESTIGATE, and DEFER classification;
- post-run triage and any approved polish;
- a replacement candidate baseline if code changes;
- the subsequent P0 and focused regression smoke;
- closure and the hand-off to formal pre-beta acceptance.

## 2. Relationship to Pre-Beta Acceptance

The activities are distinct:

```text
UX/UI EXPLORATORY SMOKE
!=
N1
!=
PRE-BETA ACCEPTANCE
```

This smoke does not complete S1-S8, N1, C1-C10, R1-R4, U1, E1, or D1. It does
not produce an acceptance `PASS` or `FAIL`, and it does not replace
`sources/pre-beta-manual-acceptance.md` or
`sources/pre-beta-manual-acceptance-runbook.md`.

The required sequence is:

```text
stable baseline
-> local UX/UI exploratory smoke
-> findings classification
-> scoped polish, if justified and approved
-> new SHA if code changes
-> P0 and focused smoke
-> formal pre-beta acceptance with four physical devices
```

Observations from this smoke must remain separate from the formal acceptance
runbook.

Formal acceptance remains responsible for validating Android and iOS devices,
installed and browser PWA use, physical multi-actor behavior, recovery,
background and reconnect behavior, Presence and liveness, host succession,
native share and clipboard behavior, PWA update, and physical privacy and
consistency. Using an available physical device during this exploratory smoke
does not reduce that later scope.

## 3. Baseline

Reference product-code baseline:

```text
a064ce2c38abe4502b8c11ceeb9be5b7187aea62
```

Repository state inspected during the operational preflight:

```text
Date: 2026-09-03
Branch: main
HEAD: cc3b72dca5de (Align pre-beta documentation baseline)
```

The current HEAD contains documentation alignment after the reference
product-code baseline. If the exploratory smoke later leads to a code change,
record the new candidate SHA in section 18 and do not automatically treat the
reference baseline as the final candidate.

## 4. Scope

The smoke may observe:

- whether the next action is evident;
- visual hierarchy;
- comprehension of location, phase, and available actions;
- copy;
- approximate touch ergonomics in a desktop mobile viewport;
- density, reflow, and scrolling;
- feedback and waiting states;
- host and non-host consistency;
- transitions between gameplay phases;
- how prominent or discreet the phone is in each phase.

Independent actors in isolated browser sessions are used to move authoritative
state and reach real gameplay phases. Different browsers, separate browser
profiles, or a physical device may provide that isolation. This does not make
the run formal multi-actor evidence.

The expected output is a small set of observed findings, KEEP items, and open
questions that can be triaged after the run. Only approved, low-risk
presentational improvements may proceed to polish before a new SHA, P0, a
focused smoke, and the unchanged formal acceptance protocol.

## 5. Out of Scope

Do not use this smoke to validate:

- any formal pre-beta acceptance scenario or result;
- natural four-person playtesting or N1;
- physical privacy between four phones;
- backend authority, RLS, permissions, or technical contracts;
- Presence, liveness, host succession, recovery, or synchronization as formal
  criteria;
- Android Chrome or iOS Safari behavior;
- installed PWA behavior or PWA updates;
- native Web Share;
- physical background, lock, reconnect, or network behavior;
- a real mobile keyboard or real touch ergonomics;
- offline gameplay or network performance;
- new game rules, permissions, or backend behavior.

## 6. Environment

Operational preflight environment:

| Item | Recorded state |
| --- | --- |
| Application URL | `http://localhost:3000` |
| Supabase API URL | `http://127.0.0.1:54321` |
| Supabase database | Local Postgres on port `54322` |
| Supabase API health | HTTP 200 |
| Database connectivity | Read-only aggregate query succeeded |
| Application health | `GET /` returned HTTP 200 |
| Application process | Existing Next.js development server, PID 18915 |
| Application log | `.next/dev/logs/next-development.log` |
| Primary viewport | `390 x 844` CSS pixels |
| Current PC LAN address | `192.168.0.71` at inspection time; dynamically assigned |

Supabase was stopped at the beginning of the preflight and was started with
the repository command `npm run supabase:start`. The services excluded by that
documented reduced-stack command remain stopped by design. The API and
database services required by this smoke are available.

For the executed smoke, both Next and local Supabase were made accessible over
the LAN so that the Motorola could participate as a real fourth actor. This
temporarily required:

- `NEXT_PUBLIC_SUPABASE_URL` pointing to the PC's LAN address;
- `allowedDevOrigins` for `192.168.0.71` in the Next development setup.

These were environment-preparation steps, not UX findings about the product.

## 7. Actors

Required aliases and currently available surfaces:

| Alias | Browser/device | Intended use | Current readiness |
| --- | --- | --- | --- |
| A | Chromium on the PC | Platform admin, initial Group admin, initial Room host, and primary UX surface at `390 x 844` | Participated as `admin-chromium` |
| B | Firefox on the same PC | Independent guest session and helper actor | Participated as `guest-firefox` |
| C | Brave on the same PC | Independent guest session and helper actor | Participated as `guest-brave` |
| D | Motorola g15 | Independent guest and physical mobile actor | Participated as `guest-motorola` against the complete local stack over LAN |
| E | iPad with Safari | Optional physical spot-check only | Not required for smoke readiness |

If D cannot use the full local stack, replace it temporarily with another
isolated desktop session. Four Chromium profiles are one valid alternative,
but they are not a requirement.

Aliases describe smoke roles only. Do not record the identity of the impostor,
private words, individual votes, tokens, cookies, invitation codes, or Room
codes.

## 8. Operational Preflight

### Git

Initial read-only inspection:

```text
Branch: main
HEAD: cc3b72dca5de

 M sources/implementation-plan.md
 M sources/pre-beta-manual-acceptance-runbook.md
 M sources/pre-beta-manual-acceptance.md
?? sources/technical-narrative.md
```

The pre-existing changes are Markdown documentation only. No tracked product
code, test, or migration change was detected. This document is the only file
created by the current task. No files were staged, committed, restored, reset,
or switched to another branch.

### Supabase

```text
Initial state: stopped
Action: npm run supabase:start
Current required-service state: healthy
API URL: http://127.0.0.1:54321
API check: HTTP 200
Database port: 54322
Database check: read-only aggregate query succeeded
Reset performed: no
```

Storage, Studio, Mailpit, image processing, Postgres Meta, Edge Runtime,
analytics, Vector, and the pooler are excluded by the repository's local start
command and are not required for this smoke.

### Environment variables

`.env.local` was inspected without printing key values:

```text
NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
Points to local Supabase: yes
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: present
Environment file modified during initial preflight: no
```

Do not copy local key values into this document or into smoke evidence.

Before execution, `NEXT_PUBLIC_SUPABASE_URL` was temporarily changed to the
PC's LAN address so the Motorola browser could reach local Supabase. No key
value is retained here.

### Local app

```text
Expected URL: http://localhost:3000
Existing development server: yes
GET /: HTTP 200
Initial page content: Juegos Familiares rendered
Initial compilation error observed: no
```

An attempted start detected the existing server and did not leave a duplicate
server running on port 3001.

### Product data state

The local database is operationally empty for this smoke. A read-only aggregate
inspection found technical-validator fixtures, but no reusable product setup.
Fixtures are not accepted as smoke actors or product data because they do not
establish independent browser sessions and do not satisfy the complete
preparation gate.

No word content, Room code, invitation code, private role, or individual vote
was read or recorded. No data was created, updated, deleted, or reset.

Preparation must create, through the documented local tooling and real product
UI:

1. actor A and A's anonymous Auth;
2. A's local-only platform-admin grant;
3. a disposable Group;
4. independent B/C/D actors;
5. membership of B/C/D in that Group;
6. at least four non-sensitive words;
7. a verified state with no active Room.

Do not reset the database and do not create product rows directly with SQL.

### Create A and grant local platform admin

The following workflow was checked against `README.md`, `package.json`,
`supabase/scripts/local-make-platform-admin.mjs`, its tests, and the current
Auth/Group UI implementation.

#### A. Open session A

Use a clean or already verified Chromium profile. The detected candidate is:

```text
Executable: /snap/bin/chromium
Profile root: /home/ramiro/snap/chromium/common/chromium
Detected profile: Profile 1 (display name: Ramiro)
```

Open it with:

```bash
/snap/bin/chromium --profile-directory="Profile 1" http://localhost:3000/impostor
```

If the profile contains a stale local session that no longer corresponds to
the current local database, use a clean Chromium profile for A. Do not treat a
stale browser identity as a reusable actor.

#### B. Create anonymous Auth

Rendering `/` or `/impostor` does not create Auth. In `/impostor`:

1. select `Unirme a un grupo`;
2. enter a deliberately nonexistent invitation code and select `Continuar`;
3. allow the expected “group not found” result.

The implementation calls `ensureAnonymousAuthIdentity()` before trying to
resolve the invitation, so this real product intention creates or reuses A's
anonymous Auth without creating a Group or Player.

#### C. Obtain A's auth user ID

Immediately after the action, with no concurrent local onboarding, use the
existing README method:

```bash
psql "$(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')" \
  --quiet \
  --tuples-only \
  --no-align \
  --command "select id, created_at from auth.users order by created_at desc limit 5;"
```

Identify the UUID by its creation time. If the newest row is ambiguous, stop
and repeat the identification under controlled conditions; do not guess. Do
not record the UUID in this guide or in smoke evidence, and do not inspect or
copy tokens.

#### D. Grant local platform admin

Run exactly:

```bash
npm run local:make-platform-admin -- <auth-user-id>
```

The script accepts exactly one UUID, checks that both Supabase API and database
hosts are loopback/local, verifies that `auth.users.id` exists, and inserts the
grant idempotently. Expected output is either:

```text
Platform admin local habilitado para <auth-user-id>
```

or, on a safe repeat:

```text
Platform admin local ya estaba habilitado para <auth-user-id>
```

Never bypass the locality checks or use this workflow against a remote project.

#### E. Refresh A

Refresh or reopen `http://localhost:3000/impostor` in the same Chromium profile.
Wait for the platform-permissions check. `Crear grupo` should now appear next
to `Unirme a un grupo`.

#### F. Create the disposable Group

1. Select `Crear grupo`.
2. Enter A's chosen test nickname.
3. Use the Group name `UX Smoke Test`.
4. Submit `Crear grupo`.

This UI action creates the Player and Group and assigns A as initial Group
admin. Do not create them directly in SQL.

#### G. Verify A and the Group

From the UI, verify:

- A is recognized and the `UX Smoke Test` Group is shown;
- A appears as `Admin` in the member list;
- A can select `Invitar personas` and obtain the active invitation;
- the `Jugar` section offers `Unirme a una sala` and `Crear sala`, rather than
  `Volver a la sala` or `Volver a la partida`.

Do not copy an invitation code into this guide. Pass the invitation directly
to the isolated guest sessions during preparation.

### Prepare B, C, and D

#### B — Firefox

1. Open Firefox as its own browser session at the Group invitation URL from A.
2. Select `Continuar`.
3. Enter B's test nickname and select `Unirme`.
4. Verify that the Group name is shown.

Firefox is installed at `/usr/bin/firefox`. Its browser storage is independent
from Chromium and Brave; do not sign B in from A's browser profile.

#### C — Brave

1. Open Brave as its own browser session at the Group invitation URL from A.
2. Select `Continuar`.
3. Enter C's test nickname and select `Unirme`.
4. Verify that the Group name is shown.

Brave is installed at `/snap/bin/brave`. Its browser storage is independent
from Chromium and Firefox.

#### D — Motorola g15 or desktop substitute

If the Motorola has full access to the local application and Supabase endpoint:

1. open A's Group invitation URL in the Motorola browser;
2. select `Continuar`;
3. enter D's test nickname and select `Unirme`;
4. verify that the Group name is shown.

At preflight time the complete Motorola flow required additional preparation.
The LAN configuration described in section 6 was later applied, and the
Motorola participated as D throughout the executed smoke. B/C/D were not made
platform admins.

#### Final actor verification

Return to A's Group view and confirm that A, B, C, and D appear as four members
of the same Group. Then confirm:

- no active Room is shown for any actor;
- at least four words are available;
- all four sessions remain independent.

Four words are recommended even though two rounds require a technical minimum
of two. The margin avoids blocking the smoke because of prior selection or
unexpected state. Create all words through the word-bank UI and do not record
their content here.

### Isolated sessions

The repository documents persistent Chromium profiles as one isolation
workflow, but this smoke uses browser-level isolation:

```text
A -> Chromium
B -> Firefox
C -> Brave
D -> Motorola g15 or isolated desktop substitute
E -> iPad Safari, optional
```

Separate Chromium profiles remain an acceptable substitute. Do not use normal
tabs in the same browser profile as independent actors. If a temporary private
session is used as a substitute, keep it open for the complete smoke.

### Physical-device access to the local environment

The PC's LAN address can be obtained immediately before the run with:

```bash
ip -4 route get 1.1.1.1
```

Use the `src` address on the active LAN interface. At preflight time it was
`192.168.0.71`, but it is dynamically assigned and must be rechecked.

The current listeners include Next on port `3000`, Supabase API on `54321`, and
local Postgres on `54322`. Subject to the same Wi-Fi/LAN and firewall rules, the
Motorola may be able to load Next at:

```text
http://<PC-LAN-IP>:3000
```

That page load was not sufficient for the full application. The initial
`.env.local` builds the browser client with:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

On the Motorola, `127.0.0.1` and `localhost` refer to the Motorola itself, not
the PC. Client-side Auth and data calls therefore cannot reach the PC's
Supabase through the current URL, even if the Next page loads over LAN.

For the executed smoke, the public Supabase URL temporarily used the PC's LAN
address and Next allowed the observed development origin. This enabled the
Motorola to participate throughout the two-round path as the fourth isolated
actor. That participation remains exploratory evidence only and provides no
formal acceptance result.

### Viewport

For the single browser surface being observed in depth:

1. Open Chromium DevTools (`F12` or `Ctrl+Shift+I`).
2. Toggle the device toolbar (`Ctrl+Shift+M`).
3. Select **Responsive** dimensions.
4. Set width to `390` and height to `844`.
5. Keep page zoom at a value that allows the complete emulated viewport to be
   inspected without changing its CSS dimensions.
6. Confirm the displayed dimensions before beginning the smoke.

This desktop viewport does not equal a physical phone. It does not validate a
real mobile keyboard, real touch ergonomics, mobile browser behavior, or an
installed PWA.

### Preflight verdict

```text
SMOKE EXECUTED
```

Satisfied during execution:

- local Supabase and Next were reachable over LAN by the Motorola;
- the local application responded for all four actors;
- Chromium, Firefox, Brave, and the Motorola provided isolated sessions;
- A/B/C/D belonged to the same disposable Group;
- four words were available without recording their content as evidence;
- two complete rounds were traversed with four simultaneous actors.

No formal pre-beta acceptance scenario was executed or assigned `PASS` or
`FAIL`.

## 9. Smoke Method

At every stable checkpoint:

1. Look at the screen for 5-10 seconds without consulting the checklist.
2. Record only spontaneous doubts or reactions.
3. Review:
   - next action;
   - hierarchy;
   - comprehension;
   - approximate ergonomics;
   - density;
   - feedback.
4. Continue without discussing solutions.

Keep observation, diagnosis, and solution separate:

```text
observe
-> record evidence
-> complete the run
-> diagnose
-> classify
-> propose a solution only if justified
```

The beginning of the run is natural only in the limited sense that no outcome
is being forced. The run becomes controlled when the operator starts directing
votes to create the required gameplay branch. Do not use observations from the
controlled segment as evidence of natural player behavior.

A is the primary UX surface when its perspective is sufficient. Use B/C/D
mainly to advance shared state. Change the observed surface only when the
perspective is materially different:

| Surface | Perspectives to observe |
| --- | --- |
| Join | Guest |
| Lobby | Host and guest |
| Reveal | Normal player and impostor |
| Discussion | Host and guest |
| Voting | One actor |
| Tie discussion | Host and guest |
| Guess | Impostor and normal player |
| Scoreboard | Host and guest |
| Finished | One actor |

Do not inspect every screen in every browser or device.

## 10. Operational Runbook

### Preparation

- [ ] Localhost and local Supabase are available.
- [ ] A/B/C/D have isolated sessions and are recognized in the same Group.
- [ ] No actor has an active Room.
- [ ] At least four words are available.
- [ ] A is open in Chromium; B in Firefox; C in Brave; D on Motorola or in an
      isolated desktop substitute.
- [ ] A uses `390 x 844` when it is the primary observed surface.
- [ ] Motorola access is ready or the desktop substitute for D is open.
- [ ] Notes are separate from formal acceptance evidence.
- [ ] No acceptance `PASS` or `FAIL` will be recorded.
- [ ] No secrets, private words, roles, individual votes, or active codes will
      be captured.

### Entry

- [ ] A: `/` -> natural CTA -> `/impostor/grupo`.
- [ ] Observe the Group surface.
- [ ] Open the word bank, add one non-sensitive word, and return.
- [ ] A creates a Room.
- [ ] B performs one observed join.
- [ ] C/D join mechanically.

### Lobby

- [ ] Observe the HOST lobby.
- [ ] Observe the NON-HOST lobby.
- [ ] If Motorola access is available, optionally spot-check physical size,
      scroll, wrapping, hierarchy, and legibility; do not repeat the full lobby
      flow.

### Round 1

- [ ] Start the session.
- [ ] Observe one NORMAL reveal.
- [ ] Observe the IMPOSTOR reveal.
- [ ] Observe the HOST control.
- [ ] Observe discussion as NON-HOST.
- [ ] Observe discussion as HOST.
- [ ] Reveal and hide the private view during discussion.
- [ ] Observe voting before and after B submits a vote.

### Controlled segment

From this point forward the run is controlled, not natural:

- [ ] Direct a 2-2 tie that includes the impostor.
- [ ] Observe tie discussion as NON-HOST.
- [ ] Observe tie discussion as HOST.
- [ ] Start the second vote.
- [ ] Make the impostor the unique top-voted player.
- [ ] Observe the guess screen as IMPOSTOR.
- [ ] Observe the waiting screen as a NORMAL player.
- [ ] Submit a deliberately incorrect, non-sensitive guess.
- [ ] Observe the result only if it remains visible.
- [ ] Observe the scoreboard as HOST and NON-HOST.

Do not record which actor is the impostor or the text of the secret word or
guess.

### Round 2

- [ ] HOST starts `Nueva ronda`.
- [ ] A guest sees the new round and hidden reveal.
- [ ] Resolve the round quickly only to return to the scoreboard.
- [ ] Do not derive additional UX conclusions from voting or scoring in this
      operational segment.
- [ ] Return to the scoreboard.
- [ ] HOST selects `Terminar tanda`.
- [ ] Observe the confirmation.

### Finished

- [ ] Observe Finished in one actor surface.
- [ ] Select `Volver al grupo`.
- [ ] Separate Findings, KEEP items, and Open Questions.
- [ ] Classify only after the run.
- [ ] Do not copy results into the formal acceptance runbook.
- [ ] Decide separately whether any POLISH candidate passes the gate in section
      16.

### Optional physical spot-checks

If the Motorola is functional against the complete local environment, use it
only for high-value spot-checks on:

- `/`;
- Group;
- lobby;
- voting;
- scoreboard.

Observe physical size, scroll, wrapping, hierarchy, and legibility. Do not
repeat the complete session on the Motorola by default. The iPad may provide
the same spot-checks, but it is optional. Neither device completes S2, N1,
Android or iOS acceptance, PWA installation, native share, background/reconnect,
formal ergonomics, or any acceptance `PASS`.

### Executed path — 2026-09-03

The real smoke used `admin-chromium`, `guest-firefox`, `guest-brave`, and
`guest-motorola` as four simultaneous isolated actors. The Motorola
participated throughout the path rather than only as an optional spot-check.

The run traversed:

```text
/
-> /impostor
-> Group invitation and guest incorporation
-> /impostor/grupo
-> word bank
-> Room creation and four-player lobby
-> round 1 reveal and discussion
-> first vote and controlled 2-2 tie
-> second vote
-> correctly identified impostor and final attempt
-> round scoreboard
-> Nueva ronda
-> round 2 and accumulated scoreboard
-> Terminar tanda
-> final result
-> Volver al grupo
-> /impostor/grupo
```

The setup used a disposable Group and four available words. No word content,
role assignment, individual vote, Room code, or invitation code is retained as
evidence. This was not formal pre-beta acceptance and produced no scenario
`PASS` or `FAIL`.

## 11. Observation Template

Copy this template for each observation:

```text
UX-XX

Moment/screen:
Viewport:
Actor/session/perspective:
Type: spontaneous | systematic review | controlled segment

Trying to:
Expected:
Basis for expectation:
Observed:
Consequence or friction:
Evidence/repetition:

Classification:
KEEP | POLISH | INVESTIGATE | DEFER

Severity:
HIGH | MEDIUM | LOW | N/A

Confidence:
HIGH | MEDIUM | LOW
```

Recording rules:

- `Observed` contains facts.
- `Expected` is an expectation, not sufficient evidence.
- `Consequence or friction` states the doubt, error, delay, scrolling, or effort
  produced.
- Do not include a solution during initial capture.
- KEEP uses severity `N/A`.
- A preference without an observable consequence belongs in Open Questions /
  DEFER, not in confirmed findings.

## 12. Findings

### UX-01 — Platform home does not make the game the primary destination

```text
Moment/screen: /
Viewport: Mobile-first exploratory surfaces
Actor/session/perspective: Signed-in Group member
Type: systematic review

Trying to: Continue from the platform home into the available game experience.
Expected: The game and its next action have clear visual priority.
Basis for expectation: Impostor is currently the playable game on the platform.
Observed: The user name and Group context carry substantial visual weight. The
  "Ir al juego del grupo" CTA is ambiguous, the Impostor card has no CTA, and
  the game does not feel like the protagonist of the screen.
Consequence or friction: The user must infer where the game begins and how the
  Group-level CTA relates to it.
Evidence/repetition: Observed on the entry path used for the smoke.

Classification: POLISH
Severity: MEDIUM
Confidence: HIGH
```

Possible directions to evaluate later are reducing the visual weight of Group
context, clarifying access to the Group, and adding relevant create/join actions
to the Impostor card. These are hypotheses, not approved solutions.

### UX-02 — Impostor entry mixes game and Group context

```text
Moment/screen: /impostor
Viewport: Mobile-first exploratory surfaces
Actor/session/perspective: Group member
Type: systematic review

Trying to: Understand the game and choose how to begin playing.
Expected: A clear hierarchy around Impostor and its primary entry actions.
Basis for expectation: The route is the entry surface for the game.
Observed: Game information and Group context compete in the same hierarchy.
Consequence or friction: The purpose of the screen and the next game action
  require more interpretation than expected.
Evidence/repetition: Observed during both direct entry and post-invitation
  navigation.

Classification: POLISH
Severity: MEDIUM
Confidence: HIGH
```

A game-centered surface with a brief explanation and clear create/join actions
is a direction to explore, not a final product decision.

### UX-03 — Successful invitation join has weak continuity

```text
Moment/screen: Invitation -> join -> /impostor -> /impostor/grupo
Viewport: Guest browser and physical mobile surfaces
Actor/session/perspective: Newly joined guest
Type: spontaneous

Trying to: Join the Group and continue to the relevant Group experience.
Expected: Clear confirmation of success and an evident next step.
Basis for expectation: Joining changes membership and should establish the
  user's new context.
Observed: Success feedback is weak. After joining, the guest reaches /impostor,
  must interpret "Ir al juego del grupo", and only then reaches
  /impostor/grupo.
Consequence or friction: The guest is uncertain whether joining completed and
  what action continues the flow.
Evidence/repetition: Observed during guest incorporation in the real smoke.

Classification: POLISH
Severity: MEDIUM
Confidence: HIGH
```

This classification does not approve a routing change. Any proposal that
changes routing must be investigated outside the polish gate.

### UX-04 — Reveal state has unclear sequencing and generic copy

```text
Moment/screen: Pre-round role/private-information reveal
Viewport: Host and guest surfaces, including physical mobile
Actor/session/perspective: Host, normal player, and impostor
Type: spontaneous

Trying to: Learn the private information and understand what happens before the
  round starts.
Expected: Clear actor-specific sequencing between reveal, readiness, and the
  host-controlled start.
Basis for expectation: The screen contains shoulder-sensitive game information
  and different host/guest responsibilities.
Observed: All actors see "Tu rol está listo" and the generic "Ver mi rol" CTA.
  The host also receives "Empezar ronda", but the relationship between both
  actions is not explained. Guests do not know what to do after revealing or
  whether they are waiting for the host.
Consequence or friction: Actors are uncertain about readiness and who controls
  the next transition.
Evidence/repetition: Observed from host, normal-player, and impostor
  perspectives during the completed run.

Classification: POLISH
Severity: HIGH
Confidence: HIGH
```

Exact CTA wording remains for triage; a name such as "Ver palabra" is not
approved by this record.

### UX-05 — Revealed private information cannot be concealed again

```text
Moment/screen: Revealed role/private-information state
Viewport: Host and guest surfaces, including physical mobile
Actor/session/perspective: Normal player and impostor
Type: spontaneous

Trying to: Protect private game information after reading it.
Expected: To be determined; the device should not unnecessarily keep private
  information exposed.
Basis for expectation: Players handle the phone around other participants.
Observed: Once revealed, neither a normal player's information nor "Sos el
  impostor" can be hidden again.
Consequence or friction: Private information remains visible with no clear
  action to return it to a concealed state.
Evidence/repetition: Observed for both normal-player and impostor perspectives.

Classification: INVESTIGATE
Severity: HIGH
Confidence: HIGH
```

The interaction and its wording remain unresolved. This finding is separated
from copy and hierarchy polish because it affects privacy behavior.

### UX-06 — Guest waiting states do not explain host-controlled transitions

```text
Moment/screen: Pre-round and discussion transitions
Viewport: Guest browser and physical mobile surfaces
Actor/session/perspective: Guest
Type: spontaneous

Trying to: Understand whether the guest has completed their part and what will
  happen next.
Expected: Immediate feedback about the current state, the controlling actor,
  and the next transition.
Basis for expectation: Guests cannot perform host-only actions.
Observed: Some host actions do not immediately change the guest screen. For
  example, after the host selects "Empezar ronda", guests remain on the same
  screen until the host later advances to voting.
Consequence or friction: Guests cannot tell whether they are done, waiting, or
  missing an action of their own.
Evidence/repetition: Observed across isolated guest sessions.

Classification: POLISH
Severity: MEDIUM
Confidence: HIGH
```

### UX-07 — Tie screen hierarchy can be refined

```text
Moment/screen: 2-2 tie after the first vote
Viewport: Host and guest surfaces
Actor/session/perspective: Multiple actors
Type: controlled segment

Trying to: Understand the tie and continue to the second vote.
Expected: Required tie information and next-step hierarchy are easy to scan.
Basis for expectation: The tie introduces an extra game phase.
Observed: The screen was understandable and contained the necessary
  information, but its visual weights and density can be improved.
Consequence or friction: The content takes slightly more effort to scan than
  its functional simplicity requires.
Evidence/repetition: Observed during the controlled 2-2 branch.

Classification: POLISH
Severity: LOW
Confidence: HIGH
```

### UX-08 — Round result and scoreboard compete for visual priority

```text
Moment/screen: Round result / accumulated scoreboard
Viewport: Host and guest surfaces
Actor/session/perspective: Multiple actors
Type: systematic review

Trying to: Understand the round outcome and current session standing.
Expected: The round narrative and accumulated score have an intentional visual
  order.
Basis for expectation: The screen combines several distinct result layers.
Observed: The round winner, actual impostor, secret-word result, impostor's
  attempt, and accumulated scoreboard all compete visually. The required
  functional information is present.
Consequence or friction: The user must work harder to identify the intended
  reading order.
Evidence/repetition: Observed after both completed rounds.

Classification: POLISH
Severity: LOW
Confidence: HIGH
```

### UX-09 — Final-result headline outweighs the supporting result

```text
Moment/screen: Final result
Viewport: Multiple actor surfaces
Actor/session/perspective: Session participant
Type: systematic review

Trying to: Understand the final classification and leave the session.
Expected: A balanced hierarchy between the winner/tie, classification, and
  next action.
Basis for expectation: The screen closes the complete session.
Observed: The result and classification are understandable and "Volver al
  grupo" is clear, but the winner/tie headline has very large visual weight
  relative to the rest.
Consequence or friction: Supporting result information is visually diminished.
Evidence/repetition: Observed at the end of the two-round session.

Classification: POLISH
Severity: LOW
Confidence: HIGH
```

### UX-10 — Returning from the final result feels abrupt

```text
Moment/screen: Final result -> /impostor/grupo
Viewport: Session participant surface
Actor/session/perspective: Participant leaving the finished session
Type: spontaneous

Trying to: Return to the Group after finishing the session.
Expected: A clear action with perceptible continuity into the Group context.
Basis for expectation: The destination retains the same social context.
Observed: "Volver al grupo" routes correctly to /impostor/grupo, but the
  transition feels abrupt and provides little continuity or feedback.
Consequence or friction: The destination change feels disconnected even though
  it is functionally correct.
Evidence/repetition: Observed on the completed exit path.

Classification: POLISH
Severity: LOW
Confidence: MEDIUM
```

### UX-11 — Group admin cannot remove another participant's word

```text
Moment/screen: Group word bank
Viewport: Group administration surface
Actor/session/perspective: Group admin
Type: systematic review

Trying to: Maintain the shared word bank before play.
Expected: To be determined as a Group permission/product rule.
Basis for expectation: Duplicates, spelling errors, and problematic
  contributions may require moderation.
Observed: Each participant can remove only their own words; the Group admin
  cannot remove words contributed by another participant.
Consequence or friction: The admin cannot directly resolve those maintenance
  cases before play.
Evidence/repetition: Observed against the implemented word-bank behavior.

Classification: INVESTIGATE
Severity: MEDIUM
Confidence: HIGH
```

This is a permissions and product-rule question, not visual polish. No change
is approved or implemented by this finding.

### UX-12 — Closed-vote results do not expose vote detail

```text
Moment/screen: Result after voting closes
Viewport: Participant surfaces
Actor/session/perspective: Session participant
Type: controlled segment

Trying to: Understand how the group arrived at the voting result.
Expected: To be decided; vote secrecy may or may not end when voting closes.
Basis for expectation: Per-player votes and totals could help explain the
  result after secrecy is no longer needed.
Observed: The final voting outcome is shown, but not who voted for whom.
Consequence or friction: Participants cannot reconstruct the vote distribution
  beyond the displayed outcome.
Evidence/repetition: Observed after the completed voting branches.

Classification: INVESTIGATE
Severity: LOW
Confidence: HIGH
```

Whether to show votes by player, totals, both, or neither is an unresolved
product and privacy decision.

## 13. KEEP

The following behaviors worked as expected during this exploratory run. They
are not formal acceptance results:

- `KEEP-01`: Four isolated actors coexisted correctly in the Group and Room.
- `KEEP-02`: All four actors appeared as connected in the lobby.
- `KEEP-03`: The minimum of three active players to start was enforced.
- `KEEP-04`: The lobby -> game -> voting flow completed correctly.
- `KEEP-05`: A controlled 2-2 tie led correctly to a second vote.
- `KEEP-06`: The second vote completed correctly.
- `KEEP-07`: The uniquely top-voted impostor received the final attempt.
- `KEEP-08`: The final-attempt comparison was case-insensitive: an uppercase
  variant of the secret word was accepted. The word itself is not retained as
  evidence.
- `KEEP-09`: The accumulated scoreboard updated correctly.
- `KEEP-10`: `Nueva ronda` moved all actors into a new round.
- `KEEP-11`: `Terminar tanda` produced the final result correctly.
- `KEEP-12`: The final result was consistent across devices.
- `KEEP-13`: `Volver al grupo` routed correctly to `/impostor/grupo`.

## 14. Open Questions

### OQ-01 — Revalidate native copy/share controls in Preview HTTPS

Some invitation copy/share controls did not work in the local HTTP environment.
This is not a confirmed product bug because secure-context requirements, the
Web Share API, or the Clipboard API may explain the behavior.

```text
Classification: DEFER
Priority: Revalidate in Preview HTTPS; do not prioritize as a local UX defect.
```

### OQ-02 — Offer a control to copy only the invitation code

Copying only the invitation code appeared potentially useful, but its absence
did not block the smoke or produce material friction.

```text
Classification: DEFER
Priority: LOW
```

## 15. Triage

Post-smoke triage has not yet been performed. Each finding will be evaluated
using:

1. observable friction;
2. consequence;
3. evidence;
4. scope;
5. product-decision impact;
6. technical risk;
7. focused regression needed.

The current intent is to correct before formal acceptance everything that is
justifiable, sufficiently understood, and has controllable risk. This intent is
not an approved implementation plan.

Triage must keep visual polish separate from permission or rule changes. A
preference alone does not authorize implementation, and functional changes
require their own investigation and plan. Any product-code change creates a
new candidate SHA and requires the corresponding revalidation before formal
acceptance.

## 16. Polish Gate

A change may be proposed before N1 only when all of the following are true:

```text
observable friction with a consequence
+ sufficiently clear evidence
+ diagnosis after initial capture
+ a small presentational solution
+ no new product decision
+ no change to routing, phases, authority, permissions, privacy, or data
+ low technical risk
+ a defined focused validation
```

If any condition is uncertain, classify the item as INVESTIGATE or DEFER.

Do not implement polish during the exploratory run. Any later implementation
requires its own authorization and must preserve the repository workflow: a
separate branch and commit, a new candidate SHA and Preview if code changes,
then P0 and a focused smoke before formal acceptance.

## 17. Approved Polish

<!-- Intentionally empty until polish is explicitly approved. -->

## 18. Candidate Baseline After Polish

<!-- Intentionally empty unless approved polish changes product code. -->

## 19. P0 and Focused Regression Smoke

<!-- Intentionally empty until a new code candidate exists. -->

## 20. Closure

<!-- Intentionally empty until this exploratory workflow is closed. -->
