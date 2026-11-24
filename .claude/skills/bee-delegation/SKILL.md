---
name: bee-delegation
description: 'Hands work to the Queen''s bees, cheaper than doing it yourself: what bees can and cannot do (gHashTag/t27 only), how to write a delegable issue (Boundary + measurable criteria), how to read the board and skip reasons (claimed, fileConflict, missingBoundary, incompleteSpec, notFirst), the hourly work-and-blockers report, remote hive control from Telegram. Use BEFORE writing yourself what the hive can do. Triggers: "delegate to the bees", "through the bees", "give it to the hive", "Queen", "hourly report", "blockers to chat", "bee control"; in Russian: «делегируй пчёлам», «через пчёл», «отдай улью», «королева», «ежечасный отчёт», «блокеры в чат», «управление пчёлами».'
---

# Bee Delegation

Owner, 2026-10-11: "delegate tasks to the bees, through the bees it is
cheaper." A bee is a Queen worker on `trios-agent-server` (Railway, project
999). Its turn costs less than a Claude Code session turn, and the hive keeps
working while the session sleeps. So everything a bee **can** do is issued to
it, not written by hand. Bees are the first executor of the general in skill
`tri`.

## What bees can and cannot do (measured 2026-10-11)

| Can                                                                | Cannot                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| work in **`gHashTag/t27`**: specs, `cli/t27b`, `gen/rust`, reports | touch any other repo (TurboBaby, 999-multibots-telegraf): the board reads only t27, there is nowhere to hold a boundary from a foreign repo |
| write the spec of a rule a host wires in later                     | wire a spec into a host in another repo (we do that)                                                                                        |
| fix t27b/t27c against measurable criteria                          | deploy, merge into `main`, touch prod                                                                                                       |

Hence the split: **spec and compiler -- to the bees; wiring into the host and
release -- to us.**

## A delegable task = an issue in gHashTag/t27

The Queen takes an issue only when **all four** checks pass (the rule:
`apps/vibee-editor/packages/vibee-atoms/src/spec-quality.ts`, `judge`, mirror
of the engine's `QueenSpecQuality`):

```
## User Scenarios & Testing
- **Given** ..., **When** ..., **Then** ...  (without it: incompleteSpec)
## Requirements
- FR-001: ... MUST ...                       (an FR-NNN number or MUST)
## Success Criteria                          (or Acceptance criteria)
1. `cargo test -p t27b` exits 0              (measurable: exit 0, test count,
                                              a .rs/.ts/.json path, a cargo/git/bun command)
## Boundary
- path/to/file the bee holds                 (without the section: missingBoundary)
```

Measured 2026-10-11: three tasks with Boundary, FR and criteria but **no
scenario** sat a tick as `incompleteSpec`. The Queen later writes the
scenarios herself (label `queen-shaped`), but that costs a tick -- **write all
four sections at once**. Form examples: t27#8590, t27#8959.

Cheapest: one task = one idea, minimal boundary. The more files in Boundary,
the longer the task waits in `fileConflict`.

**A directory in Boundary is a held directory.** Measured 2026-10-11: two
spec tasks with boundary `.trinity/seals/` sat in `fileConflict` because
dozens of other bees hold that directory. Name the concrete seal file:
`.trinity/seals/automation_automation::<module>.json` (the name comes from
the spec's `module automation::<module>`).

## Reading the board (no key needed)

```bash
B=https://trios-agent-server-production.up.railway.app
curl -s $B/queen/status          # swarmState, workers.active/capacity, lastTick.skipSummary
curl -s $B/queen/public-board    # repo, columns, cards, pulse
```

`lastTick.skipSummary` -- why a task is not being taken now:

| reason            | means                                                     | what to do              |
| ----------------- | --------------------------------------------------------- | ----------------------- |
| `claimed`         | **a bee is already working on it**                        | wait for the PR         |
| `fileConflict`    | another bee holds the boundary files                      | wait or narrow Boundary |
| `missingBoundary` | no `## Boundary`                                          | add the section         |
| `incompleteSpec`  | scenario, FR or a measurable criterion is missing         | add the missing section |
| `notFirst`        | the task is eligible, just not first in this tick's queue | wait, change nothing    |
| `completed`       | done                                                      | check the PR and close  |

Lists in `skipSummary` are truncated (`more: N`), so a number missing from
the first 25 does not mean the task is absent. `refusal: "nothing to choose"`
with `workers.active > 0` is a **working hive**, not an idle one (skill
`why-the-bees-are-silent`).

## Hourly work-and-blockers report

The report rules are the spec **`specs/automation/bee-report.t27`** (t27#8960,
delegated to bees): a cron once an hour, not at :00; silent when nothing
changed, except a pulse every 6 h; blockers -- failed CI immediately, CI
queued over 60 min, a task without movement for 6 h, the Queen without a
dispatch for 90 min; at most 4000 characters; no client names, no secrets.

The host is an Inngest cron in the bot
(`src/inngest_app/functions/hive/beeReport.ts`), next to
`mailPushHeartbeat`: it collects facts (`/queen/status`, PR and CI of tracked
tasks) and writes **to the owner's chat**. Order as always: spec in t27 ->
`sync-t27-spec` -> host and test -> PR in 999. A merge into 999 `main` is a
deploy: only on the owner's word.

**Not instead:** local scheduled tasks on the Mac (they die after 2 s, memory
`scheduled-tasks-dead-on-glm`), a session `CronCreate` (dies with the
session), or a report to the client (a VIP client may have auto-replies off
-- skill `vip-client-care`).

## Remote hive control from Telegram

Today the hive can be read from Telegram (`hive_pulse`, `hive_board`,
`hive_events`, `hive_queen` in `render/src/agent/hive-tools.ts`), but work
can be issued only by hand on a computer. The next step is a `hive_delegate`
tool: the owner describes the task in chat, the agent builds the issue with
Boundary and criteria, shows the text and **creates it only on the owner's
press** (an issue in a public repo is a publication). Rules: spec
**`specs/automation/hive-delegate.t27`** (t27#8961, delegated): owner only,
`gHashTag/t27` only, at least 1 and at most 12 boundary files, at least 1
criterion, a duplicate title is refused.

## Workflow

1. Split the task: what is in t27 (bees) and what is in other repos (us).
2. For bees -- an issue with Boundary and numbered command criteria.
3. After a minute or two -- `/queen/status`: is the task `claimed`, or why
   was it skipped.
4. Do your own part in parallel; do not do what a bee has `claimed`.
5. When a bee sends a PR -- check its criteria yourself (by running, not
   reading) and only then wire it into the host.

## Пишем на .t27

Owner, 07.10.2026: "we write everything in .t27". Any number, threshold,
rule, price, limit or on-screen order that decides behaviour here is written
as a `.t27` spec FIRST (in `gHashTag/t27`); the host imports the numbers from
`t27c gen-ts` output, and a test runs every spec `test` against the code.
Code without a spec is debt, not the norm. How, the laws and the traps live
only in the skill `t27-spec-first`: this is a pointer, not a copy.

## Related resources

- `tri` -- the general: splitting work into orders and accepting it
- `why-the-bees-are-silent` -- diagnosing a silent hive from Railway logs
- `agent-hive` -- the catalogue's agent bots and their chats
- `vip-client-care` -- reports to the client, not to the owner
- Memory `queen-takes-issues-not-logs` -- the board reads only t27 issues
