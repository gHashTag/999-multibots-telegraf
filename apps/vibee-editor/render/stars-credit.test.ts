/**
 * The Stars -> tokens path, proven without spending money.
 *
 * This is the only path where a mistake takes money from a person and gives
 * nothing back, and until now it had no behavioural test at all. Both fixes it
 * has needed shipped on reasoning alone:
 *
 *   #873 the webhook was not idempotent -- Telegram retries delivery on any
 *        non-200 and on plain network trouble, and every redelivery credited
 *        the tokens again;
 *   #874 /api/tokens/verify compared dates as strings, so the fallback
 *        verification never credited anything from the day it was written.
 *
 * Both were later silently reverted by an unrelated merge, and nothing went
 * red, because nothing tested them. A live purchase is the owner's to make;
 * this proves the logic that purchase triggers.
 *
 * The pool is a fake that behaves like Postgres for the two statements that
 * matter: ON CONFLICT DO NOTHING reports rowCount 0 for a duplicate key, and
 * the balance upsert adds rather than replaces.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { creditStarsPayment } from './src/stars-credit'

/** Minimal Postgres stand-in: a charge ledger and a balance table. */
function fakePool() {
  const charges = new Set<string>()
  const balances = new Map<string, number>()
  const calls: string[] = []
  return {
    charges,
    balances,
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push(sql.trim().split('\n')[0].trim())
      if (sql.includes('INSERT INTO star_payments')) {
        const id = String(params[0])
        if (charges.has(id)) return { rowCount: 0, rows: [] } // ON CONFLICT DO NOTHING
        charges.add(id)
        return { rowCount: 1, rows: [] }
      }
      if (sql.includes('INSERT INTO user_tokens')) {
        const tid = String(params[0])
        const amount = Number(params[1])
        /*
         * ПОДДЕЛКА ПОДЧИНЯЕТСЯ SQL, А НЕ ПРИБАВЛЯЕТ ВСЕГДА.
         *
         * Здесь стояло безусловное `balances.set(tid, (было ?? 0) + amount)`,
         * то есть фальшивая база складывала независимо от запроса. Мутация
         * `DO UPDATE SET balance = user_tokens.balance + $2` →
         * `DO UPDATE SET balance = $2` оставляла ВСЕ 8 тестов зелёными, и
         * ни один из 88 файлов набора не краснел.
         *
         * В настоящем Postgres это значит: человек купил 50 токенов, потом
         * 20 — и у него стало 20. Прямая потеря денег покупателя на
         * единственном пути, который этот файл и называет «местом, где ошибка забирает
         * у человека деньги и не даёт ничего взамен».
         *
         * Теперь прибавление происходит, только если запрос ДЕЙСТВИТЕЛЬНО
         * прибавляет; замена — заменяет. Неузнанная форма — ошибка, а не
         * тихое «как раньше».
         */
        const прибавляет =
          /DO UPDATE SET balance = user_tokens\.balance \+ \$2/.test(sql)
        const заменяет = /DO UPDATE SET balance = \$2(\D|$)/.test(sql)
        if (прибавляет) balances.set(tid, (balances.get(tid) ?? 0) + amount)
        else if (заменяет) balances.set(tid, amount)
        else
          throw new Error(
            `подделка не узнала форму зачисления: ${sql.replace(/\s+/g, ' ').slice(0, 160)}`
          )
        return { rowCount: 1, rows: [] }
      }
      return { rowCount: 0, rows: [] } // CREATE TABLE IF NOT EXISTS
    },
  }
}

const PAYMENT = { chargeId: 'charge_abc', telegramId: '144022504', amount: 50 }

describe('a Stars payment credits tokens exactly once', () => {
  let pool: ReturnType<typeof fakePool>
  beforeEach(() => {
    pool = fakePool()
  })

  it('credits the paid amount on first delivery', async () => {
    const r = await creditStarsPayment(pool, PAYMENT)
    expect(r.credited).toBe(true)
    expect(pool.balances.get(PAYMENT.telegramId)).toBe(50)
  })

  it('a redelivered webhook does NOT credit again', async () => {
    await creditStarsPayment(pool, PAYMENT)
    const second = await creditStarsPayment(pool, PAYMENT)
    expect(second.credited).toBe(false)
    expect(second.reason).toMatch(/already credited/)
    // The decisive assertion: the balance did not move on the retry.
    expect(pool.balances.get(PAYMENT.telegramId)).toBe(50)
  })

  it('ten redeliveries of one payment still credit once', async () => {
    for (let i = 0; i < 10; i++) await creditStarsPayment(pool, PAYMENT)
    expect(pool.balances.get(PAYMENT.telegramId)).toBe(50)
    expect(pool.charges.size).toBe(1)
  })

  it('two DIFFERENT payments both credit, and they add up', async () => {
    await creditStarsPayment(pool, PAYMENT)
    await creditStarsPayment(pool, {
      ...PAYMENT,
      chargeId: 'charge_def',
      amount: 20,
    })
    expect(pool.balances.get(PAYMENT.telegramId)).toBe(70)
  })

  it('the ledger row is written BEFORE the balance, so a crash cannot double-credit', async () => {
    await creditStarsPayment(pool, PAYMENT)
    const ledgerAt = pool.calls.findIndex(c =>
      c.includes('INSERT INTO star_payments')
    )
    const balanceAt = pool.calls.findIndex(c =>
      c.includes('INSERT INTO user_tokens')
    )
    expect(ledgerAt).toBeGreaterThanOrEqual(0)
    expect(balanceAt).toBeGreaterThan(ledgerAt)
  })
})

describe('it refuses rather than guessing', () => {
  it('no recipient means no credit', async () => {
    const pool = fakePool()
    const r = await creditStarsPayment(pool, { ...PAYMENT, telegramId: '' })
    expect(r.credited).toBe(false)
    expect(pool.balances.size).toBe(0)
  })

  it('a zero or negative amount means no credit', async () => {
    const pool = fakePool()
    expect(
      (await creditStarsPayment(pool, { ...PAYMENT, amount: 0 })).credited
    ).toBe(false)
    expect(
      (await creditStarsPayment(pool, { ...PAYMENT, amount: -5 })).credited
    ).toBe(false)
    expect(pool.balances.size).toBe(0)
  })

  it('a payment with no charge id is refused, not credited unprotected', async () => {
    /*
     * This used to credit and merely SAY it had no dedup key, which is the one
     * outcome this function exists to prevent: with no key, a redelivered
     * webhook or a retried request credits the same money again, and every
     * repeat reads as a fresh sale. Telegram always sends a charge id; a body
     * without one is a bug or a forgery, and both are better refused. Nothing
     * is lost by refusing -- the money stays with Telegram until a credit with
     * a key lands.
     */
    const pool = fakePool()
    const r = await creditStarsPayment(pool, { ...PAYMENT, chargeId: '' })
    expect(r.credited).toBe(false)
    expect(r.reason).toMatch(/no charge id/)
    expect(pool.balances.size).toBe(0)
  })
})

/*
 * THE OWNER LEARNS THAT THEIR CLIENT PAID.
 *
 * An owner's crm_offer stamps token_invoices.owner_id; the credit tells that
 * owner once. Fictional ids only (900000xxx).
 */
describe('the owner who issued the invoice is told the client paid', () => {
  const OWNER = '900000201'
  const CLIENT = '900000202'
  const PAID = { chargeId: 'charge_owner_1', telegramId: CLIENT, amount: 500 }

  /** The Stars fake plus the two reads the notice makes. */
  function poolWithInvoice(ownerId: string | null) {
    const base = fakePool()
    return {
      ...base,
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes('FROM token_invoices')) {
          return {
            rowCount: 1,
            rows: [{ owner_id: ownerId, stars: 750, tokens: 500 }],
          }
        }
        if (sql.includes('FROM crm_people')) {
          return {
            rowCount: 1,
            rows: [{ first_name: 'Vera', username: 'vera_demo' }],
          }
        }
        return base.query(sql, params)
      },
    }
  }

  /** The notice is fire-and-forget; let its promise chain run. */
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r))
  }

  it('notifies the owner once on the first credit, naming client and amount', async () => {
    const pool = poolWithInvoice(OWNER)
    const sent: Array<[string, string]> = []
    const notifyOwner = async (id: string, text: string) => {
      sent.push([id, text])
    }
    const r = await creditStarsPayment(
      pool,
      { ...PAID, invoiceId: 7 },
      { notifyOwner }
    )
    await settle()
    expect(r.credited).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0][0]).toBe(OWNER)
    expect(sent[0][1]).toContain('Vera @vera_demo')
    expect(sent[0][1]).toContain(CLIENT)
    expect(sent[0][1]).toContain('750')
  })

  it('a redelivery does not notify again', async () => {
    const pool = poolWithInvoice(OWNER)
    const sent: string[] = []
    const notifyOwner = async (id: string) => {
      sent.push(id)
    }
    await creditStarsPayment(pool, { ...PAID, invoiceId: 7 }, { notifyOwner })
    await settle()
    const again = await creditStarsPayment(
      pool,
      { ...PAID, invoiceId: 7 },
      { notifyOwner }
    )
    await settle()
    expect(again.credited).toBe(false)
    expect(sent).toEqual([OWNER])
  })

  it('the bot path finds the open invoice by person and amount', async () => {
    const pool = poolWithInvoice(OWNER)
    const sent: string[] = []
    await creditStarsPayment(
      pool,
      { ...PAID, matchOpenInvoice: true },
      {
        notifyOwner: async id => {
          sent.push(id)
        },
      }
    )
    await settle()
    expect(sent).toEqual([OWNER])
  })

  it('no owner on the invoice, no notice', async () => {
    const pool = poolWithInvoice(null)
    const sent: string[] = []
    const r = await creditStarsPayment(
      pool,
      { ...PAID, invoiceId: 7 },
      {
        notifyOwner: async id => {
          sent.push(id)
        },
      }
    )
    await settle()
    expect(r.credited).toBe(true)
    expect(sent).toEqual([])
  })

  it('a person buying for themselves is not told about their own purchase', async () => {
    const pool = poolWithInvoice(CLIENT)
    const sent: string[] = []
    await creditStarsPayment(
      pool,
      { ...PAID, invoiceId: 7 },
      {
        notifyOwner: async id => {
          sent.push(id)
        },
      }
    )
    await settle()
    expect(sent).toEqual([])
  })

  it('a payment with no invoice hint (a club month) reads no invoice at all', async () => {
    const pool = poolWithInvoice(OWNER)
    const sent: string[] = []
    await creditStarsPayment(pool, PAID, {
      notifyOwner: async id => {
        sent.push(id)
      },
    })
    await settle()
    expect(sent).toEqual([])
  })

  it('the credit still succeeds when the notice throws', async () => {
    const pool = poolWithInvoice(OWNER)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await creditStarsPayment(
      pool,
      { ...PAID, invoiceId: 7 },
      {
        notifyOwner: async () => {
          throw new Error('Telegram answered 403: blocked')
        },
      }
    )
    await settle()
    expect(r.credited).toBe(true)
    expect(pool.balances.get(CLIENT)).toBe(500)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('the credit still succeeds when the invoice read throws', async () => {
    const base = fakePool()
    const pool = {
      ...base,
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes('FROM token_invoices'))
          throw new Error('column "owner_id" does not exist')
        return base.query(sql, params)
      },
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await creditStarsPayment(pool, { ...PAID, invoiceId: 7 })
    await settle()
    expect(r.credited).toBe(true)
    expect(base.balances.get(CLIENT)).toBe(500)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
