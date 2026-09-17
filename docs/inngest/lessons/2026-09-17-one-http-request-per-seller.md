# Lesson 2026-09-17: one Inngest step is one HTTP request -- keep it under the proxy's patience

## What was observed (self-hosted Inngest dashboard, read through the owner's browser)

* `/api/inngest/functions/status`: `crm-proactive-sweep` 194 COMPLETED / 3 FAILED, everything else
  0 failures.
* Runs filtered Status=Failed, last 7 days: exactly three runs, all `CRM: proactive seller sweep`,
  all on 2026-09-16 (+07): `01M2MQ3GNAS472F5R3P1TGCEFJ` 16:00:00 -> 16:00:15 (15.6 s),
  `01M2N9ZRHPPX8NJAMHRNK5MG77` 21:30:00 -> 21:32:02 (2m 2s), `01M2NDDM5TENWM857PHMADJY6G`
  22:30:00 -> 22:35:00 (5m 0s exactly).
* All three carry the same error: "Your server returned HTTP 502 before the SDK responded. No step
  output was produced before the request failed". Upstream bodies differ: `upstream error`
  (text/plain, the 15 s and the 5 m runs) and
  `{"status":"error","code":502,"message":"Application failed to respond"}` (the 2 m run).
* No step output at all: the function was ONE `step.run('sweep')`, so the failing request was the
  whole tick -- owner first, then every connected seller, each sweep allowed up to
  `INGEST_TIMEOUT_MS = 170_000` on the render. Two slow sellers already exceed five minutes.

## What was NOT verified

* Which seller each 502 landed on: a single step leaves no per-seller trace. That is exactly what
  the fix adds.
* Whether the 15 s and 2 m failures were a redeploy under the request (Railway "upstream error" is
  also what an edge returns while the container is not accepting connections) or an app crash.
  Railway `/logs` rendered blank in the browser; not read.
* The exact Railway edge request budget. 5m 0s to the second is the observed cut; treat it as the
  ceiling, do not rely on it.

## The rule

1. A `step.run` is one HTTP request from the Inngest server to the app, through the Railway edge.
   Anything that may take minutes -- a loop over tenants, a chain of provider calls -- goes one
   `step.run` per unit, so each request stays well under the edge budget and a finished unit is
   memoized when the run is retried or continued.
2. `retries: 0` on a function with side effects (`messages-user`) is still right: a retry re-runs
   the interrupted step and may push a second card. Per-unit steps limit what a 502 can take with
   it; they do not make a retry safe.
3. Read the dashboard, not the counters. `/functions/status` said "3 FAILED"; only the run trace
   said 502 and 5m 0s. The self-hosted UI at the `inngestinngest-*` Railway domain shows runs and
   traces in the browser; the `filterStatus` URL parameter is ignored -- use the Status dropdown
   and press Apply.

## Applied

* `src/inngest_app/functions/crm/crmProactiveSweep.ts`: `resolve-sellers` step, then
  `sweep-<owner>` per seller (sequential; a thrown tick is a failed row, next seller runs).
* `src/__tests__/services/crmProactive.sweepSteps.test.ts` pins the step shape, the failed row,
  the paused path and retries 0; cites t27 `specs/functions/crm-proactive-sweep.t27`.
* `functions.manifest.json`: steps and a dated note.
