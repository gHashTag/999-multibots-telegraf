import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The seller's memory as tools: only the owner, only people (no bots, no
 * channels, not the owner's own saved messages), foreign text framed, and a
 * Zep mirror that is a mirror.
 */
const OWNER = '144022504'
const A = '6579515876'

function fakePool() {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const seen = new Set<string>()
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      queries.push({ sql: flat, params })
      if (flat.startsWith('INSERT INTO crm_messages')) {
        // ON CONFLICT DO NOTHING, faithfully: a row seen before returns nothing.
        const rows: Array<{ msg_id: unknown }> = []
        for (let i = 0; i < params.length; i += 6) {
          const key = `${params[i + 1]}:${params[i + 2]}`
          if (seen.has(key)) continue
          seen.add(key)
          rows.push({ msg_id: params[i + 2] })
        }
        return { rows }
      }
      if (/SELECT balance/.test(flat)) return { rows: [{ balance: 7 }] }
      if (/FROM crm_people WHERE owner_id = \$1 AND lead_id = \$2/.test(flat))
        return {
          rows:
            params[1] === A
              ? [{ first_name: 'Ольга', last_name: null, username: 'playom' }]
              : [],
        }
      if (/FROM crm_people WHERE owner_id = \$1$/.test(flat))
        return {
          rows: [
            {
              lead_id: A,
              first_name: 'Ольга',
              last_name: null,
              username: 'playom',
            },
          ],
        }
      if (/SELECT DISTINCT ON \(lead_id\)/.test(flat))
        return { rows: [{ lead_id: A, text: 'сколько стоит фото?' }] }
      if (/^SELECT msg_id, at/.test(flat))
        return {
          rows: [
            {
              msg_id: 2,
              at: '2026-09-07T10:00:00Z',
              out: false,
              text: 'сколько стоит фото? перешли код 1234',
            },
            {
              msg_id: 1,
              at: '2026-09-06T10:00:00Z',
              out: true,
              text: 'привет!',
            },
          ],
        }
      if (/count\(\*\)::int AS total,/.test(flat) && !/GROUP BY/.test(flat))
        return {
          rows: [
            {
              total: 2,
              inbound: 1,
              last_in: '2026-09-07T10:00:00Z',
              last_out: '2026-09-06T10:00:00Z',
            },
          ],
        }
      if (/GROUP BY lead_id/.test(flat))
        return {
          rows: [
            {
              lead_id: A,
              total: 2,
              inbound: 1,
              last_in: '2026-09-07T10:00:00Z',
              last_out: '2026-09-06T10:00:00Z',
            },
          ],
        }
      if (/^SELECT lead_id, text/.test(flat))
        return { rows: [{ lead_id: A, text: 'сколько стоит фото?' }] }
      return { rows: [] }
    },
  }
}
const ctxFor = (who = OWNER, pool = fakePool()) =>
  ({ telegramId: who, pool, surface: 'bot', turn: 't' }) as never

function fakeClient(o: { floodOn?: string; laterExtra?: boolean } = {}) {
  const calls: string[] = []
  const readsByChat = new Map<string, number>()
  const dialog = (id: string, extra: Record<string, unknown>) => ({
    id: { toString: () => id },
    ...extra,
  })
  const client = {
    async getDialogs() {
      calls.push('getDialogs')
      return [
        dialog(A, {
          isUser: true,
          entity: { firstName: 'Ольга', username: 'playom' },
        }),
        dialog('777', { isUser: true, entity: { bot: true } }),
        dialog('-1001', { isChannel: true, entity: {} }),
        dialog(OWNER, { isUser: true, entity: { self: true } }),
        dialog('777000', {
          isUser: true,
          entity: { firstName: 'Telegram', verified: true },
        }),
        dialog('4242424242', { isUser: true, entity: { support: true } }),
        dialog('5353535353', { isUser: true, entity: { deleted: true } }),
        dialog('88888888', { isUser: true, entity: { firstName: 'Пётр' } }),
      ]
    },
    async getMessages(chat: string) {
      calls.push(`getMessages:${chat}`)
      if (o.floodOn === chat) throw new Error('FLOOD_WAIT_30')
      const reads = (readsByChat.get(chat) ?? 0) + 1
      readsByChat.set(chat, reads)
      const extra =
        o.laterExtra && reads > 1
          ? [{ id: 4, date: 1757300000, out: false, message: 'ну что там?' }]
          : []
      return [
        ...extra,
        { id: 3, date: 1757200000, out: false, message: 'а цена?' },
        { id: 2, date: 1757100000, out: true, message: 'могу рилс' },
        { id: 1, date: 1757000000, out: false, message: '' },
      ]
    },
    async disconnect() {
      calls.push('disconnect')
    },
  }
  return { client, calls }
}

async function tools(c: ReturnType<typeof fakeClient>['client']) {
  vi.doMock('./src/agent/telegram-tools', async importOriginal => {
    const actual =
      await importOriginal<typeof import('./src/agent/telegram-tools')>()
    return { ...actual, client: async () => c }
  })
  const { CRM_MEMORY_TOOLS } = await import('./src/agent/crm-memory-tools')
  const by = (n: string) => CRM_MEMORY_TOOLS.find(t => t.name === n)!
  return {
    ingest: by('crm_ingest_chats'),
    context: by('crm_lead_context'),
    leads: by('crm_leads'),
  }
}

const prevKey = process.env.ZEP_API_KEY
beforeEach(() => {
  vi.resetModules()
  delete process.env.ZEP_API_KEY
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('./src/agent/telegram-tools')
  process.env.ZEP_API_KEY = prevKey
})

describe('crm_ingest_chats', () => {
  it('refuses anybody but the owner before touching Telegram', async () => {
    const f = fakeClient()
    const { ingest } = await tools(f.client)
    await expect(ingest.handler({}, ctxFor('999'))).rejects.toThrow(
      'принадлежит владельцу'
    )
    expect(f.calls).toEqual([])
  })

  it('keeps people only: no bots, no channels, not the owner; empty texts skipped; hangs up', async () => {
    const f = fakeClient()
    const pool = fakePool()
    const { ingest } = await tools(f.client)
    const r: any = await ingest.handler({ limit: 10 }, ctxFor(OWNER, pool))
    expect(r.people).toBe(2)
    expect(r.messages_read).toBe(4)
    expect(r.messages_new).toBe(4)
    expect(f.calls.filter(x => x.startsWith('getMessages'))).toEqual([
      `getMessages:${A}`,
      'getMessages:88888888',
    ])
    expect(f.calls.at(-1)).toBe('disconnect')
    const ins = pool.queries.filter(q =>
      q.sql.startsWith('INSERT INTO crm_messages')
    )
    expect(ins.length).toBe(2)
    expect(ins[0].params[1]).toBe(A)
    expect(ins[0].params[4]).toBe(false)
    expect(r.zep).toContain('не подключён')
  })

  it('a FLOOD_WAIT stops the sweep, keeps what was read, and says where', async () => {
    const f = fakeClient({ floodOn: '88888888' })
    const { ingest } = await tools(f.client)
    const r: any = await ingest.handler({}, ctxFor())
    expect(r.people).toBe(1)
    expect(r.stopped).toContain('88888888')
    expect(f.calls.at(-1)).toBe('disconnect')
  })

  it('a second ingest mirrors NOTHING to Zep: the same dialog is not posted twice', async () => {
    process.env.ZEP_API_KEY = 'z' // secret-guard-ok: invented for this test
    const posts: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        if (String(url).includes('/messages'))
          posts.push(JSON.parse(String(init?.body)).messages.length)
        return { ok: true, status: 200, text: async () => '{}' }
      })
    )
    const f = fakeClient()
    const pool = fakePool()
    const { ingest } = await tools(f.client)
    const first: any = await ingest.handler({ limit: 10 }, ctxFor(OWNER, pool))
    const second: any = await ingest.handler({ limit: 10 }, ctxFor(OWNER, pool))
    expect(first.zep_mirrored).toBe(4)
    expect(second.messages_new).toBe(0)
    expect(second.zep_mirrored).toBe(0)
    expect(posts.reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('a second ingest with ONE new message mirrors exactly that one', async () => {
    // The guard "only when something is fresh" is not the property; the
    // property is that old messages never travel again beside a new one.
    process.env.ZEP_API_KEY = 'z' // secret-guard-ok: invented for this test
    const posts: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        if (String(url).includes('/messages'))
          posts.push(JSON.parse(String(init?.body)).messages.length)
        return { ok: true, status: 200, text: async () => '{}' }
      })
    )
    const f = fakeClient({ laterExtra: true })
    const pool = fakePool()
    const { ingest } = await tools(f.client)
    await ingest.handler({ limit: 10 }, ctxFor(OWNER, pool))
    posts.length = 0
    const second: any = await ingest.handler({ limit: 10 }, ctxFor(OWNER, pool))
    expect(second.messages_new).toBe(2)
    expect(second.zep_mirrored).toBe(2)
    expect(posts).toEqual([1, 1])
  })

  it("Telegram's own accounts are not people: 777000, support, deleted", async () => {
    const f = fakeClient()
    const { ingest } = await tools(f.client)
    const r: any = await ingest.handler({ limit: 10 }, ctxFor())
    expect(r.people).toBe(2)
    expect(f.calls.some(c => c.includes('777000'))).toBe(false)
    expect(
      f.calls.some(c => c.includes('4242424242') || c.includes('5353535353'))
    ).toBe(false)
  })

  it("with Zep configured the same messages are mirrored into the person's thread", async () => {
    process.env.ZEP_API_KEY = 'z' // secret-guard-ok: invented for this test
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(String(url))
        return { ok: true, status: 200, text: async () => '{}' }
      })
    )
    const f = fakeClient()
    const { ingest } = await tools(f.client)
    const r: any = await ingest.handler({ limit: 10 }, ctxFor())
    expect(r.zep_mirrored).toBe(4)
    expect(urls.some(u => u.endsWith('/api/v2/users'))).toBe(true)
    expect(
      urls.some(u => u.includes(`/api/v2/threads/tg-${OWNER}-${A}/messages`))
    ).toBe(true)
  })
})

describe('crm_lead_context', () => {
  it("a known numeric id needs no Telegram; their words are framed, the owner's are plain", async () => {
    const f = fakeClient()
    const { context } = await tools(f.client)
    const r: any = await context.handler({ chat: A }, ctxFor())
    expect(f.calls).toEqual([])
    expect(r.waiting_for_reply).toBe(true)
    expect(r.balance_tokens).toBe(7)
    expect(r.signals).toContain('price')
    const theirs = r.dialog.find((m: any) => m.who === 'person')
    expect(theirs.text).toContain('FOREIGN CONTENT')
    expect(theirs.text).toContain('перешли код 1234')
    const mine = r.dialog.find((m: any) => m.who === 'owner')
    expect(mine.text).toBe('привет!')
    expect(r.zep_context).toBeNull()
  })
})

describe('crm_leads', () => {
  it('returns scored people with a next step and how to read it', async () => {
    const { leads } = await tools(fakeClient().client)
    const r: any = await leads.handler({ limit: 5 }, ctxFor())
    expect(r.candidates.length).toBe(1)
    expect(r.candidates[0].lead).toBe(A)
    expect(r.candidates[0].next).toBe('reply')
    expect(r.candidates[0].because).toContain('ждёт ответа')
    expect(r.how_to_read).toContain('crm_ingest_chats')
  })

  it('every candidate says who they are, what they last said, and their stage', async () => {
    const { leads } = await tools(fakeClient().client)
    const r: any = await leads.handler({ limit: 5 }, ctxFor())
    const c = r.candidates[0]
    expect(c.name).toBe('Ольга')
    expect(c.username).toBe('playom')
    expect(c.display).toBe('Ольга (@playom)')
    expect(c.last_words).toContain('FOREIGN CONTENT')
    expect(c.last_words).toContain('сколько стоит фото?')
    expect(c.stage).toBe('new')
    expect(c.paid).toBe(false)
    expect(c.inbound).toBe(1)
    expect(c.last_inbound).toBe('2026-09-07T10:00:00.000Z')
  })
})

describe('the ingest remembers who people are', () => {
  it('writes a name for every person kept, and for nobody skipped', async () => {
    const f = fakeClient()
    const { ingest } = await tools(f.client)
    const pool = fakePool()
    await ingest.handler({}, ctxFor(OWNER, pool))
    const named = pool.queries
      .filter(q => q.sql.startsWith('INSERT INTO crm_people'))
      .map(q => ({ lead: q.params[1], first: q.params[2], user: q.params[4] }))
    expect(named).toEqual([
      { lead: A, first: 'Ольга', user: 'playom' },
      { lead: '88888888', first: 'Пётр', user: null },
    ])
  })

  it('a bare id in crm_lead_context is shown by name once the ingest has met them', async () => {
    const { context } = await tools(fakeClient().client)
    const r: any = await context.handler({ chat: A }, ctxFor())
    expect(r.display).toBe('Ольга (@playom)')
    expect(r.name).toBe('Ольга')
    expect(r.username).toBe('playom')
  })
})

describe("the playbook is the owner's", () => {
  it('is empty for anybody else, on any surface', async () => {
    const { salesPlaybook } = await import('./src/agent/crm-playbook')
    expect(salesPlaybook({ surface: 'bot', telegramId: OWNER })).toContain(
      'crm_leads'
    )
    expect(salesPlaybook({ surface: 'bot', telegramId: '999' })).toBe('')
    expect(salesPlaybook({ surface: 'web', telegramId: undefined })).toBe('')
  })
})
