# Trinity S³AI / VIBEE

Telegram-first social product for creators and developers. The current release candidate is a deliberately narrow **SAFE BETA**: a verified user can open the Mini App, load the server-owned profile, inspect feed statistics, and prepare a content-plan draft. Publishing, payments, paid generation, rendering from the agent, and automatic approval paths are disabled in the release artifact.

## SAFE BETA contract

- Telegram Mini App identity is accepted only from fresh, valid `initData` signed for the configured bot.
- Production expects `@t27ai_bot` and the server-side `BOT_TOKEN_12` slot; tokens and Telegram IDs are never embedded in the client.
- Profile ownership comes from the verified Telegram identity, never from a client-supplied `telegramId`.
- The live MCP registry exposes exactly `whoami`, `feed_stats`, and `content_plan_prepare`.
- `content_plan_prepare` writes drafts only. Publish, autopublish, charges, paid generation, render, verification, and unknown approval routes are blocked before request-body parsing or handler dispatch.
- External Codex/Claude MCP access is release-blocked until a hashed, revocable, owner-scoped key store is available. The product does not expose or copy a raw MCP key, and legacy plaintext `AGENT_KEYS` values are rejected.
- Activity and error output are redacted before reaching the UI or logs.
- Free-form model chat is disabled because it can spend provider credits;
  owner-scoped diagnostics and draft preparation remain available as explicit
  live-registry actions.

## Repository map

| Path                                      | Purpose                                             |
| ----------------------------------------- | --------------------------------------------------- |
| `src/`                                    | Telegram bot workspace                              |
| `apps/vibee-editor/player/`               | React/Vite Telegram Mini App                        |
| `apps/vibee-editor/render/`               | Render service, authenticated API, and MCP endpoint |
| `apps/vibee-editor/packages/vibee-atoms/` | Shared identity and agent-policy contracts          |
| `docs/`                                   | Operations, integrations, and release evidence      |
| `Makefile`                                | Reproducible local and release checks               |

## Requirements

- Node.js 20–22 and npm
- Bun
- Docker with Compose only when the declared local stack is needed

Node.js 26 is not supported by this candidate. Confirm the toolchain without reading secret values:

```bash
make doctor
```

## Install and run locally

Install every workspace from its lockfile:

```bash
make install
```

Run each process in its own terminal. These commands never kill occupied ports:

```bash
make dev-bot
make dev-render
make dev-player
```

The browser alone cannot manufacture trusted Telegram `initData`. A real login test requires an isolated test bot, a public HTTPS tunnel to the local Mini App, and a temporary test-only BotFather entry. Keep development and production bot tokens, databases, and URLs separate; do not change the global `@t27ai_bot` Mini App URL for local testing.

## Make commands

Run `make help` for the canonical list. The main entry points are:

| Command                   | Result                                                         |
| ------------------------- | -------------------------------------------------------------- |
| `make install`            | Reproducible root, player, and render installs                 |
| `make test-safe-beta`     | Focused auth, profile, MCP, policy, and immutable-lock suites  |
| `make test-e2e-safe-beta` | Isolated Agent/header QA at 390, 720, and 1024 px              |
| `make test`               | All unit suites                                                |
| `make typecheck`          | Root, player, and render type checks                           |
| `make build`              | Root, Mini App, and render bundles                             |
| `make audit`              | Dependency audits for every workspace                          |
| `make remotion-versions`  | Remotion/Zod alignment check                                   |
| `make security-scan`      | Credential-pattern guard                                       |
| `make verify-editor`      | SAFE BETA player/render release matrix                         |
| `make verify`             | Full repository release gate, including `tri` regress/selftest |

Deployment is intentionally not a Make target. A green `make verify` is evidence for review, not authorization to publish.

## Configuration

Store values only in an approved local/hosting secret source. Do not commit `.env` files or paste credentials into issues, logs, browser storage, URLs, or clipboard payloads.

Relevant variable names include:

- `BOT_TOKEN_12` — production Telegram bot secret slot
- `RENDER_AUTH_MODE` — authenticated API mode; the production SAFE BETA artifact remains fail-closed even if runtime configuration requests `warn`
- `DATABASE_URL` — service database connection
- `GLM_API_KEY` — optional model-provider credential; never required for the draft-only SAFE BETA path

Use the environment-specific examples and doctor checks in `docs/`; never copy production values into local fixtures.

## Verification and release policy

Before an editor/render SAFE BETA review:

```bash
make verify-editor
```

`make verify` is the stricter whole-monorepo diagnostic, including the legacy
root Telegram service and repository-native `tri` checks. A red unrelated root
baseline must be reported and keeps that service out of the deployment scope;
it must not be hidden by calling the narrower editor gate “all green.”

The exact candidate diff must then receive an independent P0/P1 review. Production rollout remains blocked when any critical test, identity check, secret scan, or credential-revocation gate is red. Rollback is the exact release-commit revert plus the previously recorded deployment artifact; a compromised credential is revoked and replaced, never restored.

Current product limitations are intentional:

- external MCP keys for Codex/Claude are not issued yet;
- the browser CTA on `t27.ai` remains disabled until a stable HTTPS Mini App endpoint passes identity smoke;
- publishing, paid actions, payment verification, and agent-driven render are disabled in production SAFE BETA.

See `docs/releases/` for candidate provenance, gates, and rollback notes.
