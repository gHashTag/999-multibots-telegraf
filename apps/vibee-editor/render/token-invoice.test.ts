import { describe, it, expect, vi } from 'vitest'
import { mintTokenInvoice } from './src/agent/token-invoice'

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
      forTelegramId: '6579515876',
      tokens: 50,
      fetchImpl: f,
      botToken: 'bot-token',
    })
    expect(m.payload).toBe('tokens:50:6579515876')
    expect(posted[0].body.payload).toBe('tokens:50:6579515876')
  })

  it('a username is REFUSED rather than written into the payload', async () => {
    /*
     * The bot's handler credits whatever id is in the payload. A username
     * there credits nobody, and the person who paid has paid for nothing.
     */
    const { posted, f } = recorder()
    await expect(
      mintTokenInvoice({
        forTelegramId: '@playom',
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
      forTelegramId: '6579515876',
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
        forTelegramId: '6579515876',
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
        forTelegramId: '6579515876',
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
      forTelegramId: '6579515876',
      tokens: 10,
      pool,
      fetchImpl: f,
      botToken: 't',
    })
    const ins = pool.queries.find(q =>
      q.sql.startsWith('INSERT INTO token_invoices')
    )
    expect(ins, 'pending-строка не записана').toBeTruthy()
    expect(ins!.params[0]).toBe('6579515876')
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
      forTelegramId: '6579515876',
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
      who: '6579515876',
      amount: 15,
      severity: 'attention',
    })
  })

  it('a row that fails to write does not withhold a real link', async () => {
    // Refusing to sell because bookkeeping failed would block payments the
    // bot's handler credits perfectly well.
    const { f } = recorder()
    const m = await mintTokenInvoice({
      forTelegramId: '6579515876',
      tokens: 10,
      pool: poolThat(true),
      fetchImpl: f,
      botToken: 't',
    })
    expect(m.url).toContain('t.me')
  })
})
