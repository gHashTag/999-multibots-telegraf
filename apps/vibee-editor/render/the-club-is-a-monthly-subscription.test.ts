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
  sweepClubGrants,
  bookGrantPeriod,
  grantRef,
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
  const grants: Array<Record<string, any>> = []
  const journal: Array<unknown[]> = []
  return {
    periods,
    grants,
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
      if (/^INSERT INTO club_grant_period/i.test(s)) {
        if (
          grants.some(
            g => g.telegram_id === params[0] && g.period_start === params[3]
          )
        )
          return { rows: [], rowCount: 0 }
        grants.push({
          id: grants.length + 1,
          telegram_id: params[0],
          grant_kind: params[1],
          tokens_granted: params[2],
          credited: false,
          period_start: params[3],
          until: params[4],
        })
        return { rows: [{ id: grants.length }], rowCount: 1 }
      }
      if (/^UPDATE club_grant_period SET credited/i.test(s)) {
        const g = grants.find(x => x.id === params[0])
        if (g) g.credited = true
        return { rows: [], rowCount: g ? 1 : 0 }
      }
      if (/FROM club_grant_period WHERE telegram_id/i.test(s)) {
        const mine = grants
          .filter(g => g.telegram_id === params[0])
          .sort((a, b) => String(b.until).localeCompare(String(a.until)))
        return { rows: mine.slice(0, 1) }
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

/**
 * BOT OWNERS ENTER FOR FREE (owner, 2026-09-10: "give every bot owner access
 * to the digital twin"). Ownership is the `avatars` answer, the same source
 * as hive/roles.ts; the grant is read, never written, and fail-closed.
 */
describe('bot owners and keepers enter without paying', () => {
  const grant = (bots: Record<string, string[]>, keeperIds: string[] = []) => ({
    botsOwnedBy: async (id: string) => bots[id] ?? [],
    keepers: () => keeperIds,
  })
  const deps = (
    pool: ReturnType<typeof fakePool>,
    who: string,
    g: ReturnType<typeof grant> | undefined
  ) => ({
    getPool: async () => pool,
    identity: () => who,
    botToken: 'bot',
    credit: fakeCredit().fn,
    fetchImpl: invoiceFetch as unknown as typeof fetch,
    now: () => new Date('2026-09-10T12:00:00Z'),
    grant: g,
  })

  it('a bot owner is active with granted=owner and no paid period', async () => {
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps(fakePool(), '555', grant({ '555': ['woody_weed_bot'] }))
    )
    expect(out.body).toMatchObject({
      ok: true,
      active: true,
      granted: 'owner',
      until: null,
      days_left: 0,
      periods: 0,
    })
  })

  it('a keeper is active with granted=keeper', async () => {
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps(fakePool(), '144022504', grant({}, ['144022504']))
    )
    expect(out.body).toMatchObject({ active: true, granted: 'keeper' })
  })

  it('a bee without bots still sees the paywall', async () => {
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps(fakePool(), '777', grant({ '555': ['woody_weed_bot'] }))
    )
    expect(out.body).toMatchObject({ active: false, granted: null })
  })

  it('without a grant source nobody is granted (the old behaviour)', async () => {
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps(fakePool(), '555', undefined)
    )
    expect(out.body).toMatchObject({ active: false, granted: null })
  })

  it('an owner is not sold an invoice: already_active with the reason', async () => {
    const out = await handleClub(
      { url: '/api/club/invoice', method: 'POST' },
      deps(fakePool(), '555', grant({ '555': ['woody_weed_bot'] }))
    )
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({
      ok: false,
      already_active: true,
      granted: 'owner',
    })
    expect(String(out.body.error)).toMatch(new RegExp('без оплаты')) // cyrillic-ok: user-facing wording
  })

  it('a failing avatars lookup means no grant, not a free month', async () => {
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps(fakePool(), '555', {
        botsOwnedBy: async () => {
          throw new Error('avatars replied 500')
        },
        keepers: () => [],
      })
    )
    expect(out.body).toMatchObject({ active: false, granted: null })
  })

  it('a paid month stays a paid month beside the grant', async () => {
    const pool = fakePool()
    const who = '555'
    const tx: StarTx = {
      id: 'tx-owner-1',
      amount: CLUB_STARS,
      date: Math.floor(new Date('2026-09-01T00:00:00Z').getTime() / 1000),
      source: {
        type: 'user',
        user: { id: Number(who) },
        subscription_period: CLUB_PERIOD_S,
      },
    }
    await bookClubPeriods(pool, [tx], fakeCredit().fn, who)
    const s = await clubStatus(
      pool,
      who,
      new Date('2026-09-10T12:00:00Z'),
      'owner'
    )
    expect(s.active).toBe(true)
    expect(s.granted).toBe('owner')
    expect(s.periods).toBe(1)
    expect(s.days_left).toBeGreaterThan(0)
  })
})

/**
 * THE MONTHLY TOKENS OF A GRANTED PERSON (owner, 2026-09-10: "add the monthly
 * club tokens for bot owners"). No charge to book, so the period is our own
 * row; one per person per 30 days, opened on a visit or by the hourly sweep.
 */
describe('a granted person gets the monthly tokens', () => {
  const NOW = new Date('2026-09-10T12:00:00Z')
  function fakeGrantCredit(fail = false) {
    const credits: Array<{ telegramId: string; tokens: number; ref: string; grant: string }> = []
    const fn = async (c: { telegramId: string; tokens: number; ref: string; grant: 'owner' | 'keeper' }) => {
      if (fail) return { credited: false, reason: 'ledger down' }
      credits.push(c)
      return { credited: true }
    }
    return { credits, fn }
  }
  const source = (bots: Record<string, string[]>, keeperIds: string[] = []) => ({
    botsOwnedBy: async (id: string) => bots[id] ?? [],
    keepers: () => keeperIds,
    allOwners: async () => Object.keys(bots),
  })

  it('a visit opens the period once and credits 2 571 as a grant', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeGrantCredit()
    const first = await bookGrantPeriod(pool, '555', 'owner', fn, NOW)
    expect(first).toMatchObject({
      telegramId: '555',
      grant: 'owner',
      tokens: clubTokensPerPeriod(),
      credited: true,
      opened: true,
      periodStart: '2026-09-10T00:00:00.000Z',
      until: '2026-10-10T00:00:00.000Z',
    })
    expect(credits).toHaveLength(1)
    expect(credits[0].ref).toBe(grantRef('555', new Date('2026-09-10T00:00:00Z')))
    expect(credits[0].ref).toBe('club-grant:555:2026-09-10')

    // The same day, an hour later, and a week later: nothing more.
    expect(await bookGrantPeriod(pool, '555', 'owner', fn, new Date('2026-09-10T13:00:00Z'))).toBeNull()
    expect(await bookGrantPeriod(pool, '555', 'owner', fn, new Date('2026-09-17T12:00:00Z'))).toBeNull()
    expect(credits).toHaveLength(1)
  })

  it('after 30 days a new period opens and the next month is credited', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeGrantCredit()
    await bookGrantPeriod(pool, '555', 'owner', fn, NOW)
    expect(await bookGrantPeriod(pool, '555', 'owner', fn, new Date('2026-10-09T23:00:00Z'))).toBeNull()
    const second = await bookGrantPeriod(pool, '555', 'owner', fn, new Date('2026-10-10T00:00:01Z'))
    expect(second).toMatchObject({ opened: true, credited: true, periodStart: '2026-10-10T00:00:00.000Z' })
    expect(credits.map(c => c.ref)).toEqual(['club-grant:555:2026-09-10', 'club-grant:555:2026-10-10'])
  })

  it('no back-fill: three silent months give one period, from today', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeGrantCredit()
    await bookGrantPeriod(pool, '555', 'owner', fn, new Date('2026-06-01T12:00:00Z'))
    const late = await bookGrantPeriod(pool, '555', 'owner', fn, NOW)
    expect(late).toMatchObject({ periodStart: '2026-09-10T00:00:00.000Z' })
    expect(credits).toHaveLength(2)
  })

  it('a failed credit is an alarm and is retried on the next visit, not doubled', async () => {
    const pool = fakePool()
    const broken = fakeGrantCredit(true)
    const first = await bookGrantPeriod(pool, '555', 'owner', broken.fn, NOW)
    expect(first).toMatchObject({ opened: true, credited: false })
    expect(pool.journal.some(j => JSON.stringify(j).includes('alarm'))).toBe(true)

    const good = fakeGrantCredit()
    const retry = await bookGrantPeriod(pool, '555', 'owner', good.fn, new Date('2026-09-11T12:00:00Z'))
    expect(retry).toMatchObject({ opened: false, credited: true, periodStart: '2026-09-10T00:00:00.000Z' })
    expect(good.credits).toHaveLength(1)
    expect(await bookGrantPeriod(pool, '555', 'owner', good.fn, new Date('2026-09-12T12:00:00Z'))).toBeNull()
  })

  it('status of an owner opens the period, credits, and names until / days_left', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeGrantCredit()
    const deps = {
      getPool: async () => pool,
      identity: () => '555',
      botToken: 'bot',
      credit: fakeCredit().fn,
      fetchImpl: invoiceFetch as unknown as typeof fetch,
      now: () => NOW,
      grant: source({ '555': ['woody_weed_bot'] }),
      creditGrant: fn,
    }
    const out = await handleClub({ url: '/api/club/status', method: 'GET' }, deps)
    expect(out.body).toMatchObject({
      active: true,
      granted: 'owner',
      until: '2026-10-10T00:00:00.000Z',
      days_left: 30,
      periods: 0,
      tokens_per_period: clubTokensPerPeriod(),
    })
    await handleClub({ url: '/api/club/status', method: 'GET' }, deps)
    await handleClub({ url: '/api/club/verify', method: 'POST' }, deps)
    expect(credits).toHaveLength(1)
  })

  it('a bee gets nothing from the grant path', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeGrantCredit()
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      {
        getPool: async () => pool,
        identity: () => '777',
        botToken: 'bot',
        credit: fakeCredit().fn,
        now: () => NOW,
        grant: source({ '555': ['woody_weed_bot'] }),
        creditGrant: fn,
      }
    )
    expect(out.body).toMatchObject({ active: false, granted: null })
    expect(credits).toHaveLength(0)
    expect(pool.grants).toHaveLength(0)
  })

  it('the sweep books every owner and keeper once, keepers as keepers', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeGrantCredit()
    const src = source({ '555': ['a_bot'], '666': ['b_bot'], '144022504': ['c_bot'] }, ['144022504'])
    const booked = await sweepClubGrants(pool, src, fn, NOW)
    expect(booked.map(b => `${b.telegramId}:${b.grant}`).sort()).toEqual(
      ['144022504:keeper', '555:owner', '666:owner']
    )
    expect(credits).toHaveLength(3)
    expect(await sweepClubGrants(pool, src, fn, new Date('2026-09-20T12:00:00Z'))).toEqual([])
    expect(credits).toHaveLength(3)
  })

  it('a failing owner list books nobody', async () => {
    const pool = fakePool()
    const { credits, fn } = fakeGrantCredit()
    const booked = await sweepClubGrants(
      pool,
      { botsOwnedBy: async () => [], keepers: () => [], allOwners: async () => { throw new Error('avatars 500') } },
      fn,
      NOW
    )
    expect(booked).toEqual([])
    expect(credits).toHaveLength(0)
  })
})
