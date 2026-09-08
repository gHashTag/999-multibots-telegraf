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
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      queries.push({ sql: flat, params })
      if (flat.startsWith('INSERT INTO crm_messages'))
        return {
          rows: Array.from({ length: params.length / 6 }, (_, i) => ({
            msg_id: i,
          })),
        }
      if (/SELECT balance/.test(flat)) return { rows: [{ balance: 7 }] }
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

function fakeClient(o: { floodOn?: string } = {}) {
  const calls: string[] = []
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
        dialog('88888888', { isUser: true, entity: { firstName: 'Пётр' } }),
      ]
    },
    async getMessages(chat: string) {
      calls.push(`getMessages:${chat}`)
      if (o.floodOn === chat) throw new Error('FLOOD_WAIT_30')
      return [
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
})
