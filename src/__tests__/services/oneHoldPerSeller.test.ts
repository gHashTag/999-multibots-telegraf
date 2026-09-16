import { describe, it, expect, beforeEach } from 'vitest'
import {
  sweepOnce,
  resetProactiveForTests,
  noteResolved,
  holdFor,
  HOLD_MS_DEFAULT,
  UNPRESSED_BEFORE_BACKOFF,
  BACKOFF_CAP_MS,
  type SweepDeps,
} from '@/services/crmProactive'

/*
 * ONE HOLD PER SELLER, NOT ONE FOR EVERYBODY.
 *
 * ADMIN_IDS names more than one person and runProactiveTickAll walks them all
 * inside a single tick, so the first seller to get a card used to set a
 * module-level lastPushAt -- and every other seller was answered `held` for
 * two hours about a card they cannot see and cannot press.
 *
 * Production, 2026-09-16 07:02:19, two lines in one second:
 *   [crm-proactive] sweep {"did":"card"}
 *   [crm-proactive] sweep {"did":"held","why":"карточка ещё ждёт нажатия"}
 *
 * Ids are synthetic (9000000xx) except the owner's own, which is public in
 * this repository already.
 */
const A = '144022504'
const B = '900000091'
const NOW = 1_000_000

const draft = {
  id: 'p1',
  action: 'send',
  target: '555',
  what: 'привет', // cyrillic-ok: fixture text
  secret: 's',
}

function deps(now = NOW, over: Partial<SweepDeps> = {}) {
  const calls: string[] = []
  const d: SweepDeps = {
    ask: async () => {
      calls.push('ask')
      return { текст: 'подготовил', proposal: draft } as never // cyrillic-ok: pre-existing identifiers
    },
    ingest: async () => {
      calls.push('ingest')
    },
    push: async () => {
      calls.push('push')
    },
    record: async () => 'recorded',
    now: () => now,
    ...over,
  }
  return { d, calls }
}

beforeEach(() => resetProactiveForTests())

describe('a card for one seller does not hold another', () => {
  it('the second seller is swept, not refused', async () => {
    const first = await sweepOnce(A, deps().d)
    expect(first.did).toBe('card')
    const { d, calls } = deps()
    const second = await sweepOnce(B, d)
    expect(second.did, 'B was told to wait for a card that belongs to A').toBe(
      'card'
    )
    expect(calls).toContain('ask')
  })

  it('and the same seller IS held by their own card', async () => {
    await sweepOnce(A, deps().d)
    const again = await sweepOnce(A, deps().d)
    expect(again.did).toBe('held')
  })

  it("a press frees only the presser's hold", async () => {
    await sweepOnce(A, deps().d)
    await sweepOnce(B, deps().d)
    noteResolved(A)
    expect((await sweepOnce(A, deps().d)).did).toBe('card')
    expect((await sweepOnce(B, deps().d)).did).toBe('held')
  })

  it('an anonymous press frees nobody, rather than everybody', async () => {
    await sweepOnce(A, deps().d)
    noteResolved(undefined)
    expect((await sweepOnce(A, deps().d)).did).toBe('held')
  })
})

describe('a card nobody presses is asked for less often', () => {
  it('the first cards keep the plain two-hour hold', () => {
    for (let n = 0; n < UNPRESSED_BEFORE_BACKOFF; n += 1) {
      expect(holdFor(n), `unpressed=${n}`).toBe(HOLD_MS_DEFAULT)
    }
  })

  it('the run of silence doubles it, and the cap holds', () => {
    expect(holdFor(UNPRESSED_BEFORE_BACKOFF)).toBe(HOLD_MS_DEFAULT * 2)
    expect(holdFor(UNPRESSED_BEFORE_BACKOFF + 1)).toBe(HOLD_MS_DEFAULT * 4)
    expect(holdFor(100)).toBe(BACKOFF_CAP_MS)
    expect(holdFor(1000)).toBe(BACKOFF_CAP_MS)
  })

  it('junk is not a licence to ask forever', () => {
    expect(holdFor(-5)).toBe(HOLD_MS_DEFAULT)
    expect(holdFor(2.9)).toBe(HOLD_MS_DEFAULT)
  })

  it('the wait really grows in the sweep, not only in the helper', async () => {
    // Three unanswered cards, each read at a moment past the previous hold.
    let now = NOW
    for (let n = 0; n < UNPRESSED_BEFORE_BACKOFF; n += 1) {
      expect((await sweepOnce(A, deps(now).d)).did).toBe('card')
      now += HOLD_MS_DEFAULT + 1
    }
    // A fourth would have been due under the plain hold; it is not now.
    expect((await sweepOnce(A, deps(now).d)).did).toBe('held')
    // Past the doubled hold it comes back.
    expect((await sweepOnce(A, deps(now + HOLD_MS_DEFAULT).d)).did).toBe('card')
  })

  it('one press ends the silence and the plain hold returns', async () => {
    let now = NOW
    for (let n = 0; n < UNPRESSED_BEFORE_BACKOFF; n += 1) {
      await sweepOnce(A, deps(now).d)
      now += HOLD_MS_DEFAULT + 1
    }
    noteResolved(A)
    expect((await sweepOnce(A, deps(now).d)).did).toBe('card')
    now += HOLD_MS_DEFAULT + 1
    expect(
      (await sweepOnce(A, deps(now).d)).did,
      'the backoff should have been reset by the press'
    ).toBe('card')
  })
})
