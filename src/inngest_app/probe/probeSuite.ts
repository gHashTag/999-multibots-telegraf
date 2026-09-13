/**
 * Safe probe suite for the served Inngest functions.
 *
 * Spec: gHashTag/t27 `specs/automation/inngest-probe-suite.t27`. This file is
 * the host implementation of that spec; the constants below mirror it.
 *
 * What a probe is: `invokeFunction(slug, payload)` on the Inngest server's
 * GraphQL API (the private `/v0/gql`, reachable only from inside the Railway
 * network), where `payload = manifest.safe_probe + { e2e_test: true }`. The
 * `e2e_test` flag is what `isSafeMode(event)` reads, so every function stops
 * before it charges a balance, calls a paid provider, or messages a user; the
 * only Telegram recipient allowed in safe mode is `ADMIN_CHAT_ID`.
 *
 * What a probe proves: the function is registered, the SDK answers, the
 * guard / safe-mode return is where the manifest says it is. It does NOT
 * prove the happy path — that needs real payloads and real money and is out
 * of scope by design.
 *
 * The expectation per function is `manifest.probe_expect`:
 *   COMPLETED        the run ends COMPLETED (safe-mode return or a read-only run)
 *   FAILED-at-guard  the run ends FAILED and the failed step is `manifest.guard`
 *   skip             not probed (code-only functions, or no safe payload known)
 *
 * Verdicts: match | mismatch | timeout | invoke-error | skipped. A suite
 * "passes" when every non-skipped probe is a match.
 */
import type { ManifestFunction } from '@/inngest_app/manifest'
import {
  getManifestFunctions,
  manifestAppId,
  probeExpectOf,
} from '@/inngest_app/manifest'

export const PROBE_SUITE_VERSION = 2
/** Whole-suite wall-clock budget, after which pending runs are `timeout`. */
export const PROBE_BUDGET_MS = 120_000
/** Poll cadence for run status. */
export const PROBE_POLL_MS = 3_000
/** Runs newer than `startedAt - PROBE_RUN_LOOKBACK_MS` count as ours. */
export const PROBE_RUN_LOOKBACK_MS = 5_000
/** Event name the Inngest server gives to a run started by `invokeFunction`. */
export const INVOKED_EVENT_PREFIX = 'inngest/function.invoked'

export type ProbeExpectation = 'COMPLETED' | 'FAILED-at-guard' | 'skip'
export type ProbeVerdict =
  | 'match'
  | 'mismatch'
  | 'timeout'
  | 'invoke-error'
  | 'skipped'

/**
 * Where the guard lives. `step`: the guard is one of the function's
 * `step.run` names, so its span fails. `body`: the guard runs in the function
 * body (zod parse, an early throw before the first step), so no step span
 * fails and Inngest records only the synthetic `function error` span. `none`:
 * the manifest could not name a guard (`none`/`unknown`) — any FAILED counts.
 */
export type GuardKind = 'step' | 'body' | 'none'

/** The span name Inngest gives a failure that happened outside every step. */
export const FUNCTION_ERROR_SPAN = 'function error'

export interface ProbePlan {
  id: string
  slug: string
  expect: ProbeExpectation
  guard: string
  guardKind: GuardKind
  payload: Record<string, unknown>
  /** Why a `skip` is a skip (from the manifest) — shown in the report. */
  skipReason?: string
}

export interface ProbeResult extends ProbePlan {
  verdict: ProbeVerdict
  runId?: string
  status?: string
  /** Where the run failed: a step name, `function error`, or undefined. */
  failedStep?: string
  error?: string
  durationMs?: number
}

export interface ProbeSuiteReport {
  version: number
  appId: string
  startedAt: string
  endedAt: string
  gqlUrl: string
  results: ProbeResult[]
  counts: Record<ProbeVerdict, number>
  ok: boolean
}

/** Function-level view the suite needs from the Inngest server. */
export interface ProbeClient {
  readonly url: string
  /** slug -> internal function UUID for every function the app serves. */
  functionIds(): Promise<Map<string, string>>
  invokeFunction(slug: string, data: Record<string, unknown>): Promise<boolean>
  runsSince(params: {
    from: Date
    functionIDs: string[]
    first?: number
  }): Promise<
    Array<{
      id: string
      status: string
      eventName: string | null
      queuedAt: string
    }>
  >
  runWithTrace(runId: string): Promise<{
    id: string
    status: string
    endedAt: string | null
    steps: Array<{ name: string; status: string }>
  } | null>
}

export interface ProbeSuiteDeps {
  client: ProbeClient
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  budgetMs?: number
  pollMs?: number
  /** Called after each state change; used by the Telegram command to edit its message. */
  onProgress?: (done: number, total: number) => void | Promise<void>
  functions?: ManifestFunction[]
}

export const TERMINAL_RUN_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
])

export function probeExpectation(f: ManifestFunction): ProbeExpectation {
  // one reading of probe_expect for the suite and the status route
  return probeExpectOf(f as unknown as { probe_expect?: string })
}

export function probePayload(f: ManifestFunction): Record<string, unknown> {
  let base: Record<string, unknown> = {}
  const raw = (f.safe_probe as unknown as string) || ''
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>
      }
    } catch {
      // an unparsable safe_probe is a manifest bug; probe with the flag only
      // and let the guard say what is missing
    }
  }
  // The flag wins over anything the manifest payload might say.
  return { ...base, e2e_test: true }
}

export function skipReasonFor(f: ManifestFunction): string {
  if (f.control !== 'spec+code') return `not served (control=${f.control})`
  const raw = (f.safe_probe as unknown as string) || ''
  if (!raw.trim().startsWith('{')) return 'no safe payload in manifest'
  return 'probe_expect=skip'
}

export function planProbes(
  functions: ManifestFunction[] = getManifestFunctions(),
  appId: string = manifestAppId()
): ProbePlan[] {
  return functions
    .filter(f => f.control === 'spec+code')
    .map(f => {
      const expect = probeExpectation(f)
      const guard = f.guard || 'none'
      const plan: ProbePlan = {
        id: f.id,
        slug: `${appId}-${f.id}`,
        expect,
        guard,
        guardKind: guardKindOf(guard, f.steps),
        payload: probePayload(f),
      }
      if (expect === 'skip') plan.skipReason = skipReasonFor(f)
      return plan
    })
}

export function guardKindOf(guard: string, steps: string[]): GuardKind {
  if (guard === 'none' || guard === 'unknown' || guard === '') return 'none'
  return steps.includes(guard) ? 'step' : 'body'
}

/**
 * Where a FAILED run failed, from the top-level step spans of its trace.
 *
 * Verified against production traces on 2026-09-09 (runs 01M23S9H…01M23SEE):
 * a step that threw is reported with status RUNNING and a FAILED `Attempt N`
 * child, and Inngest appends a synthetic top-level `function error` span.
 * So: the first real step that is FAILED itself or has a FAILED attempt wins;
 * only when no step failed is the answer `function error` (the guard ran in
 * the function body). `runWithTrace` folds the attempt status into the step.
 */
/**
 * The step a terminal run died in: the first step span that is not
 * COMPLETED, else the `function error` span (a body-level throw).
 *
 * "Not COMPLETED", not "FAILED": mirror run 2026-09-10 02:16Z, function
 * `instagram-reels-analyze`, run `01M24HNMM66NTG7XJ8WQRE1SHB` -- the run was
 * FAILED with `Invalid event data: username: Required` thrown as a
 * NonRetriableError inside `step.run('validate-input')`, and the trace read
 * 20 s later (and again minutes later) showed that span as RUNNING with the
 * `function error` span FAILED. The server does not always close the span
 * of a step whose NonRetriableError ends the run. Only call this on a
 * terminal run: there a step still "running" is the one that threw.
 */
export function firstFailedStep(
  steps: Array<{ name: string; status: string }>
): string | undefined {
  const step = steps.find(
    s => s.name !== FUNCTION_ERROR_SPAN && s.status !== 'COMPLETED'
  )
  if (step) return step.name
  return steps.find(s => s.name === FUNCTION_ERROR_SPAN)?.name
}

export function judge(
  plan: ProbePlan,
  run: { status: string; steps: Array<{ name: string; status: string }> }
): { verdict: ProbeVerdict; failedStep?: string } {
  const failedStep = firstFailedStep(run.steps)
  if (plan.expect === 'COMPLETED') {
    return {
      verdict: run.status === 'COMPLETED' ? 'match' : 'mismatch',
      failedStep,
    }
  }
  if (plan.expect === 'FAILED-at-guard') {
    if (run.status !== 'FAILED') return { verdict: 'mismatch', failedStep }
    const atGuard =
      plan.guardKind === 'none' ||
      (plan.guardKind === 'body' && failedStep === FUNCTION_ERROR_SPAN) ||
      (plan.guardKind === 'step' && failedStep === plan.guard)
    return { verdict: atGuard ? 'match' : 'mismatch', failedStep }
  }
  return { verdict: 'skipped', failedStep }
}

export function emptyCounts(): Record<ProbeVerdict, number> {
  return { match: 0, mismatch: 0, timeout: 0, 'invoke-error': 0, skipped: 0 }
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Invoke every planned probe, then poll until each run is terminal or the
 * budget is spent. Skipped plans are reported, not invoked.
 */
export async function runProbeSuite(
  deps: ProbeSuiteDeps
): Promise<ProbeSuiteReport> {
  const now = deps.now ?? (() => new Date())
  const sleep = deps.sleep ?? defaultSleep
  const budgetMs = deps.budgetMs ?? PROBE_BUDGET_MS
  const pollMs = deps.pollMs ?? PROBE_POLL_MS
  const startedAt = now()
  const plans = planProbes(deps.functions)
  const results: ProbeResult[] = plans.map(p => ({ ...p, verdict: 'skipped' }))
  const active = results.filter(r => r.expect !== 'skip')

  const report = async () => {
    const done = results.filter(
      r =>
        r.expect === 'skip' ||
        (r.verdict !== 'skipped' && r.runId !== undefined) ||
        r.verdict === 'invoke-error'
    ).length
    await deps.onProgress?.(done, results.length)
  }

  let idBySlug: Map<string, string>
  try {
    idBySlug = await deps.client.functionIds()
  } catch (e) {
    for (const r of active) {
      r.verdict = 'invoke-error'
      r.error = `functionIds: ${e instanceof Error ? e.message : String(e)}`
    }
    return finish(results, startedAt, now(), deps.client.url)
  }

  // 1. Invoke. Sequential on purpose: the server assigns the run id
  // asynchronously and we find it by (function id, from) — one at a time keeps
  // that lookup unambiguous.
  for (const r of active) {
    const fnId = idBySlug.get(r.slug)
    if (!fnId) {
      r.verdict = 'invoke-error'
      r.error = 'function not served by the app (slug unknown to Inngest)'
      continue
    }
    const from = new Date(now().getTime() - PROBE_RUN_LOOKBACK_MS)
    try {
      const ok = await deps.client.invokeFunction(r.slug, r.payload)
      if (!ok) {
        r.verdict = 'invoke-error'
        r.error = 'invokeFunction returned false'
        continue
      }
    } catch (e) {
      r.verdict = 'invoke-error'
      r.error = e instanceof Error ? e.message : String(e)
      continue
    }
    // Find our run: newest run of this function since `from` that came from
    // an invoke (not from a cron tick or a user event).
    for (let attempt = 0; attempt < 10 && !r.runId; attempt++) {
      const runs = await deps.client.runsSince({
        from,
        functionIDs: [fnId],
        first: 5,
      })
      const mine =
        runs.find(x => (x.eventName ?? '').startsWith(INVOKED_EVENT_PREFIX)) ??
        null
      if (mine) {
        r.runId = mine.id
        r.status = mine.status
      } else {
        await sleep(Math.min(pollMs, 1_500))
      }
    }
    if (!r.runId) {
      r.verdict = 'invoke-error'
      r.error = 'run not found after invoke'
    }
    await report()
  }

  /*
   * 2. Poll until judged or budget.
   *
   * "Pending" is a run with an id and no verdict yet -- NOT "a run that is
   * not terminal". Mirror run 2026-09-10 02:16Z: 21 of 28 probes came back
   * `skipped` with a run id and `status: FAILED`. A guard fails within
   * milliseconds, so the discovery query above already saw the run as
   * FAILED, a status-based filter never let it into this loop, and nobody
   * read its trace. The verdict must come from the trace, so every run
   * without a verdict goes through here at least once.
   */
  const pending = () => active.filter(r => r.runId && r.verdict === 'skipped')
  while (
    pending().length > 0 &&
    now().getTime() - startedAt.getTime() < budgetMs
  ) {
    for (const r of pending()) {
      const run = await deps.client.runWithTrace(r.runId!)
      if (!run) continue
      r.status = run.status
      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        const j = judge(r, run)
        r.verdict = j.verdict
        r.failedStep = j.failedStep
        if (run.endedAt) {
          r.durationMs = Math.max(
            0,
            new Date(run.endedAt).getTime() - startedAt.getTime()
          )
        }
      }
    }
    await report()
    if (pending().length > 0) await sleep(pollMs)
  }
  for (const r of pending()) {
    r.verdict = 'timeout'
    r.error = `still ${r.status} after ${Math.round(budgetMs / 1000)} s`
  }
  return finish(results, startedAt, now(), deps.client.url)
}

function finish(
  results: ProbeResult[],
  startedAt: Date,
  endedAt: Date,
  gqlUrl: string
): ProbeSuiteReport {
  const counts = emptyCounts()
  for (const r of results) counts[r.verdict] += 1
  return {
    version: PROBE_SUITE_VERSION,
    appId: manifestAppId(),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    gqlUrl,
    results,
    counts,
    ok:
      counts.mismatch === 0 &&
      counts.timeout === 0 &&
      counts['invoke-error'] === 0,
  }
}

const MARK: Record<ProbeVerdict, string> = {
  match: '✅',
  mismatch: '❌',
  timeout: '⏳',
  'invoke-error': '⚠️',
  skipped: '➖',
}

/** Plain text (no parse_mode) so function ids and JSON never break rendering. */
export function renderProbePlanText(plans: ProbePlan[]): string {
  const active = plans.filter(p => p.expect !== 'skip')
  const skipped = plans.filter(p => p.expect === 'skip')
  const lines = [
    `Безопасный прогон Inngest-функций (safe mode, e2e_test=true)`,
    `К запуску: ${active.length}, пропуск: ${skipped.length}, всего в манифесте: ${plans.length}`,
    ``,
    `Ожидание по манифесту:`,
    ...active.map(p =>
      p.expect === 'COMPLETED'
        ? `• ${p.id} → COMPLETED`
        : p.guardKind === 'body'
          ? `• ${p.id} → FAILED в теле функции (${p.guard})`
          : p.guardKind === 'step'
            ? `• ${p.id} → FAILED на шаге ${p.guard}`
            : `• ${p.id} → FAILED (guard не назван)`
    ),
  ]
  if (skipped.length) {
    lines.push(
      ``,
      `Пропуск:`,
      ...skipped.map(p => `• ${p.id} — ${p.skipReason}`)
    )
  }
  lines.push(
    ``,
    `Ни одна функция не списывает баланс, не зовёт платный провайдер и не пишет пользователям: каждая останавливается на guard или на safe-mode-возврате. Бюджет ${Math.round(PROBE_BUDGET_MS / 1000)} с.`
  )
  return lines.join('\n')
}

export function renderProbeReportText(rep: ProbeSuiteReport): string {
  const c = rep.counts
  const head = rep.ok
    ? `✅ Прогон совпал с манифестом: ${c.match}/${c.match + c.mismatch + c.timeout + c['invoke-error']}`
    : `❌ Прогон разошёлся с манифестом: совпало ${c.match}, расхождений ${c.mismatch}, таймаутов ${c.timeout}, не запустилось ${c['invoke-error']}`
  const lines = [
    head,
    `Пропущено: ${c.skipped}. Источник: ${rep.gqlUrl}`,
    `${rep.startedAt} → ${rep.endedAt}`,
    ``,
  ]
  for (const r of rep.results) {
    if (r.verdict === 'skipped') continue
    let tail = ''
    if (r.verdict === 'match') {
      tail =
        r.status === 'FAILED'
          ? `FAILED@${r.failedStep ?? '?'}`
          : (r.status ?? '')
    } else if (r.verdict === 'mismatch') {
      const got =
        r.status === 'FAILED'
          ? `FAILED@${r.failedStep ?? '?'}`
          : (r.status ?? '?')
      const want =
        r.expect === 'FAILED-at-guard'
          ? `FAILED@${r.guardKind === 'body' ? `${FUNCTION_ERROR_SPAN} (${r.guard} в теле функции)` : r.guard}`
          : r.expect
      tail = `ждали ${want}, получили ${got}`
    } else {
      tail = r.error ?? r.verdict
    }
    lines.push(
      `${MARK[r.verdict]} ${r.id} — ${tail}${r.runId ? `  run ${r.runId}` : ''}`
    )
  }
  const sk = rep.results.filter(r => r.verdict === 'skipped')
  if (sk.length) lines.push(``, `➖ пропуск: ${sk.map(r => r.id).join(', ')}`)
  return lines.join('\n')
}
