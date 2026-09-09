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
    args: Record<string, unknown>
    who: string
    chargeLater?: boolean
  }> = []
  const gen = {
    name: 'image_generate',
    description: '',
    parameters: {},
    handler: async (
      args: Record<string, unknown>,
      ctx: { telegramId: string; chargeLater?: boolean }
    ) => {
      calls.push({ args, who: ctx.telegramId, chargeLater: ctx.chargeLater })
      return opts.gen ? opts.gen(args) : { url: PIC }
    },
  }
  const [tool] = makeCrmDeliverTools(n =>
    n === 'image_generate' ? gen : undefined
  )
  return { tool, q, calls }
}

describe('crm_deliver_photo asks the provider last and charges nobody', () => {
  it('a surface without a button is refused BEFORE anything is generated', async () => {
    stubSupabase([leadRow])
    const { tool, q, calls } = await deliverer()
    const r: any = await tool.handler(
      { chat: '@pilot_client', prompt: 'кот' },
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
      { chat: '@pilot_client', prompt: 'кот' },
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
      { chat: '@pilot_client', prompt: 'кот' },
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
    await tool.handler({ chat: '@pilot_client', prompt: 'кот' }, ctxWith(pool))
    expect(calls[0].who).toBe(OWNER)
    expect(calls[0].args.prompt).toBe('кот')
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
      { chat: '@pilot_client', prompt: 'кот' },
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
      { chat: '@pilot_client', prompt: 'кот', caption: 'Ваш котик готов!' },
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
      { chat: '@pilot_client', prompt: 'кот' },
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
      },
      ctxWith(poolWith([{ balance: 50 }]))
    )
    const what = String(q.pendingFor(OWNER)!.what)
    expect(what).not.toContain('\n')
    expect(what).not.toContain('http')
  })

  it('somebody other than the owner is refused', async () => {
    stubSupabase([leadRow])
    const { tool, calls } = await deliverer()
    await expect(
      tool.handler(
        { chat: '@pilot_client', prompt: 'кот' },
        ctxWith(poolWith([{ balance: 50 }]), 'bot', '999')
      )
    ).rejects.toThrow('принадлежит владельцу')
    expect(calls.length).toBe(0)
  })
})

/** The sending client, with a file door and a timeline. */
function fakeClient(
  o: { failFile?: string; failNumericUntilDialogs?: boolean } = {},
  timeline: string[] = []
) {
  const files: Array<Record<string, unknown>> = []
  let warmed = false
  const client = {
    async sendMessage(to: string) {
      timeline.push(`sendMessage:${to}`)
    },
    async sendFile(to: string, opts: Record<string, unknown>) {
      timeline.push(`sendFile:${to}`)
      if (o.failNumericUntilDialogs && !warmed)
        throw new Error('Could not find the input entity for 900000002')
      if (o.failFile) throw new Error(o.failFile)
      files.push(opts)
    },
    async getDialogs() {
      timeline.push('getDialogs')
      warmed = true
    },
    async disconnect() {
      timeline.push('disconnect')
    },
  }
  return { client, timeline, files }
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
  const { execute } = await import('./src/agent/tg-proposals')
  return { execute, timeline, touches, journal }
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
