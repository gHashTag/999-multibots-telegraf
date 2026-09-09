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
  runProbeSuite,
  renderProbeReportText,
  renderProbePlanText,
  type ProbeClient,
  type ProbePlan,
} from '@/inngest_app/probe/probeSuite'
import { flattenSpans } from '@/inngest_app/probe/inngestProbeClient'
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
    expect(plans).toHaveLength(28)
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
})

describe('the verdict', () => {
  const guard: ProbePlan = {
    id: 'g',
    slug: `${APP}-g`,
    expect: 'FAILED-at-guard',
    guard: 'validate-input',
    payload: { e2e_test: true },
  }
  const done: ProbePlan = { ...guard, id: 'd', expect: 'COMPLETED' }

  it('FAILED at the named guard is a match; FAILED elsewhere is a mismatch', () => {
    expect(
      judge(guard, {
        status: 'FAILED',
        steps: [{ name: 'validate-input', status: 'FAILED' }],
      })
    ).toEqual({ verdict: 'match', failedStep: 'validate-input' })
    expect(
      judge(guard, {
        status: 'FAILED',
        steps: [
          { name: 'validate-input', status: 'COMPLETED' },
          { name: 'act', status: 'FAILED' },
        ],
      })
    ).toEqual({ verdict: 'mismatch', failedStep: 'act' })
  })

  it('a function expected to fail that completed is a mismatch — it acted on a probe', () => {
    expect(judge(guard, { status: 'COMPLETED', steps: [] }).verdict).toBe(
      'mismatch'
    )
  })

  it('guard "none" accepts any FAILED; COMPLETED expectation needs COMPLETED', () => {
    expect(
      judge(
        { ...guard, guard: 'none' },
        { status: 'FAILED', steps: [{ name: 'q', status: 'FAILED' }] }
      ).verdict
    ).toBe('match')
    expect(judge(done, { status: 'COMPLETED', steps: [] }).verdict).toBe(
      'match'
    )
    expect(judge(done, { status: 'FAILED', steps: [] }).verdict).toBe(
      'mismatch'
    )
    expect(judge(done, { status: 'CANCELLED', steps: [] }).verdict).toBe(
      'mismatch'
    )
  })

  it('flattenSpans walks the trace tree in order', () => {
    expect(
      flattenSpans({
        name: 'run',
        status: 'FAILED',
        childrenSpans: [
          {
            name: 'a',
            status: 'COMPLETED',
            childrenSpans: [{ name: 'a1', status: 'COMPLETED' }],
          },
          { name: 'b', status: 'FAILED' },
        ],
      })
    ).toEqual([
      { name: 'a', status: 'COMPLETED' },
      { name: 'a1', status: 'COMPLETED' },
      { name: 'b', status: 'FAILED' },
    ])
    expect(flattenSpans(null)).toEqual([])
  })
})

/** Fake Inngest: each slug has a scripted terminal run. */
function fakeClient(
  script: Record<
    string,
    | { status: 'COMPLETED' | 'FAILED'; failedStep?: string; polls?: number }
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
          status: 'RUNNING',
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
        steps: s.failedStep ? [{ name: s.failedStep, status: 'FAILED' }] : [],
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
