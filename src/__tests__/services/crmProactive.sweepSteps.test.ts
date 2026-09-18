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
import { crmProactiveSweep } from '@/inngest_app/functions/crm/crmProactiveSweep'

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
