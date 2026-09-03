# SAFE BETA candidate provenance

Candidate base: `origin/main@8e253117bd39` (full SHA is recorded by the final release commit).

The candidate is assembled in a clean worktree. The mixed source checkout is
used only as a read-only implementation reference. Existing mixed files are
never copied wholesale.

## Feature allowlist

- Telegram Mini App authentication bound to production `@t27ai_bot` through
  the canonical environment-to-token-slot contract.
- Server-verified Telegram identity and owner-scoped profile loading/upsert.
- MCP and in-product Agent tools limited to exactly `whoami`, `feed_stats`
  and `content_plan_prepare`.
- Content plans are stored as drafts for the verified owner.
- Live safe registry; read-only Activity; responsive diagnostic alert;
  author/media fallbacks. External MCP onboarding is visibly release-blocked
  until a hashed, revocable, owner-scoped key store exists.
- A compile-time SAFE BETA lock blocks paid generation, rendering, charges,
  publish/autopublish, external notifications and access/approval endpoints.
- Legacy client-addressed asset history is fail-closed until it can be moved
  to a server-owned profile route; manual paid/publish loop scripts are
  excluded from the production Docker build context.

## Explicit exclusions

- The unfinished one-shot local production-bot override and every
  `ALLOW_PROD_TELEGRAM_BOT_LOCAL` path.
- Raw MCP key issuance or rendering/copying a key in DOM, clipboard, URL or
  logs.
- Paid generation, rendering, charges, publish/autopublish and approval
  execution.
- Voice/provider experiments, generated evidence, runtime data, secrets, and
  `loop/state.json` / `loop/topics.json`.

## Source ownership

- Baseline: `origin/main`.
- Auth/profile, Agent/MCP and player/feed changes: exact reviewed hunks from
  the inherited dirty snapshot, corrected to the SAFE BETA allowlist.
- Reviewer-authored provenance: live-registry disabled-copy semantics,
  constant error boundaries and responsive viewport expectations.
- Release integrator: immutable HTTP side-effect lock and candidate-only
  release wiring/evidence; reproducible lockfile/Docker installs; aligned
  Remotion/Zod dependencies; Make release commands and security documentation.
- Latest-upstream reconciliation: four overlapping auth/chat/generation tests
  and implementations were resolved explicitly in favor of signed Mini App
  identity and immutable SAFE BETA locks; no loop state was transferred.

No database-destructive migration is permitted in this release. A whole-commit
revert is prohibited because it could restore credential-bearing material.
Rollback must follow `SAFE_BETA_ROLLBACK.md`: a reviewed forward/path-scoped
change or a previously scanned, post-rotation artifact for each affected
service.

## Exact local candidate matrix

- Clean locked installs: PASS for root, player and render.
- SAFE BETA auth/identity/MCP/HTTP suites: PASS (121/121).
- Player unit suite: PASS (152/152).
- TypeScript: PASS for root, player and render.
- Production builds: PASS for root, player and render/Remotion.
- Responsive Agent E2E: PASS at 390, 720 and 1024 px.
- Player/render dependency audits: PASS, zero reported vulnerabilities.
- Remotion/Zod alignment: PASS (Remotion 4.0.516; Zod 4.4.3).
- Exact staged credential scan and diff check: PASS.
- Player executable bundle: zero raw-key, model-provider/chat, paid/payment,
  publish-dispatch or client-addressed assets routes. Remaining legacy render
  strings are unreachable behind the immutable client lock and the server
  pre-dispatch lock.
- `tri selftest`: PASS. `tri regress`: RED because the legacy live-stack check
  expects a separate service on port 2999 and at least 20 tools, while this
  candidate intentionally exposes exactly three SAFE BETA tools; it did not
  exercise the isolated candidate processes.
- Root dependency audit: RED (185 inherited findings: 4 critical, 77 high,
  88 moderate, 16 low). The root bot service is outside this deployment and
  must not be deployed from this candidate.

These RED gates block deployment but do not alter the exact player/render
candidate submitted for independent review. Push, merge and deployment also
remain blocked until the separately recorded credential rotations are proven.
