/**
 * THE NUMBER NOBODY HAD, AND THE WAYS IT COULD LIE.
 *
 * Every assistant that sells an outcome publishes one measured figure. This
 * product could not answer the same question about itself: the owner saw
 * cards, receipts and a switch, and had no way to say whether this week went
 * better than the last.
 *
 * What is pinned here is not that the counter counts -- that is one line --
 * but the four ways it could mislead the person reading it: a refusal counted
 * as a send, a percentage invented out of nothing, an empty journal read as a
 * bad week, and somebody else's rows counted as yours.
 */
import { describe, it, expect } from 'vitest'
import {
  outcomesFrom,
  outcomesFor,
  OUTCOMES_SQL,
} from './src/agent/outcomes-tool'

const row = (kind: string, n: number, what: string | null = null) => ({
  kind,
  what,
  n,
})

describe('what went out', () => {
  it('separates what left by itself from what the owner sent', () => {
    const o = outcomesFrom(
      [
        row('card-auto-sent', 6),
        row('card-pressed', 3, 'отправил'), // cyrillic-ok: journal text
      ],
      7
    )
    expect(o.auto_sent).toBe(6)
    expect(o.pressed_sent).toBe(3)
    expect(o.without_you_percent).toBe(67)
  })

  it('does NOT count a refusal as a send -- the press writes its outcome', () => {
    const o = outcomesFrom(
      [
        row('card-pressed', 2, 'отправил'), // cyrillic-ok: journal text
        row('card-pressed', 5, 'не отправил'), // cyrillic-ok: journal text
      ],
      7
    )
    expect(o.pressed_sent).toBe(2)
    expect(o.cancelled).toBe(5)
    // Nothing left by itself, so the share is zero -- not 71% of presses.
    expect(o.without_you_percent).toBe(0)
  })

  it('invents no percentage when nothing left at all', () => {
    const o = outcomesFrom([row('sweep-idle', 40)], 7)
    expect(o.without_you_percent).toBeNull()
    expect(o.quiet).toBe(40)
  })

  it('says out loud when the journal has nothing, so 0 is not read as a bad week', () => {
    expect(outcomesFrom([], 7).note).toBeTruthy()
    // With real rows there is no note to explain away the numbers.
    expect(outcomesFrom([row('card-auto-sent', 1)], 7).note).toBeUndefined()
  })

  it('carries the sweep totals, so "quiet" is visible beside the sends', () => {
    const o = outcomesFrom(
      [row('sweep-card', 9), row('sweep-idle', 31), row('sweep-failed', 2)],
      30
    )
    expect(o).toMatchObject({ cards_drawn: 9, quiet: 31, failed: 2, days: 30 })
  })
})

describe('whose rows', () => {
  it('asks only for this owner, and only inside the window', async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      async query(sql: string, params: unknown[] = []) {
        seen.push({ sql, params })
        return { rows: [] }
      },
    }
    await outcomesFor(pool as never, '900000501', 14)
    expect(seen).toHaveLength(1)
    expect(seen[0].sql).toBe(OUTCOMES_SQL)
    expect(seen[0].params).toEqual(['900000501', '14'])
    // The window and the owner are parameters, never interpolated text.
    expect(OUTCOMES_SQL).toContain('who = $1')
    expect(OUTCOMES_SQL).toContain("($2 || ' days')::interval")
  })
})
