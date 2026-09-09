import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * tokens_invoice -- the client buying for themselves -- is minted by the
 * client's OWN bot of the farm, through the one mint the invoice route uses.
 */

const CLIENT = '900000002'

function stubNet(opts: {
  botName?: string | null
  bots: Record<string, string>
}) {
  const posted: Array<{ url: string; body: any }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      posted.push({
        url: u,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      if (u.endsWith('/getMe')) {
        const token = /\/bot([^/]+)\/getMe$/.exec(u)?.[1] ?? ''
        const username = opts.bots[token]
        return {
          status: 200,
          json: async () =>
            username ? { ok: true, result: { username } } : { ok: false },
        }
      }
      if (u.includes('api.telegram.org')) {
        return {
          status: 200,
          json: async () => ({ ok: true, result: 'https://t.me/$inv-self' }),
        }
      }
      const rows =
        opts.botName === null
          ? []
          : [
              {
                telegram_id: CLIENT,
                bot_name: opts.botName ?? 'neuro_blogger_bot',
              },
            ]
      return { ok: true, status: 200, json: async () => rows }
    })
  )
  return posted
}

async function invoiceTool() {
  const mod: Record<string, unknown> = await import('./src/agent/tools')
  const all = Object.values(mod)
    .filter(v => Array.isArray(v))
    .flat() as Array<{
    name?: string
    handler: (a: any, ctx: any) => Promise<any>
  }>
  const tool = all.find(t => t?.name === 'tokens_invoice')
  if (!tool) throw new Error('tokens_invoice not exported')
  return tool
}

const ctx = () =>
  ({
    telegramId: CLIENT,
    pool: { query: async () => ({ rows: [] }) },
    surface: 'business',
  }) as never

beforeEach(() => {
  vi.resetModules()
  process.env.TOKENS_PAYMENT_BOT_TOKEN = 'bot-token-for-tests' // secret-guard-ok: invented for this test
  process.env.BOT_TOKEN_1 = 'farm-token-one' // secret-guard-ok: invented for this test
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'k'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BOT_TOKEN_1
})

describe("tokens_invoice is minted by the client's own bot", () => {
  it('the link comes from the bot the client belongs to, payload for the client', async () => {
    const posted = stubNet({
      botName: 'neuro_blogger_bot',
      bots: {
        'farm-token-one': 'neuro_blogger_bot',
        'bot-token-for-tests': 't27ai_bot',
      },
    })
    const tool = await invoiceTool()
    const r = await tool.handler({ tokens: 50 }, ctx())
    const mint = posted.find(p => p.url.includes('createInvoiceLink'))!
    expect(mint.url).toContain('/botfarm-token-one/')
    expect(mint.body.payload).toBe(`tokens:50:${CLIENT}`)
    expect(mint.body.currency).toBe('XTR')
    expect(r.ссылка).toBe('https://t.me/$inv-self') // cyrillic-ok: pre-existing result field names
    expect(r.от_бота).toBe('@neuro_blogger_bot') // cyrillic-ok: pre-existing result field names
    expect(r.токенов).toBe(50) // cyrillic-ok: pre-existing result field names
    expect(r.звёзд).toBe(65) // cyrillic-ok: pre-existing result field names
  })

  it('a client the base does not know is served by the default cashier', async () => {
    const posted = stubNet({
      botName: null,
      bots: {
        'farm-token-one': 'neuro_blogger_bot',
        'bot-token-for-tests': 't27ai_bot',
      },
    })
    const tool = await invoiceTool()
    const r = await tool.handler({ tokens: 10 }, ctx())
    const mint = posted.find(p => p.url.includes('createInvoiceLink'))!
    expect(mint.url).toContain('/botbot-token-for-tests/')
    expect(r.от_бота).toBe('касса по умолчанию') // cyrillic-ok: pre-existing result field names
  })

  it('the price is the scale, not a number the model could pass', async () => {
    stubNet({
      botName: 'neuro_blogger_bot',
      bots: { 'farm-token-one': 'neuro_blogger_bot' },
    })
    const tool = await invoiceTool()
    const r = await tool.handler({ tokens: 150 }, ctx())
    expect(r.звёзд).toBe(175) // cyrillic-ok: pre-existing result field names
    expect(r.звёзд_за_токен).toBeCloseTo(175 / 150, 3) // cyrillic-ok: pre-existing result field names
  })
})
