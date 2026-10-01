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
import { agentPackageById, agentPackageStars } from '@vibee/atoms'
import { isPublic } from './auth'

/**
 * AN AGENT PACKAGE IS PAID IN STARS: THE LAUNCH ONCE, THEN A MONTHLY
 * SUBSCRIPTION -- AND NO CHARGE IS EVER BOOKED TWICE OR LOST.
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
const { setup: SETUP, month: MONTH } = agentPackageStars(blogger)

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

  it('mints the launch as a one-off invoice and the month as a 30-day subscription', async () => {
    const sent: any[] = []
    const fetchImpl = (async (_url: string, init: any) => {
      sent.push(JSON.parse(init.body))
      return { json: async () => ({ ok: true, result: 'https://t.me/$abc' }) }
    }) as unknown as typeof fetch
    const setup = await mintAgentPackageInvoice({
      pkg: blogger,
      charge: 'setup',
      forTelegramId: PERSON,
      botToken: 'x',
      fetchImpl,
    })
    const month = await mintAgentPackageInvoice({
      pkg: blogger,
      charge: 'month',
      forTelegramId: PERSON,
      botToken: 'x',
      fetchImpl,
    })
    expect(setup.stars).toBe(9375)
    expect(month.stars).toBe(2188)
    expect(sent[0].currency).toBe('XTR')
    expect(sent[0].prices[0].amount).toBe(9375)
    expect(sent[0].subscription_period).toBeUndefined()
    expect(sent[0].payload).toBe(`agentpkg:blogger:setup:${PERSON}`)
    expect(sent[1].subscription_period).toBe(PACKAGE_PERIOD_S)
    expect(sent[1].payload).toBe(`agentpkg:blogger:month:${PERSON}`)
    for (const b of sent) {
      expect(b.title.length).toBeLessThanOrEqual(32)
      expect(b.description.length).toBeLessThanOrEqual(255)
    }
  })

  it('recognises a charge by its payload, and the subscription mark must agree', () => {
    const payload = `agentpkg:blogger:setup:${PERSON}`
    expect(packageChargeOf(tx('a', SETUP, payload, T0))?.charge).toBe('setup')
    // A launch payload on a subscription transaction is not a launch.
    expect(
      packageChargeOf(tx('b', SETUP, payload, T0, PACKAGE_PERIOD_S))
    ).toBeNull()
    // A month must carry the one period Telegram allows.
    const m = `agentpkg:blogger:month:${PERSON}`
    expect(
      packageChargeOf(tx('c', MONTH, m, T0, PACKAGE_PERIOD_S))?.charge
    ).toBe('month')
    expect(packageChargeOf(tx('d', MONTH, m, T0))).toBeNull()
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
    const launch = tx('L1', SETUP, `agentpkg:blogger:setup:${PERSON}`, T0)
    // Subscribed on day 10, while the launch month still runs.
    const month1 = tx(
      'M1',
      MONTH,
      `agentpkg:blogger:month:${PERSON}`,
      T0 + 10 * DAY,
      PACKAGE_PERIOD_S
    )
    const first = await bookAgentPackagePeriods(pool, [month1, launch])
    expect(first.map(b => b.charge)).toEqual(['setup', 'month'])
    // Launch: 30 days from payment; month: 30 more from where the launch ends.
    expect(first[0].until).toBe(new Date((T0 + 30 * DAY) * 1000).toISOString())
    expect(first[1].until).toBe(new Date((T0 + 60 * DAY) * 1000).toISOString())
    // The same ledger read again books nothing.
    expect(await bookAgentPackagePeriods(pool, [launch, month1])).toEqual([])
    expect(pool.periods).toHaveLength(2)
    expect(pool.journal).toHaveLength(2)
  })

  it('a renewal after a lapse starts from its own payment, not from the past', async () => {
    const pool = fakePool()
    await bookAgentPackagePeriods(pool, [
      tx('L1', SETUP, `agentpkg:blogger:setup:${PERSON}`, T0),
    ])
    const late = tx(
      'M1',
      MONTH,
      `agentpkg:blogger:month:${PERSON}`,
      T0 + 45 * DAY,
      PACKAGE_PERIOD_S
    )
    const [b] = await bookAgentPackagePeriods(pool, [late])
    expect(b.until).toBe(new Date((T0 + 75 * DAY) * 1000).toISOString())
  })

  it('verify books only the asking person; the sweep books everyone', async () => {
    const other = '900000061'
    const txs = [
      tx('A', SETUP, `agentpkg:blogger:setup:${PERSON}`, T0),
      tx('B', SETUP, `agentpkg:blogger:setup:${other}`, T0, undefined, other),
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

  it('sells the launch first, then the month, and no second subscription while one runs', () => {
    const base = {
      id: 'blogger',
      setup_stars: SETUP,
      month_stars: MONTH,
      until: null,
      days_left: 0,
    }
    expect(
      nextCharge({ ...base, launched: false, active: false, subscribed: false })
    ).toBe('setup')
    expect(
      nextCharge({ ...base, launched: true, active: true, subscribed: false })
    ).toBe('month')
    expect(
      nextCharge({ ...base, launched: true, active: true, subscribed: true })
    ).toBeNull()
    // A lapsed subscription can be bought again.
    expect(
      nextCharge({ ...base, launched: true, active: false, subscribed: false })
    ).toBe('month')
  })

  it('answers the public prices without identity, and refuses invoice and verify', async () => {
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
      p.setup_stars,
      p.month_stars,
      p.active,
    ])
    expect(pk).toEqual([
      ['manager', 6250, 938, false],
      ['blogger', 9375, 2188, false],
      ['twin', 12500, 3125, false],
    ])
    for (const url of [
      '/api/agents/packages/invoice?package=blogger',
      '/api/agents/packages/verify',
    ]) {
      const r = await handleAgentPackageSale({ url, method: 'POST' }, deps)
      expect(r.status, url).toBe(401)
    }
  })

  it('the invoice route mints the next charge and refuses an unknown package', async () => {
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
    const bad = await handleAgentPackageSale(
      { url: '/api/agents/packages/invoice?package=nobody', method: 'POST' },
      deps
    )
    expect(bad.status).toBe(400)
    const first = await handleAgentPackageSale(
      { url: '/api/agents/packages/invoice?package=blogger', method: 'POST' },
      deps
    )
    expect(first.body).toMatchObject({
      ok: true,
      charge: 'setup',
      stars: 9375,
      link: 'https://t.me/$inv',
    })
    await bookAgentPackagePeriods(pool, [
      tx('L1', SETUP, `agentpkg:blogger:setup:${PERSON}`, T0),
    ])
    const second = await handleAgentPackageSale(
      { url: '/api/agents/packages/invoice?package=blogger', method: 'POST' },
      deps
    )
    expect(second.body).toMatchObject({
      ok: true,
      charge: 'month',
      stars: 2188,
    })
    expect(bodies[1].subscription_period).toBe(PACKAGE_PERIOD_S)
    const standing = await agentPackageStanding(pool, PERSON, deps.now())
    expect(standing.find(s => s.id === 'blogger')).toMatchObject({
      launched: true,
      active: true,
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
