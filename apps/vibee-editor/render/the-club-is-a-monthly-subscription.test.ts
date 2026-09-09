import { describe, it, expect, beforeEach } from 'vitest'
import {
  CLUB_STARS,
  CLUB_PERIOD_S,
  clubTokensPerPeriod,
  mintClubInvoice,
  bookClubPeriods,
  clubStatus,
  handleClub,
  isClubCharge,
  sweepClubRenewals,
  forgetClubTablesForTests,
  type StarTx,
} from './src/agent/club-membership'
import {
  МАКС_ЗВЁЗД_ПОДПИСКА as SUB_MAX, // cyrillic-ok: pre-existing export name
  ПЕРИОД_ПОДПИСКИ_С as SUB_PERIOD, // cyrillic-ok: pre-existing export name
} from './src/agent/token-packs' // cyrillic-ok: pre-existing export names

/**
 * THE CLUB: 10 000 STARS EVERY 30 DAYS, THIRTY PERCENT BACK IN TOKENS.
 *
 * The owner's shape (2026-09-09): a Telegram Stars subscription at the
 * measured ceiling; each charge returns 30% as tokens (2 571) and the rest is
 * income. Renewals happen inside Telegram, so the one thing this file must
 * never do is let a charged month go uncredited -- and never credit one twice.
 */

function fakePool() {
  const periods: Array<Record<string, unknown>> = []
  const journal: Array<unknown[]> = []
  return {
    periods,
    journal,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(CREATE|ALTER)/i.test(s)) return { rows: [] }
      if (/^INSERT INTO club_period/i.test(s)) {
        if (periods.some(p => p.star_tx_id === params[3])) return { rows: [] }
        periods.push({
          id: periods.length + 1,
          telegram_id: params[0],
          stars: params[1],
          tokens_granted: params[2],
          star_tx_id: params[3],
          paid_at: params[4],
          until: params[5],
        })
        return { rows: [{ id: periods.length }] }
      }
      if (/^INSERT INTO hive_events/i.test(s)) {
        journal.push(params)
        return { rows: [] }
      }
      if (/FROM club_period WHERE star_tx_id/i.test(s)) {
        return {
          rows: periods
            .filter(p => p.star_tx_id === params[0])
            .map(p => ({ id: p.id })),
        }
      }
      if (/FROM club_period WHERE telegram_id/i.test(s)) {
        const mine = periods
          .filter(p => p.telegram_id === params[0])
          .sort((a, b) => String(b.until).localeCompare(String(a.until)))
        return {
          rows: mine.slice(0, 1).map(p => ({
            paid_at: p.paid_at,
            until: p.until,
            periods: mine.length,
          })),
        }
      }
      return { rows: [] }
    },
  }
}

function fakeCredit() {
  const credits: Array<{
    telegramId: string
    tokens: number
    chargeId: string
  }> = []
  const fn = async (c: {
    telegramId: string
    tokens: number
    chargeId: string
  }) => {
    credits.push(c)
    return { credited: true }
  }
  return { credits, fn }
}

const T0 = Math.floor(new Date('2026-09-09T00:00:00Z').getTime() / 1000)

function charge(
  id: string,
  user: number,
  date = T0,
  amount = CLUB_STARS
): StarTx {
  return {
    id,
    amount,
    date,
    source: {
      type: 'user',
      user: { id: user },
      subscription_period: CLUB_PERIOD_S,
    },
  }
}

const invoiceFetch = (async (_url: string, init?: { body?: string }) => {
  const sent = JSON.parse(String(init?.body ?? '{}'))
  return {
    json: async () => ({
      ok: true,
      result: `https://t.me/$sub-${sent.prices?.[0]?.amount}-${sent.subscription_period}`,
    }),
  }
}) as unknown as typeof fetch

const txFetch = (txs: StarTx[]) =>
  (async () => ({
    json: async () => ({ ok: true, result: { transactions: txs } }),
  })) as unknown as typeof fetch

beforeEach(() => forgetClubTablesForTests())

describe('the price, the period and the share', () => {
  it('the monthly price is exactly the measured subscription ceiling', () => {
    expect(CLUB_STARS).toBe(10_000)
    expect(CLUB_STARS).toBe(SUB_MAX)
  })

  it('the period is the only one Telegram allows', () => {
    expect(CLUB_PERIOD_S).toBe(SUB_PERIOD)
    expect(CLUB_PERIOD_S).toBe(30 * 24 * 60 * 60)
  })

  it('thirty percent back in tokens, on the top pack rate', () => {
    // 10000 * 0.3 * 150 / 175 = 2571.4 -> 2571
    expect(clubTokensPerPeriod()).toBe(2_571)
    // Sanity: seventy percent stays as income.
    expect((2_571 * 175) / 150 / 10_000).toBeLessThan(0.31)
  })
})

describe('the invoice is a subscription', () => {
  it('asks Telegram for a 30-day subscription at the ceiling', async () => {
    const minted = await mintClubInvoice({
      forTelegramId: '144022504',
      botToken: 'bot',
      fetchImpl: invoiceFetch,
    })
    expect(minted.url).toBe('https://t.me/$sub-10000-2592000')
    expect(minted.stars).toBe(10_000)
    expect(minted.tokens).toBe(2_571)
    expect(minted.payload).toBe('club:10000:144022504')
  })

  it('refuses a chat id and a missing cashier', async () => {
    await expect(
      mintClubInvoice({
        forTelegramId: '-100123',
        botToken: 'bot',
        fetchImpl: invoiceFetch,
      })
    ).rejects.toThrow()
    await expect(
      mintClubInvoice({
        forTelegramId: '144022504',
        botToken: '',
        fetchImpl: invoiceFetch,
      })
    ).rejects.toThrow(/TOKENS_PAYMENT_BOT_TOKEN/)
  })
})

describe('recognising a club charge', () => {
  it('needs the amount, the period and a user', () => {
    expect(isClubCharge(charge('a', 1))).toBe(true)
    expect(isClubCharge(charge('a', 1), '1')).toBe(true)
    expect(isClubCharge(charge('a', 1), '2')).toBe(false)
    expect(isClubCharge(charge('a', 1, T0, 175))).toBe(false)
    const oneOff = charge('a', 1)
    delete oneOff.source!.subscription_period
    expect(isClubCharge(oneOff)).toBe(false)
    expect(isClubCharge({ id: 'x', amount: 10_000, date: T0 })).toBe(false)
  })
})

describe('booking periods: every charge once, never twice', () => {
  it('the first charge opens 30 days and credits 2 571 tokens', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeCredit()
    const booked = await bookClubPeriods(pool, [charge('tx1', 1)], fn, '1')
    expect(booked).toHaveLength(1)
    expect(booked[0].until).toBe('2026-10-09T00:00:00.000Z')
    expect(credits).toEqual([
      { telegramId: '1', tokens: 2_571, chargeId: 'club:tx1' },
    ])
    const st = await clubStatus(pool, '1', new Date('2026-09-10T00:00:00Z'))
    expect(st.active).toBe(true)
    expect(st.days_left).toBe(29)
    expect(st.periods).toBe(1)
    expect(pool.journal).toHaveLength(1)
    expect(pool.journal[0][0]).toBe('payment')
  })

  it('the same transaction seen again books nothing and credits nothing', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeCredit()
    await bookClubPeriods(pool, [charge('tx1', 1)], fn, '1')
    const again = await bookClubPeriods(pool, [charge('tx1', 1)], fn, '1')
    expect(again).toHaveLength(0)
    expect(credits).toHaveLength(1)
    expect(pool.periods).toHaveLength(1)
  })

  it('a renewal extends membership and credits another 2 571', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeCredit()
    await bookClubPeriods(pool, [charge('tx1', 1)], fn, '1')
    const renewal = charge('tx2', 1, T0 + CLUB_PERIOD_S)
    const booked = await bookClubPeriods(
      pool,
      [renewal, charge('tx1', 1)],
      fn,
      '1'
    )
    expect(booked).toHaveLength(1)
    expect(booked[0].until).toBe('2026-11-08T00:00:00.000Z')
    expect(credits.map(c => c.tokens)).toEqual([2_571, 2_571])
    const st = await clubStatus(pool, '1', new Date('2026-10-20T00:00:00Z'))
    expect(st.active).toBe(true)
    expect(st.periods).toBe(2)
  })

  it('verify for one person does not book somebody else', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeCredit()
    await bookClubPeriods(pool, [charge('tx1', 1), charge('tx2', 2)], fn, '1')
    expect(credits.map(c => c.telegramId)).toEqual(['1'])
  })

  it('the sweep books everybody, and a lost credit is an alarm, not silence', async () => {
    const pool = fakePool()
    let fail = false
    const credit = async (c: { telegramId: string }) =>
      fail && c.telegramId === '2'
        ? { credited: false, reason: 'ledger down' }
        : { credited: true }
    fail = true
    const booked = await sweepClubRenewals(
      pool,
      'bot',
      credit,
      txFetch([charge('tx1', 1), charge('tx2', 2), charge('tx3', 3, T0, 175)])
    )
    expect(booked.map(b => b.telegramId).sort()).toEqual(['1', '2'])
    const alarms = pool.journal.filter(j => j[0] === 'payment-lost')
    expect(alarms).toHaveLength(1)
    expect(alarms[0][1]).toBe('2')
  })

  it('an expired membership reads inactive', async () => {
    const pool = fakePool()
    const { fn } = fakeCredit()
    await bookClubPeriods(pool, [charge('tx1', 1)], fn)
    const st = await clubStatus(pool, '1', new Date('2026-12-01T00:00:00Z'))
    expect(st.active).toBe(false)
    expect(st.days_left).toBe(0)
  })
})

describe('the HTTP surface', () => {
  const deps = (
    pool: ReturnType<typeof fakePool>,
    who: string | null,
    txs: StarTx[] = []
  ) => {
    const { credits, fn } = fakeCredit()
    return {
      credits,
      deps: {
        getPool: async () => pool,
        identity: () => who,
        botToken: 'bot',
        credit: fn,
        fetchImpl: (async (url: string, init?: { body?: string }) =>
          /getStarTransactions/.test(url)
            ? (txFetch(txs) as unknown as (u: string) => Promise<unknown>)(url)
            : (
                invoiceFetch as unknown as (
                  u: string,
                  i?: unknown
                ) => Promise<unknown>
              )(url, init)) as unknown as typeof fetch,
        now: () => new Date('2026-09-09T12:00:00Z'),
      },
    }
  }

  it('a stranger gets 401 on every route', async () => {
    const pool = fakePool()
    for (const [url, method] of [
      ['/api/club/status', 'GET'],
      ['/api/club/invoice', 'POST'],
      ['/api/club/verify', 'POST'],
    ]) {
      const out = await handleClub({ url, method }, deps(pool, null).deps)
      expect(out.status).toBe(401)
    }
  })

  it('status before paying names the price and the share', async () => {
    const pool = fakePool()
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps(pool, '144022504').deps
    )
    expect(out.body).toMatchObject({
      ok: true,
      active: false,
      stars: 10_000,
      period_days: 30,
      tokens_per_period: 2_571,
    })
  })

  it('invoice, then verify finds the charge, then a second invoice is refused', async () => {
    const pool = fakePool()
    const before = await handleClub(
      { url: '/api/club/invoice', method: 'POST' },
      deps(pool, '144022504').deps
    )
    expect(before.body).toMatchObject({
      ok: true,
      stars: 10_000,
      tokens: 2_571,
      period_days: 30,
    })

    const d = deps(pool, '144022504', [charge('tx1', 144022504, T0 + 60)])
    const verified = await handleClub(
      { url: '/api/club/verify', method: 'POST' },
      d.deps
    )
    expect(verified.body).toMatchObject({
      ok: true,
      active: true,
      booked: 1,
      ['зачислено_токенов']: 2_571,
    }) // cyrillic-ok: API field
    expect(d.credits).toHaveLength(1)

    const again = await handleClub(
      { url: '/api/club/invoice', method: 'POST' },
      d.deps
    )
    expect(again.body).toMatchObject({ ok: false, already_active: true })
  })

  it('verify with no charge yet says so, honestly', async () => {
    const pool = fakePool()
    const out = await handleClub(
      { url: '/api/club/verify', method: 'POST' },
      deps(pool, '144022504').deps
    )
    expect(out.body).toMatchObject({ ok: false, active: false, booked: 0 })
  })

  it('a group id cannot join', async () => {
    const pool = fakePool()
    const out = await handleClub(
      { url: '/api/club/invoice', method: 'POST' },
      deps(pool, '-100777').deps
    )
    expect(out.status).toBe(400)
  })
})
