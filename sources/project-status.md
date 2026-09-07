# Project status

This document describes the current product state. It is not a chronological
development log.

> Active documentation describes the current system. Git preserves
> implementation history.

## Product stage

Impostor has reached an approved beta, and that approved beta is currently
deployed to production.

- Production baseline SHA: `7296dee` (`main`).
- The baseline is supported by a confirmed Vercel Production deployment,
  repeated real-world play, and positive human evaluation.

Approved beta does not imply product-market fit, mass validation, finished
UX/UI, absence of bugs, or product completion.

## Preview feedback branch

```yaml
branch: pre-beta-production-feedback
SHA: ec730c5
status: preview only / not merged / not production
```

The branch contains refinements prompted by observation of production use:

- join-room UX refinement;
- unified private reveal/hide interaction;
- starting-player rule refinement to avoid selecting the impostor when an
  equally balanced alternative exists.

These changes are not part of the current production contract. They must be
evaluated within the post-beta UX/UI refinement workstream. A preview branch
must not be used as a source of current behavior, and its changes must not be
promoted automatically to mandatory backlog items.

## Post-beta roadmap

1. Documentation consolidation
2. Narrative and professional material
3. Progressive UX/UI refinement through observation
4. Next Juegos Familiares utility

The first workstream establishes the new baseline. Once it is complete,
workstreams 2, 3, and 4 may proceed in parallel. They must remain separated by
scope, evidence, and branches or tasks.

UX/UI refinement follows this cycle:

> real use → observation → friction → prioritization → small intervention →
> play again
