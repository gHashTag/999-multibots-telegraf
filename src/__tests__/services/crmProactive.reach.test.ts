import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  sweepOnce,
  carrierFor,
  cannotReach,
  resetProactiveForTests,
  resetReachCacheForTests,
  reportSweepOutcome,
  type SweepDeps,
} from '@/services/crmProactive'
import { logger } from '@/utils/logger'

/**
 * A CARD THAT CANNOT ARRIVE IS NOT WORTH A MODEL TURN.
 *
 * Production 2026-09-26 19:01: seller 6879003264 had never opened the
 * carrier bot. The sweep ran 107 s, a model turn wrote a card, Telegram
 * answered "400: Bad Request: chat not found" at the last step, and it was
 * paged as an ERROR -- to repeat every half hour. Pinned: the sweep asks
 * first whether any bot can write to the owner, and the card goes through
 * the owner's own bot when the carrier cannot reach them.
 */
const OWNER = '900000095'
const draft = {
  id: 'p1',
  action: 'send',
  target: '555',
  what: 'hi',
  secret: 's',
}

const bot = (reachable: boolean | 'network') => ({
  sendMessage: vi.fn(async () => ({})),
  sendPhoto: vi.fn(async () => ({})),
  getChat: vi.fn(async () => {
    if (reachable === 'network') throw new Error('ETIMEDOUT')
    if (!reachable) throw new Error('400: Bad Request: chat not found')
    return { id: OWNER }
  }),
})

beforeEach(() => {
  resetProactiveForTests()
  resetReachCacheForTests()
  vi.mocked(logger.warn).mockClear()
})

describe('cannotReach', () => {
  it('knows the Telegram answers that mean "this bot cannot write here"', () => {
    for (const m of [
      '400: Bad Request: chat not found',
      '403: Forbidden: bot was blocked by the user',
      "403: Forbidden: bot can't initiate conversation with a user",
    ])
      expect(cannotReach(new Error(m))).toBe(true)
    expect(cannotReach(new Error('ETIMEDOUT'))).toBe(false)
  })
})

describe('carrierFor', () => {
  it('the carrier when it can reach the owner', async () => {
    const c = bot(true)
    expect(await carrierFor(c as never, OWNER, async () => [])).toBe(c)
  })

  it("the owner's own bot when the carrier cannot", async () => {
    const c = bot(false)
    const own = bot(true)
    expect(
      await carrierFor(c as never, OWNER, async () => [own as never])
    ).toBe(own)
  })

  it('null when no bot can, said once a day and not every tick', async () => {
    const c = bot(false)
    expect(await carrierFor(c as never, OWNER, async () => [], 0)).toBeNull()
    expect(
      await carrierFor(c as never, OWNER, async () => [], 31 * 60_000)
    ).toBeNull()
    expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(1)
  })

  it('a network error is "unknown", read as the carrier, never as "cannot"', async () => {
    const c = bot('network')
    expect(await carrierFor(c as never, OWNER, async () => [])).toBe(c)
  })
})

describe('the sweep asks first', () => {
  const deps = (reach: SweepDeps['reach']) => {
    const calls: string[] = []
    const d: SweepDeps = {
      ask: async () => {
        calls.push('ask')
        return { текст: 'x', proposal: draft } as never // cyrillic-ok: pre-existing field
      },
      ingest: async () => {
        calls.push('ingest')
      },
      push: async () => {
        calls.push('push')
      },
      now: () => 1_000_000,
      reach,
    }
    return { d, calls }
  }

  it('an owner no bot can reach: held, no memory refresh, no model turn, no page', async () => {
    const { d, calls } = deps(async () => false)
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('held')
    expect(calls).toEqual([])
    expect(reportSweepOutcome(r, OWNER)).toBe('info')
  })

  it('a reachable owner is swept as before', async () => {
    const { d, calls } = deps(async () => true)
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('card')
    expect(calls).toContain('push')
  })

  it('a reach check that throws does not silence the seller', async () => {
    const { d } = deps(async () => {
      throw new Error('down')
    })
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
  })
})
