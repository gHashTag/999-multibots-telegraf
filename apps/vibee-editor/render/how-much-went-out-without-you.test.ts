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
  OUTCOMES_BEFORE_SQL,
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
  it('asks only for this owner, and only inside the two windows', async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      async query(sql: string, params: unknown[] = []) {
        seen.push({ sql, params })
        return { rows: [] }
      },
    }
    await outcomesFor(pool as never, '900000501', 14)
    expect(seen.map(s => s.sql)).toEqual([OUTCOMES_SQL, OUTCOMES_BEFORE_SQL])
    for (const call of seen) expect(call.params).toEqual(['900000501', '14'])
    // The window and the owner are parameters, never interpolated text.
    for (const sql of [OUTCOMES_SQL, OUTCOMES_BEFORE_SQL]) {
      expect(sql).toContain('who = $1')
      expect(sql).toContain("($2 || ' days')::interval")
    }
    // The earlier window ENDS where this one starts: no overlap, or the same
    // send would be counted in both and every comparison would read flat.
    expect(OUTCOMES_BEFORE_SQL).toContain('* 2')
    expect(OUTCOMES_BEFORE_SQL).toContain('at <= now()')
  })
})

describe('the window before', () => {
  const pool = (now: unknown[], before: unknown[]) => {
    let call = 0
    return {
      async query() {
        call += 1
        return { rows: call === 1 ? now : before }
      },
    }
  }

  it('is carried beside this week, so a number has something to compare with', async () => {
    const o = await outcomesFor(
      pool(
        [row('card-auto-sent', 9), row('card-pressed', 1, 'отправил')], // cyrillic-ok: journal text
        [row('card-auto-sent', 2), row('card-pressed', 8, 'отправил')] // cyrillic-ok: journal text
      ) as never,
      '900000502',
      7
    )
    expect(o.without_you_percent).toBe(90)
    expect(o.before).toMatchObject({
      auto_sent: 2,
      pressed_sent: 8,
      left: 10,
      without_you_percent: 20,
    })
  })

  it('is NULL when the earlier window is empty -- no trend invented from nothing', async () => {
    const o = await outcomesFor(
      pool([row('card-auto-sent', 3)], []) as never,
      '900000503',
      7
    )
    expect(o.before).toBeNull()
  })

  it('survives a database that answers the first question and not the second', async () => {
    let call = 0
    const flaky = {
      async query() {
        call += 1
        if (call === 2) throw new Error('timeout')
        return { rows: [row('card-auto-sent', 4)] }
      },
    }
    const o = await outcomesFor(flaky as never, '900000504', 7)
    expect(o.auto_sent).toBe(4)
    expect(o.before).toBeNull()
  })
})
