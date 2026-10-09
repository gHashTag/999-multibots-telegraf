---
name: 'railway-ci'
description: 'CI for this repository runs on Railway, not GitHub Actions: the ci-bridge service sends each new PR head to check-runner and marks it railway/checks. Load on «CI», «CI/CD», «чеки не идут», «Actions красные», «billing», «railway/checks», «ci-bridge», «почему PR без проверок», before touching .github/workflows or deployment/ci-bridge, and when a PR shows no mark.'
---

# CI on Railway (ci-bridge)

## When to Use This Skill

- A PR has red GitHub Actions checks that "never ran", or no checks at all.
- Someone asks to "fix CI/CD", to turn Actions back on, or why a PR has no mark.
- Any edit to `.github/workflows/*` or `deployment/ci-bridge/*`.

## The facts (measured 2026-10-09)

- **GitHub Actions do not start here**: "recent account payments have failed or
  your spending limit needs to be increased" since June. The owner has no budget
  for it. Every automatic workflow job now waits for the repository variable
  `CI_ENABLED == 'true'` (#3944): skipped, not red. Set the variable when billing
  is back; nothing else changes.
- **CD was never broken**: Railway deploys `main` on merge.
- **CI is `ci-bridge`** (Railway service, project 999): every `POLL_S` it lists open
  PRs, runs heads of THIS repo updated since `SINCE` (no backfill, no forks), sends
  the commit's tarball minus ballast plus the PR's changed files (`.check-files`) to
  `check-runner` with suites `types,render-types,guard,boots` (the local gates), and
  writes `railway/checks`: a commit status, or a check run when the app may not
  write statuses. A non-green run also gets one PR comment with the output tail.
- **Every decision is spec `automation/ci-bridge`** (t27#8300), vendored in
  `deployment/ci-bridge/spec/` with its compiled logic; the host is Node 22 with
  types stripped (it imports `.gen.ts`/`.logic.ts` by extension;
  `check-t27-specs.mjs` knows that form).

## Quick Diagnosis

```bash
tri ci                    # every open PR: head, mark, description (exit 1 = a red one)
tri ci 3951               # one PR
tri ci --recheck 3951     # run a finished head again (a /recheck comment)
```

- **The live app may only comment** (logged 2026-10-09 20:10: `checks=read issues=write
pull_requests=write`). Spec v3 `MARK_COMMENT`: the mark is ONE PR comment per head,
  first line `<!-- railway/checks sha=<sha> state=<state> -->`, opened pending and edited
  to the verdict (with the output tail when red). Only a comment the app wrote
  (`performed_via_github_app.id`) counts. `tri ci` reads it too.
- `/recheck` alone in a PR comment, from OWNER/MEMBER/COLLABORATOR, newer than the
  mark, runs that head on the next pass (spec v2 `recheck_due`).
- **Self-healing deploy** (spec v2 `heal_due`): with `RAILWAY_API_TOKEN` set, a bridge
  that does not contain the latest commit touching `deployment/ci-bridge` asks Railway
  (`serviceInstanceDeployV2`, main's head) to deploy, once per process, after 600 s.
  Log line `stale: running X, asked Railway to deploy Y`. Railway skipped five of its
  merge deploys on 2026-10-09 (the merge commit carries no files of its own; why one
  merge deploys and the next is SKIPPED was not found).

Railway logs of `ci-bridge` (MCP `get-logs`, service id `899acae4-…`) say why a pass
failed, with GitHub's own words:

| log line                                               | meaning / fix                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `403 Resource not accessible by personal access token` | the token does not reach this private repo                                                             |
| `the app may write neither commit statuses nor checks` | owner: give the trios bees app `Checks: write` (or `Commit statuses: write`) and accept on install     |
| `the app may not mark; falling back to GITHUB_TOKEN`   | the token marks instead (needs `Commit statuses: write`)                                               |
| `…"Checks: write"; GITHUB_TOKEN: … 403 …`              | neither can mark; the fallback lasts one pass, so a permission granted later is used without a restart |
| `runner: …` in the mark                                | check-runner refused or died; `tri remote-check types` from a checkout reproduces it                   |

## Common Issues

- **Railway SKIPPED the deploy after a merge**: watch paths. The service has root
  directory `/deployment/ci-bridge`; a leading `/` pattern never matched. Patterns
  now `deployment/ci-bridge/**` and `bridge.mjs`; if a merge is still skipped,
  `redeploy` with the skipped deployment's id builds that commit.
- **A Railway variable set to `""` keeps acting**: the app wins over a token when
  both are configured (`tokenOf`), so an emptied token cannot shadow it.
- **Do not backfill**: on day one there were 34 open PRs, mostly stale; the runner
  runs one request at a time and is shared with `tri remote-check`.
- **A fork head never runs**: it would execute inside the project's private network.

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Число, порог, правило, цена,
лимит, порядок на экране -- всё, что в этой теме решает поведение, пишется
спекой `.t27` ПЕРВОЙ (в `gHashTag/t27`); хост импортирует числа из вывода
`t27c gen-ts`, а тест гоняет каждый `test` спеки против кода. Код без спеки --
долг, а не норма. Как именно, законы и ловушки -- только в навыке
`t27-spec-first`: здесь указатель, не копия правила.

## Related Resources

- `deployment/ci-bridge/bridge.mjs`, `spec/ci-bridge.t27`, `bridge.test.mjs`, `spec/ci-bridge.test.ts`
- `deployment/check-runner/` (the runner), `bin/helpers/ci.sh` (`tri ci`), `bin/helpers/remote-check.sh`
- Epic #3950; loop memory `.claude/loop-state/ci-loop.md`
