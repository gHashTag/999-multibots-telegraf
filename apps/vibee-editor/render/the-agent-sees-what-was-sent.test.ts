import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TELEGRAM_TOOLS } from './src/agent/telegram-tools'
import {
  useFetchEdgesForTests,
  FETCH_MAX_FILES,
  LIVE_LOOKS,
} from './src/agent/tg-fetch-media'
import { USER_MEDIA_TABLE_SQL } from './src/agent/media-library'
import { salesPlaybook } from './src/agent/crm-playbook'

/**
 * THE AGENT SEES WHAT WAS SENT.
 *
 * Production, 2026-09-21: a client sent the owner photos for her content plan
 * -- two bursts, seven and eight messages -- and through tg_history every one
 * of them was an empty fenced block. Nothing could download a file from a
 * chat read over the owner's session. Owner, 2026-09-22: why does the agent
 * not read the correspondence and the files.
 *
 * Two doubles, both of which REFUSE what they do not know:
 *
 *   - a GramJS client that throws on any method it does not define, so a
 *     tool reaching for an API the real client may not have fails here;
 *   - a pool that PARSES the SQL it is given -- columns checked against the
 *     real schema, WHERE predicates evaluated from the query text -- and
 *     throws on any statement it does not recognise. A double that answered
 *     by its own copy of the rule would let a dropped `owner_id = $1` through.
 *
 * Every id is invented (9000000xx); no person, no message, no file is real.
 */

const SELLER_A = '900000011'
const SELLER_B = '900000012'
const CLIENT = '900000021'
const NO_SESSION = '900000031'
/** A day ago: older than the reply detector's two hours, so it stays quiet. */
const T0 = Math.floor(Date.now() / 1000) - 86_400

/* ── the GramJS double ─────────────────────────────────────────────────── */

interface Script {
  sessions: string[]
  timeline: string[]
  messages: Array<Record<string, unknown>>
  downloads: number[]
  getMessagesCalls: Array<Record<string, unknown>>
  failGetMessages: string | null
  failDownload: Set<number>
}
const freshScript = (): Script => ({
  sessions: [],
  timeline: [],
  messages: [],
  downloads: [],
  getMessagesCalls: [],
  failGetMessages: null,
  failDownload: new Set(),
})
let script = freshScript()

vi.doMock('telegram/sessions', () => ({
  StringSession: class {
    constructor(readonly value?: string) {}
  },
}))

vi.doMock('telegram', async importOriginal => {
  const actual = await importOriginal<typeof import('telegram')>()
  const KNOWN = new Set([
    'connect',
    'checkAuthorization',
    'getMessages',
    'getDialogs',
    'downloadMedia',
    'destroy',
    'disconnect',
  ])
  class FakeTelegramClient {
    constructor(session: { value?: string }) {
      script.sessions.push(String(session?.value ?? ''))
      return new Proxy(this, {
        get(target, prop, receiver) {
          if (typeof prop === 'symbol' || prop === 'then')
            return Reflect.get(target, prop, receiver)
          if (!KNOWN.has(prop))
            throw new Error(`the GramJS double has no "${prop}"`)
          return Reflect.get(target, prop, receiver)
        },
      })
    }
    async connect() {
      script.timeline.push('connect')
    }
    async checkAuthorization() {
      return true
    }
    async getDialogs() {
      script.timeline.push('getDialogs')
      return []
    }
    async getMessages(_chat: unknown, o: Record<string, unknown>) {
      script.getMessagesCalls.push({ ...o })
      if (script.failGetMessages) throw new Error(script.failGetMessages)
      if (Array.isArray(o.ids))
        return (o.ids as number[]).map(id =>
          script.messages.find(m => m.id === id)
        )
      const newestFirst = [...script.messages].sort(
        (a, b) => Number(b.id) - Number(a.id)
      )
      return newestFirst.slice(0, Number(o.limit ?? 20))
    }
    async downloadMedia(m: { id: number }) {
      script.downloads.push(m.id)
      if (script.failDownload.has(m.id))
        throw new Error('FILE_REFERENCE_EXPIRED')
      return Buffer.from(`bytes of ${m.id}`)
    }
    async destroy() {
      script.timeline.push('destroy')
    }
    async disconnect() {
      script.timeline.push('disconnect')
    }
  }
  return {
    ...actual,
    TelegramClient: FakeTelegramClient,
  } as unknown as typeof actual
})

/* ── message fixtures, shaped like GramJS ──────────────────────────────── */

const peer = (id: string) => ({
  className: 'PeerUser',
  userId: { toString: () => id },
})
const photo = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  date: T0 + id,
  out: false,
  message: '',
  peerId: peer(CLIENT),
  media: {
    className: 'MessageMediaPhoto',
    photo: { sizes: [{ size: 1200 }, { sizes: [900, 64_000] }] },
  },
  ...extra,
})
const voice = (id: number) => ({
  id,
  date: T0 + id,
  out: false,
  message: '',
  peerId: peer(CLIENT),
  media: {
    className: 'MessageMediaDocument',
    voice: true,
    document: {
      mimeType: 'audio/ogg',
      size: 18_000,
      attributes: [
        { className: 'DocumentAttributeAudio', voice: true, duration: 12 },
      ],
    },
  },
})
const pdf = (id: number, fileName: string) => ({
  id,
  date: T0 + id,
  out: false,
  message: '',
  peerId: peer(CLIENT),
  media: {
    className: 'MessageMediaDocument',
    document: {
      mimeType: 'application/pdf',
      size: 1_258_291,
      attributes: [{ className: 'DocumentAttributeFilename', fileName }],
    },
  },
})
const text = (id: number, words: string, out = false) => ({
  id,
  date: T0 + id,
  out,
  message: words,
  peerId: peer(CLIENT),
})
/** GramJS gives groupedId as a big integer; only toString is read. */
const album = (id: string) => ({ toString: () => id })

/* ── the pool double: parses what it is given ──────────────────────────── */

const USER_MEDIA_COLUMNS = new Set(
  [
    ...USER_MEDIA_TABLE_SQL.matchAll(
      /^\s*"?(\w+)"?\s+(?:bigserial|text|bigint|timestamptz|boolean)/gm
    ),
  ].map(m => m[1])
)
const CRM_MESSAGES_COLUMNS = new Set([
  'owner_id',
  'lead_id',
  'msg_id',
  'at',
  'out',
  'text',
])

type Row = Record<string, any>

function predicate(
  p: string,
  params: unknown[],
  columns: Set<string>
): (row: Row) => boolean {
  const col = (name: string) => {
    if (!columns.has(name)) throw new Error(`pool double: no column ${name}`)
    return name
  }
  let m: RegExpExecArray | null
  if ((m = /^"?(\w+)"? = \$(\d+)$/.exec(p))) {
    const c = col(m[1])
    const v = params[Number(m[2]) - 1]
    return row => String(row[c]) === String(v)
  }
  if ((m = /^"?(\w+)"? = '([^']*)'$/.exec(p))) {
    const c = col(m[1])
    const v = m[2]
    return row => String(row[c]) === v
  }
  if ((m = /^"?(\w+)"? = ANY\(\$(\d+)(?:::\w+\[\])?\)$/.exec(p))) {
    const c = col(m[1])
    const list = (params[Number(m[2]) - 1] as unknown[]).map(String)
    return row => list.includes(String(row[c]))
  }
  if ((m = /^position\(\$(\d+) in text\) = 0$/.exec(p))) {
    const v = String(params[Number(m[1]) - 1])
    return row => !String(row.text).includes(v)
  }
  throw new Error(`pool double: unknown predicate "${p}"`)
}

function whereOf(
  clause: string,
  params: unknown[],
  columns: Set<string>
): (row: Row) => boolean {
  const tests = clause
    .split(/\s+AND\s+/i)
    .map(p => predicate(p.trim(), params, columns))
  return row => tests.every(t => t(row))
}

function poolDouble(sessions: Record<string, string>) {
  const media: Row[] = []
  const crm: Row[] = []
  const statements: string[] = []
  let nextId = 1
  return {
    media,
    crm,
    statements,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, ' ').trim()
      statements.push(flat)
      if (/^CREATE (TABLE|INDEX)/.test(flat)) return { rows: [] }
      if (flat === 'SELECT session FROM tg_sessions WHERE telegram_id = $1') {
        const s = sessions[String(params[0])]
        return { rows: s ? [{ session: s }] : [] }
      }
      let m: RegExpExecArray | null
      if ((m = /^INSERT INTO user_media \(([^)]+)\) VALUES/.exec(flat))) {
        const cols = m[1].split(',').map(c => c.trim().replace(/"/g, ''))
        for (const c of cols)
          if (!USER_MEDIA_COLUMNS.has(c))
            throw new Error(`pool double: user_media has no column ${c}`)
        if (!/ON CONFLICT \(owner_id, lead_id, url\)/.test(flat))
          throw new Error('pool double: user_media upsert without its key')
        const row: Row = Object.fromEntries(cols.map((c, i) => [c, params[i]]))
        const same = media.find(
          r =>
            r.owner_id === row.owner_id &&
            r.lead_id === row.lead_id &&
            r.url === row.url
        )
        if (same) return { rows: [{ id: same.id, fresh: false }] }
        row.id = nextId++
        row.transcript = null
        row.transcribed_at = null
        media.push(row)
        return { rows: [{ id: row.id, fresh: true }] }
      }
      if (
        (m = /^SELECT (.+) FROM user_media WHERE (.+?)( ORDER BY .+)?$/.exec(
          flat
        ))
      ) {
        const cols = m[1].split(',').map(c => c.trim().replace(/"/g, ''))
        for (const c of cols)
          if (!USER_MEDIA_COLUMNS.has(c))
            throw new Error(`pool double: user_media has no column ${c}`)
        const keep = whereOf(m[2], params, USER_MEDIA_COLUMNS)
        return { rows: media.filter(keep).sort((a, b) => a.id - b.id) }
      }
      if (
        flat ===
        'UPDATE user_media SET transcript = $2, transcribed_at = now() WHERE id = $1'
      ) {
        const row = media.find(r => r.id === params[0])
        if (row) {
          row.transcript = params[1]
          row.transcribed_at = new Date()
        }
        return { rows: [], rowCount: row ? 1 : 0 }
      }
      if ((m = /^INSERT INTO crm_messages \(([^)]+)\) VALUES/.exec(flat))) {
        const cols = m[1].split(',').map(c => c.trim().replace(/"/g, ''))
        for (const c of cols)
          if (!CRM_MESSAGES_COLUMNS.has(c))
            throw new Error(`pool double: crm_messages has no column ${c}`)
        const rows: Row[] = []
        for (let i = 0; i < params.length; i += cols.length) {
          const row: Row = Object.fromEntries(
            cols.map((c, j) => [c, params[i + j]])
          )
          const dup = crm.some(
            r =>
              r.owner_id === row.owner_id &&
              r.lead_id === row.lead_id &&
              Number(r.msg_id) === Number(row.msg_id)
          )
          if (dup) continue
          crm.push(row)
          rows.push({ msg_id: row.msg_id })
        }
        return { rows }
      }
      if (
        (m =
          /^UPDATE crm_messages SET text = left\(text \|\| E'\\n' \|\| \$4, 4000\) WHERE (.+)$/.exec(
            flat
          ))
      ) {
        const keep = whereOf(m[1], params, CRM_MESSAGES_COLUMNS)
        const hit = crm.filter(keep)
        for (const r of hit) r.text = `${r.text}\n${params[3]}`
        return { rows: [], rowCount: hit.length }
      }
      throw new Error(`pool double: unknown statement: ${flat.slice(0, 90)}`)
    },
  }
}

/* ── wiring ────────────────────────────────────────────────────────────── */

const looked: string[] = []
const heard: string[] = []
const queued: number[] = []
const puts: Array<{ name: string; mime: string }> = []

const prev = {
  id: process.env.TELEGRAM_API_ID,
  hash: process.env.TELEGRAM_API_HASH,
  session: process.env.TELEGRAM_SESSION_STRING,
}
beforeEach(() => {
  script = freshScript()
  looked.length = 0
  heard.length = 0
  queued.length = 0
  puts.length = 0
  process.env.TELEGRAM_API_ID = '1'
  process.env.TELEGRAM_API_HASH = 'hash'
  // Nobody here is the platform owner: every session comes from the pool.
  delete process.env.TELEGRAM_SESSION_STRING
  useFetchEdgesForTests({
    put: async (_bytes, name, mime) => {
      puts.push({ name, mime })
      return {
        url: `https://vibee-render-production.up.railway.app/s3/assets/1-${name}`,
      }
    },
    look: async url => {
      looked.push(url)
      return 'На фото женщина у окна, лицо видно.'
    },
    listen: async url => {
      heard.push(url)
      return 'пришлю ещё фото к плану'
    },
    read: async () => null,
    later: async (_pool, _owner, rows) => {
      queued.push(...rows.map(r => Number(r.msgId)))
      return undefined
    },
  })
})
afterEach(() => {
  useFetchEdgesForTests(null)
  process.env.TELEGRAM_API_ID = prev.id
  process.env.TELEGRAM_API_HASH = prev.hash
  if (prev.session === undefined) delete process.env.TELEGRAM_SESSION_STRING
  else process.env.TELEGRAM_SESSION_STRING = prev.session
})

const tool = (name: string) => {
  const t = TELEGRAM_TOOLS.find(x => x.name === name)
  if (!t) throw new Error(`${name} is missing from TELEGRAM_TOOLS`)
  return t
}
const bothSellers = () =>
  poolDouble({ [SELLER_A]: 'session-a', [SELLER_B]: 'session-b' })
const as = (who: string, pool: unknown) =>
  ({ telegramId: who, pool, surface: 'bot' }) as never

/* ── 1. the frames say what is attached ────────────────────────────────── */

describe('a media message is no longer an empty block', () => {
  beforeEach(() => {
    script.messages = [
      photo(101, { groupedId: album('7001') }),
      photo(102, { groupedId: album('7001') }),
      photo(103, { groupedId: album('7001'), message: 'для плана' }),
      voice(104),
      pdf(105, 'brief.pdf'),
      text(106, 'вот всё'),
      photo(107, { out: true }),
    ]
  })

  it('carries kind, album and size per message, and the album reads as one unit', async () => {
    const r: any = await tool('tg_history').handler(
      { chat: CLIENT },
      as(SELLER_A, bothSellers())
    )
    const by = new Map<number, any>(r.messages.map((m: any) => [m.id, m]))
    for (const id of [101, 102, 103]) {
      expect(by.get(id).media).toMatchObject({
        kind: 'photo',
        album: '7001',
        album_size: 3,
      })
    }
    expect(by.get(104).media).toMatchObject({ kind: 'voice', duration: 12 })
    expect(by.get(105).media).toMatchObject({
      kind: 'document',
      mime: 'application/pdf',
      bytes: 1_258_291,
    })
    expect(by.get(106).media).toBeUndefined()
    // The album as a unit: its members, and nothing else.
    expect(r.albums).toEqual([
      {
        album: '7001',
        size: 3,
        msg_ids: [101, 102, 103],
        date: T0 + 101,
        own: false,
      },
    ])
    expect(r.files_note).toContain('tg_fetch_media')
  })

  it('says what is there inside the fence, and the owner’s own file outside it', async () => {
    const r: any = await tool('tg_history').handler(
      { chat: CLIENT },
      as(SELLER_A, bothSellers())
    )
    const by = new Map<number, any>(r.messages.map((m: any) => [m.id, m]))
    const first = by.get(101).text
    expect(first).toContain('FOREIGN CONTENT')
    expect(first).toContain('[фото, альбом из 3]')
    expect(by.get(103).text).toContain('[фото, альбом из 3] для плана')
    expect(by.get(104).text).toContain('[голосовое, 0:12]')
    expect(by.get(105).text).toContain('[файл: brief.pdf, 1.2 МБ]')
    // The sender's file name lives only in the fenced line, never in our facts.
    expect(JSON.stringify(by.get(105).media)).not.toContain('brief')
    expect(by.get(107).text).toBe('[фото]')
  })

  it('a read of words only answers exactly as before: no albums, no note', async () => {
    script.messages = [text(1, 'привет'), text(2, 'здравствуйте', true)]
    const r: any = await tool('tg_history').handler(
      { chat: CLIENT },
      as(SELLER_A, bothSellers())
    )
    expect(Object.keys(r).sort()).toEqual(['messages', 'note'])
    expect(r.messages.every((m: any) => !('media' in m))).toBe(true)
  })

  it('tg_media carries the same descriptor', async () => {
    const r: any = await tool('tg_media').handler(
      { chat: '@pilot_client', kind: 'photo' },
      as(SELLER_A, bothSellers())
    )
    expect(r.media.find((m: any) => m.id === 102).media.album).toBe('7001')
    expect(r.albums[0].msg_ids).toEqual([101, 102, 103])
  })
})

/* ── 2. the tool that looks ────────────────────────────────────────────── */

describe('tg_fetch_media opens what the person sent', () => {
  it('downloads, puts on OUR shelf, records in her library, and returns a url and what is on it', async () => {
    script.messages = [photo(201), photo(202, { message: 'для плана' })]
    const pool = bothSellers()
    const r: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: [201, 202] },
      as(SELLER_A, pool)
    )
    expect(script.downloads).toEqual([201, 202])
    expect(puts).toEqual([
      { name: 'photo-201.jpg', mime: 'image/jpeg' },
      { name: 'photo-202.jpg', mime: 'image/jpeg' },
    ])
    // The library row: this seller, this client, the owner-session surface.
    expect(pool.media).toHaveLength(2)
    for (const row of pool.media) {
      expect(row.owner_id).toBe(SELLER_A)
      expect(row.lead_id).toBe(CLIENT)
      expect(row.surface).toBe('ingest')
      expect(String(row.url)).toContain('/s3/assets/')
      expect(String(row.url)).not.toContain('api.telegram.org')
      expect(row.transcript).toBe('На фото женщина у окна, лицо видно.')
    }
    expect(pool.media.map(x => Number(x.msg_id))).toEqual([201, 202])
    expect(r.lead).toBe(CLIENT)
    expect(r.files).toHaveLength(2)
    expect(r.files[0]).toMatchObject({
      msg_id: 201,
      kind: 'photo',
      status: 'seen',
    })
    expect(r.files[0].url).toBe(pool.media[0].url)
    // What was seen is data: framed, like every word from the file.
    expect(r.files[0].description).toContain('FOREIGN CONTENT')
    expect(r.files[0].description).toContain('лицо видно')
    expect(r.files[1].caption).toContain('FOREIGN CONTENT')
    expect(r.how_to_read).toContain('image_edit')
  })

  it('the memory learns she sent them, and what was on them', async () => {
    script.messages = [
      photo(301, { groupedId: album('7002') }),
      photo(302, { groupedId: album('7002') }),
    ]
    const pool = bothSellers()
    await tool('tg_fetch_media').handler(
      { chat: CLIENT, album: '7002' },
      as(SELLER_A, pool)
    )
    expect(pool.crm.map(r => Number(r.msg_id)).sort()).toEqual([301, 302])
    for (const row of pool.crm) {
      expect(row.owner_id).toBe(SELLER_A)
      expect(row.lead_id).toBe(CLIENT)
      expect(String(row.text).startsWith('[фото, альбом из 2]\n')).toBe(true)
      expect(String(row.text)).toContain('лицо видно')
    }
  })

  it('album: exactly that album, found among the recent messages', async () => {
    script.messages = [
      photo(401, { groupedId: album('7003') }),
      photo(402, { groupedId: album('7003') }),
      photo(403, { groupedId: album('7004') }),
      voice(404),
    ]
    const r: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT, album: '7003' },
      as(SELLER_A, bothSellers())
    )
    expect(script.downloads).toEqual([401, 402])
    expect(r.files.map((f: any) => f.album)).toEqual(['7003', '7003'])
  })

  it('without ids or album: her newest files, not the owner’s', async () => {
    script.messages = [
      photo(501),
      photo(502, { out: true }),
      voice(503),
      text(504, 'посмотри'),
    ]
    const r: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT },
      as(SELLER_A, bothSellers())
    )
    expect(script.downloads.sort()).toEqual([501, 503])
    const v = r.files.find((f: any) => f.msg_id === 503)
    expect(v).toMatchObject({ kind: 'voice', status: 'heard' })
    expect(v.transcript).toContain('FOREIGN CONTENT')
    expect(heard).toHaveLength(1)
  })

  it('a file the library already holds is not downloaded again', async () => {
    script.messages = [photo(601)]
    const pool = bothSellers()
    await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: [601] },
      as(SELLER_A, pool)
    )
    const again: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: [601] },
      as(SELLER_A, pool)
    )
    expect(script.downloads).toEqual([601])
    expect(looked).toHaveLength(1)
    expect(again.files[0]).toMatchObject({ status: 'seen earlier' })
    expect(again.files[0].url).toBe(pool.media[0].url)
    expect(pool.media).toHaveLength(1)
  })
})

describe('tg_fetch_media is gated like every other reader', () => {
  it('refuses without an identity, before a client exists', async () => {
    await expect(
      tool('tg_fetch_media').handler({ chat: CLIENT }, undefined as never)
    ).rejects.toThrow('кто спрашивает')
    await expect(
      tool('tg_fetch_media').handler({ chat: CLIENT }, {
        telegramId: '  ',
        pool: bothSellers(),
      } as never)
    ).rejects.toThrow('кто спрашивает')
    expect(script.sessions).toEqual([])
  })

  it('a caller with no session of their own is refused, and never handed anybody else’s', async () => {
    await expect(
      tool('tg_fetch_media').handler(
        { chat: CLIENT, msg_ids: [1] },
        as(NO_SESSION, bothSellers())
      )
    ).rejects.toThrow('не подключён')
    expect(script.sessions).toEqual([])
  })

  it("another seller's library is not theirs: B opens through B's session and never gets A's rows", async () => {
    script.messages = [photo(701)]
    const pool = bothSellers()
    // Seller A looked at this file first; its row and description are A's.
    await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: [701] },
      as(SELLER_A, pool)
    )
    const aUrl = pool.media[0].url
    useFetchEdgesForTests({
      put: async (_b, name) => ({
        url: `https://vibee-render-production.up.railway.app/s3/assets/2-${name}`,
      }),
      look: async () => 'описание продавца B',
      later: async () => undefined,
    })
    const b: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: [701] },
      as(SELLER_B, pool)
    )
    // B's own session opened the chat; A's never did for B.
    expect(script.sessions).toEqual(['session-a', 'session-b'])
    // B downloaded for B: A's stored row was not an answer to B.
    expect(script.downloads).toEqual([701, 701])
    expect(b.files[0].status).toBe('seen')
    expect(b.files[0].url).not.toBe(aUrl)
    expect(b.files[0].description).toContain('описание продавца B')
    expect(b.files[0].description).not.toContain('лицо видно')
    const bRows = pool.media.filter(r => r.owner_id === SELLER_B)
    expect(bRows).toHaveLength(1)
    expect(pool.media.filter(r => r.owner_id === SELLER_A)).toHaveLength(1)
  })

  it('a group or a channel has no client library, and is refused', async () => {
    script.messages = [
      {
        ...photo(801),
        peerId: {
          className: 'PeerChannel',
          channelId: { toString: () => '1' },
        },
      },
    ]
    await expect(
      tool('tg_fetch_media').handler(
        { chat: '@somechannel', msg_ids: [801] },
        as(SELLER_A, bothSellers())
      )
    ).rejects.toThrow('личной переписки')
  })
})

describe('tg_fetch_media is bounded', () => {
  it(`takes at most ${FETCH_MAX_FILES} ids a call and names the rest`, async () => {
    const ids = Array.from({ length: 12 }, (_, i) => 900 + i)
    script.messages = ids.map(id => photo(id))
    const r: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: ids },
      as(SELLER_A, bothSellers())
    )
    expect(script.getMessagesCalls[0].ids).toEqual(
      ids.slice(0, FETCH_MAX_FILES)
    )
    expect(script.downloads).toHaveLength(FETCH_MAX_FILES)
    expect(r.left_out).toEqual([910, 911])
  })

  it(`looks at ${LIVE_LOOKS} photos live and queues the rest for the background`, async () => {
    const ids = [1001, 1002, 1003, 1004, 1005, 1006]
    script.messages = ids.map(id => photo(id))
    const r: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: ids },
      as(SELLER_A, bothSellers())
    )
    expect(looked).toHaveLength(LIVE_LOOKS)
    expect(r.files.filter((f: any) => f.status === 'seen')).toHaveLength(
      LIVE_LOOKS
    )
    const stored = r.files.filter((f: any) => f.status === 'stored')
    expect(stored.map((f: any) => f.msg_id)).toEqual([1005, 1006])
    expect(stored.every((f: any) => !('description' in f))).toBe(true)
    expect(queued).toEqual([1005, 1006])
    expect(r.describing_later).toBe(2)
  })

  it('a file above 20 MB is not downloaded at all', async () => {
    script.messages = [
      {
        ...voice(1101),
        media: {
          className: 'MessageMediaDocument',
          document: {
            mimeType: 'video/mp4',
            size: 300 * 1024 * 1024,
            attributes: [
              { className: 'DocumentAttributeVideo', duration: 900 },
            ],
          },
        },
      },
    ]
    const r: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: [1101] },
      as(SELLER_A, bothSellers())
    )
    expect(script.downloads).toEqual([])
    expect(r.files[0]).toMatchObject({ kind: 'video', status: 'too big' })
  })
})

describe('tg_fetch_media hangs up', () => {
  it('after a normal answer', async () => {
    script.messages = [photo(1201)]
    await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: [1201] },
      as(SELLER_A, bothSellers())
    )
    expect(script.timeline.at(-1)).toBe('destroy')
    expect(script.timeline.filter(x => x === 'connect')).toHaveLength(1)
  })

  it('when Telegram refuses the read', async () => {
    script.failGetMessages = 'FLOOD_WAIT_30'
    await expect(
      tool('tg_fetch_media').handler(
        { chat: CLIENT, msg_ids: [1] },
        as(SELLER_A, bothSellers())
      )
    ).rejects.toThrow('FLOOD_WAIT')
    expect(script.timeline.at(-1)).toBe('destroy')
  })

  it('when one download fails: the others still come, the failure is named, and the socket closes', async () => {
    script.messages = [photo(1301), photo(1302)]
    script.failDownload.add(1301)
    const r: any = await tool('tg_fetch_media').handler(
      { chat: CLIENT, msg_ids: [1301, 1302] },
      as(SELLER_A, bothSellers())
    )
    expect(r.files[0]).toMatchObject({ msg_id: 1301, status: 'failed' })
    expect(r.files[1]).toMatchObject({ msg_id: 1302, status: 'seen' })
    expect(script.timeline.at(-1)).toBe('destroy')
  })
})

/* ── 4. the seller is told to use them ─────────────────────────────────── */

describe('the brief says: open the files before answering', () => {
  it("every seller's playbook carries the rule, the face rule and the honesty rule", () => {
    const p = salesPlaybook({
      surface: 'bot',
      telegramId: SELLER_A,
      seller: true,
    })
    expect(p).toContain('tg_fetch_media')
    expect(p).toContain('after_our_last_word')
    expect(p).toContain('контент-плана')
    expect(p).toContain('image_edit')
    expect(p).toContain('лицо обязательно')
    expect(p).toContain('Не описывай фото, которое не открыл')
    // Still nobody else's: a non-seller gets no playbook at all.
    expect(salesPlaybook({ surface: 'bot', telegramId: CLIENT })).toBe('')
  })
})
