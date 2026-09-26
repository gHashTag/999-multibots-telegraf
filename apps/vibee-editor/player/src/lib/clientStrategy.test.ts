import { describe, expect, it } from 'vitest'
import {
  daysSince,
  MIN_MOVE_USES,
  nextMoves,
  rankByExperience,
  profileHighlights,
  temperatureOf,
  type StrategyInput,
} from './clientStrategy'

/**
 * THE NEXT MOVE IS THE SELLER'S RULES, IN ORDER.
 *
 * The order is the strategy: stop beats everything, an answer beats a sale,
 * the gift comes before an offer. Each pin below would pass with the order
 * shuffled only if the pin itself were wrong.
 */
const NOW = Date.parse('2026-09-24T12:00:00Z')
const base: StrategyInput = {
  stage: 'talking',
  waitingOnUs: false,
  lastInbound: '2026-09-24T10:00:00Z',
  lastOutbound: '2026-09-24T11:00:00Z',
  signals: [],
  intentScore: 0,
  balanceTokens: 100,
  portrait: { given: true, drawing: false, ready: false },
  assistantOff: false,
  hasSoul: true,
  hasProfile: true,
  planTotal: 0,
  planDone: 0,
}
const ids = (x: Partial<StrategyInput>) =>
  nextMoves({ ...base, ...x }, NOW).map(m => m.id)

describe('nextMoves', () => {
  it('a client who switched the assistant off gets ONE move: stop', () => {
    expect(ids({ assistantOff: true, waitingOnUs: true })).toEqual([
      'ownerOnly',
    ])
  })

  it('somebody who said no is offered nothing, whatever the words', () => {
    expect(
      ids({ stage: 'refused', signals: ['buy', 'price'], intentScore: 5 })
    ).toEqual(['refused'])
  })

  it('waiting on us: the answer comes before the deal', () => {
    const m = ids({
      waitingOnUs: true,
      signals: ['buy', 'price'],
      intentScore: 5,
    })
    expect(m[0]).toBe('answer')
    expect(m).toContain('close')
  })

  it('hot and not waiting: close is the first, urgent move', () => {
    const m = nextMoves(
      { ...base, signals: ['buy', 'price'], intentScore: 5 },
      NOW
    )
    expect(m[0]).toEqual({ id: 'close', tone: 'urgent' })
  })

  it('a paid client is never "closed" again', () => {
    expect(
      ids({ stage: 'client', signals: ['buy', 'price'], intentScore: 5 })
    ).not.toContain('close')
  })

  it('a ready portrait not yet given is sent before anything slower', () => {
    const m = ids({ portrait: { given: false, drawing: false, ready: true } })
    expect(m[0]).toBe('portraitSend')
  })

  it('quiet after OUR message for 3+ days: one soft nudge', () => {
    expect(
      ids({
        lastInbound: '2026-09-15T10:00:00Z',
        lastOutbound: '2026-09-20T10:00:00Z',
      })
    ).toContain('nudge')
    expect(ids({})).not.toContain('nudge')
  })

  it('low tokens on a paying client: top-up', () => {
    expect(ids({ stage: 'client', balanceTokens: 20 })).toContain('topUp')
    expect(ids({ stage: 'talking', balanceTokens: 20 })).not.toContain('topUp')
  })

  it('never more than three moves', () => {
    const m = ids({
      waitingOnUs: true,
      signals: ['objection', 'buy', 'price'],
      intentScore: 5,
      portrait: { given: false, drawing: false, ready: true },
      hasSoul: false,
      hasProfile: false,
    })
    expect(m.length).toBe(3)
  })
})

describe('temperatureOf', () => {
  it('silence is unknown, not cold', () => {
    expect(temperatureOf(null, [])).toBe('unknown')
  })
  it('buy + price is hot; an objection cools a weak signal', () => {
    expect(temperatureOf(3, ['buy', 'price'])).toBe('hot')
    expect(temperatureOf(1, ['objection', 'service'])).toBe('cold')
    expect(temperatureOf(2, ['service'])).toBe('warm')
  })
})

describe('daysSince', () => {
  it('counts whole days and refuses garbage', () => {
    expect(daysSince('2026-09-21T12:00:00Z', NOW)).toBe(3)
    expect(daysSince('not a date', NOW)).toBeNull()
    expect(daysSince(null, NOW)).toBeNull()
  })
})

describe('profileHighlights', () => {
  it('puts the forbidden things first and flags them', () => {
    const h = profileHighlights({
      business: 'yoga studio',
      forbidden: ['guarantees', 'medical claims'],
      how_to_work_with_her: 'short messages',
      random: 'x',
    })
    expect(h.map(x => x.key)).toEqual([
      'forbidden',
      'how_to_work_with_her',
      'business',
    ])
    expect(h[0]).toMatchObject({
      text: 'guarantees · medical claims',
      warning: true,
    })
  })
  it('cuts long values and tolerates null', () => {
    expect(profileHighlights(null)).toEqual([])
    const [h] = profileHighlights({ business: 'a'.repeat(500) }, 5, 50)
    expect(h.text.length).toBe(50)
  })
})

describe('experience reorders only what the rules allow', () => {
  const stat = (score: number, used = MIN_MOVE_USES) => ({
    used,
    replied: 0,
    bought: 0,
    refused: 0,
    score,
  })

  it('ranks the normal moves by proven score, best first', () => {
    const moves = [
      { id: 'objection', tone: 'normal' },
      { id: 'discovery', tone: 'normal' },
      { id: 'nudge', tone: 'normal' },
    ] as const
    const out = rankByExperience([...moves], {
      nudge: stat(2),
      objection: stat(-1),
    })
    expect(out.map(m => m.id)).toEqual(['nudge', 'discovery', 'objection'])
  })

  it('never moves an urgent move, whatever the statistics say', () => {
    const out = nextMoves(
      { ...base, waitingOnUs: true, signals: ['objection'], hasSoul: false },
      NOW,
      { answer: stat(-5), writeSoul: stat(9) }
    )
    expect(out[0]).toEqual({ id: 'answer', tone: 'urgent' })
    expect(out[1].id).toBe('writeSoul')
  })

  it('an anecdote (fewer uses than the minimum) keeps rule order', () => {
    expect(
      ids({ signals: ['objection'], hasSoul: false }) // rule order
    ).toEqual(['objection', 'writeSoul'])
    const out = nextMoves(
      { ...base, signals: ['objection'], hasSoul: false },
      NOW,
      { writeSoul: stat(9, MIN_MOVE_USES - 1) }
    )
    expect(out.map(m => m.id)).toEqual(['objection', 'writeSoul'])
  })

  it('a stop stays the only move', () => {
    expect(
      nextMoves({ ...base, assistantOff: true }, NOW, { nudge: stat(9) })
    ).toEqual([{ id: 'ownerOnly', tone: 'stop' }])
  })
})
