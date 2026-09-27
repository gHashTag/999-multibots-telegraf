import { describe, expect, it } from 'vitest'
import {
  MIN_USES,
  moveStatsFor,
  moveStatsLine,
  scoreMoves,
  type LeadEvent,
  type MoveUse,
} from './crm-move-stats'
import { COMPACT_TOOLS_EXCLUDED, TOOLS_BY_NAME } from './tools'
import { supervisorBlock } from './chat'

/**
 * THE SALES MOVES LEARN FROM WHAT FOLLOWED THEM.
 *
 * Pinned: an outcome counts only inside the 7 days after the move, only
 * for that lead; a purchase outweighs a reply and a refusal counts against;
 * the prompt line lists only moves used often enough, best first; and the
 * Queen reads it.
 */
const DAY = 24 * 60 * 60 * 1000
const T = Date.parse('2026-09-01T00:00:00Z')
const use = (lead: string, move: string, day = 0): MoveUse => ({
  lead,
  move,
  at: T + day * DAY,
})
const ev = (lead: string, kind: LeadEvent['kind'], day: number): LeadEvent => ({
  lead,
  kind,
  at: T + day * DAY,
})

describe('scoreMoves', () => {
  it('counts what followed within 7 days, for that lead only', () => {
    const s = scoreMoves(
      [use('900000031', 'answer'), use('900000032', 'answer')],
      [
        ev('900000031', 'inbound', 1), // counts
        ev('900000032', 'inbound', 9), // too late
        ev('900000033', 'bought', 1), // another lead
        ev('900000031', 'inbound', -1), // before the move
      ]
    )
    expect(s.answer).toEqual({
      used: 2,
      replied: 1,
      bought: 0,
      refused: 0,
      score: 0.5,
    })
  })

  it('a purchase outweighs a reply; a refusal counts against', () => {
    const s = scoreMoves(
      [use('900000031', 'close'), use('900000032', 'nudge')],
      [ev('900000031', 'bought', 2), ev('900000032', 'refused', 2)]
    )
    expect(s.close.score).toBe(3)
    expect(s.nudge.score).toBe(-2)
  })
})

describe('moveStatsLine', () => {
  it('lists only moves used often enough, best first', () => {
    const many = (move: string, n: number) =>
      Array.from({ length: n }, (_, i) => use(String(900000040 + i), move))
    const s = scoreMoves(
      [
        ...many('portraitGive', MIN_USES),
        ...many('nudge', MIN_USES),
        use('900000099', 'rare'),
      ],
      [ev('900000040', 'bought', 1)]
    )
    const line = moveStatsLine(s)
    expect(line.indexOf('portraitGive')).toBeGreaterThan(-1)
    expect(line.indexOf('portraitGive')).toBeLessThan(line.indexOf('nudge'))
    expect(line).not.toContain('rare')
    expect(moveStatsLine({})).toBe('')
  })
})

describe('wiring', () => {
  it('the tool is registered and kept out of the compact kit', () => {
    expect(TOOLS_BY_NAME.get('crm_move_stats')).toBeTruthy()
    expect(COMPACT_TOOLS_EXCLUDED.test('crm_move_stats')).toBe(true)
  })
  it('the Queen reads what worked', () => {
    expect(supervisorBlock('', 'close: применён 4')).toContain(
      // cyrillic-ok
      'ЧТО РАБОТАЛО У ЭТОГО ВЛАДЕЛЬЦА' // cyrillic-ok
    )
    expect(supervisorBlock('', '')).not.toContain('ЧТО РАБОТАЛО') // cyrillic-ok
  })
})

describe('moveStatsFor counts a Stars payment as a purchase (audit #8)', () => {
  it('a purchase in the live wallet after the move is "bought"', async () => {
    const now = Date.now()
    const seen: string[] = []
    const pool = {
      query: async (sql: string) => {
        seen.push(sql)
        if (/FROM crm_touches[\s\S]*note LIKE/.test(sql))
          return {
            rows: [
              {
                lead_id: '900000041',
                note: 'move:offer',
                at: new Date(now - 3 * DAY).toISOString(),
              },
            ],
          }
        if (/FROM token_ledger/.test(sql))
          return {
            rows: [
              {
                telegram_id: '900000041',
                created_at: new Date(now - 2 * DAY).toISOString(),
              },
            ],
          }
        return { rows: [] }
      },
    }
    const stats = await moveStatsFor(pool, '900000040')
    expect(stats.offer.bought).toBe(1)
    expect(seen.find(q => /FROM token_ledger/.test(q))).toMatch(
      /kind = 'purchase' AND delta > 0/
    )
  })

  it('an unreadable wallet leaves the other outcomes standing', async () => {
    const now = Date.now()
    const pool = {
      query: async (sql: string) => {
        if (/FROM token_ledger/.test(sql)) throw new Error('no table')
        if (/note LIKE/.test(sql))
          return {
            rows: [
              {
                lead_id: '900000042',
                note: 'move:talk',
                at: new Date(now - 3 * DAY).toISOString(),
              },
            ],
          }
        if (/FROM crm_messages/.test(sql))
          return {
            rows: [
              {
                lead_id: '900000042',
                at: new Date(now - 2 * DAY).toISOString(),
              },
            ],
          }
        return { rows: [] }
      },
    }
    const stats = await moveStatsFor(pool, '900000040')
    expect(stats.talk.replied).toBe(1)
    expect(stats.talk.bought).toBe(0)
  })
})
