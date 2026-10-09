# Queen rounds on Railway -- plan

Status: PLAN, nothing deployed. Written 2026-10-09.

## Why

On 2026-10-07 the owner disabled every local routine: the Mac is starved
(memory `routines-paused-mac-starved`). Three Queen rounds lived there as
Claude Code desktop scheduled tasks (`~/.claude/scheduled-tasks/*/SKILL.md`):

| task                         | cadence   | rules live in                                                         | what it runs                                                                                                                                                                                                            |
| ---------------------------- | --------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queen-browser-social-round` | every 4 h | `.claude/agents/browser-desk-keeper.md`                               | `tri browser doctor`, `tri blog-share`, `tri meta`, `tri logins`, `tri jam`, `tri relays`, `tri journal`, `tri remote-check`, `gh`, `railway` (via `bin/helpers/rail.sh` `rvars`), Agent tool (coder and reviewer bees) |
| `queen-card-chat-round`      | every 4 h | `.claude/agents/queen-card-chat-keeper.md` + skill `kanban-card-chat` | `tri jam`, `tri card-check`, `tri remote-check`, `tri runner`, `gh`, Queen board GET with `TRIOS_API_TOKEN`, Agent tool                                                                                                 |
| `card-drift-nightly`         | nightly   | its SKILL.md                                                          | `tri hive-nightly` (Sundays adds `tri shot all`, ~30 min of Chromium), `gh` issue writes, agent key for the live card-check                                                                                             |

The first two are LLM rounds: they read, judge and dispatch bees. The third is
a deterministic script that only needs an LLM to word the report.

## What already runs on Railway (project 999, production)

- `queen-watch` (`deployment/queen-watch/`): cron service `0 * * * *`,
  `node:20-bookworm-slim`, `restartPolicyType: NEVER`, a `/data` volume for
  state, no LLM, no git, no `gh`/`railway` CLI. Talks HTTP only: Railway
  GraphQL (`RAILWAY_API_TOKEN`), GitHub REST (`GITHUB_TOKEN`), the Queen
  (`TRIOS_API_TOKEN`, `POST /queen/report`), Telegram (`OWNER_BOT_TOKEN`).
  Every secret is a Railway reference variable and is scrubbed from output.
- `check-runner` (`deployment/check-runner/`): HTTP service that runs tsc,
  vitest, mutants, t27 spec suites and trinity website checks; has Node 20/22,
  Chromium, t27c, zig. Reached by `./tri remote-check`, keyed by
  `CHECK_RUNNER_KEY`.

## What a round needs that a Railway container does not have today

1. A Claude Code CLI (`@anthropic-ai/claude-code`) and auth for it.
2. A git checkout of this repo (and `gHashTag/trinity` for some checks) --
   `bin/tri` and the agent defs are read from `origin/main`.
3. `gh` logged in with write scope on 999, t27 and trinity (bees push
   branches, open PRs; reviewer bees merge).
4. `railway` CLI for `rvars` (`bin/helpers/rail.sh`), or a project token.
5. The loop-state files the rounds append to (`.claude/loop-state/*.md`,
   `~/.local/state/...`) -- today on the Mac's disk.
6. Nothing local: no `localhost`, no launchd, no `/Users/playra/trinity`
   paths. `browser-desk-keeper.md` and `queen-card-chat-keeper.md` name Mac
   paths in a few places; those must become repo-relative.

## Options

### A. New Railway cron service `queen-rounds` running `claude -p` headless (recommended)

One image, one service per round or one service with `ROUND=<name>` and three
cron entries (Railway allows one `cronSchedule` per service, so three small
services sharing one Dockerfile: `queen-round-browser`, `queen-round-card`,
`queen-round-drift`).

Image: `node:20-bookworm-slim` + git, bash, `gh`, `railway` CLI,
`@anthropic-ai/claude-code`, python3. At start: shallow clone of
`gHashTag/999-multibots-telegraf@main`, then

```
claude -p "Run one round as .claude/agents/$AGENT.md describes" \
  --agent "$AGENT" --permission-mode bypassPermissions \
  --max-turns 200 --output-format stream-json
```

Heavy checks keep going to `check-runner` over `./tri remote-check`, so the
round container stays small (512 MB-1 GB). `card-drift-nightly`'s Sunday
`tri shot all` should run on `check-runner` (it already has Chromium), not in
the round image. The final report goes to `POST /queen/report` and to the
owner through `@t27ai_bot`, exactly like queen-watch. Loop-state moves to a
`/data` volume (or into the Queen via `/queen/report`), never to the Mac.

Secrets (names only, all as Railway reference variables where possible):

- `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`
  to bill the owner's subscription) -- new, owner must provide
- `GH_TOKEN` -- fine-grained, contents+PR+issues write on 999, t27, trinity;
  new (the existing `TRIOS_GITHUB_API_TOKEN` may lack merge scope; check)
- `RAILWAY_API_TOKEN` -- reuse `${{vibee-render.RAILWAY_API_TOKEN}}`; `rvars`
  must accept a project token (`RAILWAY_TOKEN`) instead of a CLI login
- `TRIOS_API_TOKEN` -- `${{trios-agent-server.TRIOS_API_TOKEN}}`
- `OWNER_BOT_TOKEN` -- `${{vibee-render.BOT_TOKEN_12}}`
- `CHECK_RUNNER_KEY` -- `${{check-runner.CHECK_RUNNER_KEY}}`
- `VIBEE_AGENT_KEY` / `AGENT_KEY` -- for the live card-check

Cost: Railway compute is small (a 4-h round of ~15-30 min at ~1 GB is under
$2/month per round). The real cost is the model: an Opus round with bees is
roughly 0.5-3M tokens; at API prices that is several dollars a round, i.e.
$30-150/month for two 4-h rounds. With `CLAUDE_CODE_OAUTH_TOKEN` it comes out
of the owner's subscription quota instead. Mitigation: `--model sonnet` for
the Queen, Opus only for coder bees; or 8-h cadence.

What breaks / risks:

- A token with merge rights sits in a container that runs with
  `bypassPermissions`. Fence it: no inbound port, fine-grained token, repo
  allow-list, gitleaks before every push (lefthook installs in the clone).
- Hooks: the clone must run `lefthook install` and root `bun install`
  (memory `lefthook-gates-need-root-install`), otherwise commits run no gate.
  Bees commit in their own worktrees inside the container.
- No human in the loop for permission prompts: any rule that says "ask the
  owner" must end in a Telegram message and a stop, not a wait.
- Rounds overlap if one runs past 4 h: cron with `NEVER` restart will not
  double-start the same service, but keep a lock in `/data`.
- `gh`/`railway` paths that assumed the Mac (`/Users/playra/...`) fail; fix
  in the agent defs first.

### B. Extend `queen-watch`

Add an LLM step to `watch.mjs`. Cheapest to deploy (service, volume and
secrets exist) but wrong shape: queen-watch is deliberately a small, no-LLM,
read-mostly HTTP watcher with one dependency; adding git, gh, a CLI agent
and write tokens would turn the one trustworthy watch into the riskiest
service. Use it only for the deterministic part: `card-drift-nightly`'s
drift and live card-check could be ported into it as a fourth watch (HTTP +
GitHub issue writes, which it already does), with no LLM at all.

### C. Anthropic cloud scheduled routines (`/schedule`)

Claude Code routines run in Anthropic's cloud on a cron, with the repo
cloned from GitHub; no container of ours. Zero infra and billed to the
subscription. Limits: secrets go in the routine's environment config, not as
Railway references; no `railway` CLI login unless a token is placed there;
network egress may be restricted to allow-listed hosts (check that
`*.up.railway.app`, `api.telegram.org`, `app.t27.ai` are reachable); subagent
(bee) dispatch and run length limits must be checked before relying on it.
Outside Railway, so it does not follow the owner's "everything on Railway"
line literally.

## Recommendation

1. Now, no LLM: port `card-drift-nightly` into `queen-watch` as a daily watch
   (option B for that one task only) -- it is a script, not a round.
2. Build option A (`deployment/queen-rounds/`, one Dockerfile, two cron
   services first: browser-social and card-chat), with Sonnet as the Queen
   and `CLAUDE_CODE_OAUTH_TOKEN` to stay on the subscription.
3. Before deploy: remove Mac paths from the two agent defs, teach `rvars`
   to use `RAILWAY_TOKEN`, move loop-state to the volume or the Queen.
4. Owner actions (cannot be done by an agent): create the Anthropic token,
   create the fine-grained GitHub token, approve the new service.
5. Option C is the fallback if the owner prefers not to hold a model key in
   Railway at all; trial one round there before committing to it.

The routines on the Mac stay disabled; nothing in this plan re-enables them.
