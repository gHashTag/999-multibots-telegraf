import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The seller's memory as tools: only the owner, only people (no bots, no
 * channels, not the owner's own saved messages), foreign text framed, and a
 * Zep mirror that is a mirror.
 */
const OWNER = '144022504'
const A = '900000002'

/**
 * DATES THE TEST OWNS, NOT DATES THE CALENDAR OWNS.
 *
 * The fixture below said `2026-09-07` and the assertions read "asked a price
 * TODAY". That was true on the day it was written and false a week later: the
 * hot segment is "asked within seven days", the clock is the real one, and on
 * 2026-09-16 the same fixture is nine days old. The test began failing on its
 * own, and nobody saw it -- the render suite does not run in this repository's
 * push gate, so main has been red at least since the window closed.
 *
 * A fixture that ages is not a test of behaviour, it is a countdown. These
 * are offsets from now, so "two days ago" stays two days ago.
 */
const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 86400_000).toISOString()

/**
 * Computed ONCE and shared by the fixture and the assertions. Calling
 * daysAgo() again at assertion time would differ by the milliseconds the
 * test itself took, which is the other way a clock-shaped test rots.
 */
const LAST_IN = daysAgo(2)
const LAST_OUT = daysAgo(3)

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
              ? [
                  {
                    first_name: 'Ольга',
                    last_name: null,
                    username: 'pilot_client',
                  },
                ]
              : [],
        }
      if (/FROM crm_people WHERE owner_id = \$1$/.test(flat))
        return {
          rows: [
            {
              lead_id: A,
              first_name: 'Ольга',
              last_name: null,
              username: 'pilot_client',
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
              // Same reason as LAST_IN: a message dated by the calendar falls
              // out of every window the code measures, on its own schedule.
              at: LAST_IN,
              out: false,
              text: 'сколько стоит фото? перешли код 1234',
            },
            {
              msg_id: 1,
              at: LAST_OUT,
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
              last_in: LAST_IN,
              last_out: LAST_OUT,
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
              last_in: LAST_IN,
              last_out: LAST_OUT,
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
          entity: { firstName: 'Ольга', username: 'pilot_client' },
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
  it('refuses a person without a connected account before touching Telegram', async () => {
    const f = fakeClient()
    const { ingest } = await tools(f.client)
    await expect(ingest.handler({}, ctxFor('999'))).rejects.toThrow(
      'не подключён'
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

  it('with `lead` only that person is read: resolved directly, no dialog list, not a bot', async () => {
    const f = fakeClient()
    const client = {
      ...f.client,
      async getEntity(id: string | number) {
        f.calls.push(`getEntity:${id}`)
        return {
          className: 'User',
          id: { toString: () => String(id) },
          firstName: 'Ольга',
          username: 'pilot_client',
        }
      },
    }
    const { ingest } = await tools(client)
    const r: any = await ingest.handler({ lead: A }, ctxFor())
    expect(r.people).toBe(1)
    expect(r.dialogs_seen).toBe(1)
    expect(f.calls).toContain(`getEntity:${Number(A)}`)
    expect(f.calls).not.toContain('getDialogs')
    expect(f.calls.filter(x => x.startsWith('getMessages'))).toEqual([
      `getMessages:${A}`,
    ])
    expect(f.calls.at(-1)).toBe('disconnect')
  })

  it('with `lead` pointing at a channel the ingest refuses: not a person', async () => {
    const f = fakeClient()
    const { ingest } = await tools({
      ...f.client,
      async getEntity() {
        return { className: 'Channel', id: { toString: () => '1' } }
      },
    } as never)
    await expect(
      ingest.handler({ lead: '@somechannel' }, ctxFor())
    ).rejects.toThrow('not a person')
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

  it('a caption-less voice note is no longer a hole: it becomes a row, is downloaded to OUR shelf and indexed', async () => {
    // The media message has NO text. Before, `.filter(m => m.message)` dropped
    // it; now it is a `[voice note]` row plus a user_media row whose URL is
    // the shelf's, never Telegram's.
    const put = vi.fn(async (_b: Buffer, name: string) => ({
      key: `assets/1-${name}`,
      url: `https://vibee-render-production.up.railway.app/s3/assets/1-${name}`,
    }))
    vi.doMock('./src/lib/s3-put', () => ({ s3PutBytes: put }))
    // No provider must be reached from a test: the background describe sees
    // a 500 and writes null.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => '' }))
    )
    const f = fakeClient()
    const voice = {
      id: 5,
      date: 1757250000,
      out: false,
      message: '',
      media: {
        className: 'MessageMediaDocument',
        document: {
          mimeType: 'audio/ogg',
          size: 4096,
          attributes: [{ className: 'DocumentAttributeAudio', voice: true }],
        },
      },
    }
    const baseGetMessages = f.client.getMessages.bind(f.client)
    f.client.getMessages = async (chat: string) => {
      const rows = await baseGetMessages(chat)
      return chat === A ? [voice, ...rows] : rows
    }
    const downloaded: number[] = []
    ;(f.client as any).downloadMedia = async (m: { id: number }) => {
      downloaded.push(m.id)
      return Buffer.from('OggS voice bytes')
    }
    const pool = fakePool()
    const media: unknown[][] = []
    const inner = pool.query
    pool.query = async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      if (flat.startsWith('INSERT INTO user_media')) {
        media.push(params)
        return { rows: [{ id: media.length, fresh: true }] }
      }
      return inner(sql, params)
    }
    const { ingest } = await tools(f.client)
    const r: any = await ingest.handler({ limit: 10 }, ctxFor(OWNER, pool))
    expect(r.messages_read).toBe(5)
    expect(r.media_saved).toBe(1)
    expect(downloaded).toEqual([5])
    expect(put).toHaveBeenCalledWith(
      expect.any(Buffer),
      'voice-5.ogg',
      'audio/ogg'
    )
    // The url column (index 10) is ours.
    expect(String(media[0][10])).toContain('/s3/assets/1-voice-5.ogg')
    expect(String(media[0][10])).not.toContain('api.telegram.org')
    expect(media[0][2]).toBe('ingest')
    // And the correspondence row exists with the label, not a hole.
    const ins = pool.queries.filter(q =>
      q.sql.startsWith('INSERT INTO crm_messages')
    )
    expect(ins[0].params).toContain('[голосовое]')
  })

  it('a file whose message is already on the shelf is not downloaded again on the next pass', async () => {
    const put = vi.fn(async (_b: Buffer, name: string) => ({
      key: `assets/2-${name}`,
      url: `https://vibee-render-production.up.railway.app/s3/assets/2-${name}`,
    }))
    vi.doMock('./src/lib/s3-put', () => ({ s3PutBytes: put }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => '' }))
    )
    const f = fakeClient()
    const photo = {
      id: 9,
      date: 1757250000,
      out: false,
      message: '',
      media: {
        className: 'MessageMediaPhoto',
        photo: { sizes: [{ size: 100 }] },
      },
    }
    const baseGetMessages = f.client.getMessages.bind(f.client)
    f.client.getMessages = async (chat: string) => {
      const rows = await baseGetMessages(chat)
      return chat === A ? [photo, ...rows] : rows
    }
    const downloaded: number[] = []
    ;(f.client as any).downloadMedia = async (m: { id: number }) => {
      downloaded.push(m.id)
      return Buffer.from('JFIF bytes')
    }
    const pool = fakePool()
    const inner = pool.query
    pool.query = async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      // The earlier pass already stored message 9 of this lead.
      if (flat.startsWith('SELECT msg_id FROM user_media'))
        return { rows: params[1] === A ? [{ msg_id: 9 }] : [] }
      if (flat.startsWith('INSERT INTO user_media'))
        return { rows: [{ id: 1, fresh: true }] }
      return inner(sql, params)
    }
    const { ingest } = await tools(f.client)
    const r: any = await ingest.handler({ limit: 10 }, ctxFor(OWNER, pool))
    expect(downloaded).toEqual([])
    expect(put).not.toHaveBeenCalled()
    expect(r.media_saved).toBe(0)
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
    expect(r.how_to_read).toContain('talk')
    expect(r.how_to_read).toContain('Не предлагай оплату первым')
  })

  it('every candidate says who they are, what they last said, and their stage', async () => {
    const { leads } = await tools(fakeClient().client)
    const r: any = await leads.handler({ limit: 5 }, ctxFor())
    const c = r.candidates[0]
    expect(c.name).toBe('Ольга')
    expect(c.username).toBe('pilot_client')
    expect(c.display).toBe('Ольга (@pilot_client)')
    expect(c.last_words).toContain('FOREIGN CONTENT')
    expect(c.last_words).toContain('сколько стоит фото?')
    expect(c.stage).toBe('new')
    expect(c.paid).toBe(false)
    expect(c.inbound).toBe(1)
    expect(c.last_inbound).toBe(LAST_IN)
  })
})

describe('crm_leads by segment', () => {
  it('every row names its segment and how long we have been silent; a bad segment is refused', async () => {
    const { leads } = await tools(fakeClient().client)
    const r: any = await leads.handler({ limit: 5 }, ctxFor())
    // A asked a price today: hot outranks waiting by precedence.
    expect(r.candidates[0].segment).toBe('hot')
    expect(r.candidates[0].days_since_our_last_word).toBeGreaterThanOrEqual(0)
    expect(r.how_to_read).toContain('segment=warm')
    await expect(leads.handler({ segment: 'quiet' }, ctxFor())).rejects.toThrow(
      'segment:'
    )
    await expect(leads.handler({ segment: 'nope' }, ctxFor())).rejects.toThrow(
      'segment:'
    )
    const none: any = await leads.handler({ segment: 'warm' }, ctxFor())
    expect(none.candidates).toEqual([])
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
      { lead: A, first: 'Ольга', user: 'pilot_client' },
      { lead: '88888888', first: 'Пётр', user: null },
    ])
  })

  it('a bare id in crm_lead_context is shown by name once the ingest has met them', async () => {
    const { context } = await tools(fakeClient().client)
    const r: any = await context.handler({ chat: A }, ctxFor())
    expect(r.display).toBe('Ольга (@pilot_client)')
    expect(r.name).toBe('Ольга')
    expect(r.username).toBe('pilot_client')
  })
})

describe("the playbook is every seller's", () => {
  it('is shown to a seller and empty for anybody else, on any surface', async () => {
    const { salesPlaybook } = await import('./src/agent/crm-playbook')
    expect(
      salesPlaybook({ surface: 'bot', telegramId: OWNER, seller: true })
    ).toContain('crm_leads')
    // @playom: not the owner, but a connected account -- a seller.
    expect(
      salesPlaybook({ surface: 'bot', telegramId: '435572800', seller: true })
    ).toContain('crm_leads')
    // The id alone decides nothing any more: the caller computes `seller`.
    expect(salesPlaybook({ surface: 'bot', telegramId: OWNER })).toBe('')
    expect(salesPlaybook({ surface: 'bot', telegramId: '999' })).toBe('')
    expect(salesPlaybook({ surface: 'web', telegramId: undefined })).toBe('')
  })
})
