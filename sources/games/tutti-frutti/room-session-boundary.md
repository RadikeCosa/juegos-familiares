# Room ↔ Session boundary for Impostor and Tutti Frutti

## Purpose and status

This design records the proposed boundary for two games. The implementation
contract is in `technical-requirements.md` and the physical proposal is in
`physical-data-model.md`. `CONFIRMED` marks
product decisions in `product-decisions.md`; `RECOMMENDED` marks architecture
to validate during technical design; `OPEN` marks decisions not yet made. It
does not describe an implemented multi-game platform or prescribe SQL.

## Evidence from the current repository

`rooms` has `group_id`, `join_code`, `host_player_id`, immutable `game_type`, and
`lobby | playing | closed`. Historical Rooms are backfilled as `impostor`, and
the legacy zero-argument create still creates Impostor Rooms.
`player_active_room_slots` permits one active Room per Player.
`get_my_active_room()` returns the authorized Room's game identity with its
coordination fields and participants. The local Increment 1 branch adds typed
create/join and minimal game-aware routing; Tutti Frutti lobby and gameplay
are not implemented yet. The current `game_sessions.state` holds
Impostor phases and permits only one session per Room; `session_players`
includes Impostor scoring data. Impostor's `end_session()` closes its Room.
These facts come from the current migrations and client, not a verified remote
database.

## Ownership

| Concept | Owns | Does not own |
| --- | --- | --- |
| Group and Player | Authenticated social identity. | Game rules. |
| Room | Game identity, Group, host, participant membership, active-room coordination, and `lobby | playing | closed`. | Roles, letters, answers, rounds, challenge votes, or gameplay phase. |
| Presence and liveness | Ephemeral connectivity and recent-activity evidence scoped to the Room. | Session participation or completed answers. |
| Minimal session identity (`RECOMMENDED`) | One playthrough, its Room, roster, and start/finish identity. | Impostor or Tutti Frutti gameplay state. |
| Game-specific session | Configuration, phases, rules, private state, and scoring of that game. | Cross-game room membership. |

`RoomParticipant` means membership in the Room. A session participant means a
place in one match's frozen roster. A temporary disconnect changes neither
membership nor past game actions. The current `session_players` is not a
game-neutral implementation of that distinction.

## Game identity and active Room

`CONFIRMED`: people choose their game before creating or joining a Room; a
Tutti Frutti Room belongs to Tutti Frutti. `RECOMMENDED`: the Room's game
identity is immutable and server-enforced. Creation, join, discovery, routing,
authorization, and reconnect must agree on that identity. A code for the other
game cannot silently enter or convert a Room. The current one-active-Room
rule should remain global until a real product need challenges it.

The active-room read model needs Room identity, code, game type, and lifecycle
status so the client can choose the correct game loader. It must not become a
universal gameplay read model.

## Lifecycle boundary

`lobby`, `playing`, and `closed` remain coordination states. Impostor phases
such as role reveal and voting, and Tutti Frutti phases such as countdown and
review, remain inside their respective sessions.

`CONFIRMED` for Tutti Frutti:

```text
final round scored
  → current Tutti Frutti Session FINISHED and immutable
  → same Room playing → lobby, retaining its participants
  → rematch starts a distinct Session in that Room
```

The session finish and Room return must be one authoritative consistent
transition. A new session freezes a new roster and configuration snapshot;
previous configuration may only be offered as a UI convenience. Room closing
is a separate action. Impostor retains its current session-finish and
Room-close transition.

`OPEN`: who initiates a rematch, whether initiation is host-only, whether
previous configuration is preselected, departures between matches, and the
exact post-game lobby experience.

## Start, host, reconnect, and Realtime

At start, shared coordination verifies actor, host, Room, game identity, and
absence of another active session. The game validates its own prerequisites
and creates its own state. Roster freeze, game-state creation, active-session
association, and `lobby → playing` must be transactionally consistent.

Host ownership belongs to Room. **CONFIRMED:** in `lobby`, a liveness-valid
RoomParticipant may succeed a stale host. In `playing`, the successor must
also belong to the active session's frozen roster. The server verifies stale
host and candidate liveness, then chooses deterministically and changes only
Room host authority. Presence cannot decide the transfer. The old host does
not automatically regain authority on reconnect; if no candidate qualifies,
host-only actions may wait. The future shared guard must use the minimal
shared roster rather than Impostor's `session_players`. The versioned Impostor
RPC already uses that game-specific roster, but its deployed behavior remains
unverified; see `sources/project-status.md`.

Reconnect follows Auth → Player/Group → active Room → game type → authorized
game-specific state loader. Room changes, membership, and host changes may
invalidate coordination reads. Game notifications may invalidate private reads
but must not publish secret or not-yet-reviewable data. Presence is not
authority; the client reconstructs state from authorized server reads.
