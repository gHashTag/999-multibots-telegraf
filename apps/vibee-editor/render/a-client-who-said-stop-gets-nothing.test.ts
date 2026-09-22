import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A PERSON WHO SWITCHED THE OWNER'S ASSISTANT OFF GETS NOTHING FROM IT.
 *
 * The bot hears the request and writes `assistant_opt_outs`
 * (src/services/assistantOptOut.ts, tested there). Here, the render's half:
 * every door a draft passes on its way to that person asks the same row
 * through `assistantMayReach` --
 *
 *  - `propose()`, which every outward draft passes (tg_send and its media
 *    siblings, tg_forward, crm_offer, crm_deliver_photo);
 *  - `execute()`, the owner's press, so a card drawn before the stop does not
 *    leave after it;
 *  - crm_offer refuses BEFORE an invoice is minted;
 *  - the owner's own typed words are the one exception, and only as plain
 *    text, and never inside an unattended sweep.
 *
 * Ids are invented (9000000xx); no name here is a person's.
 */

const OWNER = '900000091'
const LEAD = '900000092'
const OTHER = '900000093'

/**
 * A pool that answers the opt-out table from a list of `owner:client` keys
 * and every other statement with no rows. `down` makes only the opt-out
 * statements fail, which is the case the gate has to decide.
 */
function optOutPool(
  off: string[] = [],
  o: { down?: boolean; people?: Record<string, string> } = {}
) {
  const keys = new Set(off)
  const state = { down: o.down === true }
  const seen: string[] = []
  return {
    state,
    seen,
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ').trim()
      seen.push(q)
      if (/^SELECT lead_id FROM crm_people /.test(q)) {
        const lead = o.people?.[String(params[1]).toLowerCase()]
        return { rows: lead ? [{ lead_id: lead }] : ([] as any[]) }
      }
      if (!/assistant_opt_outs/.test(q)) return { rows: [] as any[] }
      if (state.down) throw new Error('connect ECONNREFUSED (test pool down)')
      if (/^CREATE TABLE IF NOT EXISTS assistant_opt_outs /.test(q))
        return { rows: [] as any[] }
      if (
        q ===
        'SELECT client_id, since FROM assistant_opt_outs WHERE owner_id = $1 AND active'
      )
        return {
          rows: [...keys]
            .filter(k => k.startsWith(`${String(params[0])}:`))
            .map(k => ({
              client_id: k.split(':')[1],
              since: '2026-09-22T10:00:00.000Z',
            })),
        }
      throw new Error(`test pool: statement not understood: ${q}`)
    },
  }
}

const stopped = () => optOutPool([`${OWNER}:${LEAD}`])

const ownerCtx = (pool: unknown, extra: Record<string, unknown> = {}) =>
  ({
    telegramId: OWNER,
    pool,
    turn: 'turn-1',
    surface: 'bot',
    ...extra,
  }) as never

beforeEach(() => {
  vi.resetModules()
  process.env.OWNER_TELEGRAM_ID = OWNER
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('./src/agent/telegram-tools')
  delete process.env.OWNER_TELEGRAM_ID
})

describe('the one question: may the assistant reach this person?', () => {
  it('control: nobody switched it off, so yes', async () => {
    const { assistantMayReach } = await import('./src/agent/assistant-opt-out')
    expect(await assistantMayReach(ownerCtx(optOutPool()), LEAD)).toEqual({
      ok: true,
    })
  })

  it('the person switched it off: no draft', async () => {
    const { assistantMayReach } = await import('./src/agent/assistant-opt-out')
    const r = await assistantMayReach(ownerCtx(stopped()), LEAD, {
      text: 'hello',
      plainText: true,
    })
    expect(r.ok).toBe(false)
  })

  it("another owner's client is not this owner's business", async () => {
    const { assistantMayReach } = await import('./src/agent/assistant-opt-out')
    const pool = optOutPool([`${OTHER}:${LEAD}`])
    expect((await assistantMayReach(ownerCtx(pool), LEAD)).ok).toBe(true)
  })

  it("the owner's own typed words may still be prepared, and are marked", async () => {
    const { assistantMayReach } = await import('./src/agent/assistant-opt-out')
    const r = await assistantMayReach(
      ownerCtx(stopped(), { ownerSaid: 'send him: "See you tomorrow at ten"' }),
      LEAD,
      { text: 'See you tomorrow at ten', plainText: true }
    )
    expect(r).toEqual({ ok: true, ownerWords: true })
  })

  it('words the model rephrased are the model s words', async () => {
    const { assistantMayReach } = await import('./src/agent/assistant-opt-out')
    const r = await assistantMayReach(
      ownerCtx(stopped(), { ownerSaid: 'tell him we meet tomorrow' }),
      LEAD,
      { text: 'See you tomorrow at ten', plainText: true }
    )
    expect(r.ok).toBe(false)
  })

  it('an unattended sweep never counts as the owner speaking', async () => {
    const { assistantMayReach } = await import('./src/agent/assistant-opt-out')
    const r = await assistantMayReach(
      ownerCtx(stopped(), {
        sellerSweep: true,
        ownerSaid: 'See you tomorrow at ten',
      }),
      LEAD,
      { text: 'See you tomorrow at ten', plainText: true }
    )
    expect(r.ok).toBe(false)
  })

  it('the press: a card of the model s words is refused, the owner s words pass', async () => {
    const { assistantMayReach } = await import('./src/agent/assistant-opt-out')
    const ctx = ownerCtx(stopped())
    expect((await assistantMayReach(ctx, LEAD, { pressed: true })).ok).toBe(
      false
    )
    expect(
      (await assistantMayReach(ctx, LEAD, { pressed: true, ownerWords: true }))
        .ok
    ).toBe(true)
  })

  it('an unreadable table stops the sweep, not the owner at the keyboard', async () => {
    const { assistantMayReach } = await import('./src/agent/assistant-opt-out')
    const down = optOutPool([], { down: true })
    expect(
      (await assistantMayReach(ownerCtx(down, { sellerSweep: true }), LEAD)).ok
    ).toBe(false)
    expect((await assistantMayReach(ownerCtx(down), LEAD)).ok).toBe(true)
  })
})

describe('propose(): the door every outward draft passes', () => {
  async function tools() {
    const { propose } = await import('./src/agent/telegram-tools')
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()
    return { propose, q }
  }

  it('control: a draft to somebody who did not stop is queued', async () => {
    const { propose, q } = await tools()
    const r = (await propose(
      'send',
      LEAD,
      'hello',
      'why',
      ownerCtx(optOutPool())
    )) as { proposal?: boolean; ownerWords?: boolean }
    expect(r.proposal).toBe(true)
    expect(r.ownerWords).toBeUndefined()
    expect(q.pendingCount()).toBe(1)
  })

  it('a send to a person who switched the assistant off is refused and nothing is queued', async () => {
    const { propose, q } = await tools()
    await expect(
      propose('send', LEAD, 'hello', 'why', ownerCtx(stopped()))
    ).rejects.toThrow('выключить автоответы')
    expect(q.pendingCount()).toBe(0)
  })

  it('addressed by @username, the lead it carries decides', async () => {
    const { propose, q } = await tools()
    await expect(
      propose('send', '@placeholder', 'hello', 'why', ownerCtx(stopped()), LEAD)
    ).rejects.toThrow('выключить автоответы')
    expect(q.pendingCount()).toBe(0)
  })

  it('a forward to that person is refused too', async () => {
    const { propose, q } = await tools()
    await expect(
      propose('forward', LEAD, 'messages 1 from x', 'why', ownerCtx(stopped()))
    ).rejects.toThrow('выключить автоответы')
    expect(q.pendingCount()).toBe(0)
  })

  it('a forward addressed by @username is recognised through the base', async () => {
    const { propose, q } = await tools()
    const pool = optOutPool([`${OWNER}:${LEAD}`], {
      people: { placeholder_client: LEAD },
    })
    await expect(
      propose(
        'forward',
        '@placeholder_client',
        'messages 1 from x',
        'why',
        ownerCtx(pool)
      )
    ).rejects.toThrow('выключить автоответы')
    expect(q.pendingCount()).toBe(0)
  })

  it("the owner's own words become a card marked as his", async () => {
    const { propose, q } = await tools()
    const r = (await propose(
      'send',
      LEAD,
      'See you tomorrow at ten',
      'why',
      ownerCtx(stopped(), { ownerSaid: 'send him "See you tomorrow at ten"' })
    )) as { proposal?: boolean; ownerWords?: boolean }
    expect(r.proposal).toBe(true)
    expect(r.ownerWords).toBe(true)
    expect(q.pendingFor(OWNER)?.ownerWords).toBe(true)
  })

  it("the owner's words with a picture attached are not only his words", async () => {
    const { propose, q } = await tools()
    await expect(
      propose(
        'send',
        LEAD,
        'See you tomorrow at ten',
        'why',
        ownerCtx(stopped(), { ownerSaid: 'See you tomorrow at ten' }),
        LEAD,
        undefined,
        { media: { kind: 'photo', url: 'https://example.com/a.jpg' } } as never
      )
    ).rejects.toThrow('выключить автоответы')
    expect(q.pendingCount()).toBe(0)
  })

  it('a sweep with an unreadable table prepares nothing', async () => {
    const { propose, q } = await tools()
    await expect(
      propose(
        'send',
        LEAD,
        'hello',
        'why',
        ownerCtx(optOutPool([], { down: true }), { sellerSweep: true })
      )
    ).rejects.toThrow('база не ответила')
    expect(q.pendingCount()).toBe(0)
  })
})

describe('execute(): the press asks again', () => {
  function withClient() {
    const opened: string[] = []
    vi.doMock('./src/agent/telegram-tools', async importOriginal => {
      const actual =
        await importOriginal<typeof import('./src/agent/telegram-tools')>()
      return {
        ...actual,
        client: async () => {
          opened.push('client')
          throw new Error('no session in this test')
        },
      }
    })
    return opened
  }

  const card = (extra: Record<string, unknown> = {}) =>
    ({
      id: 'card-1',
      telegramId: OWNER,
      action: 'send',
      target: LEAD,
      what: 'A pitch drawn before the stop',
      lead: LEAD,
      createdAt: Date.now(),
      ...extra,
    }) as never

  it('a card drawn before the stop does not leave after it; no session is opened', async () => {
    const opened = withClient()
    const { execute } = await import('./src/agent/tg-proposals')
    const r = await execute(card(), { telegramId: OWNER, pool: stopped() })
    expect(r.done).toBe(false)
    expect((r as { why: string }).why).toContain('выключить автоответы')
    expect(opened, 'the owner s account was opened for a refused card').toEqual(
      []
    )
  })

  it('control: a card for somebody who did not stop goes on to the session', async () => {
    const opened = withClient()
    const { execute } = await import('./src/agent/tg-proposals')
    await execute(card(), { telegramId: OWNER, pool: optOutPool() })
    expect(opened).toEqual(['client'])
  })

  it("a card of the owner's own words goes on to the session", async () => {
    const opened = withClient()
    const { execute } = await import('./src/agent/tg-proposals')
    const r = await execute(card({ ownerWords: true }), {
      telegramId: OWNER,
      pool: stopped(),
    })
    expect(opened).toEqual(['client'])
    expect((r as { why?: string }).why ?? '').not.toContain(
      'выключить автоответы'
    )
  })
})

describe('crm_offer: no invoice is minted for a pitch that can never be shown', () => {
  it('refuses before createInvoiceLink', async () => {
    process.env.TOKENS_PAYMENT_BOT_TOKEN = 'bot-token-for-tests' // secret-guard-ok: invented for this test, not a real token
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'k'
    process.env.HIVE_KEEPERS = OWNER
    const posted: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        posted.push(String(url))
        if (String(url).includes('api.telegram.org'))
          return {
            status: 200,
            json: async () => ({ ok: true, result: 'https://t.me/$inv-x' }),
          }
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              telegram_id: LEAD,
              bot_name: 'neuro_blogger_bot',
              username: 'placeholder_client',
              first_name: 'Placeholder',
            },
          ],
        }
      })
    )
    vi.doMock('./src/agent/telegram-tools', async importOriginal => {
      const actual =
        await importOriginal<typeof import('./src/agent/telegram-tools')>()
      return {
        ...actual,
        client: async () => ({
          async getEntity() {
            return { id: { toString: () => LEAD }, className: 'User' }
          },
          async disconnect() {},
        }),
      }
    })
    const { CRM_OFFER_TOOLS } = await import('./src/agent/crm-offer-tool')
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()

    await expect(
      CRM_OFFER_TOOLS[0].handler(
        { chat: LEAD, tokens: 50 },
        ownerCtx(stopped())
      )
    ).rejects.toThrow('выключить автоответы')
    expect(posted.filter(u => u.includes('createInvoiceLink'))).toEqual([])
    expect(q.pendingCount()).toBe(0)

    delete process.env.TOKENS_PAYMENT_BOT_TOKEN
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY
    delete process.env.HIVE_KEEPERS
  })
})
