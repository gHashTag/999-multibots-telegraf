# `/inngest_probe` — safe probe of every served Inngest function

Spec: [gHashTag/t27 `specs/automation/inngest-probe-suite.t27`](https://github.com/gHashTag/t27/blob/master/specs/automation/inngest-probe-suite.t27).
Host: `src/inngest_app/probe/probeSuite.ts` (logic), `src/inngest_app/probe/inngestProbeClient.ts`
(the one GraphQL mutation this repo sends), `src/commands/inngestProbeCommand.ts` (the command).

## What it is for

The status endpoint (`GET /api/inngest/functions/status`, `docs/inngest/mcp.md`) says whether a
function is *deployed* and what its recent runs did. It cannot say whether a function still
*behaves* when it is triggered. The probe suite does: it invokes every served function with a
payload that carries `e2e_test: true`, waits for the run, and compares where the run stopped with
what the manifest says should happen.

The GraphQL endpoint of the self-hosted Inngest server is private to the Railway network, so
this cannot be done from outside. The bot is inside that network, hence a bot command.

## How to use

| command | what happens |
|---|---|
| `/inngest_probe` | shows the plan — every function to be invoked, its payload, what is expected — and a **▶️ Запустить (safe mode)** button. Nothing is invoked yet. |
| button | invokes the functions one by one, edits the message with `done/total`, then replaces it with the verdict table. |
| `/inngest_probe status` | the read-only 24 h run summary (same data as the status endpoint). |

Admin only (`ADMIN_IDS`). One suite at a time; a second press while a suite runs is refused.
A suite takes roughly one to three minutes: each probe is polled every 3 s with a budget of 120 s.

## What is sent, and what may not happen

* Payload = the manifest's `safe_probe` object (a JSON string) with `e2e_test: true` forced on.
  A `safe_probe` that tries to set the flag to `false` is overridden.
* Every function's safe-mode branch (`src/inngest_app/safeMode.ts`) is what keeps the run
  harmless: it stops at the guard step (bad/unknown ids) or, for functions that have no guard,
  completes without charging, calling paid APIs, or messaging anyone except `ADMIN_CHAT_ID`.
* The suite does not add new safety of its own — it *checks* the safety the functions claim:
  a guarded function that **completes** on a probe payload is a `mismatch`, i.e. it acted on
  garbage, and that is the finding.

## Expectations (`probe_expect` in `functions.manifest.json`)

| value | meaning | verdict `match` when |
|---|---|---|
| `FAILED-at-guard` | the guard rejects the probe payload | run `FAILED` and it failed **where the guard lives** (see "Where a guard lives"); guard `none`/`unknown`: any `FAILED` |
| `COMPLETED` | the function has a safe-mode path that runs to the end | run `COMPLETED` |
| `skip` | not invoked (no safe payload / paid path) | reported as `skipped`, never counted as a failure |

Other verdicts: `mismatch` (run ended somewhere else), `timeout` (no terminal status within the
budget — the run may still finish; check `/inngest_probe status`), `invoke-error` (slug unknown to
Inngest, mutation refused, or no run appeared). The suite is **ok** only when there is no
`mismatch`, `timeout` or `invoke-error`.

At `main @cddac64`: 28 planned = 17 `FAILED-at-guard` + 11 `COMPLETED` + 0 `skip`. The 14
`code-only/unregistered` manifest entries are not planned (they are not served).

## Where a guard lives (`guardKind`, derived — not a manifest field)

The card's `guard` is either one of the function's `steps` (`guardKind = step`, e.g. `check-user`,
`validate-input`) or a name for a check that runs in the function body before any step — a zod
parse, an early throw (`guardKind = body`, e.g. `zod-schema`, `min-images`, `extract-job-id`,
`validate-steps`). `guardKindOf(guard, steps)` decides: in `steps` → `step`, otherwise `body`.

Inngest's trace (verified on the production runs of 2026-09-09 19:11Z, e.g.
`01M23SG3QAZCWB2NQDZCV6RADK`) records a step that threw as status `RUNNING` with a `FAILED`
`Attempt 0` child, and appends a synthetic top-level span named `function error`. A body failure
produces **only** the `function error` span. So:

* `step` guard → match when the first failed real step (own status or a failed attempt) is `guard`;
* `body` guard → match when **no** real step failed and `function error` is present;
* `none` → any `FAILED`.

The first deployed judge (mb#2325) compared the guard name against the deepest failed span
(`Attempt 0`) and so reported 17 false `mismatch` lines at 19:11Z. Re-judging those 28 runs
with the rule above gives 28/28 `match` (`probe_live_rejudged.json` in the work log).

## Probe runs and the admin channel

A guard that rejects a probe is the designed outcome, so `createInngestFailureHandler` stays
quiet for it: when the failed run's original event has `data.e2e_test === true`
(`isProbeFailureEvent`), it logs one `[INNGEST PROBE]` info line and sends no
`🚨 Inngest Failure` alert. The 20+ alerts in the admin channel at 22:11 local on 2026-09-09
came from the first suite run before this rule existed. Known remaining noise: the
`monitoring-*` 24 h statistics still count probe runs as failures (10 failed / 24 h after a
suite run) — they are `inngest/function.invoked` runs and can be filtered by that event name
if the reports should ignore them.

## How a run is found

`invokeFunction` returns only `true`. The suite then lists runs of that function id queued after
the invoke (minus a 5 s clock-skew allowance) whose `eventName` starts with
`inngest/function.invoked`, and takes the newest. A cron tick of the same function inside that
window has a different event name and is ignored.

## Status (honesty)

* First production run: 2026-09-09 19:11Z from the admin chat (28 invoked in 44 s, all terminal
  within the budget). Deployed judge said 17 `mismatch`; corrected judge (this PR) on the same
  runs: 28/28 `match`.
* Witness of the merged judge (#2331) against production, 2026-09-10 03:19:17Z – 03:20:05Z:
  `runProbeSuite` from `main` 224a87f, executed from an operator sandbox with `INNGEST_GQL_URL`
  pointed at the production Inngest server — 28 invoked, **28 `match`, 0 mismatch, 0 timeout,
  0 invoke-error, 0 skipped**, 48 s. Run ids and per-function verdicts:
  `docs/inngest/witness/2026-09-10-probe-suite-03-19Z.json`. What this is not: the deployed bot
  process did not run it and no Telegram report was produced — the same code, a different
  process. The Telegram path (`/inngest_probe` → confirm button → report) is witnessed only by
  the 2026-09-09 19:11Z run with the old judge and by unit tests.
* Unit tests drive the orchestrator with a fake Inngest (`src/__tests__/inngest/probeSuite.test.ts`)
  and the command on a booted Telegraf bot (`src/__tests__/bot/inngestProbeCommand.test.ts`).
* The 2026-09-09 manual probe (`probe_result` in the manifest, `PROBE_RESULT` on the t27 cards) is
  history and is left as it was; `probe_expect` is the live contract.
* `docs/inngest/functions.md` is generated (`npx tsx scripts/inngest/gen-functions-doc.ts`,
  `--check` in CI) and now prints `probe suite expects: …` on every card.

## Two judge defects found by the mirror run of 2026-09-10 02:16Z

Run with the same `runProbeSuite` code as the bot, against the production GQL, right after the
deploy of #2326/#2328/#2329. 6 match, 1 mismatch, **21 `skipped` with a run id and `status: FAILED`**.

1. A guard fails within milliseconds, so the discovery query already saw the run as FAILED; the
   poll loop filtered "pending" by status and never read the trace. Now "pending" = has a run id
   and no verdict yet.
2. `instagram-reels-analyze`: the NonRetriableError thrown inside `step.run('validate-input')` left
   that span **RUNNING** in the trace while the run was FAILED (read at 20 s and again minutes
   later). On a terminal run the culprit is the first step that is not COMPLETED, not the first
   step that is FAILED.

Re-judged offline with the fixed rule: 28/28 match. The bot's own report from
`/inngest_probe` is the next witness.
