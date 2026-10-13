import { describe, it, expect, beforeEach } from 'vitest'
import {
  CLUB_PERIOD_S,
  CLUB_STARS,
  bookClubPeriods,
  clubPaidText,
  forgetClubTablesForTests,
  type StarTx,
} from './src/agent/club-membership'

/**
 * EVERY PAID CLUB PERIOD REACHES THE OWNER, ONCE.
 *
 * Owner, 2026-10-13: a club payment used to land only in the hive journal.
 * Now the owner gets a live message per booked period: who paid, how much,
 * until when, and how many members are active. Pinned here:
 *  - one message per period, only when the INSERT created the row;
 *  - the same transaction seen again tells nothing;
 *  - a failing send, or a failing count, never breaks the booking.
 * Ids are invented (9000000xx).
 */

function fakePool(opts: { countFails?: boolean } = {}) {
  const periods: Array<Record<string, unknown>> = []
  return {
    periods,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(CREATE|ALTER)/i.test(s)) return { rows: [] }
      if (/^INSERT INTO club_period/i.test(s)) {
        if (periods.some(p => p.star_tx_id === params[3])) return { rows: [] }
        periods.push({
          telegram_id: params[0],
          star_tx_id: params[3],
          until: params[5],
        })
        return { rows: [{ id: periods.length }] }
      }
      if (/FROM club_period WHERE star_tx_id/i.test(s))
        return {
          rows: periods
            .filter(p => p.star_tx_id === params[0])
            .map((_, i) => ({ id: i + 1 })),
        }
      if (/count\(DISTINCT telegram_id\)/i.test(s)) {
        if (opts.countFails) throw new Error('db down')
        return { rows: [{ n: new Set(periods.map(p => p.telegram_id)).size }] }
      }
      return { rows: [] }
    },
  }
}

const T0 = Math.floor(new Date('2026-10-13T00:00:00Z').getTime() / 1000)
const charge = (id: string, user: number): StarTx => ({
  id,
  amount: CLUB_STARS,
  date: T0,
  source: {
    type: 'user',
    user: { id: user, first_name: 'Ann', username: 'ann_t' },
    subscription_period: CLUB_PERIOD_S,
  },
})
const credit = async () => ({ credited: true })

beforeEach(() => forgetClubTablesForTests())

describe('the owner hears of every paid club period', () => {
  it('one message per new period, with who, stars, until and members', async () => {
    const pool = fakePool()
    const told: string[] = []
    const tellOwner = async (t: string) => void told.push(t)
    await bookClubPeriods(pool, [charge('tx1', 900000001)], credit, undefined, {
      tellOwner,
    })
    expect(told).toHaveLength(1)
    expect(told[0]).toContain('Ann @ann_t id 900000001')
    expect(told[0]).toContain('10 000 Stars')
    expect(told[0]).toContain('until 2026-11-12')
    expect(told[0]).toContain('active members now: 1')
  })

  it('the same transaction seen again tells nothing', async () => {
    const pool = fakePool()
    const told: string[] = []
    const tellOwner = async (t: string) => void told.push(t)
    await bookClubPeriods(pool, [charge('tx1', 900000001)], credit, undefined, {
      tellOwner,
    })
    await bookClubPeriods(pool, [charge('tx1', 900000001)], credit, undefined, {
      tellOwner,
    })
    expect(told).toHaveLength(1)
  })

  it('a failing send never breaks the booking', async () => {
    const pool = fakePool()
    const booked = await bookClubPeriods(
      pool,
      [charge('tx1', 900000001)],
      credit,
      undefined,
      {
        tellOwner: async () => {
          throw new Error('telegram down')
        },
      }
    )
    expect(booked).toHaveLength(1)
    expect(pool.periods).toHaveLength(1)
  })

  it('a failing member count still sends, without the count', async () => {
    const pool = fakePool({ countFails: true })
    const told: string[] = []
    await bookClubPeriods(pool, [charge('tx1', 900000001)], credit, undefined, {
      tellOwner: async t => void told.push(t),
    })
    expect(told).toHaveLength(1)
    expect(told[0]).not.toContain('active members')
  })

  it('a cash month says cash', () => {
    expect(
      clubPaidText(
        {
          telegramId: '900000002',
          stars: 0,
          until: '2026-11-12T00:00:00Z',
          via: 'cash',
        },
        3
      )
    ).toBe(
      'Club payment: id 900000002 paid cash, member until 2026-11-12, active members now: 3.'
    )
  })
})
