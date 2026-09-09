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
| `FAILED-at-guard` | the guard step rejects the probe payload | run `FAILED` and the first `FAILED` step is the card's `guard` (guard `none`/`unknown`: any `FAILED`) |
| `COMPLETED` | the function has a safe-mode path that runs to the end | run `COMPLETED` |
| `skip` | not invoked (no safe payload / paid path) | reported as `skipped`, never counted as a failure |

Other verdicts: `mismatch` (run ended somewhere else), `timeout` (no terminal status within the
budget — the run may still finish; check `/inngest_probe status`), `invoke-error` (slug unknown to
Inngest, mutation refused, or no run appeared). The suite is **ok** only when there is no
`mismatch`, `timeout` or `invoke-error`.

At `main @251571c`: 28 planned = 17 `FAILED-at-guard` + 11 `COMPLETED` + 0 `skip`. The 14
`code-only/unregistered` manifest entries are not planned (they are not served).

## How a run is found

`invokeFunction` returns only `true`. The suite then lists runs of that function id queued after
the invoke (minus a 5 s clock-skew allowance) whose `eventName` starts with
`inngest/function.invoked`, and takes the newest. A cron tick of the same function inside that
window has a different event name and is ignored.

## Status (honesty)

* The suite has **not been run against production** from the commit that adds it. The first real
  run is from the admin chat after deploy; its report is the evidence, not this document.
* Unit tests drive the orchestrator with a fake Inngest (`src/__tests__/inngest/probeSuite.test.ts`)
  and the command on a booted Telegraf bot (`src/__tests__/bot/inngestProbeCommand.test.ts`).
* The 2026-09-09 manual probe (`probe_result` in the manifest, `PROBE_RESULT` on the t27 cards) is
  history and is left as it was; `probe_expect` is the live contract.
* `docs/inngest/functions.md` is generated (`npx tsx scripts/inngest/gen-functions-doc.ts`,
  `--check` in CI) and now prints `probe suite expects: …` on every card.
