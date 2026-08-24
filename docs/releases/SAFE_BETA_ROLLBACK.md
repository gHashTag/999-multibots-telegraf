# SAFE BETA rollback contract

SAFE BETA uses two ordered commits so application rollback cannot restore
credential-bearing material:

1. `c3eceb9e746ed338b4d77b43562e1d8b47e5caa4` is the non-revertable security
   prerequisite. It removes tracked credential material, makes configuration
   environment-owned and adds scanner rules/regressions.
2. Its immediate child is the revertable SAFE BETA application commit. The
   exact SHA is recorded by the release report after the commit is created.

Never revert, cherry-pick backward over, or replace the security prerequisite.
Compromised credentials are rotated, not restored.

The reviewed application release base is frozen after the exact application
commit, clean matrix and independent topology/runtime verdict are recorded.
Later `origin/main` movement alone is not a rollback or rebuild trigger.
Reconciliation is reopened only if the PR is no longer mergeable,
merged-result CI fails, or upstream provides a proven security/contract fix in
an affected release boundary. This avoids replacing a reviewed rollback unit
solely because an unrelated branch advanced.

## Application rollback

Only `vibee-editor` and `vibee-render` are release targets. The root bot is
excluded. If post-deploy smoke fails, stop the affected candidate and prepare:

```bash
git revert <safe-beta-application-sha>
```

Review that forward revert, rerun the SAFE BETA matrix and deploy only the
affected service. The resulting tree must still contain the security
prerequisite, and `./scripts/security-token-guard.sh tree` must pass. No
database-destructive migration belongs to this release, so rollback must not
mutate or delete production rows.

Before release, this topology is tested in a temporary clean worktree by
reverting only the application commit, checking that every prerequisite path
is unchanged, and running the tracked-tree scanner.

## Previous artifact acceptance gate

A previous Railway artifact is not an automatic rollback target. It is usable
only after all of the following are proven without printing values:

1. its filesystem and client bundle contain no credential-pattern match;
2. its player bundle has no raw MCP key, paid/provider, payment or publish
   dispatch path;
3. production auth is enforce-only and selects the expected Telegram bot;
4. every credential used by the artifact is a post-rotation credential;
5. the old compromised credential is rejected by a safe read-only provider
   check.

If any proof is unavailable or fails, keep the fail-closed deployment stopped
and use a reviewed forward fix instead of that artifact.

## Release record

Immediately before deployment, capture the current deployment identifiers for
both affected services and repository-native rollback commands. Immediately
after deployment, record health, expected bot identity, owner-isolation and
draft-only smoke evidence. Any failed smoke blocks further rollout.
