/**
 * ONE STEP PER SELLER -- the 2026-09-17 shape of crm-proactive-sweep.
 *
 * Spec: t27 specs/functions/crm-proactive-sweep.t27 (STEPS, RETRIES 0, NOTE).
 *
 * Evidence: three FAILED runs on 2026-09-16 (01M2MQ3GNAS472F5R3P1TGCEFJ,
 * 01M2N9ZRHPPX8NJAMHRNK5MG77, 01M2NDDM5TENWM857PHMADJY6G) all ended with
 * "Your server returned HTTP 502 before the SDK responded", after 15 s,
 * 2m02s and exactly 5m00s. The whole tick was one `step.run('sweep')`:
 * one HTTP request carrying every seller in turn, each allowed up to
 * INGEST_TIMEOUT_MS (170 s). The Railway edge does not wait that long.
 *
 * What this test pins:
 *   - the handler resolves the sellers in its own step, then runs ONE
 *     `sweep-<id>` step per seller, in the resolved order, sequentially;
 *   - a seller whose tick throws yields a failed row and does not stop the
 *     next seller;
 *   - no carrier -> did=paused and no sweep step at all;
 *   - retries stay 0 (a retry could push a second card).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const svc = {
  carrier: null as null | { bot: unknown; opts: { ownerId: string } },
  resolveSellers: vi.fn(),
  runProactiveTick: vi.fn(),
  runProactiveTickAll: vi.fn(),
}

vi.mock('@/services/crmProactive', () => ({
  crmCarrier: () => svc.carrier,
  resolveSellers: (...a: unknown[]) => svc.resolveSellers(...a),
  runProactiveTick: (...a: unknown[]) => svc.runProactiveTick(...a),
  runProactiveTickAll: (...a: unknown[]) => svc.runProactiveTickAll(...a),
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { getHandler } from '@/inngest_app/test/utils/test-helpers'
import {
  crmProactiveSweep,
  withStepBudget,
  SWEEP_STEP_BUDGET_MS,
} from '@/inngest_app/functions/crm/crmProactiveSweep'

const handler = getHandler(crmProactiveSweep)

function fakeStep() {
  const names: string[] = []
  const inFlight = { n: 0, max: 0 }
  return {
    names,
    inFlight,
    step: {
      run: async (name: string, fn: () => Promise<unknown>) => {
        names.push(name)
        inFlight.n += 1
        inFlight.max = Math.max(inFlight.max, inFlight.n)
        try {
          return await fn()
        } finally {
          inFlight.n -= 1
        }
      },
    },
  }
}

const cronEvent = { name: 'inngest/scheduled.timer', data: {} }

describe('crm-proactive-sweep runs one step per seller', () => {
  beforeEach(() => {
    svc.carrier = { bot: { tag: 'bot' }, opts: { ownerId: '144022504' } }
    svc.resolveSellers.mockReset()
    svc.runProactiveTick.mockReset()
    svc.runProactiveTickAll.mockReset()
  })

  it('resolve-sellers first, then sweep-<id> for each seller in order', async () => {
    svc.resolveSellers.mockResolvedValue(['144022504', '435572800'])
    svc.runProactiveTick.mockImplementation(
      async (_bot: unknown, opts: { ownerId: string }) => ({
        did: 'quiet',
        owner: opts.ownerId,
      })
    )
    const { step, names, inFlight } = fakeStep()
    const out = (await handler({ event: cronEvent, step } as never)) as any

    expect(names).toEqual([
      'resolve-sellers',
      'sweep-144022504',
      'sweep-435572800',
    ])
    expect(inFlight.max).toBe(1)
    expect(svc.runProactiveTickAll).not.toHaveBeenCalled()
    expect(svc.runProactiveTick).toHaveBeenCalledTimes(2)
    expect(svc.runProactiveTick.mock.calls[1][1]).toMatchObject({
      ownerId: '435572800',
    })
    expect(out.sellers).toEqual(['144022504', '435572800'])
    expect(out.outcomes.map((o: any) => o.owner)).toEqual([
      '144022504',
      '435572800',
    ])
    expect(out.owner).toBe('144022504')
    expect(typeof out.ms).toBe('number')
  })

  it('a seller that throws gets a failed row; the next seller still runs', async () => {
    svc.resolveSellers.mockResolvedValue(['144022504', '435572800'])
    svc.runProactiveTick
      .mockRejectedValueOnce(new Error('TypeError: terminated'))
      .mockResolvedValueOnce({ did: 'quiet' })
    const { step, names } = fakeStep()
    const out = (await handler({ event: cronEvent, step } as never)) as any

    expect(names).toHaveLength(3)
    expect(out.outcomes[0]).toEqual({
      owner: '144022504',
      outcome: { did: 'failed', why: 'TypeError: terminated' },
    })
    expect(out.outcomes[1]).toEqual({
      owner: '435572800',
      outcome: { did: 'quiet' },
    })
  })

  it('no carrier: paused, and not a single sweep step', async () => {
    svc.carrier = null
    const { step, names } = fakeStep()
    const out = (await handler({ event: cronEvent, step } as never)) as any
    expect(names).toEqual(['resolve-sellers'])
    expect(out).toMatchObject({ did: 'paused', why: 'carrier not registered' })
    expect(svc.resolveSellers).not.toHaveBeenCalled()
  })

  it('retries stay 0 -- a retry could push a second card', () => {
    expect((crmProactiveSweep as any).opts.retries).toBe(0)
  })
})

/**
 * THE STEP BUDGET -- production run 01M31ASM93K61CECEAWEYWH9GW, 2026-09-21.
 *
 * Request out at 06:30:00, run FAILED at 06:35:00 sharp ("HTTP 502 before the
 * SDK responded"), and the sweep it carried logged its own result at 06:36:14:
 * the work was healthy, the socket was not. The step has to give up before the
 * edge does, and hand back a row instead of a dead run.
 */
describe('a sweep that outlasts the wire', () => {
  beforeEach(() => {
    svc.carrier = { bot: { tag: 'bot' }, opts: { ownerId: '144022504' } }
    svc.resolveSellers.mockReset()
    svc.runProactiveTick.mockReset()
  })

  /*
   * Not merely "under the ceiling". The first budget was 240 s and the next
   * tick came back at 239.9 -- inside the rule, sixty seconds from the 502 it
   * was written to prevent. The ceiling is an observation (lesson
   * 2026-09-17), so the budget has to leave most of it unused, not a sliver.
   */
  it('leaves most of the edge budget unused, not a sliver', () => {
    const EDGE_MS = 300_000
    expect(SWEEP_STEP_BUDGET_MS).toBeLessThanOrEqual(EDGE_MS / 2)
  })

  it('returns the slow row and stops waiting', async () => {
    const forever = new Promise<never>(() => undefined)
    const out = await withStepBudget(forever, 5, () => ({
      did: 'slow' as const,
      why: 'still running',
      ms: 6,
    }))
    expect(out).toMatchObject({ did: 'slow' })
  })

  it('a sweep that rejects after we walked away does not go unhandled', async () => {
    let boom: (e: Error) => void = () => undefined
    const late = new Promise<never>((_, reject) => {
      boom = reject
    })
    const out = await withStepBudget(late, 5, () => ({
      did: 'slow' as const,
      why: 'still running',
      ms: 6,
    }))
    expect(out).toMatchObject({ did: 'slow' })
    boom(new Error('terminated, long after nobody was listening'))
    await new Promise(r => setTimeout(r, 10))
  })

  it('a sweep that answers in time is not called slow', async () => {
    const out = await withStepBudget(
      Promise.resolve({ did: 'card' }),
      5_000,
      () => ({
        did: 'slow' as const,
        why: 'unused',
        ms: 0,
      })
    )
    expect(out).toEqual({ did: 'card' })
  })

  it('the slow seller does not stop the next one', async () => {
    svc.resolveSellers.mockResolvedValue(['144022504', '435572800'])
    svc.runProactiveTick
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce({ did: 'quiet' })
    const { step, names } = fakeStep()
    /*
     * The real budget is ninety seconds; a test cannot wait for it, so the whole
     * point here is the SHAPE -- the second seller gets its own step and its
     * own answer. Timing is pinned by the two withStepBudget tests above.
     */
    vi.useFakeTimers()
    const run = handler({ event: cronEvent, step } as never) as Promise<any>
    await vi.advanceTimersByTimeAsync(SWEEP_STEP_BUDGET_MS + 10)
    const out = await run
    vi.useRealTimers()

    expect(names).toEqual([
      'resolve-sellers',
      'sweep-144022504',
      'sweep-435572800',
    ])
    expect(out.outcomes[0].outcome).toMatchObject({ did: 'slow' })
    expect(out.outcomes[1].outcome).toEqual({ did: 'quiet' })
  })
})
