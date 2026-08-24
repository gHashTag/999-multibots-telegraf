# SAFE BETA credential rotation gate

## Confirmed facts

- `origin/main` contained a credential-like z.ai value in tracked
  documentation.
- A redacted provider request confirmed that historical value is still active.
- Production `GLM_API_KEY` is present in Railway services `vibee-render` and
  `999-multibots-telegraf`.
- Read-only equality checks confirmed that neither current production value is
  the tracked compromised value. No secret value was printed or persisted.
- `vibee-editor` does not currently carry `GLM_API_KEY`.
- Historical tracked source also contained credentialed database URLs. The
  candidate now reads only `DATABASE_URL` / `NEON_DATABASE_URL`; values are
  absent from tracked files and the full-tree scanner is green.
- Removing a value from the working tree does not revoke it from the provider
  or Git history. Database roles found in history must therefore be treated as
  compromised even when current Railway values differ.

Candidate assembly, tests, a local release commit and independent review can
finish before rotation. Credential revocation is the owner-controlled external
gate before push, merge or deployment.

## Owner-controlled rotation procedure

1. In the z.ai account, identify the credential that was committed in
   `docs/GLM_INTEGRATION.md` and revoke it. Do not paste it into chat or a
   terminal command.
2. Because current Railway values do not equal that credential, do not replace
   them merely as rollback theater. Rotate either current production key only
   if its own provenance cannot be established.
3. If a production key is rotated, update `GLM_API_KEY` in exactly the affected
   Railway service (`vibee-render` and/or `999-multibots-telegraf`) through the
   secret UI. Keep `AGENT_PROVIDER=zai` on the render service.
4. Validate the replacement with one redacted, read-only request to the z.ai
   coding API. Record only presence, HTTP status and provider/model health.
5. Validate revocation by repeating the same read-only request with the old
   credential in process memory: it must return an authentication failure.
6. At the database provider, identify the roles embedded historically in the
   legacy player API and Instagram scraper. Revoke/rotate those roles, then
   update only the affected approved secret entries (`DATABASE_URL` and/or
   `NEON_DATABASE_URL`). Never restore the historical password.
7. Validate each replacement with a single parameterized read-only query such
   as `SELECT 1`; record only presence, connection success/failure and service
   name. Validate revocation from process memory: the historical role must be
   rejected. Do not print either URL, username or host.
8. Run Agent `whoami` / `feed_stats` and prepare one draft plan. Do not invoke
   generation, billing or publication.

## Rollback

- Application rollback: redeploy the recorded previous Railway artifact for
  each affected service or revert the exact release commit.
- Credential rollback: use a newly created, independently stored replacement.
  Never restore any compromised historical z.ai or database value, even if
  application rollback is required.
- No Git history rewrite is part of this release. History cleanup, if desired,
  is a separate coordinated operation after revocation.
