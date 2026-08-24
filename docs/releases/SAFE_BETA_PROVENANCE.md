# SAFE BETA candidate provenance

Candidate base: `origin/main@af33370bb77a7e5f4ad716caebc0cee4279d2f04`.

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
- Latest-upstream reconciliation: the exact 11-path overlap with
  `af33370bb77a7e5f4ad716caebc0cee4279d2f04` was audited. `Header.tsx` and
  `FeedCard.tsx` merged without a content conflict. Nine paths were resolved
  hunk-by-hunk: the upstream localization, sanitizer/cache fixes, deterministic
  test setup, symlink-aware Vitest resolution, service endpoint fallbacks and
  health fingerprint were retained without restoring client-owned identity,
  paid/publish capabilities, or bypassing the immutable SAFE BETA locks. No
  loop state was transferred and no mixed file was copied wholesale.

No database-destructive migration is permitted in this release. The history is
intentionally split: security prerequisite `c3eceb9e746ed338b4d77b43562e1d8b47e5caa4`
is non-revertable, while the immediately following SAFE BETA application
commit is the only commit eligible for `git revert`. Rollback must follow
`SAFE_BETA_ROLLBACK.md`; it must never restore credential cleanup or select an
unscanned, pre-rotation Railway artifact.

After the exact application commit, clean matrix and independent topology and
runtime verdict are recorded, this base is frozen. Ordinary later
`origin/main` drift does not restart assembly. Rebuild/rebase is required only
when the PR cannot merge, merged-result CI fails, or upstream contains a
proven security/contract fix in a path or boundary affected by this release.

## Exact local candidate matrix

- Clean locked installs: PASS for root, player and render.
- SAFE BETA auth/identity/MCP/HTTP suites: PASS (121/121).
- Player unit suite: PASS (158/158, including the six tests added on the R5
  upstream base).
- Render unit suite: PASS (80/80).
- TypeScript: PASS for root, player and render.
- Production builds: PASS for root, player and render/Remotion.
- Responsive Agent E2E: PASS at 390, 720 and 1024 px; independent visual QA
  found no P0/P1. The fixed compact navigation can cover an intermediate
  slice in a full-page screenshot, but the content is not clipped and remains
  scrollable (non-blocking P2).
- Player/render dependency audits: PASS, zero reported vulnerabilities.
- Remotion/Zod alignment: PASS (Remotion 4.0.516; Zod 4.4.3).
- Exact staged credential scan and diff check: PASS.
- Player executable bundle: zero raw-key, production-bot-local override,
  model-provider/chat, paid/payment, publish-dispatch, approval-execution or
  client-addressed assets routes. The two `feed_publish` text occurrences are
  the EN/RU `soul.skill.feed_publish` translation literals, not executable
  registry or dispatch code. Remaining legacy render strings are unreachable
  behind the immutable client lock and the server pre-dispatch lock.
- `tri selftest`: PASS. `tri regress`: RED before any network probe because it
  requires a legacy external-agent key. SAFE BETA deliberately ships no
  static/plaintext key and keeps `X-Agent-Key` fail-closed until a hashed,
  revocable, owner-scoped store exists; this check therefore cannot exercise
  the signed-Telegram isolated candidate.
- Root full unit suite: RED (75 failed files / 218 failed tests, including
  missing legacy fixtures, external dev services and provider configuration).
  None of the failures imports or executes the isolated player/render release
  targets.
- Root dependency audit: RED (185 inherited findings: 4 critical, 77 high,
  88 moderate, 16 low). The root bot service is outside this deployment and
  must not be deployed from this candidate.

The scoped player/render candidate matrix is green. The RED root and legacy
`tri regress` gates prove that the excluded root bot and the retired static-key
workflow must not be deployed or represented as covered by this release; they
do not waive or replace any player/render check. Push, merge and deployment
remain blocked until independent review accepts the exact two-commit topology
and the separately recorded credential rotations are proven.
