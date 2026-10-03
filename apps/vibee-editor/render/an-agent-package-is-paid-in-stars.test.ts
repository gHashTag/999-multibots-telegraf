import { describe, it, expect, beforeEach } from 'vitest'
import {
  PACKAGE_PERIOD_S,
  bookAgentPackagePeriods,
  forgetAgentPackageTablesForTests,
  handleAgentPackageSale,
  isAgentPackageSalePath,
  mintAgentPackageInvoice,
  nextCharge,
  packageChargeOf,
  sweepAgentPackageSales,
  agentPackageStanding,
} from './src/agent/agent-package-sale'
import type { StarTx } from './src/agent/club-membership'
import { agentPackageById } from '@vibee/atoms'
import { isPublic } from './auth'

/**
 * AN AGENT PACKAGE IS PAID IN STARS EVERY MONTH: EVERY PACKAGE IS ONE
 * TELEGRAM SUBSCRIPTION OF 10000 STARS PER 30 DAYS (AGENT_SUBSCRIPTION) --
 * AND NO CHARGE IS EVER BOOKED TWICE OR LOST. A one-off month ('once') is no
 * longer sold, but a charge minted before the switch still books.
 */

const PERSON = '144022504'
const DAY = 86_400

function fakePool() {
  const periods: Array<Record<string, any>> = []
  const journal: Array<unknown[]> = []
  return {
    periods,
    journal,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(CREATE|ALTER)/i.test(s)) return { rows: [] }
      if (/^INSERT INTO agent_package_period/i.test(s)) {
        if (periods.some(p => p.star_tx_id === params[4])) return { rows: [] }
        periods.push({
          id: periods.length + 1,
          telegram_id: params[0],
          package_id: params[1],
          charge: params[2],
          stars: params[3],
          star_tx_id: params[4],
          paid_at: params[5],
          until: params[6],
        })
        return { rows: [{ id: periods.length }] }
      }
      if (/^INSERT INTO hive_events/i.test(s)) {
        journal.push(params)
        return { rows: [] }
      }
      if (/FROM agent_package_period WHERE star_tx_id/i.test(s)) {
        return {
          rows: periods
            .filter(p => p.star_tx_id === params[0])
            .map(p => ({ id: p.id })),
        }
      }
      const byUntil = (a: any, b: any) =>
        String(b.until).localeCompare(String(a.until))
      if (/WHERE telegram_id = \$1 AND package_id = \$2/i.test(s)) {
        return {
          rows: periods
            .filter(
              p => p.telegram_id === params[0] && p.package_id === params[1]
            )
            .sort(byUntil)
            .slice(0, 1),
        }
      }
      if (/FROM agent_package_period WHERE telegram_id/i.test(s)) {
        return {
          rows: periods.filter(p => p.telegram_id === params[0]).sort(byUntil),
        }
      }
      return { rows: [] }
    },
  }
}

function tx(
  id: string,
  amount: number,
  payload: string,
  date: number,
  subscription?: number,
  who = PERSON
): StarTx {
  return {
    id,
    amount,
    date,
    source: {
      type: 'user',
      user: { id: Number(who) },
      invoice_payload: payload,
      ...(subscription ? { subscription_period: subscription } : {}),
    },
  }
}

const T0 = Date.UTC(2026, 9, 1) / 1000
const blogger = agentPackageById('blogger')!
const developer = agentPackageById('twin')!
const tridev = agentPackageById('tridev')!
// The one package price, every package (AGENT_SUBSCRIPTION.stars).
const MONTH = 10000
const BLOGGER = MONTH
// What a one-off Developer Agent month cost before the one price; such a
// charge may still be in flight and must still book.
const DEVELOPER = 12500
const sub = (who = PERSON) => `agentpkg:blogger:month:${who}`
const once = (who = PERSON) => `agentpkg:twin:once:${who}`

beforeEach(() => forgetAgentPackageTablesForTests())

describe('the agent package till', () => {
  it('serves its three routes, all of them checking identity themselves', () => {
    for (const p of [
      '/api/agents/packages/invoice',
      '/api/agents/packages/status',
      '/api/agents/packages/verify',
    ]) {
      expect(isAgentPackageSalePath(p)).toBe(true)
      expect(isPublic({ url: p, method: 'POST' } as any), p).toBe(true)
    }
  })

  it('mints every package as the one 30-day subscription at 10000 Stars', async () => {
    const sent: any[] = []
    const fetchImpl = (async (_url: string, init: any) => {
      sent.push(JSON.parse(init.body))
      return { json: async () => ({ ok: true, result: 'https://t.me/$abc' }) }
    }) as unknown as typeof fetch
    const month = await mintAgentPackageInvoice({
      pkg: blogger,
      charge: 'month',
      forTelegramId: PERSON,
      botToken: 'x',
      fetchImpl,
    })
    const dev = await mintAgentPackageInvoice({
      pkg: developer,
      charge: 'month',
      forTelegramId: PERSON,
      botToken: 'x',
      fetchImpl,
    })
    const tri = await mintAgentPackageInvoice({
      pkg: tridev,
      charge: 'month',
      forTelegramId: PERSON,
      botToken: 'x',
      fetchImpl,
    })
    expect([month.stars, dev.stars, tri.stars]).toEqual([MONTH, MONTH, MONTH])
    expect(sent).toHaveLength(3)
    for (const b of sent) {
      expect(b.currency).toBe('XTR')
      expect(b.prices[0].amount).toBe(MONTH)
      expect(b.subscription_period).toBe(PACKAGE_PERIOD_S)
    }
    expect(PACKAGE_PERIOD_S).toBe(2_592_000)
    expect(sent[0].payload).toBe(sub())
    expect(sent[1].payload).toBe(`agentpkg:twin:month:${PERSON}`)
    expect(sent[2].payload).toBe(`agentpkg:tridev:month:${PERSON}`)
    for (const b of sent) {
      expect(b.title.length).toBeLessThanOrEqual(32)
      expect(b.description.length).toBeLessThanOrEqual(255)
    }
  })

  it('recognises a charge by its payload, and the subscription mark must agree', () => {
    expect(
      packageChargeOf(tx('a', BLOGGER, sub(), T0, PACKAGE_PERIOD_S))?.charge
    ).toBe('month')
    // A month must carry the one period Telegram allows.
    expect(packageChargeOf(tx('b', BLOGGER, sub(), T0))).toBeNull()
    expect(packageChargeOf(tx('c', DEVELOPER, once(), T0))?.charge).toBe('once')
    // A one-off payload on a subscription transaction is not a one-off.
    expect(
      packageChargeOf(tx('d', DEVELOPER, once(), T0, PACKAGE_PERIOD_S))
    ).toBeNull()
    // Club and token charges are not ours.
    expect(
      packageChargeOf(
        tx('e', 10000, `club:10000:${PERSON}`, T0, PACKAGE_PERIOD_S)
      )
    ).toBeNull()
    expect(packageChargeOf(tx('f', 175, `tokens:150:${PERSON}`, T0))).toBeNull()
  })

  it('books each charge once and chains the periods without losing a day', async () => {
    const pool = fakePool()
    const first = tx('O1', DEVELOPER, once(), T0)
    // The next month bought ahead on day 10, while the first still runs.
    const ahead = tx('O2', DEVELOPER, once(), T0 + 10 * DAY)
    const booked = await bookAgentPackagePeriods(pool, [ahead, first])
    expect(booked.map(b => b.starTxId)).toEqual(['O1', 'O2'])
    expect(booked[0].until).toBe(new Date((T0 + 30 * DAY) * 1000).toISOString())
    expect(booked[1].until).toBe(new Date((T0 + 60 * DAY) * 1000).toISOString())
    // The same ledger read again books nothing.
    expect(await bookAgentPackagePeriods(pool, [first, ahead])).toEqual([])
    expect(pool.periods).toHaveLength(2)
    expect(pool.journal).toHaveLength(2)
  })

  it('a renewal after a lapse starts from its own payment, not from the past', async () => {
    const pool = fakePool()
    await bookAgentPackagePeriods(pool, [
      tx('M1', BLOGGER, sub(), T0, PACKAGE_PERIOD_S),
    ])
    const late = tx('M2', BLOGGER, sub(), T0 + 45 * DAY, PACKAGE_PERIOD_S)
    const [b] = await bookAgentPackagePeriods(pool, [late])
    expect(b.until).toBe(new Date((T0 + 75 * DAY) * 1000).toISOString())
  })

  it('verify books only the asking person; the sweep books everyone', async () => {
    const other = '900000061'
    const txs = [
      tx('A', BLOGGER, sub(), T0, PACKAGE_PERIOD_S),
      tx('B', BLOGGER, sub(other), T0, PACKAGE_PERIOD_S, other),
    ]
    const pool = fakePool()
    expect(
      (await bookAgentPackagePeriods(pool, txs, PERSON)).map(b => b.telegramId)
    ).toEqual([PERSON])
    const fetchImpl = (async () => ({
      json: async () => ({ ok: true, result: { transactions: txs } }),
    })) as unknown as typeof fetch
    const swept = await sweepAgentPackageSales(pool, 'x', fetchImpl)
    expect(swept.map(b => b.telegramId)).toEqual([other])
  })

  it('no second subscription while one runs; a one-off month can always be bought ahead', () => {
    const base = {
      id: 'blogger',
      month_stars: BLOGGER,
      until: null,
      days_left: 0,
    }
    const s = { ...base, renews: true }
    expect(nextCharge({ ...s, active: false, subscribed: false })).toBe('month')
    expect(nextCharge({ ...s, active: true, subscribed: true })).toBeNull()
    const o = { ...base, id: 'twin', month_stars: DEVELOPER, renews: false }
    expect(nextCharge({ ...o, active: false, subscribed: false })).toBe('once')
    expect(nextCharge({ ...o, active: true, subscribed: false })).toBe('once')
  })

  it('answers the public monthly prices without identity, and refuses invoice and verify', async () => {
    const deps = {
      getPool: async () => fakePool(),
      identity: () => null,
      botToken: 'x',
    }
    const status = await handleAgentPackageSale(
      { url: '/api/agents/packages/status', method: 'GET' },
      deps
    )
    expect(status.status).toBe(200)
    const pk = (status.body.packages as any[]).map(p => [
      p.id,
      p.month_stars,
      p.renews,
      p.active,
    ])
    expect(pk).toEqual([
      ['manager', MONTH, true, false],
      ['blogger', MONTH, true, false],
      ['twin', MONTH, true, false],
      ['tridev', MONTH, true, false],
    ])
    for (const url of [
      '/api/agents/packages/invoice?package=blogger',
      '/api/agents/packages/verify',
    ]) {
      const r = await handleAgentPackageSale({ url, method: 'POST' }, deps)
      expect(r.status, url).toBe(401)
    }
  })

  it('the invoice route mints the month, refuses an unknown package and a second subscription', async () => {
    const pool = fakePool()
    const bodies: any[] = []
    const fetchImpl = (async (_u: string, init: any) => {
      bodies.push(JSON.parse(init.body))
      return { json: async () => ({ ok: true, result: 'https://t.me/$inv' }) }
    }) as unknown as typeof fetch
    const deps = {
      getPool: async () => pool,
      identity: () => PERSON,
      botToken: 'x',
      fetchImpl,
      now: () => new Date((T0 + DAY) * 1000),
    }
    const invoice = (pkg: string) =>
      handleAgentPackageSale(
        { url: `/api/agents/packages/invoice?package=${pkg}`, method: 'POST' },
        deps
      )
    expect((await invoice('nobody')).status).toBe(400)
    expect((await invoice('blogger')).body).toMatchObject({
      ok: true,
      charge: 'month',
      stars: BLOGGER,
      link: 'https://t.me/$inv',
    })
    expect(bodies[0].subscription_period).toBe(PACKAGE_PERIOD_S)
    await bookAgentPackagePeriods(pool, [
      tx('M1', BLOGGER, sub(), T0, PACKAGE_PERIOD_S),
    ])
    expect((await invoice('blogger')).body).toMatchObject({
      ok: false,
      already_subscribed: true,
      days_left: 29,
    })
    expect((await invoice('twin')).body).toMatchObject({
      ok: true,
      charge: 'month',
      stars: MONTH,
    })
    expect((await invoice('tridev')).body).toMatchObject({
      ok: true,
      charge: 'month',
      stars: MONTH,
    })
    expect(bodies.map(b => b.subscription_period)).toEqual([
      PACKAGE_PERIOD_S,
      PACKAGE_PERIOD_S,
      PACKAGE_PERIOD_S,
    ])
    const standing = await agentPackageStanding(pool, PERSON, deps.now())
    expect(standing.find(s => s.id === 'blogger')).toMatchObject({
      active: true,
      subscribed: true,
      days_left: 29,
    })
  })

  it('without a cashier the invoice route says so and raises the alarm', async () => {
    const pool = fakePool()
    const r = await handleAgentPackageSale(
      { url: '/api/agents/packages/invoice?package=twin', method: 'POST' },
      { getPool: async () => pool, identity: () => PERSON, botToken: '' }
    )
    expect(r.status).toBe(503)
    expect(pool.journal.length).toBeGreaterThan(0)
  })
})
