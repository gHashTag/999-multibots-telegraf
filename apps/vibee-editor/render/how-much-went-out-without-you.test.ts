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
  OUTCOMES_DM_SQL,
  OUTCOMES_DM_BEFORE_SQL,
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
    // Four questions now: this window and the one before it, for cards and
    // for the answers given in his chats.
    expect(new Set(seen.map(s => s.sql))).toEqual(
      new Set([
        OUTCOMES_SQL,
        OUTCOMES_BEFORE_SQL,
        OUTCOMES_DM_SQL,
        OUTCOMES_DM_BEFORE_SQL,
      ])
    )
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
  /*
   * Answers BY STATEMENT, not by call order. The first version keyed off the
   * call counter and quietly fed the card rows to the question about answers
   * in his chats -- the same trap as the double that matched a statement by
   * substring. What a double answers must depend on what it was asked.
   */
  const pool = (now: unknown[], before: unknown[], dm = 0, dmBefore = 0) => ({
    async query(sql: string) {
      if (sql === OUTCOMES_SQL) return { rows: now }
      if (sql === OUTCOMES_BEFORE_SQL) return { rows: before }
      if (sql === OUTCOMES_DM_SQL) return { rows: [{ n: dm }] }
      if (sql === OUTCOMES_DM_BEFORE_SQL) return { rows: [{ n: dmBefore }] }
      throw new Error(`unexpected sql: ${sql.slice(0, 40)}`)
    },
  })

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

  it('survives a database that answers this window and not the one before', async () => {
    const flaky = {
      async query(sql: string) {
        if (sql === OUTCOMES_BEFORE_SQL) throw new Error('timeout')
        if (sql === OUTCOMES_SQL) return { rows: [row('card-auto-sent', 4)] }
        return { rows: [{ n: 0 }] }
      },
    }
    const o = await outcomesFor(flaky as never, '900000504', 7)
    expect(o.auto_sent).toBe(4)
    expect(o.before).toBeNull()
  })
})

/**
 * THE ANSWERS THE FIGURE USED TO IGNORE.
 *
 * The first production reading said "0% without you" -- and it was wrong by
 * omission: it counted cards, the rare path, and not the common one, where a
 * client writes to the owner's Telegram and the agent answers with nobody
 * touching anything. Measured the morning this shipped: 263 such answers in a
 * week against 13 card presses.
 */
describe('answers given in his chats', () => {
  const pool = (rows: {
    now?: unknown[]
    before?: unknown[]
    dm?: number
    dmBefore?: number
  }) => {
    const seen: string[] = []
    return {
      seen,
      async query(sql: string) {
        seen.push(sql)
        if (sql === OUTCOMES_SQL) return { rows: rows.now ?? [] }
        if (sql === OUTCOMES_BEFORE_SQL) return { rows: rows.before ?? [] }
        if (sql === OUTCOMES_DM_SQL) return { rows: [{ n: rows.dm ?? 0 }] }
        if (sql === OUTCOMES_DM_BEFORE_SQL)
          return { rows: [{ n: rows.dmBefore ?? 0 }] }
        throw new Error(`unexpected sql: ${sql.slice(0, 40)}`)
      },
    }
  }

  it('counts them, and the share is over everything that reached a client', async () => {
    const o = await outcomesFor(
      pool({
        now: [row('card-pressed', 13, 'отправил')], // cyrillic-ok: journal text
        dm: 263,
      }) as never,
      '900000601',
      7
    )
    expect(o.dm_answered).toBe(263)
    // 263 of 276 went out with nobody pressing anything.
    expect(o.without_you_percent).toBe(95)
  })

  it('does not count them for another seller: the join is on his own leads', async () => {
    for (const sql of [OUTCOMES_DM_SQL, OUTCOMES_DM_BEFORE_SQL]) {
      expect(sql).toContain('c.owner_id = $1')
      expect(sql).toContain("a.surface = 'business'")
      expect(sql).toContain("a.role = 'assistant'")
    }
  })

  it('carries them in the comparison too', async () => {
    const o = await outcomesFor(
      pool({ dm: 10, dmBefore: 4, now: [], before: [] }) as never,
      '900000602',
      7
    )
    expect(o.before).toMatchObject({ dm_answered: 4, left: 4 })
    expect(o.without_you_percent).toBe(100)
  })

  it('a week of answers is not an empty week, whatever the cards say', async () => {
    const o = await outcomesFor(pool({ dm: 5 }) as never, '900000603', 7)
    expect(o.note).toBeUndefined()
  })

  it('a half that cannot be read says zero for that half, not for the answer', async () => {
    const half = {
      async query(sql: string) {
        if (sql === OUTCOMES_DM_SQL) throw new Error('timeout')
        if (sql === OUTCOMES_SQL) return { rows: [row('card-auto-sent', 2)] }
        return { rows: [] }
      },
    }
    const o = await outcomesFor(half as never, '900000604', 7)
    expect(o.dm_answered).toBe(0)
    expect(o.auto_sent).toBe(2)
    expect(o.without_you_percent).toBe(100)
  })
})
