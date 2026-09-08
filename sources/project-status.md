# Project status

This document describes the current product state. It is not a chronological
development log.

> Active documentation describes the current system. Git preserves
> implementation history.

## Product stage

Impostor has reached an approved beta, and that approved beta is currently
deployed to production.

```yaml
product: Impostor
stage: approved beta
production: main@7431605
deployment_status: confirmed in Vercel Production
observed_status: working correctly based on validation performed so far
```

The baseline is supported by a manually confirmed Vercel Production
deployment, repeated real-world use, positive human evaluation, and the correct
behavior observed so far.

In this context, approved beta means that the complete core game loop is
implemented, deployed to production, used repeatedly in real-world play, and
supported by positive human product evaluation.

Approved beta does not imply product-market fit, mass validation, finished
UX/UI, absence of bugs, or product completion.

## Integrated production-feedback refinements

```yaml
source_branch: pre-beta-production-feedback
source_SHA: ec730c5
merged_via: PR #40
merged_into: main
status: integrated / deployed to production / currently active
```

The integrated refinements prompted by observation of production use are:

- join-room UX refinement;
- unified private reveal/hide interaction;
- starting-player rule refinement to avoid selecting the impostor when an
  equally balanced alternative exists.

These changes are integrated into `main`, deployed to Production, and part of
the current production behavior. The active source of that behavior is the
production baseline above, not the historical source branch. The refinements
remain subject to observation and progressive improvement; their integration
does not mean the UX/UI is finished.

## Post-beta roadmap

1. Documentation consolidation
2. Narrative and professional material
3. Progressive UX/UI refinement through observation
4. Next Juegos Familiares utility

Documentation consolidation is the current workstream and establishes the new
active documentation baseline. Once it is closed, workstreams 2, 3, and 4 may
proceed in parallel. They must remain separated by explicit scope, evidence,
and change control through distinct branches or tasks.

The next Juegos Familiares utility is future exploration. It may be a game or
another kind of utility; the roadmap does not decide that in advance.

## Known limitations

- A SessionPlayer who disconnects during a session remains in the frozen
  roster and can prevent completion of actions that require full participation,
  including voting.
- If the host disappears during `playing`, host-only transitions can remain
  blocked. Automatic host succession is currently implemented only in the
  lobby.

These are known limitations, not an automatic backlog. Host succession during
`playing` requires a product decision. Leaving during a session, timeout or a
host override remain future exploration.

## Future exploration

These questions are not committed roadmap items:

- whether absence or departure during a session needs timeout, host override
  or another explicit policy;
- whether nickname changes, nickname ownership or transfer of Group
  administration need explicit product rules.

Architectural questions about multi-group membership, global versus
group-scoped Player identity and capabilities shared by future utilities live
only in `sources/architecture.md`. Impostor-specific future capabilities remain
classified in `sources/games/impostor/product-brief.md`. The next utility is
already owned by the roadmap above.

## Current improvement work

Only observations confirmed against the current product should become active
improvement work. Historical UX findings are evidence to revalidate, not an
automatic backlog. No additional detailed post-beta UX/UI backlog is established
by this document today.

UX/UI refinement follows this cycle:

> real use → observation → friction → prioritization → small intervention →
> play again
