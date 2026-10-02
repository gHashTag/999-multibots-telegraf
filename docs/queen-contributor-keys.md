# Personal Queen keys and contribution

Tracked by gHashTag/999-multibots-telegraf#3251 and gHashTag/t27#5472.

The personal account at `/game/account` lists the signed-in person's Queen
credentials and earned contribution. It supports NVIDIA NIM and Z.ai: add a
key, make a bounded model probe, enable or disable the key. The profile entry
is available before onboarding; the game navigation also links to the account.

This reports Queen XP. It does not issue, transfer, or convert `user_tokens`.
The Queen supplies accepted tasks, specifications, hours and scoring rules.
Adding a credential alone does not earn XP.

## Identity and transport

The player calls the configured render API through the existing `apiFetch`
session transport. Render exposes `GET/POST /api/hive/keys` and
`POST /api/hive/keys/:id/{probe,enable,disable}`. Only a full application session
or verified Telegram launch may use these routes. Game, service and delegated
agent credentials are rejected, including when local auth is in warning mode.

Render derives `telegram:<verified-id>` and passes it to the Queen using a
dedicated server-to-server credential. A browser cannot select its owner or
GitHub login. Request fields, route grammar, body size and timeouts are bounded.
Only explicit metadata fields return to the player; upstream error bodies and
extra debug fields are discarded. Both services return `Cache-Control: no-store`.

## One model for all keys of a provider

`POST /api/hive/keys/model` `{provider, model}` asks the Queen to switch every
key the person holds of that provider to one model, and returns the account.
`GET /api/hive/keys/models/{nvidia,zai}` returns the provider catalog for the
picker (loaded when the model field gets focus, never on page load). The proxy
forwards only `provider` and a catalog-shaped `model` (spec v2,
`MAX_MODEL_CHARS`). A failed check comes back as one of three closed codes,
`model_unavailable`, `model_without_tools` or `model_check_failed`. Any other
upstream body is replaced by `model_check_failed`.

The Queen checks the model through one of the person's keys before it writes
anything: a tool call is required, and up to two keys are tried at 90 s each.
`PROXY_TIMEOUT_MS` is therefore 200 s (it was 45 s). "Check all keys" now runs
four checks at once, the Queen's own in-flight limit. A key that cannot be
checked right now no longer stops the rest of the run.

## Deployment configuration

Deploy the companion BrowserOS contributor API before enabling the app UI.
The following variables are server-only; never use `VITE_` for them:

| Service          | Variable                           | Purpose                                                                                      |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Render and Queen | `QUEEN_CONTRIBUTOR_PROXY_TOKEN`    | Matching random server credential, at least 32 characters                                    |
| Queen            | `QUEEN_CONTRIBUTOR_ENCRYPTION_KEY` | Exactly 32 random bytes encoded in canonical base64; preserve securely across deployments    |
| Queen            | `QUEEN_CONTRIBUTOR_IDENTITIES`     | Operator-verified JSON mapping from app subjects to GitHub logins                            |
| Queen            | `TRIOS_KEY_OWNERS`                 | Existing environment-lane ownership; reconcile from verified fingerprints and owner evidence |
| Render           | `QUEEN_BASE_URL`                   | Optional HTTPS origin; default is the existing production Queen origin                       |

The companion backend keeps positive legacy lane indices and negative managed
indices. Disabling a legacy credential records an override after the existing
lane assignment; it does not remove an environment variable or compact indices.
New credentials are encrypted with authenticated encryption and immutable owner
binding. A provider probe records a point-in-time result, not continuous health.

When preparing variables without a restart, Railway `skipDeploys:true` saves
configuration only. A running process keeps its old environment until deployment.
Do not apply unrelated staged Railway changes. A Queen restart interrupts active
workers; coordinate its rollout and verify the actual deployed revision.

## Verification and rollout receipts

- `player/src/pages/HiveAccount.test.tsx`: account ownership presentation, secret
  clearing, own-profile entry, mixed provider outcomes and account changes.
- `render/src/hive/contributor-keys-route.test.ts`: real signed session/game token
  separation, revocation, spoofed-owner refusal, metadata projection, unsafe
  destination rejection, bounded stream reads and timeouts.
- `render/src/spec/hive-contributor-keys.test.ts`: executable binding for every
  canonical spec test, with host mutants and spec controls beside it.
- The UI was inspected independently at desktop and mobile sizes using a
  temporary, explicitly labelled fixture harness. Those fixtures are not shipped.

After deployment, verify the authenticated account sees the expected roster,
GitHub attribution and XP, then check an owned key. Confirm the public leaderboard
uses the corrected attribution. Test anonymous and restricted-token refusal.
Local tests, saved configuration, and a pull request do not prove live deployment.

## Rollback

Preserve the database table and encryption key. Removing the proxy credential
closes the management API; this backend continues to honour persisted disabled
lanes independently of that credential. A rollback to older Queen code cannot
honour those overrides, so explicitly reconcile disabled environment lanes before
rolling back the backend. Review the previous owner map before reverting attribution.
