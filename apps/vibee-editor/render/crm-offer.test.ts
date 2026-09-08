import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE PERSONAL SELLER PROPOSES; IT DOES NOT SEND.
 *
 * Everything here is about the two ways a seller can go wrong with somebody
 * else's money or somebody else's account: crediting the wrong person, and
 * sending without the owner's press. The mechanism it sits on is already
 * tested; these cover the seams the seller adds.
 */

const OWNER = '144022504'
const LEAD = '6579515876'

/** Routes fetch by host: Telegram mints, Supabase answers who exists. */
function stubNet(opts: { leadInBase?: boolean; telegramOk?: boolean } = {}) {
  const posted: Array<{ url: string; body: any }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      posted.push({
        url: u,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      if (u.includes('api.telegram.org')) {
        return {
          status: 200,
          json: async () =>
            opts.telegramOk === false
              ? { ok: false, description: 'nope' }
              : { ok: true, result: 'https://t.me/$inv-abc' },
        }
      }
      // Supabase REST: the audience and the lead lookup.
      const rows =
        opts.leadInBase === false
          ? []
          : [
              {
                telegram_id: LEAD,
                bot_name: 'neuro_blogger_bot',
                username: 'playom',
                first_name: 'Ольга',
              },
            ]
      return { ok: true, status: 200, json: async () => rows }
    })
  )
  return posted
}

/** The owner's session: knows the username, hands back the numeric id. */
function ownerSession(entities: Record<string, string> = { '@playom': LEAD }) {
  return {
    async getEntity(x: string) {
      const id = entities[x]
      if (!id) throw new Error('Could not find the input entity')
      return { id: { toString: () => id } }
    },
    async disconnect() {},
  }
}

const ownerCtx = () =>
  ({
    telegramId: OWNER,
    pool: { query: async () => ({ rows: [] }) },
    turn: 'ход-1',
    surface: 'bot',
  }) as never

beforeEach(() => {
  vi.resetModules()
  process.env.TOKENS_PAYMENT_BOT_TOKEN = 'bot-token-for-tests' // secret-guard-ok: invented for this test, not a real token
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  // The name the client actually reads. The first version set _ROLE_KEY, the
  // client read nothing, the owner's bot list came back empty, visibility
  // threw, and the seller quietly filed every draft without a lead.
  process.env.SUPABASE_SERVICE_KEY = 'k'
  // The owner is the platform keeper and sees everybody, as in crm-tools.test.
  process.env.HIVE_KEEPERS = OWNER
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('./src/agent/telegram-tools')
})

async function seller(session = ownerSession()) {
  vi.doMock('./src/agent/telegram-tools', async importOriginal => {
    const actual =
      await importOriginal<typeof import('./src/agent/telegram-tools')>()
    return { ...actual, client: async () => session }
  })
  const { CRM_OFFER_TOOLS } = await import('./src/agent/crm-offer-tool')
  const q = await import('./src/agent/tg-proposals')
  q.forgetProposals()
  return { tool: CRM_OFFER_TOOLS[0], q }
}

describe('the credit lands on the lead, never on the owner', () => {
  it('a @username is resolved through the owner session and the LEAD id goes in the payload', async () => {
    const posted = stubNet()
    const { tool } = await seller()
    const r: any = await tool.handler(
      { chat: '@playom', tokens: 50 },
      ownerCtx()
    )
    const mint = posted.find(p => p.url.includes('createInvoiceLink'))!
    expect(mint.body.payload).toBe(`tokens:50:${LEAD}`)
    expect(mint.body.payload).not.toContain(OWNER)
    expect(r.invoice.for_telegram_id).toBe(LEAD)
  })

  it('an unknown username mints NOTHING and says how to name the person', async () => {
    /*
     * A link minted for a guessed id credits a stranger, or nobody. Refusing
     * before the mint is the only order that cannot lose money.
     */
    const posted = stubNet()
    const { tool } = await seller(ownerSession({}))
    await expect(
      tool.handler({ chat: '@nobody', tokens: 50 }, ownerCtx())
    ).rejects.toThrow('tg_dialogs')
    expect(
      posted.filter(p => p.url.includes('createInvoiceLink'))
    ).toHaveLength(0)
  })
})

describe("it proposes, and the press is somebody else's", () => {
  it('the draft is queued for the owner with the link inside', async () => {
    stubNet()
    const { tool, q } = await seller()
    const r: any = await tool.handler(
      { chat: '@playom', tokens: 50, name: 'Оля' },
      ownerCtx()
    )
    expect(r.proposal).toBe(true)
    const waiting = q.pendingFor(OWNER)
    expect(waiting, 'черновик не встал в очередь').toBeTruthy()
    expect(waiting!.what).toContain('https://t.me/$inv-abc')
    expect(waiting!.what).toContain('65')
    expect(waiting!.what).toContain('Оля')
    expect(waiting!.action).toBe('send')
  })

  it('a stranger cannot sell from the owner account', async () => {
    stubNet()
    const { tool, q } = await seller()
    await expect(
      tool.handler(
        { chat: '@playom' },
        { ...(ownerCtx() as any), telegramId: '999' }
      )
    ).rejects.toThrow('владельцу')
    expect(q.pendingCount()).toBe(0)
  })

  it('outside the bot chat nothing is queued, NOTHING IS MINTED, and the answer says where to go', async () => {
    /*
     * The surface gate lived only in propose(). A call from the mini app or
     * /mcp had by then already minted a real, payable invoice link and written
     * a pending row -- for a draft that was dropped one line later. Found by
     * the pre-merge probe; the gate now runs before any money moves.
     */
    const posted = stubNet()
    const { tool, q } = await seller()
    const r: any = await tool.handler(
      { chat: '@playom' },
      { ...(ownerCtx() as any), surface: 'miniapp' }
    )
    expect(q.pendingCount()).toBe(0)
    expect(String(r.why)).toContain('чате бота')
    expect(
      posted.filter(p => p.url.includes('createInvoiceLink')),
      'инвойс выпущен для черновика, который тут же выброшен'
    ).toHaveLength(0)
  })

  it('a negative chat id is refused before anything is minted', async () => {
    const posted = stubNet()
    const { tool } = await seller()
    await expect(
      tool.handler({ chat: '-1001234567890' }, ownerCtx())
    ).rejects.toThrow('не человек')
    expect(posted.filter(p => p.url.includes('createInvoiceLink'))).toHaveLength(0)
  })
})

describe('the touch follows the send, not the model', () => {
  it('a lead in the base travels on the proposal, so the send can record it', async () => {
    stubNet({ leadInBase: true })
    const { tool, q } = await seller()
    const r: any = await tool.handler({ chat: '@playom' }, ownerCtx())
    // The refusal phrase contains the success phrase as a substring, so a
    // substring check passed on the very refusal it was meant to rule out.
    // The full phrase, or nothing.
    expect(r.touch).toContain('после отправки запишется')
    /*
     * Read the queued draft itself. The first version only checked that
     * SOMETHING was queued, and a seller that dropped the lead on the way
     * passed -- the touch would then never be recorded after the press, and
     * the waiting list would not know this person had been written to.
     */
    const kept = q.pendingFor(OWNER) as {
      lead?: string
      bot?: string | null
    } | null
    expect(kept?.lead, 'лид не доехал до предложения').toBe(LEAD)
    expect(kept?.bot).toBe('neuro_blogger_bot')
  })

  it('a lead NOT in the base still gets the offer, and the tool says the touch will not record', async () => {
    /*
     * A personal seller exists for people who have not walked into a bot yet.
     * Refusing them would refuse the whole point; hiding that the touch
     * cannot be recorded would make the waiting list lie later.
     */
    stubNet({ leadInBase: false })
    const { tool, q } = await seller()
    const r: any = await tool.handler({ chat: '@playom' }, ownerCtx())
    expect(r.proposal).toBe(true)
    expect(q.pendingCount()).toBe(1)
    expect(r.touch).toContain('не запишется')
  })

  it('a stalled touch write does not hold up the owner\'s "sent"', async () => {
    /*
     * The message has already left. A pool that never answers must not turn
     * a delivered message into a minute of spinner -- or, worse, into an
     * "unknown outcome" the bot reports as possibly-not-sent.
     */
    vi.useFakeTimers()
    vi.doMock('./src/agent/crm-touches', () => ({
      recordTouch: () => new Promise(() => {}), // never resolves
    }))
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async sendMessage() { return {} },
        async getDialogs() { return [] },
        async disconnect() {},
      }),
    }))
    const { execute } = await import('./src/agent/tg-proposals')
    const warned: string[] = []
    const real = console.warn
    console.warn = (...a: unknown[]) => { warned.push(a.map(String).join(' ')) }
    try {
      const p = execute(
        { id: 'p1', telegramId: OWNER, action: 'send', target: '@x', what: 'hi', lead: LEAD, createdAt: Date.now() } as any,
        { telegramId: OWNER, pool: { query: async () => ({ rows: [] }) } }
      )
      await vi.advanceTimersByTimeAsync(3100)
      const r = await p
      expect(r.done, 'отправленное письмо отчитано как неотправленное').toBe(true)
      expect(warned.join(' ')).toContain('timed out')
    } finally {
      console.warn = real
      vi.useRealTimers()
      vi.doUnmock('./src/agent/crm-touches')
    }
  })

  it('a touch that was not recorded is said out loud, not swallowed', async () => {
    vi.doMock('./src/agent/crm-touches', () => ({
      recordTouch: async () => 'not recorded',
    }))
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async sendMessage() { return {} },
        async getDialogs() { return [] },
        async disconnect() {},
      }),
    }))
    const { execute } = await import('./src/agent/tg-proposals')
    const warned: string[] = []
    const real = console.warn
    console.warn = (...a: unknown[]) => { warned.push(a.map(String).join(' ')) }
    try {
      await execute(
        { id: 'p1', telegramId: OWNER, action: 'send', target: '@x', what: 'hi', lead: LEAD, createdAt: Date.now() } as any,
        { telegramId: OWNER, pool: { query: async () => ({ rows: [] }) } }
      )
    } finally {
      console.warn = real
      vi.doUnmock('./src/agent/crm-touches')
    }
    expect(warned.join(' ')).toContain('not recorded')
  })

  it('a confirmed send with a lead writes a "written" touch; without one, nothing', async () => {
    const touches: any[] = []
    vi.doMock('./src/agent/crm-touches', () => ({
      recordTouch: async (_pool: unknown, t: unknown) => {
        touches.push(t)
        return 'recorded'
      },
    }))
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async sendMessage() {
          return {}
        },
        async getDialogs() {
          return []
        },
        async disconnect() {},
      }),
    }))
    const { execute } = await import('./src/agent/tg-proposals')
    const base = {
      id: 'p1',
      telegramId: OWNER,
      action: 'send' as const,
      target: '@playom',
      what: 'привет',
      createdAt: Date.now(),
    }
    const ctx = {
      telegramId: OWNER,
      pool: { query: async () => ({ rows: [] }) },
    }

    await execute({ ...base, lead: LEAD, bot: 'neuro_blogger_bot' } as any, ctx)
    expect(touches).toHaveLength(1)
    expect(touches[0]).toMatchObject({
      owner: OWNER,
      lead: LEAD,
      kind: 'written',
    })

    await execute(base as any, ctx)
    expect(touches, 'касание записано без лида').toHaveLength(1)
    vi.doUnmock('./src/agent/crm-touches')
  })
})
