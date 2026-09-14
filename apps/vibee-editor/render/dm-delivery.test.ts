import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE SERVICE IN THE DM: made on the owner's turn, paid by the recipient at
 * the press, refunded if it does not arrive.
 *
 * Two halves. The tool (crm_deliver_photo) must refuse cheaply before the
 * provider is asked and must charge NOTHING itself. execute() must take the
 * money after the press and before the send, send a file rather than text,
 * and give back exactly what it took when the file does not go.
 */
const OWNER = '144022504'
const LEAD = '900000002'
const PIC = 'https://s3.example/pic.png'

function stubSupabase(rows: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => rows }))
  )
}
const leadRow = {
  telegram_id: LEAD,
  bot_name: 'neuro_blogger_bot',
  username: 'pilot_client',
  first_name: 'Ольга',
}
function ownerSession(shape: Record<string, unknown> = {}) {
  return {
    async getEntity(x: string) {
      if (x !== '@pilot_client')
        throw new Error('Could not find the input entity')
      return {
        id: { toString: () => LEAD },
        className: 'User',
        firstName: 'Ольга',
        username: 'pilot_client',
        ...shape,
      }
    },
    async disconnect() {},
  }
}

beforeEach(() => {
  vi.resetModules()
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'k'
  process.env.HIVE_KEEPERS = OWNER
  process.env.ADMIN_IDS = ''
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('telegram')
  vi.doUnmock('./src/agent/telegram-tools')
  vi.doUnmock('./src/agent/billing-shared')
  vi.doUnmock('./src/agent/crm-touches')
})

/** A pool that answers balance reads and records every statement. */
function poolWith(balanceRows: unknown[]) {
  const sqls: string[] = []
  return {
    sqls,
    query: async (sql: string) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      sqls.push(flat)
      return { rows: /SELECT balance/.test(flat) ? balanceRows : [] }
    },
  }
}
const ctxWith = (pool: unknown, surface = 'bot', who = OWNER) =>
  ({ telegramId: who, pool, turn: 'turn-1', surface }) as never

async function deliverer(
  opts: {
    gen?: (args: Record<string, unknown>) => Promise<unknown>
    edit?: (args: Record<string, unknown>) => Promise<unknown>
    /** The lead's photo URL; undefined = no dep wired, '' = no photo. */
    leadPhoto?: string
  } = {}
) {
  const session = ownerSession()
  vi.doMock('./src/agent/telegram-tools', async importOriginal => {
    const actual =
      await importOriginal<typeof import('./src/agent/telegram-tools')>()
    return { ...actual, client: async () => session }
  })
  const { makeCrmDeliverTools } = await import('./src/agent/crm-deliver-tool')
  const q = await import('./src/agent/tg-proposals')
  q.forgetProposals()
  const calls: Array<{
    tool: string
    args: Record<string, unknown>
    who: string
    chargeLater?: boolean
  }> = []
  const fake = (
    name: string,
    run?: (args: Record<string, unknown>) => Promise<unknown>
  ) => ({
    name,
    description: '',
    parameters: {},
    handler: async (
      args: Record<string, unknown>,
      ctx: { telegramId: string; chargeLater?: boolean }
    ) => {
      calls.push({
        tool: name,
        args,
        who: ctx.telegramId,
        chargeLater: ctx.chargeLater,
      })
      return run ? run(args) : { url: PIC }
    },
  })
  const gen = fake('image_generate', opts.gen)
  const edit = fake('image_edit', opts.edit)
  const photos: Array<{ id: string; username?: string | null }> = []
  const [tool] = makeCrmDeliverTools(
    n => (n === 'image_generate' ? gen : n === 'image_edit' ? edit : undefined),
    opts.leadPhoto === undefined
      ? {}
      : {
          leadPhoto: async (_ctx, lead) => {
            photos.push(lead)
            return opts.leadPhoto as string
          },
        }
  )
  return { tool, q, calls, photos }
}

/** The paid, text-to-image mode the older tests below were written for. */
const PAID = { gift: false, from_photo: false } as const

describe('crm_deliver_photo asks the provider last and charges nobody', () => {
  it('a surface without a button is refused BEFORE anything is generated', async () => {
    stubSupabase([leadRow])
    const { tool, q, calls } = await deliverer()
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот', ...PAID },
      ctxWith(poolWith([{ balance: 50 }]), 'mcp')
    )
    expect(r.proposal).toBe(true)
    expect(calls.length, 'the provider was asked with nowhere to confirm').toBe(
      0
    )
    expect(q.pendingCount()).toBe(0)
  })

  it('a person who cannot afford it gets no picture made, and a way forward', async () => {
    stubSupabase([leadRow])
    const { tool, calls } = await deliverer()
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот', ...PAID },
      ctxWith(poolWith([{ balance: 1 }]))
    )
    expect(r.delivered).toBe(false)
    expect(r.причина).toContain('crm_offer') // cyrillic-ok: public API field
    expect(r.price).toBe(2)
    expect(calls.length).toBe(0)
  })

  it('a person with no row yet is treated as holding the first-row grant', async () => {
    // The platform's own policy: the first charge creates the row with 20
    // free tokens (billing-shared ensureRow). Refusing them here would
    // contradict what the charge itself would do a minute later.
    stubSupabase([leadRow])
    const { tool, calls } = await deliverer()
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот', ...PAID },
      ctxWith(poolWith([]))
    )
    expect(r.proposal).toBe(true)
    expect(calls.length).toBe(1)
    expect(r.lead_balance).toBe(20)
  })

  it("the picture is made on the OWNER's turn, with the charge deferred to the recipient", async () => {
    stubSupabase([leadRow])
    const { tool, calls } = await deliverer()
    const pool = poolWith([{ balance: 50 }])
    await tool.handler(
      { chat: '@pilot_client', prompt: 'кот', ...PAID },
      ctxWith(pool)
    )
    expect(calls[0].who).toBe(OWNER)
    expect(String(calls[0].args.prompt)).toMatch(/^кот/)
    // The generator is told the owner's wallet is not the one that pays.
    expect(calls[0].chargeLater).toBe(true)
    expect(
      pool.sqls.some(q => /UPDATE user_tokens/i.test(q)),
      'the tool moved a balance by itself'
    ).toBe(false)
  })

  it('a generation that fails files nothing', async () => {
    stubSupabase([leadRow])
    const { tool, q } = await deliverer({
      gen: async () => ({ сделано: false, причина: 'провайдер лёг' }), // cyrillic-ok: public API field
    })
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот', ...PAID },
      ctxWith(poolWith([{ balance: 50 }]))
    )
    expect(r.delivered).toBe(false)
    expect(r.причина).toContain('провайдер лёг') // cyrillic-ok: public API field
    expect(q.pendingCount()).toBe(0)
  })

  it("the draft carries the photo, the RECIPIENT's charge, and the name", async () => {
    stubSupabase([leadRow])
    const { tool, q } = await deliverer()
    const r: any = await tool.handler(
      {
        chat: '@pilot_client',
        prompt: 'кот',
        caption: 'Ваш котик готов!',
        ...PAID,
      },
      ctxWith(poolWith([{ balance: 50 }]))
    )
    const d = q.pendingFor(OWNER)!
    expect(d.media).toEqual({ kind: 'photo', url: PIC })
    expect(d.charge).toEqual({
      telegramId: LEAD,
      op: 'image_generate',
      tokens: 2,
    })
    expect(d.charge!.telegramId).not.toBe(OWNER)
    expect(d.display).toBe('Ольга (@pilot_client)')
    expect(d.what).toBe('Ваш котик готов!')
    expect(r.preview).toBe(PIC)
    expect(r.price).toBe(2)
    expect(r.media).toEqual({ kind: 'photo', url: PIC })
  })

  it('an owner-side recipient is not charged, and the card does not say otherwise', async () => {
    stubSupabase([leadRow])
    process.env.ADMIN_IDS = LEAD
    const { tool, q } = await deliverer()
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот', ...PAID },
      ctxWith(poolWith([]))
    )
    expect(r.proposal).toBe(true)
    expect(q.pendingFor(OWNER)!.charge).toBeUndefined()
    expect(String(r.lead_balance)).toContain('бесплатно')
  })

  it('a caption is one line with no link in it', async () => {
    stubSupabase([leadRow])
    const { tool, q } = await deliverer()
    await tool.handler(
      {
        chat: '@pilot_client',
        prompt: 'кот',
        caption: 'Готово!\nЖми https://evil.example/x',
        ...PAID,
      },
      ctxWith(poolWith([{ balance: 50 }]))
    )
    const what = String(q.pendingFor(OWNER)!.what)
    expect(what).not.toContain('\n')
    expect(what).not.toContain('http')
  })

  it('somebody without a connected account is refused', async () => {
    stubSupabase([leadRow])
    const { tool, calls } = await deliverer()
    // The pool has no tg_sessions row for '999' (no `session` column at all).
    await expect(
      tool.handler(
        { chat: '@pilot_client', prompt: 'кот', ...PAID },
        ctxWith(poolWith([{ balance: 50 }]), 'bot', '999')
      )
    ).rejects.toThrow('не подключён')
    expect(calls.length).toBe(0)
  })
})

describe("crm_deliver_photo, by default, is the GIFT lead magnet from the person's own photo", () => {
  it("redraws the lead's photo with GPT Image 2.5 at 9:16, on the OWNER's wallet, and charges the recipient nothing", async () => {
    stubSupabase([leadRow])
    const { tool, q, calls, photos } = await deliverer({
      leadPhoto: 'https://s3.example/lead-avatar.jpg',
    })
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'капитан парусника на закате' },
      ctxWith(poolWith([{ balance: 0 }]))
    )
    expect(photos).toEqual([{ id: LEAD, username: '@pilot_client' }])
    expect(calls.length).toBe(1)
    expect(calls[0].tool).toBe('image_edit')
    expect(calls[0].who).toBe(OWNER)
    // The owner pays now: no deferred charge to anybody.
    expect(calls[0].chargeLater).toBeUndefined()
    expect(calls[0].args.image_url).toBe('https://s3.example/lead-avatar.jpg')
    expect(calls[0].args.aspect_ratio).toBe('9:16')
    expect(calls[0].args.model).toBe('gpt-image-2-5-flare-image-to-image')
    // Identity first, the owner's scene after it, framing last.
    const prompt = String(calls[0].args.prompt)
    expect(prompt.indexOf('same person')).toBeGreaterThanOrEqual(0)
    expect(prompt.indexOf('same person')).toBeLessThan(
      prompt.indexOf('капитан парусника')
    )
    expect(prompt).toContain('9:16')
    const d = q.pendingFor(OWNER)!
    expect(d.charge, 'a gift must not carry a charge').toBeUndefined()
    expect(
      d.gift,
      'the card knows it is a gift, so the touch note will too'
    ).toBe(true)
    expect(d.media).toEqual({ kind: 'photo', url: PIC })
    expect(r.gift).toBe(true)
    expect(r.price).toBe(0)
    expect(r.source).toBe('фото человека')
    expect(r.aspect_ratio).toBe('9:16')
  })

  it('a recipient with an empty balance still gets the gift: no affordability gate', async () => {
    stubSupabase([leadRow])
    const { tool, calls } = await deliverer({
      leadPhoto: 'https://s3.example/a.jpg',
    })
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот' },
      ctxWith(poolWith([{ balance: 0 }]))
    )
    expect(r.proposal).toBe(true)
    expect(calls.length).toBe(1)
  })

  it('the default caption names the person, says who made it, asks one question, and has no link or price', async () => {
    stubSupabase([leadRow])
    const { tool, q } = await deliverer({
      leadPhoto: 'https://s3.example/a.jpg',
    })
    await tool.handler(
      { chat: '@pilot_client', prompt: 'кот' },
      ctxWith(poolWith([{ balance: 0 }]))
    )
    const what = String(q.pendingFor(OWNER)!.what)
    expect(what.startsWith('Ольга, ')).toBe(true)
    expect(what).toContain('ИИ-ассистент')
    expect(what).toContain('9:16')
    expect((what.match(/\?/g) ?? []).length).toBe(1)
    expect(what).not.toContain('http')
    expect(what).not.toMatch(/токен|₽|\$/) // cyrillic-ok: UI text pattern
  })

  it('no readable photo: falls back to text-to-image at 1080x1920, says so, still a gift', async () => {
    stubSupabase([leadRow])
    const { tool, q, calls } = await deliverer({ leadPhoto: '' })
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот' },
      ctxWith(poolWith([{ balance: 0 }]))
    )
    expect(calls.length).toBe(1)
    expect(calls[0].tool).toBe('image_generate')
    expect(calls[0].args.width).toBe(1080)
    expect(calls[0].args.height).toBe(1920)
    // Still the owner's wallet, now: a gift is never deferred to the recipient.
    expect(calls[0].chargeLater).toBeUndefined()
    expect(r.source).toBe('по описанию')
    expect(r.gift).toBe(true)
    expect(q.pendingFor(OWNER)!.charge).toBeUndefined()
  })

  it('without a photo door wired at all, the gift is still made from text', async () => {
    stubSupabase([leadRow])
    const { tool, calls } = await deliverer()
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот' },
      ctxWith(poolWith([{ balance: 0 }]))
    )
    expect(calls[0].tool).toBe('image_generate')
    expect(r.source).toBe('по описанию')
  })

  it('an edit that fails files nothing and refunds nobody here (image_edit already did)', async () => {
    stubSupabase([leadRow])
    const { tool, q } = await deliverer({
      leadPhoto: 'https://s3.example/a.jpg',
      edit: async () => ({ done: false, reason: 'Kie не ответил' }),
    })
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот' },
      ctxWith(poolWith([{ balance: 0 }]))
    )
    expect(r.delivered).toBe(false)
    expect(r.причина).toContain('Kie не ответил') // cyrillic-ok: public API field
    expect(q.pendingCount()).toBe(0)
  })
})

/**
 * The sending client, with a file door and a timeline.
 *
 * `sendFile` LIVES ON THE PROTOTYPE AND READS `this`, because that is the
 * real client's contract: GramJS' prototype method is
 * `sendFile(entity, params) { return uploadMethods.sendFile(this, ...) }`,
 * so the client travels as `this`, and a caller that lifts the method off
 * the instance sends it nowhere. The object literal that stood here closed
 * over its own state and could not notice — the production failure of
 * 2026-09-13, every photo press dying with "Cannot read properties of
 * undefined (reading 'getInputEntity')", passed this suite green. A test
 * double must share the one property the code under test can break.
 */
class FakeSendingClient {
  private warmed = false
  constructor(
    private readonly o: {
      failFile?: string
      failNumericUntilDialogs?: boolean
    },
    private readonly timeline: string[],
    private readonly files: Array<Record<string, unknown>>,
    private readonly texts: Array<Record<string, unknown>> = [],
    private readonly invoked: unknown[] = []
  ) {}
  async sendMessage(to: string, opts: Record<string, unknown> = {}) {
    this.timeline.push(`sendMessage:${to}`)
    this.texts.push(opts)
  }
  /*
   * GramJS' raw-request door: the typing signal goes through `invoke`, so
   * the fake carries the same door the real client has. Recorded, not
   * interpreted: what matters is THAT it fired and in what order.
   */
  async invoke(request: unknown) {
    this.invoked.push(request)
    this.timeline.push(
      `invoke:${String((request as { className?: string }).className)}`
    )
  }
  async sendFile(to: string, opts: Record<string, unknown>) {
    // `this` IS the client, exactly as in GramJS. A detached call arrives
    // with `this === undefined` and dies on the first line below — the same
    // first line of the real library (`client.getInputEntity`) that died in
    // production.
    this.timeline.push(`sendFile:${to}`)
    if (this.o.failNumericUntilDialogs && !this.warmed)
      throw new Error('Could not find the input entity for 900000002')
    if (this.o.failFile) throw new Error(this.o.failFile)
    this.files.push(opts)
  }
  async getDialogs() {
    this.timeline.push('getDialogs')
    this.warmed = true
  }
  async disconnect() {
    this.timeline.push('disconnect')
  }
}

function fakeClient(
  o: {
    failFile?: string
    failNumericUntilDialogs?: boolean
    typing?: boolean
  } = {},
  timeline: string[] = []
) {
  const files: Array<Record<string, unknown>> = []
  const texts: Array<Record<string, unknown>> = []
  const invoked: unknown[] = []
  const client = new FakeSendingClient(o, timeline, files, texts, invoked)
  if (!o.typing) {
    /*
     * The default fake is an OLDER client: no raw-request door. The typing
     * signal is cosmetic, so `execute` must skip it AND the pause with it —
     * otherwise every unrelated money test below would wait out TYPING_MS
     * for a signal it never asked about. Tests that care pass `typing: true`
     * and get the door (plus the pause, under fake timers).
     */
    Object.defineProperty(client, 'invoke', { value: undefined })
  }
  return { client, timeline, files, texts, invoked }
}

async function executor(
  c: ReturnType<typeof fakeClient>['client'],
  bill: {
    spend?: (tid: string, op: string) => unknown
    refund?: (...a: unknown[]) => unknown
  } = {},
  timeline: string[] = []
) {
  vi.doMock('./src/agent/telegram-tools', () => ({ client: async () => c }))
  vi.doMock('./src/agent/billing-shared', () => ({
    spendByTid: async (_p: unknown, tid: string, op: string) => {
      timeline.push(`spend:${tid}:${op}`)
      return bill.spend
        ? bill.spend(tid, op)
        : { ok: true, списано: 3, осталось: 47 } // cyrillic-ok: public API field
    },
    refundByTid: async (...a: unknown[]) => {
      timeline.push(`refund:${String(a[1])}:${String(a[5])}`)
      return bill.refund ? bill.refund(...a) : { ok: true, refunded: 2 }
    },
  }))
  const journal: Array<Record<string, unknown>> = []
  vi.doMock('./src/hive/journal', () => ({
    record: async (_p: unknown, e: Record<string, unknown>) => {
      journal.push(e)
      return 'recorded'
    },
  }))
  const touches: Array<Record<string, unknown>> = []
  vi.doMock('./src/agent/crm-touches', () => ({
    recordTouch: async (_p: unknown, t: Record<string, unknown>) => {
      touches.push(t)
      return 'recorded'
    },
  }))
  const { execute, TYPING_MS } = await import('./src/agent/tg-proposals')
  return { execute, timeline, touches, journal, TYPING_MS }
}
const pool = { query: async () => ({ rows: [] }) }
const draft = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  telegramId: OWNER,
  action: 'send' as const,
  target: LEAD,
  what: 'вот фото',
  createdAt: 0,
  media: { kind: 'photo' as const, url: PIC },
  charge: { telegramId: LEAD, op: 'image_generate', tokens: 2 },
  ...over,
})

describe('execute: the money after the press, the file, the refund', () => {
  it('the photo goes out as a FILE with the approved caption and no parse mode', async () => {
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const r = await execute(draft(), { telegramId: OWNER, pool })
    expect(r.done, (r as { why?: string }).why).toBe(true)
    expect(f.files).toEqual([
      { file: PIC, caption: 'вот фото', parseMode: false },
    ])
    expect(f.timeline.filter(t => t.startsWith('sendMessage'))).toEqual([])
  })

  it('sendFile keeps its client: a photo press must not die on getInputEntity', async () => {
    /**
     * THE REGRESSION, BY NAME. 2026-09-13, production: every photo card
     * answered "Not sent: Cannot read properties of undefined
     * (reading 'getInputEntity')" because `sendFileWithAddressBook` lifted
     * `c.sendFile` off the instance, and GramJS' prototype method passes the
     * client along as `this`. The fake above now carries that same contract,
     * so a detached call fails HERE instead of in a stranger's Telegram.
     */
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const r = await execute(draft(), { telegramId: OWNER, pool })
    expect(r.done, (r as { why?: string }).why).toBe(true)
    expect(f.files).toHaveLength(1)
  })

  it('the recipient is charged BEFORE the send, once, for the op on the draft', async () => {
    // One shared timeline for the client and the billing: the order is
    // the property, and two separate lists could not show it.
    const events: string[] = []
    const f = fakeClient({}, events)
    const { execute } = await executor(f.client, {}, events)
    await execute(draft(), { telegramId: OWNER, pool })
    expect(events).toEqual([
      `spend:${LEAD}:image_generate`,
      `sendFile:${LEAD}`,
      'disconnect',
    ])
  })

  it('no balance: nothing is sent, nothing is refunded, and the owner is told what to do', async () => {
    const f = fakeClient()
    const { execute, timeline } = await executor(f.client, {
      spend: () => ({
        ok: false,
        причина: 'не хватает токенов: нужно 2, есть 0', // cyrillic-ok: public API field
      }),
    })
    const r = await execute(draft(), { telegramId: OWNER, pool })
    expect(r.done).toBe(false)
    expect((r as { why: string }).why).toContain('crm_offer')
    expect(f.files).toEqual([])
    expect(timeline.filter(t => t.startsWith('refund'))).toEqual([])
  })

  it('a send that fails after the charge refunds EXACTLY the receipt', async () => {
    const f = fakeClient({ failFile: 'USER_IS_BLOCKED' })
    const { execute, timeline } = await executor(f.client)
    const r = await execute(draft(), { telegramId: OWNER, pool })
    expect(r.done).toBe(false)
    expect(timeline).toEqual([
      `spend:${LEAD}:image_generate`,
      `refund:${LEAD}:3`,
    ])
    expect((r as { why: string }).why).toContain('возвращены')
  })

  it('the charge is journaled as money leaving: a negative amount, like every other tokens-spent', async () => {
    const f = fakeClient()
    const { execute, journal } = await executor(f.client)
    await execute(draft(), { telegramId: OWNER, pool })
    const spent = journal.find(e => e.kind === 'tokens-spent')!
    expect(spent, 'no tokens-spent line').toBeTruthy()
    expect(spent.amount).toBe(-3)
    expect(spent.who).toBe(LEAD)
  })

  it('a refund that fails is said out loud, not swallowed', async () => {
    const f = fakeClient({ failFile: 'FLOOD_WAIT_30' })
    const { execute } = await executor(f.client, {
      refund: () => ({ ok: false, why: 'db down' }),
    })
    const r = await execute(draft(), { telegramId: OWNER, pool })
    expect(r.done).toBe(false)
    expect((r as { why: string }).why).toContain('НЕ ПРОШЁЛ')
  })

  it('a text draft without a charge touches no balance', async () => {
    const f = fakeClient()
    const { execute, timeline } = await executor(f.client)
    const r = await execute(
      draft({ media: undefined, charge: undefined, what: 'привет' }),
      { telegramId: OWNER, pool }
    )
    expect(r.done).toBe(true)
    expect(timeline).toEqual([])
    expect(f.timeline.filter(t => t.startsWith('sendMessage'))).toEqual([
      `sendMessage:${LEAD}`,
    ])
  })

  it('a bare id gets the address book fetched, then the file goes', async () => {
    const f = fakeClient({ failNumericUntilDialogs: true })
    const { execute } = await executor(f.client)
    const r = await execute(draft(), { telegramId: OWNER, pool })
    expect(r.done, (r as { why?: string }).why).toBe(true)
    expect(f.timeline.slice(0, 3)).toEqual([
      `sendFile:${LEAD}`,
      'getDialogs',
      `sendFile:${LEAD}`,
    ])
  })

  it('a delivered, paid service is recorded as a PURCHASE, a message as a touch', async () => {
    const f = fakeClient()
    const { execute, touches } = await executor(f.client)
    await execute(draft({ lead: LEAD }), { telegramId: OWNER, pool })
    await execute(
      draft({ id: 'm2', lead: LEAD, media: undefined, charge: undefined }),
      {
        telegramId: OWNER,
        pool,
      }
    )
    expect(touches.map(t => t.kind)).toEqual(['bought', 'written'])
    expect(String(touches[0].note)).toContain('3')
  })

  it('without a database a charged draft is not sent: nobody pays, nothing leaves', async () => {
    const f = fakeClient()
    const { execute, timeline } = await executor(f.client)
    const r = await execute(draft(), { telegramId: OWNER })
    expect(r.done).toBe(false)
    expect(f.files).toEqual([])
    expect(timeline).toEqual([])
  })

  it('the client is hung up on every path', async () => {
    const ok = fakeClient()
    const bad = fakeClient({ failFile: 'PEER_ID_INVALID' })
    await (
      await executor(ok.client)
    ).execute(draft(), { telegramId: OWNER, pool })
    vi.resetModules()
    await (
      await executor(bad.client)
    ).execute(draft(), { telegramId: OWNER, pool })
    expect(ok.timeline.at(-1)).toBe('disconnect')
    expect(bad.timeline.at(-1)).toBe('disconnect')
  })
})

describe('the real generator honours chargeLater', () => {
  /*
   * Everything above fakes the generator. This runs the real image_generate
   * against a recording pool, with no house exemption, and looks only at
   * whether the owner's wallet moved before the provider was even asked.
   * The provider call itself is stubbed to fail fast.
   */
  const recordingPool = () => {
    const sqls: string[] = []
    return {
      sqls,
      query: async (sql: string) => {
        sqls.push(sql.replace(/\s+/g, ' ').trim())
        return { rows: [{ balance: 50, n: 0, count: 0 }] }
      },
    }
  }
  const prevHouse = process.env.HOUSE_TELEGRAM_IDS
  beforeEach(() => {
    process.env.HOUSE_TELEGRAM_IDS = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
        text: async () => 'down',
      }))
    )
  })
  afterEach(() => {
    process.env.HOUSE_TELEGRAM_IDS = prevHouse
  })

  it('with chargeLater the owner wallet is not touched; without it, it is', async () => {
    const { TOOLS } = await import('./src/agent/tools')
    const gen = TOOLS.find(t => t.name === 'image_generate')!
    const deferred = recordingPool()
    await gen.handler({ prompt: 'кот' }, {
      telegramId: OWNER,
      pool: deferred,
      chargeLater: true,
    } as never)
    // A charge is `balance - price`; the failure path may still refund a zero.
    expect(
      deferred.sqls.filter(q => /balance = balance - /i.test(q)),
      'the owner paid for a deferred charge'
    ).toEqual([])
    const paid = recordingPool()
    await gen.handler({ prompt: 'кот' }, {
      telegramId: OWNER,
      pool: paid,
    } as never)
    expect(
      paid.sqls.some(q => /balance = balance - /i.test(q)),
      'the plain path stopped charging'
    ).toBe(true)
  })
})

/**
 * THE MEDIA KINDS A DRAFT CAN CARRY.
 *
 * Photo was the only kind, and photo travels as a URL Telegram fetches
 * itself. Voice, video and video notes CANNOT: the URL path in GramJS
 * ignores voiceNote/videoNote/attributes (uploads.js `_fileToMedia`), so a
 * round voice note or a streaming video means downloading the bytes here
 * and uploading them as a CustomFile with the attributes the card promised.
 *
 * These tests stub fetch (the download) and read what the fake client's
 * BOUND sendFile received: the attributes are the contract the card shows
 * (~N seconds, a video, a document named X), so they must reach the wire.
 */
describe('execute: media kinds reach sendFile shaped for their kind', () => {
  const bytes = (n: number) => Buffer.alloc(n, 7)

  const stubDownload = (buf: Buffer, status = 200) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(buf), { status }))
    )
  }

  const asParams = (o: Record<string, unknown>) =>
    o as {
      file: {
        name?: string
        size?: number
        buffer?: Buffer
      } & (string | unknown[])
      caption?: unknown
      voiceNote?: boolean
      videoNote?: boolean
      supportsStreaming?: boolean
      forceDocument?: boolean
      attributes?: Array<{ voice?: boolean; duration?: number }>
    }

  it('a voice draft uploads bytes as a round voice note with the promised duration', async () => {
    stubDownload(bytes(60_000))
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const r = await execute(
      draft({
        what: undefined,
        charge: undefined,
        media: { kind: 'voice', url: 'https://s3.example/v.mp3', duration: 17 },
      }),
      { telegramId: OWNER, pool }
    )
    expect(r.done, (r as { why?: string }).why).toBe(true)
    const o = asParams(f.files[0])
    expect(o.voiceNote).toBe(true)
    // The attribute is what makes it ROUND and makes the duration honest:
    // GramJS cannot measure duration itself (_getMetadata is a stub).
    expect(o.attributes?.[0]).toMatchObject({ voice: true, duration: 17 })
    expect(o.file).toMatchObject({ name: 'voice.mp3', size: 60_000 })
  })

  it('without a duration the seconds are estimated from the bytes, never zero', async () => {
    // 60_000 bytes / 6000 ≈ 10s of opus-quality voice; a zero duration would
    // show as a broken waveform on the recipient's phone.
    stubDownload(bytes(60_000))
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const r = await execute(
      draft({
        what: undefined,
        charge: undefined,
        media: { kind: 'voice', url: 'https://s3.example/v.mp3' },
      }),
      { telegramId: OWNER, pool }
    )
    expect(r.done).toBe(true)
    expect(asParams(f.files[0]).attributes?.[0]).toMatchObject({
      voice: true,
      duration: 10,
    })
  })

  it('a video uploads with streaming support; a video note as a round note', async () => {
    stubDownload(bytes(2048))
    const f = fakeClient()
    const { execute } = await executor(f.client)
    await execute(
      draft({
        what: undefined,
        charge: undefined,
        media: { kind: 'video', url: 'https://s3.example/v.mp4' },
      }),
      { telegramId: OWNER, pool }
    )
    await execute(
      draft({
        id: 'm2',
        what: undefined,
        charge: undefined,
        media: { kind: 'video_note', url: 'https://s3.example/vn.mp4' },
      }),
      { telegramId: OWNER, pool }
    )
    expect(asParams(f.files[0]).supportsStreaming).toBe(true)
    expect(asParams(f.files[0]).voiceNote).toBeUndefined()
    expect(asParams(f.files[1]).videoNote).toBe(true)
  })

  it('a document uploads under its promised name, as a document not a photo', async () => {
    stubDownload(bytes(128))
    const f = fakeClient()
    const { execute } = await executor(f.client)
    await execute(
      draft({
        what: undefined,
        charge: undefined,
        media: {
          kind: 'document',
          url: 'https://s3.example/report.pdf',
          fileName: 'Смета.pdf',
        },
      }),
      { telegramId: OWNER, pool }
    )
    const o = asParams(f.files[0])
    expect(o.forceDocument).toBe(true)
    expect(o.file).toMatchObject({ name: 'Смета.pdf', size: 128 })
  })

  it('an album sends every URL, each caption beside its own photo', async () => {
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const r = await execute(
      draft({
        what: undefined,
        charge: undefined,
        media: {
          kind: 'album',
          urls: [
            'https://s3.example/1.png',
            'https://s3.example/2.png',
            'https://s3.example/3.png',
          ],
          captions: ['первый', 'второй'],
        },
      }),
      { telegramId: OWNER, pool }
    )
    expect(r.done, (r as { why?: string }).why).toBe(true)
    expect(f.files).toEqual([
      {
        file: [
          'https://s3.example/1.png',
          'https://s3.example/2.png',
          'https://s3.example/3.png',
        ],
        caption: ['первый', 'второй'],
        parseMode: false,
      },
    ])
  })

  it('a media url that is not https is refused before anything is fetched', async () => {
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const r = await execute(
      draft({
        what: undefined,
        charge: undefined,
        media: { kind: 'voice', url: 'http://insecure/v.mp3' },
      }),
      { telegramId: OWNER, pool }
    )
    expect(r.done).toBe(false)
    expect(f.files).toEqual([])
  })

  it('a download that fails is said in plain words, not a stack trace', async () => {
    stubDownload(bytes(1), 503)
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const r = await execute(
      draft({
        what: undefined,
        charge: undefined,
        media: { kind: 'voice', url: 'https://s3.example/v.mp3', duration: 5 },
      }),
      { telegramId: OWNER, pool }
    )
    expect(r.done).toBe(false)
    expect((r as { why: string }).why).toContain('скачать')
    expect(f.files).toEqual([])
  })

  /*
   * CODES THAT WILL START ARRIVING (PR3 adds kick, pin, react, vote, join,
   * delete), translated NOW: every executor funnels its failure through the
   * same plain-words door, and "CHAT_ADMIN_REQUIRED" said raw is an answer
   * only the debugger loves. The send executor is used as the vehicle —
   * the door is shared, so the words are proven on any road through it.
   */
  const plainWordCases: Array<[string, string]> = [
    ['CHAT_ADMIN_REQUIRED', 'права администратора'],
    ['USER_NOT_PARTICIPANT', 'нет в чате'],
    ['USER_ALREADY_PARTICIPANT', 'уже в чате'],
    ['INVITE_HASH_EXPIRED', 'устарела'],
    ['INVITE_HASH_INVALID', 'недействительна'],
    ['MESSAGE_ID_INVALID', 'не найдено'],
    ['POLL_VOTE_INVALID', 'голосовании'],
    ['REACTION_INVALID', 'реакц'],
    ['CHAT_NOT_MODIFIED', 'не изменилось'],
    ['MESSAGE_NOT_MODIFIED', 'не изменилось'],
    ['USER_ID_INVALID', 'такого пользователя'],
  ]
  for (const [code, words] of plainWordCases) {
    it(`${code} reaches the person as Russian, not as a code`, async () => {
      const f = fakeClient({ failFile: code })
      const { execute } = await executor(f.client, {}, f.timeline)
      const r = await execute(draft(), { telegramId: OWNER, pool })
      expect(r.done).toBe(false)
      expect((r as { why: string }).why).toContain(words)
      // the charge came back before the words were chosen
      expect(f.timeline).toContain(`refund:${LEAD}:3`)
    })
  }
})

/**
 * TYPING AND SCHEDULE (owner decisions, 2026-09-14): "печатает…" shows
 * automatically before a send, and a send may be named a time instead of now.
 *
 * The two are one block of behaviour because they exclude each other: a
 * scheduled send fires later, with nobody watching, so signalling "typing"
 * at press time would be a lie -- the person is not typing at HH:MM, the
 * clock is. Everything here is cosmetic until the send itself, which is why
 * typing can fail without killing the send, and why its absence (an old
 * client, a fake) must not change the wire behaviour at all.
 */
describe('execute: typing before the act, schedule instead of now', () => {
  it('a send signals typing once, between the charge and the send', async () => {
    /*
     * A local client, not the shared fake: this test needs TIME STAMPS, and
     * under fake timers Date.now() only moves when the clock does. The
     * prologue (module loads, the charge) crosses real event-loop ticks, so
     * mid-flight assertions race it; asserting afterwards, on one shared
     * timeline plus stamps, is deterministic however long the prologue took.
     *
     * `telegram` is mocked so the SetTyping request is cheap to build and
     * inspect; the real package is not what is under test here.
     */
    class SetTyping {
      className = 'messages.SetTyping'
      constructor(public readonly payload: Record<string, unknown>) {}
    }
    class TypingAction {
      className = 'SendMessageTypingAction'
    }
    vi.doMock('telegram', () => ({
      Api: { messages: { SetTyping }, SendMessageTypingAction: TypingAction },
    }))
    class TypingClient {
      readonly marks: Array<[string, number]> = []
      lastRequest: unknown = null
      constructor(private readonly tl: string[]) {}
      private stamp(what: string) {
        this.tl.push(what)
        this.marks.push([what, Date.now()])
      }
      async getDialogs() {
        this.stamp('getDialogs')
      }
      async invoke(request: unknown) {
        this.lastRequest = request
        this.stamp(
          `invoke:${String((request as { className?: string }).className)}`
        )
      }
      async sendMessage() {}
      async sendFile(to: string) {
        this.stamp(`sendFile:${to}`)
      }
      async disconnect() {
        this.stamp('disconnect')
      }
    }
    vi.useFakeTimers()
    try {
      const tl: string[] = []
      const client = new TypingClient(tl)
      const { execute, TYPING_MS } = await executor(client as never, {}, tl)
      const started = execute(draft(), { telegramId: OWNER, pool })
      // The prologue crosses real ticks; the async timer advance yields to
      // them, so the whole chain settles within this one call.
      await vi.advanceTimersByTimeAsync(TYPING_MS + 5)
      const r = await started
      expect(r.done, (r as { why?: string }).why).toBe(true)
      const at = (what: string) => tl.findIndex(t => t.startsWith(what))
      expect(at('spend:')).toBeGreaterThanOrEqual(0)
      expect(at('invoke:')).toBeGreaterThan(at('spend:'))
      expect(at('sendFile:')).toBeGreaterThan(at('invoke:'))
      // The pause is real: the send's stamp sits a full TYPING_MS after the
      // signal's, so the recipient sees the typing indicator first.
      const invokedAt = client.marks.find(([w]) => w.startsWith('invoke:'))![1]
      const sentAt = client.marks.find(([w]) => w.startsWith('sendFile:'))![1]
      expect(sentAt - invokedAt).toBeGreaterThanOrEqual(TYPING_MS)
      // The signal itself: exactly one request of the typing kind -- not a
      // record-audio or upload kind -- and its peer is the draft's target.
      expect(tl.filter(t => t.startsWith('invoke:'))).toEqual([
        'invoke:messages.SetTyping',
      ])
      const asked = client.lastRequest as SetTyping
      expect(asked.className).toBe('messages.SetTyping')
      expect(asked.payload.peer).toBe(LEAD)
      expect((asked.payload.action as TypingAction).className).toBe(
        'SendMessageTypingAction'
      )
    } finally {
      vi.useRealTimers()
      vi.doUnmock('telegram')
    }
  })

  it('a scheduled file send names the time and skips typing', async () => {
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const when = Date.now() + 60 * 60_000
    const r = await execute(draft({ scheduleAt: when }), {
      telegramId: OWNER,
      pool,
    })
    expect(r.done, (r as { why?: string }).why).toBe(true)
    expect(f.invoked, 'никто не печатает в запланированное время').toEqual([])
    expect((f.files[0]?.scheduleDate as Date).getTime()).toBe(when)
  })

  it('a scheduled text goes through sendMessage with schedule', async () => {
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const when = Date.now() + 5 * 60_000
    const r = await execute(
      draft({ media: undefined, what: 'позже', scheduleAt: when }),
      { telegramId: OWNER, pool }
    )
    expect(r.done, (r as { why?: string }).why).toBe(true)
    expect(f.texts).toEqual([
      { message: 'позже', parseMode: false, schedule: new Date(when) },
    ])
  })

  it('a restored draft whose time has passed refuses before the charge', async () => {
    const f = fakeClient()
    const { execute } = await executor(f.client)
    const r = await execute(draft({ scheduleAt: Date.now() - 60_000 }), {
      telegramId: OWNER,
      pool,
    })
    expect(r.done).toBe(false)
    expect((r as { why: string }).why).toContain('расписан')
    expect(f.timeline.filter(t => t.startsWith('spend:'))).toEqual([])
    expect(f.files).toEqual([])
  })
})
