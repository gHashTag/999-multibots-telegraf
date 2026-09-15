import { describe, it, expect, vi } from 'vitest'
import {
  mintTokenInvoice,
  ensureInvoiceColumns,
  forgetInvoiceColumnsForTests,
} from './src/agent/token-invoice'

/**
 * ONE MINT, TWO CALLERS, ONE TRUTH ABOUT MONEY.
 *
 * The mini app's cashier and the personal seller both come through here. What
 * is worth checking is not that a link comes back but WHOSE money it is: the
 * payload names the person who will be credited, and a wrong id there pays
 * one person with another's Stars.
 */

const telegramSays = (body: unknown, status = 200) =>
  (async () => ({ status, json: async () => body })) as unknown as typeof fetch

/** A fetch that records what was posted and answers as Telegram would. */
function recorder(answer: unknown = { ok: true, result: 'https://t.me/$inv' }) {
  const posted: Array<{ url: string; body: any }> = []
  const f = (async (url: string, init: any) => {
    posted.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')),
    })
    return { status: 200, json: async () => answer }
  }) as unknown as typeof fetch
  return { posted, f }
}

describe('the payload names the person who will be credited', () => {
  it('a numeric recipient goes into the payload verbatim', async () => {
    const { posted, f } = recorder()
    const m = await mintTokenInvoice({
      forTelegramId: '900000002',
      tokens: 50,
      fetchImpl: f,
      botToken: 'bot-token',
    })
    expect(m.payload).toBe('tokens:50:900000002')
    expect(posted[0].body.payload).toBe('tokens:50:900000002')
  })

  it('a username is REFUSED rather than written into the payload', async () => {
    /*
     * The bot's handler credits whatever id is in the payload. A username
     * there credits nobody, and the person who paid has paid for nothing.
     */
    const { posted, f } = recorder()
    await expect(
      mintTokenInvoice({
        forTelegramId: '@pilot_client',
        tokens: 50,
        fetchImpl: f,
        botToken: 'bot-token',
      })
    ).rejects.toThrow('числовой')
    expect(posted, 'ссылка выпущена на имя, а не на id').toHaveLength(0)
  })
})

describe('price comes from the one scale', () => {
  it('50 tokens is 65 stars, as in token-packs', async () => {
    const { posted, f } = recorder()
    const m = await mintTokenInvoice({
      forTelegramId: '900000002',
      tokens: 50,
      fetchImpl: f,
      botToken: 'bot-token',
    })
    expect(m.stars).toBe(65)
    expect(posted[0].body.prices[0].amount).toBe(65)
    expect(posted[0].body.currency).toBe('XTR')
  })
})

describe('no link is invented', () => {
  it('without a bot token it refuses, and posts nothing', async () => {
    const { posted, f } = recorder()
    await expect(
      mintTokenInvoice({
        forTelegramId: '900000002',
        tokens: 10,
        fetchImpl: f,
        botToken: '',
      })
    ).rejects.toThrow('касса не настроена')
    expect(posted).toHaveLength(0)
  })

  it('a Telegram refusal is a refusal, not an empty link', async () => {
    const f = telegramSays({
      ok: false,
      description: 'PAYMENT_PROVIDER_INVALID',
    })
    await expect(
      mintTokenInvoice({
        forTelegramId: '900000002',
        tokens: 10,
        fetchImpl: f,
        botToken: 't',
      })
    ).rejects.toThrow('не выдал инвойс')
  })
})

describe('the pending row', () => {
  const poolThat = (fail: boolean) => {
    const queries: Array<{ sql: string; params: unknown[] }> = []
    return {
      queries,
      query: async (sql: string, params: unknown[] = []) => {
        queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
        if (fail && sql.includes('INSERT')) throw new Error('disk full')
        return { rows: [] }
      },
    }
  }

  it('is written for the RECIPIENT, so the later reconcile finds their payment', async () => {
    const { f } = recorder()
    const pool = poolThat(false)
    await mintTokenInvoice({
      forTelegramId: '900000002',
      tokens: 10,
      pool,
      fetchImpl: f,
      botToken: 't',
    })
    const ins = pool.queries.find(q =>
      q.sql.startsWith('INSERT INTO token_invoices')
    )
    expect(ins, 'pending-строка не записана').toBeTruthy()
    expect(ins!.params[0]).toBe('900000002')
  })

  it('a row that fails to write is JOURNALED, naming the person and the amount', async () => {
    /*
     * Two nets catch a Stars payment: the bot's handler credits it, and the
     * pending row lets a later reconcile find it. When the row fails, the
     * moment it matters is exactly the moment the first net did not fire --
     * so the failure goes where money events needing a human already go,
     * with who and how much, at attention. Checked by running it: the
     * source grep in an-unreconcilable-invoice-is-visible.test.ts pins the
     * shape, this pins the call.
     */
    const written: any[] = []
    // Path relative to THIS file, and a module reset: the static import at the
    // top already bound the helper to the real journal, and a mock aimed at the
    // helper's own relative path names a module that does not exist here.
    vi.resetModules()
    vi.doMock('./src/hive/journal', () => ({
      record: async (_pool: unknown, ev: unknown) => {
        written.push(ev)
        return 'recorded'
      },
    }))
    const { mintTokenInvoice: mint } = await import('./src/agent/token-invoice')
    const { f } = recorder()
    await mint({
      forTelegramId: '900000002',
      tokens: 10,
      pool: poolThat(true),
      fetchImpl: f,
      botToken: 't',
    })
    vi.doUnmock('./src/hive/journal')
    expect(written, 'сбой pending-строки не попал в журнал').toHaveLength(1)
    expect(written[0]).toMatchObject({
      // The kind is what a reader filters by. A wrong one files a money event
      // under a heading nobody opens -- survived a mutation until this line.
      kind: 'payment',
      who: '900000002',
      amount: 15,
      severity: 'attention',
    })
  })

  it('a row that fails to write does not withhold a real link', async () => {
    // Refusing to sell because bookkeeping failed would block payments the
    // bot's handler credits perfectly well.
    const { f } = recorder()
    const m = await mintTokenInvoice({
      forTelegramId: '900000002',
      tokens: 10,
      pool: poolThat(true),
      fetchImpl: f,
      botToken: 't',
    })
    expect(m.url).toContain('t.me')
  })
})

describe('a group or channel is not a person', () => {
  it('a negative id is refused, not sign-stripped into a random user', async () => {
    /*
     * Bot-API style: -100… is a channel, -… a group. The first version
     * accepted /^-?\d+$/ and stripped the sign, so tokens for a channel would
     * have been credited to whichever PERSON happened to hold that positive
     * id. Found by the pre-merge probe.
     */
    const { posted, f } = recorder()
    await expect(
      mintTokenInvoice({
        forTelegramId: '-1001234567890',
        tokens: 10,
        fetchImpl: f,
        botToken: 't',
      })
    ).rejects.toThrow('не человек')
    expect(posted).toHaveLength(0)
  })
})

describe('a failed pending row leaves a line where somebody can find it', () => {
  it('console.warn fires even when the journal shares the broken database', async () => {
    /*
     * The journal lives in the same database as the row. When the row fails
     * because the database is down, the journal fails too, and the first
     * extraction of this helper dropped the console line -- leaving a DB
     * outage with no trace anywhere. Reproduced by the pre-merge probe.
     */
    const warned: string[] = []
    const real = console.warn
    console.warn = (...a: unknown[]) => {
      warned.push(a.map(String).join(' '))
    }
    try {
      const { f } = recorder()
      await mintTokenInvoice({
        forTelegramId: '900000002',
        tokens: 10,
        pool: {
          query: async () => {
            throw new Error('connection refused')
          },
        },
        fetchImpl: f,
        botToken: 't',
      })
    } finally {
      console.warn = real
    }
    expect(warned.join(' ')).toContain('pending')
    expect(warned.join(' ')).toContain('connection refused')
  })
})

describe('the pending row id travels with the draft', () => {
  /*
   * A cancel has to find the row it un-pends. The INSERT asks the database
   * for the id and the mint hands it back; everything that can go wrong on
   * that path must leave the link and the row intact.
   */
  const poolAnswering = (rows: unknown[], failOn?: string) => {
    const queries: Array<{ sql: string; params: unknown[] }> = []
    return {
      queries,
      query: async (sql: string, params: unknown[] = []) => {
        const flat = sql.replace(/\s+/g, ' ').trim()
        queries.push({ sql: flat, params })
        if (failOn && flat.startsWith(failOn)) throw new Error('nope')
        return { rows: flat.startsWith('INSERT') ? rows : [] }
      },
    }
  }
  const mint = (pool: ReturnType<typeof poolAnswering>) =>
    mintTokenInvoice({
      forTelegramId: '900000002',
      tokens: 10,
      pool,
      fetchImpl: recorder().f,
      botToken: 't',
    })

  it('RETURNING id becomes invoiceId', async () => {
    const pool = poolAnswering([{ id: 42 }])
    const minted = await mint(pool)
    expect(minted.invoiceId).toBe(42)
    expect(pool.queries.find(q => q.sql.startsWith('INSERT'))!.sql).toContain(
      'RETURNING id'
    )
  })

  it('a database that answers without an id leaves invoiceId absent, not NaN', async () => {
    const minted = await mint(poolAnswering([]))
    expect(minted).not.toHaveProperty('invoiceId')
  })

  it('a string id from the driver is a number on the draft', async () => {
    const minted = await mint(poolAnswering([{ id: '42' }]))
    expect(minted.invoiceId).toBe(42)
  })

  it('a failed ALTER does not cost the pending row or the link', async () => {
    const pool = poolAnswering([{ id: 5 }], 'ALTER')
    const minted = await mint(pool)
    expect(pool.queries.some(q => q.sql.startsWith('INSERT'))).toBe(true)
    expect(minted.invoiceId).toBe(5)
    expect(minted.url).toContain('t.me')
  })
})

describe('the cancel columns are added once per process', () => {
  const recording = (failAlter = false) => {
    const sqls: string[] = []
    return {
      sqls,
      query: async (sql: string) => {
        const flat = sql.replace(/\s+/g, ' ').trim()
        sqls.push(flat)
        if (failAlter && flat.startsWith('ALTER')) throw new Error('no grant')
        return { rows: [] }
      },
    }
  }

  it('two mints, one ALTER: the lock is taken once, not per open of the app', async () => {
    forgetInvoiceColumnsForTests()
    const pool = recording()
    for (let i = 0; i < 2; i++) {
      await mintTokenInvoice({
        forTelegramId: '900000002',
        tokens: 10,
        pool,
        fetchImpl: recorder().f,
        botToken: 't',
      })
    }
    expect(
      pool.sqls.filter(q => q.startsWith('ALTER TABLE token_invoices')).length
    ).toBe(1)
    expect(pool.sqls.filter(q => q.startsWith('INSERT')).length).toBe(2)
  })

  it('a refused ALTER is retried next time, and never throws', async () => {
    forgetInvoiceColumnsForTests()
    expect(await ensureInvoiceColumns(recording(true))).toBe(false)
    const ok = recording()
    expect(await ensureInvoiceColumns(ok)).toBe(true)
    expect(ok.sqls.length).toBe(1)
    expect(await ensureInvoiceColumns(ok)).toBe(true)
    expect(ok.sqls.length, 'a second ALTER after success').toBe(1)
  })
})

/**
 * A SUBSCRIPTION IS A DIFFERENT INVOICE, NOT THE SAME ONE REPEATED.
 *
 * Telegram bills it every thirty days by itself. Three things have to be
 * right or somebody is charged for nothing: the period must be exactly the
 * one Telegram accepts, the ceiling is ten times lower than a one-off, and
 * the payload must say "subscription" so the bot credits every renewal and
 * BotSubscriptionUpdated can be matched to a person later.
 *
 * The numbers here are not guesses: token-packs.ts records a live measurement
 * from 2026-09-09 -- 10000 accepted, 10001 rejected, period 2592000 accepted.
 */
describe('a subscription invoice', () => {
  const mint = (over: Record<string, unknown> = {}) => ({
    forTelegramId: '900000001',
    tokens: 150,
    botToken: 'test-token', // secret-guard-ok: invented here
    subscription: true,
    ...over,
  })

  it('asks Telegram for the only period Telegram takes', async () => {
    const { posted, f } = recorder()
    await mintTokenInvoice(mint({ fetchImpl: f }) as never)
    expect(posted[0].body.subscription_period).toBe(2592000)
    expect(posted[0].body.currency).toBe('XTR')
  })

  it('says so in the payload, or every renewal credits nobody', async () => {
    const { posted, f } = recorder()
    await mintTokenInvoice(mint({ fetchImpl: f }) as never)
    expect(posted[0].body.payload).toBe('subtokens:150:900000001')
  })

  it('leaves a one-off invoice exactly as it was', async () => {
    const { posted, f } = recorder()
    await mintTokenInvoice(mint({ fetchImpl: f, subscription: false }) as never)
    expect(posted[0].body.payload).toBe('tokens:150:900000001')
    expect('subscription_period' in posted[0].body).toBe(false)
  })

  it('refuses above the subscription ceiling, with the real number', async () => {
    // 10000 stars is where Telegram answers SUBSCRIPTION_AMOUNT_INVALID. A
    // one-off of the same size is fine, which is exactly why this cannot
    // lean on the one-off check.
    const { posted, f } = recorder()
    await expect(
      mintTokenInvoice(mint({ fetchImpl: f, tokens: 20000 }) as never)
    ).rejects.toThrow('10000')
    expect(posted, 'Telegram was asked anyway').toHaveLength(0)
  })

  it('still mints that size as a one-off', async () => {
    const { posted, f } = recorder()
    await mintTokenInvoice(
      mint({ fetchImpl: f, tokens: 20000, subscription: false }) as never
    )
    expect(posted).toHaveLength(1)
  })

  it('marks the pending row, so a second subscription can be refused later', async () => {
    forgetInvoiceColumnsForTests()
    const sql: Array<{ q: string; p: unknown[] }> = []
    const pool = {
      query: async (q: string, p: unknown[] = []) => {
        sql.push({ q, p })
        // The duplicate-subscription guard reads this table too, and a pool
        // that answers every SELECT with a row would make it refuse the mint.
        if (/SELECT 1 FROM token_invoices/.test(q)) return { rows: [] }
        return { rows: [{ id: 7 }] }
      },
    }
    const { f } = recorder()
    await mintTokenInvoice(mint({ fetchImpl: f, pool }) as never)
    const insert = sql.find(x => x.q.includes('INSERT INTO token_invoices'))!
    expect(insert.p).toContain(true)
    expect(
      sql.some(x => /ADD COLUMN IF NOT EXISTS subscription/.test(x.q)),
      'the column was never added'
    ).toBe(true)
  })
})
