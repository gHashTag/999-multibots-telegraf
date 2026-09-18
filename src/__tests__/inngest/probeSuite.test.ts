/**
 * Safe probe suite — the host side of t27 specs/automation/inngest-probe-suite.t27.
 *
 * These tests pin the contract: every served function is planned, every
 * payload carries e2e_test=true, expectations come from the manifest, and
 * the verdict compares the run with the expectation (including the failed
 * step for FAILED-at-guard). The orchestrator is driven by a fake client.
 */
import { describe, it, expect } from 'vitest'
import {
  planProbes,
  probePayload,
  judge,
  guardKindOf,
  firstFailedStep,
  FUNCTION_ERROR_SPAN,
  runProbeSuite,
  renderProbeReportText,
  renderProbePlanText,
  type ProbeClient,
  type ProbePlan,
} from '@/inngest_app/probe/probeSuite'
import { topLevelSteps } from '@/inngest_app/probe/inngestProbeClient'
import { isProbeFailureEvent } from '@/inngest_app/safeMode'
import {
  getManifestFunctions,
  type ManifestFunction,
} from '@/inngest_app/manifest'

const APP = 'telegram-bot-client'

function fn(over: Partial<ManifestFunction>): ManifestFunction {
  return {
    id: 'x-y-z',
    legacy_id: 'x',
    domain: 'x',
    trigger: 'event',
    event: 'x/y.z',
    legacy_events: [],
    cron: '',
    tz: 'UTC',
    file: 'src/x.ts',
    export: 'x',
    steps: ['validate-input', 'act'],
    retries: null,
    on_failure: 'log',
    side_effects: [],
    guard: 'validate-input',
    safe_probe: '{}',
    probe_result: 'FAILED-at-guard',
    probe_expect: 'FAILED-at-guard',
    deployed_2026_09_09: true,
    control: 'spec+code',
    notes: [],
    ...over,
  }
}

describe('the plan', () => {
  it('covers every served function of the real manifest and nothing else', () => {
    const plans = planProbes()
    const served = getManifestFunctions().filter(f => f.control === 'spec+code')
    expect(plans.map(p => p.id).sort()).toEqual(served.map(f => f.id).sort())
    // 28 on 2026-09-09; +crm-proactive-sweep on 2026-09-12 (the seller's clock);
    // +ton-pending-watch on 2026-09-19 (coins on the chain that nothing ever
    // credited -- the TON channel completes on the payer's press, so without
    // it nobody looks).
    expect(plans).toHaveLength(30)
    for (const p of plans) expect(p.slug).toBe(`${APP}-${p.id}`)
  })

  it('every served function has an expectation — nothing is skipped by accident', () => {
    // The 2026-09-09 probe skipped reels-ai-generate (paid) and did not have
    // four functions on the build; the suite gives all of them a safe
    // payload and an expectation. A new `skip` must be a deliberate choice.
    const skipped = planProbes().filter(p => p.expect === 'skip')
    expect(skipped.map(p => p.id)).toEqual([])
  })

  it('every payload carries e2e_test=true, and the flag cannot be overridden', () => {
    for (const p of planProbes()) expect(p.payload.e2e_test).toBe(true)
    expect(
      probePayload(fn({ safe_probe: '{"e2e_test": false, "a": 1}' }))
    ).toEqual({
      a: 1,
      e2e_test: true,
    })
  })

  it('an unparsable or empty safe_probe still yields the flag alone', () => {
    expect(probePayload(fn({ safe_probe: '' }))).toEqual({ e2e_test: true })
    expect(probePayload(fn({ safe_probe: '{not json' }))).toEqual({
      e2e_test: true,
    })
    expect(probePayload(fn({ safe_probe: '[1,2]' }))).toEqual({
      e2e_test: true,
    })
  })

  it('code-only functions are not planned; unknown probe_expect is a skip with a reason', () => {
    const plans = planProbes(
      [
        fn({ id: 'a', control: 'code-only/unregistered' }),
        fn({ id: 'b', probe_expect: 'weird' as never }),
        fn({ id: 'c', safe_probe: '', probe_expect: 'skip' }),
      ],
      APP
    )
    expect(plans.map(p => p.id)).toEqual(['b', 'c'])
    expect(plans[0].expect).toBe('skip')
    expect(plans[1].skipReason).toBe('no safe payload in manifest')
  })

  it('guard kind comes from the manifest steps: a step name is a step, anything else is the body', () => {
    expect(guardKindOf('validate-input', ['validate-input', 'act'])).toBe(
      'step'
    )
    expect(guardKindOf('zod-schema', ['create-job-folder', 'render'])).toBe(
      'body'
    )
    expect(guardKindOf('min-images', ['generate-morphing-clips'])).toBe('body')
    expect(guardKindOf('none', ['a'])).toBe('none')
    expect(guardKindOf('unknown', ['a'])).toBe('none')
    // the real manifest at cddac64: of 17 FAILED-at-guard functions, 7 stop in
    // a named step and 10 in the function body (zod parse / early throw) —
    // matches the production run of 2026-09-09 19:11Z, 28/28
    const failing = planProbes().filter(p => p.expect === 'FAILED-at-guard')
    expect(failing.filter(p => p.guardKind === 'step')).toHaveLength(7)
    expect(failing.filter(p => p.guardKind === 'body')).toHaveLength(10)
  })
})

describe('the verdict', () => {
  const guard: ProbePlan = {
    id: 'g',
    slug: `${APP}-g`,
    expect: 'FAILED-at-guard',
    guard: 'validate-input',
    guardKind: 'step',
    payload: { e2e_test: true },
  }
  const body: ProbePlan = {
    ...guard,
    id: 'b',
    guard: 'zod-schema',
    guardKind: 'body',
  }
  const done: ProbePlan = { ...guard, id: 'd', expect: 'COMPLETED' }
  const FE = { name: FUNCTION_ERROR_SPAN, status: 'FAILED' }

  it('a step guard: FAILED at that step (plus the synthetic function error span) is a match', () => {
    expect(
      judge(guard, {
        status: 'FAILED',
        steps: [
          { name: 'get-bot', status: 'COMPLETED' },
          { name: 'validate-input', status: 'FAILED' },
          FE,
        ],
      })
    ).toEqual({ verdict: 'match', failedStep: 'validate-input' })
    expect(
      judge(guard, {
        status: 'FAILED',
        steps: [
          { name: 'validate-input', status: 'COMPLETED' },
          { name: 'act', status: 'FAILED' },
          FE,
        ],
      })
    ).toEqual({ verdict: 'mismatch', failedStep: 'act' })
    // the guard never ran as a step: the failure was in the body — not the promised guard
    expect(judge(guard, { status: 'FAILED', steps: [FE] })).toEqual({
      verdict: 'mismatch',
      failedStep: FUNCTION_ERROR_SPAN,
    })
  })

  it('a body guard (zod parse, early throw): only the function error span fails — that is the match', () => {
    expect(judge(body, { status: 'FAILED', steps: [FE] })).toEqual({
      verdict: 'match',
      failedStep: FUNCTION_ERROR_SPAN,
    })
    // a step failed first: the payload got past the body guard — mismatch
    expect(
      judge(body, {
        status: 'FAILED',
        steps: [{ name: 'download-files', status: 'FAILED' }, FE],
      })
    ).toEqual({ verdict: 'mismatch', failedStep: 'download-files' })
  })

  it('a function expected to fail that completed is a mismatch — it acted on a probe', () => {
    // Production 2026-09-10 02:16Z, run 01M24HNMM66NTG7XJ8WQRE1SHB: the
    // guard step threw a NonRetriableError, the run is FAILED, and the server
    // left the step span RUNNING. On a terminal run that span is the culprit.
    expect(
      judge(guard, {
        status: 'FAILED',
        steps: [
          { name: 'get-bot', status: 'COMPLETED' },
          { name: 'validate-input', status: 'RUNNING' },
          FE,
        ],
      })
    ).toEqual({ verdict: 'match', failedStep: 'validate-input' })
    expect(judge(guard, { status: 'COMPLETED', steps: [] }).verdict).toBe(
      'mismatch'
    )
    expect(judge(body, { status: 'COMPLETED', steps: [] }).verdict).toBe(
      'mismatch'
    )
  })

  it('guard "none" accepts any FAILED; COMPLETED expectation needs COMPLETED', () => {
    expect(
      judge(
        { ...guard, guard: 'none', guardKind: 'none' },
        { status: 'FAILED', steps: [FE] }
      ).verdict
    ).toBe('match')
    expect(judge(done, { status: 'COMPLETED', steps: [] }).verdict).toBe(
      'match'
    )
    expect(judge(done, { status: 'FAILED', steps: [FE] }).verdict).toBe(
      'mismatch'
    )
    expect(judge(done, { status: 'CANCELLED', steps: [] }).verdict).toBe(
      'mismatch'
    )
  })

  it('firstFailedStep prefers a real step over the synthetic function error span', () => {
    expect(firstFailedStep([FE, { name: 'x', status: 'FAILED' }])).toBe('x')
    expect(firstFailedStep([{ name: 'x', status: 'COMPLETED' }, FE])).toBe(
      FUNCTION_ERROR_SPAN
    )
    expect(
      firstFailedStep([{ name: 'x', status: 'COMPLETED' }])
    ).toBeUndefined()
  })

  it('topLevelSteps reads the real Inngest trace shape: RUNNING step with a FAILED attempt is FAILED', () => {
    // shape of run 01M23SG3QAZCWB2NQDZCV6RADK (neuro-image-generate, 2026-09-09)
    expect(
      topLevelSteps({
        name: 'telegram-bot-client-neuro-image-generate',
        status: 'FAILED',
        childrenSpans: [
          { name: 'get-bot', status: 'COMPLETED', childrenSpans: [] },
          {
            name: 'check-user',
            status: 'RUNNING',
            childrenSpans: [
              { name: 'Attempt 0', status: 'FAILED' },
              { name: 'Attempt 1', status: 'QUEUED' },
            ],
          },
          {
            name: 'function error',
            status: 'FAILED',
            childrenSpans: [{ name: 'Attempt 0', status: 'FAILED' }],
          },
        ],
      })
    ).toEqual([
      { name: 'get-bot', status: 'COMPLETED' },
      { name: 'check-user', status: 'FAILED' },
      { name: 'function error', status: 'FAILED' },
    ])
    expect(topLevelSteps(null)).toEqual([])
  })

  it('isProbeFailureEvent reads e2e_test of the ORIGINAL event inside inngest/function.failed', () => {
    expect(
      isProbeFailureEvent({
        data: { event: { data: { e2e_test: true, telegram_id: '0' } } },
      })
    ).toBe(true)
    expect(
      isProbeFailureEvent({ data: { event: { data: { telegram_id: '1' } } } })
    ).toBe(false)
    expect(isProbeFailureEvent({ data: { e2e_test: true } })).toBe(false)
    expect(isProbeFailureEvent(null)).toBe(false)
  })
})

/** Fake Inngest: each slug has a scripted terminal run. */
describe('a run that failed before it was found is still judged', () => {
  it('a guard that fails within milliseconds gets a verdict, not "skipped"', async () => {
    /*
     * Mirror run 2026-09-10 02:16Z on production: 21 of 28 probes ended
     * `skipped` with a run id and status FAILED -- found already terminal,
     * never polled, never judged.
     */
    const { client } = fakeClient({
      [`${APP}-a-guard`]: {
        status: 'FAILED',
        failedStep: 'validate-input',
        foundTerminal: true,
      },
      [`${APP}-c-acted`]: { status: 'COMPLETED', foundTerminal: true },
    })
    const rep = await runProbeSuite({
      client,
      functions: [
        fn({
          id: 'a-guard',
          guard: 'validate-input',
          probe_expect: 'FAILED-at-guard',
        }),
        fn({ id: 'c-acted', guard: 'none', probe_expect: 'COMPLETED' }),
      ],
      sleep: async () => {},
      pollMs: 1,
    })
    const by = Object.fromEntries(rep.results.map(r => [r.id, r]))
    expect(by['a-guard'].verdict).toBe('match')
    expect(by['a-guard'].failedStep).toBe('validate-input')
    expect(by['c-acted'].verdict).toBe('match')
    expect(rep.counts.skipped).toBe(0)
    expect(rep.ok).toBe(true)
  })
})

function fakeClient(
  script: Record<
    string,
    | {
        status: 'COMPLETED' | 'FAILED'
        failedStep?: string
        polls?: number
        /** The discovery query already sees the run terminal (a fast guard). */
        foundTerminal?: boolean
      }
    | { invoke: 'false' | 'throw' }
    | { neverFound: true }
  >
) {
  const invoked: Array<{ slug: string; data: Record<string, unknown> }> = []
  const polls: Record<string, number> = {}
  const client: ProbeClient = {
    url: 'http://inngest.internal:8288/v0/gql',
    async functionIds() {
      return new Map(Object.keys(script).map(slug => [slug, `uuid-${slug}`]))
    },
    async invokeFunction(slug, data) {
      invoked.push({ slug, data })
      const s = script[slug]
      if ('invoke' in s) {
        if (s.invoke === 'throw') throw new Error('boom')
        return false
      }
      return true
    },
    async runsSince({ functionIDs }) {
      const slug = functionIDs[0].replace(/^uuid-/, '')
      const s = script[slug]
      if ('neverFound' in s) return []
      return [
        {
          id: `run-${slug}`,
          status: 'status' in s && s.foundTerminal ? s.status : 'RUNNING',
          eventName: 'inngest/function.invoked',
          queuedAt: 'x',
        },
        // a cron tick of the same function in the window must not be picked
        {
          id: `cron-${slug}`,
          status: 'COMPLETED',
          eventName: null,
          queuedAt: 'x',
        },
      ]
    },
    async runWithTrace(runId) {
      const slug = runId.replace(/^run-/, '')
      const s = script[slug]
      if (!('status' in s)) return null
      polls[slug] = (polls[slug] ?? 0) + 1
      if (polls[slug] < (s.polls ?? 1)) {
        return { id: runId, status: 'RUNNING', endedAt: null, steps: [] }
      }
      return {
        id: runId,
        status: s.status,
        endedAt: '2026-09-10T00:00:01.000Z',
        steps: s.failedStep
          ? [
              { name: s.failedStep, status: 'FAILED' },
              { name: 'function error', status: 'FAILED' },
            ]
          : [],
      }
    },
  }
  return { client, invoked }
}

describe('the suite', () => {
  const functions = [
    fn({
      id: 'a-guard',
      guard: 'validate-input',
      probe_expect: 'FAILED-at-guard',
    }),
    fn({
      id: 'b-done',
      guard: 'none',
      probe_expect: 'COMPLETED',
      safe_probe: '{"k": 1}',
    }),
    fn({
      id: 'c-acted',
      guard: 'validate-input',
      probe_expect: 'FAILED-at-guard',
    }),
    fn({ id: 'd-noinvoke', probe_expect: 'COMPLETED' }),
    fn({ id: 'e-skip', safe_probe: '', probe_expect: 'skip' }),
    fn({ id: 'f-slow', probe_expect: 'COMPLETED' }),
    fn({ id: 'z-unregistered', control: 'code-only/unregistered' }),
  ]
  const sleep = async () => undefined

  it('invokes every planned function with its payload and judges each run', async () => {
    const { client, invoked } = fakeClient({
      [`${APP}-a-guard`]: { status: 'FAILED', failedStep: 'validate-input' },
      [`${APP}-b-done`]: { status: 'COMPLETED', polls: 3 },
      [`${APP}-c-acted`]: { status: 'COMPLETED' },
      [`${APP}-d-noinvoke`]: { invoke: 'throw' },
      [`${APP}-f-slow`]: { status: 'COMPLETED', polls: 1000 },
    })
    let t = 0
    const now = () => new Date(1_700_000_000_000 + (t += 1_000))
    const progress: Array<[number, number]> = []
    const rep = await runProbeSuite({
      client,
      functions,
      now,
      sleep,
      budgetMs: 30_000,
      pollMs: 1,
      onProgress: async (d, n) => {
        progress.push([d, n])
      },
    })
    expect(invoked.map(i => i.slug)).toEqual([
      `${APP}-a-guard`,
      `${APP}-b-done`,
      `${APP}-c-acted`,
      `${APP}-d-noinvoke`,
      `${APP}-f-slow`,
    ])
    expect(invoked[1].data).toEqual({ k: 1, e2e_test: true })
    const by = Object.fromEntries(rep.results.map(r => [r.id, r]))
    expect(by['a-guard'].verdict).toBe('match')
    expect(by['a-guard'].runId).toBe(`run-${APP}-a-guard`)
    expect(by['b-done'].verdict).toBe('match')
    expect(by['c-acted'].verdict).toBe('mismatch')
    expect(by['d-noinvoke'].verdict).toBe('invoke-error')
    expect(by['d-noinvoke'].error).toBe('boom')
    expect(by['e-skip'].verdict).toBe('skipped')
    expect(by['f-slow'].verdict).toBe('timeout')
    expect(by['z-unregistered']).toBeUndefined()
    expect(rep.counts).toEqual({
      match: 2,
      mismatch: 1,
      timeout: 1,
      'invoke-error': 1,
      skipped: 1,
    })
    expect(rep.ok).toBe(false)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.at(-1)?.[1]).toBe(6)
  })

  it('a suite where every probe lands where the manifest says is ok', async () => {
    const { client } = fakeClient({
      [`${APP}-a-guard`]: { status: 'FAILED', failedStep: 'validate-input' },
      [`${APP}-b-done`]: { status: 'COMPLETED' },
    })
    const rep = await runProbeSuite({
      client,
      functions: functions.slice(0, 2),
      sleep,
      pollMs: 1,
    })
    expect(rep.ok).toBe(true)
    const text = renderProbeReportText(rep)
    expect(text).toContain('✅ Прогон совпал с манифестом: 2/2')
    expect(text).toContain('a-guard — FAILED@validate-input')
    expect(text).toContain('b-done — COMPLETED')
  })

  it('a slug Inngest does not know, or a run that never appears, is an invoke-error', async () => {
    const { client } = fakeClient({
      [`${APP}-b-done`]: { neverFound: true },
    })
    const rep = await runProbeSuite({
      client,
      functions: functions.slice(0, 2),
      sleep,
      pollMs: 1,
    })
    const by = Object.fromEntries(rep.results.map(r => [r.id, r]))
    expect(by['a-guard'].verdict).toBe('invoke-error')
    expect(by['a-guard'].error).toContain('slug unknown')
    expect(by['b-done'].verdict).toBe('invoke-error')
    expect(by['b-done'].error).toBe('run not found after invoke')
  })

  it('when the server is unreachable nothing is invoked and every probe says so', async () => {
    const { client, invoked } = fakeClient({})
    client.functionIds = async () => {
      throw new Error('ECONNREFUSED')
    }
    const rep = await runProbeSuite({
      client,
      functions: functions.slice(0, 2),
      sleep,
    })
    expect(invoked).toEqual([])
    expect(rep.results.every(r => r.verdict === 'invoke-error')).toBe(true)
    expect(rep.results[0].error).toContain('ECONNREFUSED')
  })

  it('the plan text names the expectation and what is skipped', () => {
    const text = renderProbePlanText(planProbes(functions, APP))
    expect(text).toContain('К запуску: 5, пропуск: 1, всего в манифесте: 6')
    expect(text).toContain('• a-guard → FAILED на шаге validate-input')
    expect(text).toContain('• b-done → COMPLETED')
    expect(text).toContain('• e-skip — no safe payload in manifest')
  })
})
