# SAFE BETA rollback contract

This release deliberately combines application hardening with removal or
classification of credential-shaped material. A whole-commit Git revert is
therefore **not** an acceptable rollback: it could restore material that has
already been treated as compromised.

## Non-revertable boundary

Never restore these classes from a commit or deployment made before the SAFE
BETA candidate:

- credential redactions, scanner rules and scanner regressions;
- root security/runtime cleanup in Instagram, SSH, lip-sync and test fixtures;
- authentication enforcement, log redaction and secret-safe error boundaries;
- immutable paid, charge, render, publish, approval and assets locks;
- the Docker exclusion for manual paid/publish loop scripts;
- credential-rotation records or documentation.

In particular, do not run a whole-commit revert of the SAFE BETA candidate.
A rollback must be a new, reviewed forward commit or an artifact switch that
keeps every item above.

## Application-scoped rollback

Only the two affected services are eligible for release or rollback:
`vibee-editor` and `vibee-render`. The root bot service is excluded.

For a UI-only failure, prepare a new commit that restores only the affected
presentation component from the recorded base while retaining auth, identity,
agent policy, runtime locks, scanner changes and Docker exclusions. Review the
resulting path diff and rerun the exact SAFE BETA matrix before deployment.

For an auth, identity, MCP or side-effect-boundary failure, do not restore the
old implementation. Stop traffic to the affected candidate deployment and
ship a forward fix that preserves fail-closed behavior.

No database-destructive migration belongs to this release, so rollback must
not mutate or delete production rows.

## Previous artifact acceptance gate

Before any Railway artifact can be selected as a rollback target, record its
deployment identifier/image digest and prove all of the following without
printing values:

1. its filesystem and client bundle have zero tracked credential-pattern hits;
2. its player bundle contains no raw MCP key, paid/provider, payment or publish
   dispatch path;
3. production auth is enforce-only and selects the expected Telegram bot;
4. every credential used by that artifact is the post-rotation credential;
5. the old compromised credential is rejected by a safe read-only provider
   check.

If any check is unavailable or fails, that artifact is **not** a rollback.
Keep the current fail-closed deployment stopped and use a forward fix instead.

## Release record

Immediately before deployment, capture the current deployment identifiers for
both services and the exact rollback command supported by the repository-native
Railway workflow. Immediately after deployment, record health and signed-owner
smoke evidence. A failed smoke permits only a rollback target that passed the
acceptance gate above.
