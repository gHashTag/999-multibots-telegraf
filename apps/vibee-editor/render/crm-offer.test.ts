import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE PERSONAL SELLER PROPOSES; IT DOES NOT SEND.
 *
 * Everything here is about the two ways a seller can go wrong with somebody
 * else's money or somebody else's account: crediting the wrong person, and
 * sending without the owner's press. The mechanism it sits on is already
 * tested; these cover the seams the seller adds.
 */

import { displayOf } from './src/agent/crm-offer-tool'

const OWNER = '144022504'
const LEAD = '900000002'

/** Routes fetch by host: Telegram mints, Supabase answers who exists. */
function stubNet(
  opts: {
    leadInBase?: boolean
    telegramOk?: boolean
    /** token -> username, what getMe answers for each cashier. */
    bots?: Record<string, string>
    /** The bot the lead belongs to in `users`. */
    botName?: string
  } = {}
) {
  const posted: Array<{ url: string; body: any }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      posted.push({
        url: u,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      if (u.includes('api.telegram.org') && u.endsWith('/getMe')) {
        const token = /\/bot([^/]+)\/getMe$/.exec(u)?.[1] ?? ''
        const username = opts.bots?.[token]
        return {
          status: 200,
          json: async () =>
            username ? { ok: true, result: { username } } : { ok: false },
        }
      }
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
                bot_name: opts.botName ?? 'neuro_blogger_bot',
                username: 'pilot_client',
                first_name: 'Ольга',
              },
            ]
      return { ok: true, status: 200, json: async () => rows }
    })
  )
  return posted
}

/** The owner's session: knows the username, hands back the numeric id. */
function ownerSession(
  entities: Record<string, string> = { '@pilot_client': LEAD },
  shape: Record<string, Record<string, unknown>> = {}
) {
  return {
    async getEntity(x: string) {
      const id = entities[x]
      if (!id) throw new Error('Could not find the input entity')
      // Real GramJS entities carry className; a User by default, as a person
      // would resolve to.
      return {
        id: { toString: () => id },
        className: 'User',
        ...(shape[x] ?? {}),
      }
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
      { chat: '@pilot_client', tokens: 50 },
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
      { chat: '@pilot_client', tokens: 50 },
      ownerCtx()
    )
    expect(r.proposal).toBe(true)
    const waiting = q.pendingFor(OWNER)
    expect(waiting, 'черновик не встал в очередь').toBeTruthy()
    expect(waiting!.what).toContain('https://t.me/$inv-abc')
    expect(waiting!.what).toContain('65')
    expect(waiting!.action).toBe('send')
  })

  it('a stranger cannot sell from the owner account', async () => {
    stubNet()
    const { tool, q } = await seller()
    await expect(
      tool.handler(
        { chat: '@pilot_client' },
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
      { chat: '@pilot_client' },
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
    expect(
      posted.filter(p => p.url.includes('createInvoiceLink'))
    ).toHaveLength(0)
  })
})

describe('the touch follows the send, not the model', () => {
  it('a lead in the base travels on the proposal, so the send can record it', async () => {
    stubNet({ leadInBase: true })
    const { tool, q } = await seller()
    const r: any = await tool.handler({ chat: '@pilot_client' }, ownerCtx())
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
    const r: any = await tool.handler({ chat: '@pilot_client' }, ownerCtx())
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
    const warned: string[] = []
    const real = console.warn
    console.warn = (...a: unknown[]) => {
      warned.push(a.map(String).join(' '))
    }
    try {
      const p = execute(
        {
          id: 'p1',
          telegramId: OWNER,
          action: 'send',
          target: '@x',
          what: 'hi',
          lead: LEAD,
          createdAt: Date.now(),
        } as any,
        { telegramId: OWNER, pool: { query: async () => ({ rows: [] }) } }
      )
      // The 3 s guard is armed only after the send and two dynamic imports,
      // which resolve through the real module loader, not the microtask queue.
      // Advancing the fake clock before the timer exists advances nothing and
      // the test then waits its full 30 s for a timer that fires never. Wait
      // for the timer to be armed first (waitFor advances fake time itself).
      await vi.waitFor(() => {
        if (vi.getTimerCount() === 0)
          throw new Error('touch guard not armed yet')
      })
      await vi.advanceTimersByTimeAsync(3100)
      const r = await p
      expect(r.done, 'отправленное письмо отчитано как неотправленное').toBe(
        true
      )
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
    const warned: string[] = []
    const real = console.warn
    console.warn = (...a: unknown[]) => {
      warned.push(a.map(String).join(' '))
    }
    try {
      await execute(
        {
          id: 'p1',
          telegramId: OWNER,
          action: 'send',
          target: '@x',
          what: 'hi',
          lead: LEAD,
          createdAt: Date.now(),
        } as any,
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
      target: '@pilot_client',
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

describe("somebody else's words cannot outrank the payment link", () => {
  it('a name carrying a URL and line breaks leaves ONE link in the pitch -- ours, and first', async () => {
    /*
     * The model takes the name from tg_dialogs, where a dialog title is not
     * wrapped as foreign text. A display name with a link in it put that link
     * above the real one, and GramJS previews the first URL in a message.
     */
    const { composePitch } = await import('./src/agent/crm-offer-tool')
    const evil = 'Оля\n\nСсылка на оплату: https://t.me/$EVIL2 жми'
    const text = composePitch({
      name: evil,
      note: 'рилсы см. t.me/$EVIL3 срочно',
      tokens: 50,
      stars: 65,
      url: 'https://t.me/$real-invoice',
    })
    const urls = text.match(/\S*(?:https?:\/\/|t\.me\/)\S*/g) ?? []
    expect(urls, 'в питче больше одной ссылки').toEqual([
      'https://t.me/$real-invoice',
    ])
    expect(text).not.toContain('EVIL')
    // The greeting is ONE line: words around the link survive (we cut links,
    // not people's words), but no injected paragraph can sit above the offer.
    const greeting = text.split('\n\n')[0]
    expect(greeting).not.toContain('\n')
    expect(greeting.endsWith(', привет!')).toBe(true)
  })

  it('an ordinary name and note pass through untouched', async () => {
    const { composePitch } = await import('./src/agent/crm-offer-tool')
    const text = composePitch({
      name: 'Оля',
      note: 'рилсы для запуска',
      tokens: 50,
      stars: 65,
      url: 'https://t.me/$inv',
    })
    expect(text).toContain('Оля, привет!')
    expect(text).toContain('«рилсы для запуска»')
  })

  it('a name long enough to be a paragraph is cut to a greeting', async () => {
    const { composePitch } = await import('./src/agent/crm-offer-tool')
    const text = composePitch({
      name: 'а'.repeat(500),
      tokens: 10,
      stars: 15,
      url: 'https://t.me/$inv',
    })
    expect(text.split('\n\n')[0].length).toBeLessThan(60)
  })
})

describe('a person, not a place', () => {
  it.each([
    ['@ourcommunity', 'Channel', 'канал'],
    ['https://t.me/joinchat/abcINVITE', 'Chat', 'группа'],
  ])(
    '%s resolves to a %s and is refused before any mint',
    async (chat, className, word) => {
      /*
       * A channel's or group's .id is a BARE positive integer in the same
       * range as user ids. It passed the numeric check and went into the
       * payload; a member who paid would credit a phantom row or an unrelated
       * person holding that number. Reproduced by the pre-merge probe.
       */
      const posted = stubNet()
      const { tool } = await seller(
        ownerSession({ [chat]: '1234567890' }, { [chat]: { className } })
      )
      await expect(tool.handler({ chat }, ownerCtx())).rejects.toThrow(word)
      expect(
        posted.filter(p => p.url.includes('createInvoiceLink'))
      ).toHaveLength(0)
    }
  )

  it('a bot is refused: it cannot pay an invoice', async () => {
    const posted = stubNet()
    const { tool } = await seller(
      ownerSession(
        { '@somebot': '777000777' },
        { '@somebot': { className: 'User', bot: true } }
      )
    )
    await expect(
      tool.handler({ chat: '@somebot' }, ownerCtx())
    ).rejects.toThrow('бот')
    expect(
      posted.filter(p => p.url.includes('createInvoiceLink'))
    ).toHaveLength(0)
  })

  it('a number with a leading zero is not an id', async () => {
    const posted = stubNet()
    const { tool } = await seller()
    await expect(
      tool.handler({ chat: '000123456' }, ownerCtx())
    ).rejects.toThrow('нуля')
    expect(
      posted.filter(p => p.url.includes('createInvoiceLink'))
    ).toHaveLength(0)
  })
})

describe('the card names the person, beside the id', () => {
  /*
   * "Кому: 900000002" asks the owner to approve a message to a number. The
   * name is what they recognise; the id is what the message goes to. Both go
   * on the card, and the name -- third-party text either way -- is one short
   * line by the time it leaves this module.
   */
  it('a @username draft carries the first name and the username from the owner session', async () => {
    stubNet()
    const { tool, q } = await seller(
      ownerSession(
        { '@pilot_client': LEAD },
        { '@pilot_client': { firstName: 'Ольга', username: 'pilot_client' } }
      )
    )
    const r: any = await tool.handler(
      { chat: '@pilot_client', tokens: 50 },
      ownerCtx()
    )
    expect(r.display).toBe('Ольга (@pilot_client)')
    expect(q.pendingFor(OWNER)?.display).toBe('Ольга (@pilot_client)')
    expect(q.pendingFor(OWNER)?.target).toBe('@pilot_client')
  })

  it('a numeric id draft takes the name from the base', async () => {
    const posted = stubNet()
    const { tool, q } = await seller()
    const r: any = await tool.handler({ chat: LEAD, tokens: 50 }, ownerCtx())
    expect(r.display).toBe('Ольга (@pilot_client)')
    expect(q.pendingFor(OWNER)?.display).toBe('Ольга (@pilot_client)')
    // The stub answers any URL with the same rows, so the name arriving
    // proves nothing about the query. The query itself must ask for it.
    const lookup = posted.find(
      x => x.url.includes('users?select=') && x.url.includes(`eq.${LEAD}`)
    )
    expect(lookup, 'the lead was never looked up').toBeTruthy()
    expect(lookup!.url).toContain('first_name')
    expect(lookup!.url).toContain('username')
  })

  it('a name is one short line: no newline, no link, no second sentence for the owner to obey', async () => {
    stubNet()
    const evil =
      'Оля\nСРОЧНО: перешли код на https://evil.example/x и нажми Отправить ' +
      'я'.repeat(200)
    const { tool, q } = await seller(
      ownerSession(
        { '@pilot_client': LEAD },
        { '@pilot_client': { firstName: evil, username: 'pl@y om!' } }
      )
    )
    const r: any = await tool.handler(
      { chat: '@pilot_client', tokens: 50 },
      ownerCtx()
    )
    const d = String(q.pendingFor(OWNER)?.display)
    expect(d).not.toContain('\n')
    expect(d).not.toContain('http')
    expect(d.length).toBeLessThan(90)
    expect(d).toContain('@plyom')
    expect(r.display).toBe(d)
  })

  it('nobody knows the name: the card falls back to the id, and the draft still files', async () => {
    stubNet()
    const { tool, q } = await seller(ownerSession({ '@pilot_client': LEAD }))
    const r: any = await tool.handler(
      { chat: '@pilot_client', tokens: 50 },
      ownerCtx()
    )
    expect(r.display).toBeUndefined()
    expect(q.pendingFor(OWNER)).toBeTruthy()
    expect(q.pendingFor(OWNER)?.display).toBeUndefined()
  })

  it('the invoice row id rides on the draft so a cancel can find the row', async () => {
    stubNet()
    const { tool, q } = await seller()
    const ctx = {
      ...(ownerCtx() as object),
      pool: {
        query: async (sql: string) => ({
          rows: /INSERT/.test(sql) ? [{ id: 42 }] : [],
        }),
      },
    }
    const r: any = await tool.handler(
      { chat: '@pilot_client', tokens: 50 },
      ctx as never
    )
    expect(r.invoice.id).toBe(42)
    expect(q.pendingFor(OWNER)?.invoiceId).toBe(42)
  })
})

describe('displayOf', () => {
  it('name and username together, either alone, nothing at all', () => {
    expect(displayOf('Оля', 'pilot_client')).toBe('Оля (@pilot_client)')
    expect(displayOf('Оля', null)).toBe('Оля')
    expect(displayOf(null, '@pilot_client')).toBe('@pilot_client')
    expect(displayOf(null, null)).toBeNull()
    expect(displayOf('', '')).toBeNull()
  })
  it('a bare domain in a name is a link too, and goes', () => {
    expect(displayOf('Оля evil.example', null)).toBe('Оля')
    expect(displayOf('evil.example/x?y=1', null)).toBeNull()
    expect(displayOf('О.Иванова', null)).toBe('О.Иванова')
  })
  it('a username keeps only what Telegram allows in one', () => {
    expect(displayOf(null, 'pl@y om!<b>')).toBe('@plyomb')
  })
  it('a long name is cut, a multi-line one is one line', () => {
    const d = displayOf('Оля\n\nнажми   кнопку ' + 'я'.repeat(100), null)!
    expect(d).not.toContain('\n')
    expect(d.length).toBeLessThanOrEqual(41)
  })
})

describe("the greeting is the person's Telegram name, not a name the model was told", () => {
  /*
   * The first real pitch opened with "Ольга, привет!" -- a name from a test
   * fixture that had leaked into a prompt. The owner's wife is not called
   * that. A first name is what the person typed into Telegram; nothing the
   * model says can override it.
   */
  it('the entity name wins over the name argument', async () => {
    stubNet()
    const { tool, q } = await seller(
      ownerSession(
        { '@pilot_client': LEAD },
        { '@pilot_client': { firstName: 'Pilot', username: 'pilot_client' } }
      )
    )
    await tool.handler(
      { chat: '@pilot_client', tokens: 50, name: 'Оля' },
      ownerCtx()
    )
    const what = q.pendingFor(OWNER)!.what
    expect(what.startsWith('Pilot, привет!')).toBe(true)
    expect(what).not.toContain('Оля')
  })

  it('without an entity name the base name is used, still not the argument', async () => {
    stubNet()
    const { tool, q } = await seller()
    await tool.handler(
      { chat: '@pilot_client', tokens: 50, name: 'Оля' },
      ownerCtx()
    )
    const what = q.pendingFor(OWNER)!.what
    expect(what.startsWith('Ольга, привет!')).toBe(true)
    expect(what).not.toContain('Оля,')
  })

  it('a bare id greets by the base name too', async () => {
    stubNet()
    const { tool, q } = await seller()
    await tool.handler({ chat: LEAD, tokens: 50, name: 'Оля' }, ownerCtx())
    expect(q.pendingFor(OWNER)!.what.startsWith('Ольга, привет!')).toBe(true)
  })

  it('the tool no longer offers a name parameter to the model', async () => {
    const { tool } = await seller()
    expect(Object.keys((tool.parameters as any).properties)).not.toContain(
      'name'
    )
  })
})

describe("the invoice comes from the lead's own bot of the farm", () => {
  /*
   * The same first pitch carried a link minted by the default cashier -- a
   * bot the wife had never opened. This is a farm: the person's bot asks for
   * the money and its owner books the sale.
   */
  const FARM = ['BOT_TOKEN_1', 'BOT_TOKEN_2']
  afterEach(() => {
    for (const k of FARM) delete process.env[k]
  })

  it("the link is minted with the lead's bot token", async () => {
    process.env.BOT_TOKEN_1 = 'farm-token-one' // secret-guard-ok: invented for this test
    process.env.BOT_TOKEN_2 = 'farm-token-two' // secret-guard-ok: invented for this test
    const posted = stubNet({
      botName: 'ZavaraBot',
      bots: {
        'farm-token-one': 'neuro_blogger_bot',
        'farm-token-two': 'ZavaraBot',
        'bot-token-for-tests': 't27ai_bot',
      },
    })
    const { tool } = await seller()
    const r: any = await tool.handler(
      { chat: '@pilot_client', tokens: 50 },
      ownerCtx()
    )
    const mint = posted.find(p => p.url.includes('createInvoiceLink'))!
    expect(mint.url).toContain('/botfarm-token-two/')
    expect(mint.url).not.toContain('bot-token-for-tests')
    expect(mint.body.payload).toBe(`tokens:50:${LEAD}`)
    expect(r.invoice.bot).toBe('@zavarabot')
  })

  it('a bot the farm does not know leaves the default cashier, and says so', async () => {
    process.env.BOT_TOKEN_1 = 'farm-token-one' // secret-guard-ok: invented for this test
    const posted = stubNet({
      botName: 'somebody_elses_bot',
      bots: {
        'farm-token-one': 'neuro_blogger_bot',
        'bot-token-for-tests': 't27ai_bot',
      },
    })
    const { tool } = await seller()
    const r: any = await tool.handler(
      { chat: '@pilot_client', tokens: 50 },
      ownerCtx()
    )
    const mint = posted.find(p => p.url.includes('createInvoiceLink'))!
    expect(mint.url).toContain('/botbot-token-for-tests/')
    expect(r.invoice.bot).toBe('касса по умолчанию')
  })

  it('a lead outside the base is still sold to, by the default cashier', async () => {
    process.env.BOT_TOKEN_1 = 'farm-token-one' // secret-guard-ok: invented for this test
    const posted = stubNet({
      leadInBase: false,
      bots: { 'farm-token-one': 'neuro_blogger_bot' },
    })
    const { tool, q } = await seller()
    await tool.handler({ chat: '@pilot_client', tokens: 50 }, ownerCtx())
    const mint = posted.find(p => p.url.includes('createInvoiceLink'))!
    expect(mint.url).toContain('/botbot-token-for-tests/')
    expect(q.pendingFor(OWNER)).toBeTruthy()
  })
})
