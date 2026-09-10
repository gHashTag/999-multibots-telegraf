/**
 * A FAILED PAYMENT REACHES THE OWNER.
 *
 * Owner, 2026-09-10: "why could the person not pay, and why did no error
 * reach me?" Because nothing wrote it down. These tests pin the three doors
 * that now do: the client's outcome report, the invoice notes at the
 * cashier, and the cashier's pulse.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  handlePayOutcome,
  describeOutcome,
  severityFor,
  cashierLooksDeaf,
  checkCashierPulse,
  forgetThrottleForTests,
  forgetCashierPulseForTests,
  OUTCOME_THROTTLE_MS,
} from './src/agent/payment-alarms'
import {
  handleClub,
  forgetClubTablesForTests,
} from './src/agent/club-membership'

function journalPool() {
  const events: Array<{ kind: string; who: string | null; what: string; severity: string; amount: unknown }> = []
  return {
    events,
    query: async (sql: string, params: any[] = []) => {
      if (/^INSERT INTO hive_events/i.test(sql)) {
        events.push({ kind: params[0], who: params[1], amount: params[3], what: params[4], severity: params[5] })
        return { rows: [], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    },
  }
}

const post = (body: unknown) => ({ url: '/api/pay/outcome', method: 'POST', body: JSON.stringify(body) })
const deps = (pool: ReturnType<typeof journalPool>, who: string | null = '555', now = 1_000_000) => ({
  getPool: async () => pool,
  identity: () => who,
  readBody: async (r: any) => r.body,
  now: () => now,
})

describe('the client tells the server what Telegram said', () => {
  beforeEach(() => forgetThrottleForTests())

  it('failed and pending are alarms; cancelled and unsupported are attention', () => {
    expect(severityFor('failed')).toBe('alarm')
    expect(severityFor('pending')).toBe('alarm')
    expect(severityFor('cancelled')).toBe('attention')
    expect(severityFor('unsupported')).toBe('attention')
  })

  it('a failed club payment lands in the journal as an alarm with the error text', async () => {
    const pool = journalPool()
    const out = await handlePayOutcome(
      post({ surface: 'club', outcome: 'failed', error: 'Bot did not answer', stars: 10000 }),
      deps(pool)
    )
    expect(out).toMatchObject({ status: 200, body: { ok: true, noted: true } })
    expect(pool.events).toHaveLength(1)
    expect(pool.events[0]).toMatchObject({ kind: 'payment-failed', who: '555', severity: 'alarm', amount: 10000 })
    expect(pool.events[0].what).toContain('СОРВАЛАСЬ')
    expect(pool.events[0].what).toContain('Bot did not answer')
  })

  it('pending is written as payment-lost: Telegram said paid, the ledger did not', async () => {
    const pool = journalPool()
    await handlePayOutcome(post({ surface: 'tokens', outcome: 'pending' }), deps(pool))
    expect(pool.events[0]).toMatchObject({ kind: 'payment-lost', severity: 'alarm' })
    expect(describeOutcome('tokens', 'pending')).toContain('в леджере платежа нет')
  })

  it('one person retrying five times is one note, not five', async () => {
    const pool = journalPool()
    for (let i = 0; i < 5; i++) {
      await handlePayOutcome(post({ surface: 'club', outcome: 'failed' }), deps(pool, '555', 1_000_000 + i * 1000))
    }
    expect(pool.events).toHaveLength(1)
    // ...and after the window the next one is written.
    await handlePayOutcome(post({ surface: 'club', outcome: 'failed' }), deps(pool, '555', 1_000_000 + OUTCOME_THROTTLE_MS))
    expect(pool.events).toHaveLength(2)
    // A different surface is a different problem.
    await handlePayOutcome(post({ surface: 'tokens', outcome: 'cancelled' }), deps(pool, '555', 1_000_000 + 1))
    expect(pool.events).toHaveLength(3)
    expect(pool.events[2]).toMatchObject({ kind: 'payment-cancelled', severity: 'attention' })
  })

  it('refuses strangers, bad json, unknown outcomes and "paid"', async () => {
    const pool = journalPool()
    expect((await handlePayOutcome(post({ surface: 'club', outcome: 'failed' }), deps(pool, null))).status).toBe(401)
    expect((await handlePayOutcome({ url: '/api/pay/outcome', method: 'POST', body: '{nope' } as any, deps(pool))).status).toBe(400)
    expect((await handlePayOutcome(post({ surface: 'club', outcome: 'paid' }), deps(pool))).status).toBe(400)
    expect((await handlePayOutcome(post({ surface: 'wallet', outcome: 'failed' }), deps(pool))).status).toBe(400)
    expect((await handlePayOutcome({ url: '/api/pay/outcome', method: 'GET' }, deps(pool))).status).toBe(405)
    expect(pool.events).toHaveLength(0)
  })
})

describe('the cashier writes down what it did', () => {
  beforeEach(() => forgetClubTablesForTests())
  const base = (pool: any, botToken: string, fetchImpl?: any) => ({
    getPool: async () => pool,
    identity: () => '555555',
    botToken,
    credit: async () => ({ credited: true }),
    fetchImpl,
    now: () => new Date('2026-09-10T12:00:00Z'),
  })

  it('a minted club invoice is a normal note with the price', async () => {
    const pool = journalPool()
    const fetchImpl = (async () => ({ json: async () => ({ ok: true, result: 'https://t.me/$inv' }) })) as any
    const out = await handleClub({ url: '/api/club/invoice', method: 'POST' }, base(pool, 'bot', fetchImpl))
    expect(out.status).toBe(200)
    const note = pool.events.find(e => e.what.includes('счёт выписан'))
    expect(note).toMatchObject({ kind: 'invoice', who: '555555', severity: 'normal' })
    expect(Number(note!.amount)).toBeGreaterThan(0)
  })

  it('no cashier token is an alarm, not just a 503', async () => {
    const pool = journalPool()
    const out = await handleClub({ url: '/api/club/invoice', method: 'POST' }, base(pool, ''))
    expect(out.status).toBe(503)
    expect(pool.events[0]).toMatchObject({ kind: 'payment-failed', severity: 'alarm' })
    expect(pool.events[0].what).toContain('TOKENS_PAYMENT_BOT_TOKEN')
  })

  it('Bot API refusing the invoice is an alarm and a 502 with the reason', async () => {
    const pool = journalPool()
    const fetchImpl = (async () => ({ json: async () => ({ ok: false, description: 'PAYMENT_PROVIDER_INVALID' }) })) as any
    const out = await handleClub({ url: '/api/club/invoice', method: 'POST' }, base(pool, 'bot', fetchImpl))
    expect(out.status).toBe(502)
    expect(String(out.body.error)).toContain('PAYMENT_PROVIDER_INVALID')
    const alarm = pool.events.find(e => e.severity === 'alarm')
    expect(alarm).toMatchObject({ kind: 'payment-failed' })
    expect(alarm?.what).toContain('не выписала счёт')
  })
})

describe("the cashier's pulse", () => {
  beforeEach(() => forgetCashierPulseForTests())
  const info = (pending: number, url = '') =>
    (async () => ({ json: async () => ({ ok: true, result: { url, pending_update_count: pending } }) })) as any

  it('a backlog on two consecutive readings means nobody polls', () => {
    expect(cashierLooksDeaf(null, { pending: 7, webhook: '', lastError: '' })).toBe(false)
    expect(cashierLooksDeaf({ pending: 7, webhook: '', lastError: '' }, { pending: 9, webhook: '', lastError: '' })).toBe(true)
    expect(cashierLooksDeaf({ pending: 7, webhook: '', lastError: '' }, { pending: 0, webhook: '', lastError: '' })).toBe(false)
    expect(cashierLooksDeaf(null, { pending: 0, webhook: 'https://x/hook', lastError: '' })).toBe(true)
  })

  it('writes one alarm when the backlog persists, and not every hour', async () => {
    const pool = journalPool()
    const h = 60 * 60 * 1000
    expect(await checkCashierPulse(pool, 'bot', info(5), 0)).toBe('quiet')
    expect(await checkCashierPulse(pool, 'bot', info(6), h)).toBe('deaf')
    expect(await checkCashierPulse(pool, 'bot', info(7), 2 * h)).toBe('deaf')
    expect(pool.events).toHaveLength(1)
    expect(pool.events[0]).toMatchObject({ kind: 'payment-failed', severity: 'alarm' })
    expect(pool.events[0].what).toContain('никто не опрашивает')
    expect(await checkCashierPulse(pool, 'bot', info(8), 7 * h)).toBe('deaf')
    expect(pool.events).toHaveLength(2)
  })

  it('no token, unreadable, quiet: no alarm', async () => {
    const pool = journalPool()
    expect(await checkCashierPulse(pool, '', info(5))).toBe('no token')
    expect(await checkCashierPulse(pool, 'bot', (async () => { throw new Error('net') }) as any)).toBe('unreadable')
    expect(await checkCashierPulse(pool, 'bot', info(0))).toBe('quiet')
    expect(pool.events).toHaveLength(0)
  })
})
