/**
 * WHAT A PERSON ATTACHES IN THE MINI APP JOINS THEIR MEDIA LIBRARY.
 *
 * Salvage study 2026-09-22, matrix row "Mini app chat": uploads were read on
 * the turn and then written nowhere -- no `user_media` row, so a video never
 * got the background description every bot video gets, and a PDF was read
 * again on every mention. The chat route now records them under the surface
 * 'miniapp', owner and lead both the person, our shelf only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

vi.mock('./src/agent/chat', () => ({
  runAgent: async function* () {
    yield { ['тип']: 'текст', ['текст']: 'ok' } // cyrillic-ok: event envelope
  },
}))

import { rememberMiniAppFiles } from './src/agent/miniapp-media'
import { USER_MEDIA_TABLE_SQL } from './src/agent/media-library'
import { handleAgentChat } from './src/agent/routes'

const PERSON = '900000031'
const SHELF = 'https://vibee-render-production.up.railway.app'
/** A document as the app uploads it today: `assetKeyFor`'s random part. */
const BRIEF = 'assets/1758000000000-0123456789abcdef-brief.pdf'

/** The columns the table really has, read from its own CREATE statement. */
const COLUMNS = new Set(
  [...USER_MEDIA_TABLE_SQL.matchAll(/^\s+"?([a-z_]+)"?\s+[a-z]/gim)].map(
    m => m[1]
  )
)

interface Inserted {
  [column: string]: unknown
}

/**
 * A pool that knows the user_media statements and nothing else about that
 * table: an INSERT naming a column the table does not have throws, as
 * Postgres would. Everything else (the conversation store the route also
 * writes) is answered empty -- that is not what this file is about.
 */
function strictPool() {
  const inserted: Inserted[] = []
  let id = 0
  return {
    inserted,
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ').trim()
      if (/^CREATE (TABLE|INDEX) IF NOT EXISTS user_media/.test(q))
        return { rows: [] }
      const ins = /^INSERT INTO user_media \(([^)]+)\)/.exec(q)
      if (ins) {
        const cols = ins[1].split(',').map(c => c.trim().replace(/"/g, ''))
        for (const c of cols) {
          if (!COLUMNS.has(c)) throw new Error(`user_media has no column ${c}`)
        }
        const row: Inserted = {}
        cols.forEach((c, i) => (row[c] = params[i]))
        inserted.push(row)
        id += 1
        return { rows: [{ id, fresh: false }] }
      }
      if (/user_media/.test(q))
        throw new Error(`fake pool not taught: ${q.slice(0, 80)}`)
      return { rows: [] }
    },
  }
}

const marker = (kind: string, name: string, mime: string, url: string) =>
  `[attached ${kind}: ${name}; mime=${mime}; url=${url}]`

beforeEach(() => {
  delete process.env.PUBLIC_URL
})

describe('rememberMiniAppFiles', () => {
  it("writes each shelf file once, as the person's own, on the miniapp surface", async () => {
    const pool = strictPool()
    const text = [
      'посмотри файлы', // cyrillic-ok: what a person types
      marker('file', 'brief.pdf', 'application/pdf', `${SHELF}/s3/${BRIEF}`),
      marker(
        'video',
        'clip.mp4',
        'video/mp4',
        `${SHELF}/s3/assets/1-clip.mp4?v=2`
      ),
      // The same object again, spelled differently: one row, not two.
      marker('video', 'clip.mp4', 'video/mp4', `${SHELF}/s3/assets/1-clip.mp4`),
      // Somebody else's host is not ours to describe.
      marker('image', 'x.jpg', 'image/jpeg', 'https://evil.example/x.jpg'),
    ].join('\n')

    const got = await rememberMiniAppFiles(pool as never, PERSON, text)

    // The double read the schema, or it would refuse nothing.
    expect([...COLUMNS]).toEqual(
      expect.arrayContaining(['owner_id', 'lead_id', 'surface', 'url', 'out'])
    )
    expect(got.stored).toBe(2)
    expect(pool.inserted).toHaveLength(2)
    for (const row of pool.inserted) {
      expect(row.owner_id).toBe(PERSON)
      expect(row.lead_id).toBe(PERSON)
      expect(row.surface).toBe('miniapp')
      expect(String(row.url).startsWith(`${SHELF}/s3/`)).toBe(true)
    }
    expect(pool.inserted.map(r => r.kind)).toEqual(['file', 'video'])
    expect(pool.inserted[1].url).toBe(`${SHELF}/s3/assets/1-clip.mp4`)
  })

  /*
   * A marker is text a person typed, and the library signs what it stores
   * (`crm_lead_media`): a guessed old document key stored here would come
   * back as a link that opens somebody else's file (shelf-access.ts).
   */
  it('skips a document under a walkable key, however it is spelled', async () => {
    const pool = strictPool()
    const text = [
      marker(
        'file',
        'a.pdf',
        'application/pdf',
        `${SHELF}/s3/assets/1758000000000-file-4242.pdf`
      ),
      marker(
        'file',
        'b.pdf',
        'application/pdf',
        `${SHELF}/s3/assets/1-0123456789abcdef-x/../1757000000000-file-7.pdf`
      ),
      marker('file', 'c.txt', 'text/plain', '/s3/assets/1757000000001-c.txt'),
      // An old-shape photo is public (rule 1) and still joins the library.
      marker(
        'image',
        'p.jpg',
        'image/jpeg',
        `${SHELF}/s3/assets/1757000000006-photo-12.jpg`
      ),
    ].join('\n')

    const got = await rememberMiniAppFiles(pool as never, PERSON, text)

    expect(got.stored).toBe(1)
    expect(pool.inserted.map(r => r.url)).toEqual([
      `${SHELF}/s3/assets/1757000000006-photo-12.jpg`,
    ])
  })

  it('writes nothing for a message with no files', async () => {
    const pool = strictPool()
    expect(
      await rememberMiniAppFiles(pool as never, PERSON, 'просто текст')
    ).toEqual({
      // cyrillic-ok: what a person types
      stored: 0,
      fresh: 0,
    })
    expect(pool.inserted).toHaveLength(0)
  })
})

function req(body: unknown) {
  const s = Readable.from([JSON.stringify(body)]) as any
  s.headers = { 'content-type': 'application/json' }
  s.method = 'POST'
  s.url = '/api/agent/chat'
  return s
}
function res() {
  return {
    writableEnded: false,
    on() {
      return this
    },
    writeHead() {
      return this
    },
    write() {
      return true
    },
    end() {},
  }
}

describe('the chat route records mini app files', () => {
  const message = marker(
    'file',
    'brief.pdf',
    'application/pdf',
    `${SHELF}/s3/${BRIEF}`
  )

  it('from the mini app', async () => {
    const pool = strictPool()
    await handleAgentChat(
      req({
        surface: 'miniapp',
        messages: [{ role: 'user', content: message }],
      }),
      res() as never,
      PERSON,
      async () => pool
    )
    await vi.waitFor(() => expect(pool.inserted).toHaveLength(1))
    expect(pool.inserted[0]).toMatchObject({
      owner_id: PERSON,
      lead_id: PERSON,
      surface: 'miniapp',
      kind: 'file',
      name: 'brief.pdf',
    })
  })

  /*
   * NOT from the bot: it records its own files through /api/crm/media with
   * the Telegram message id, and a second row from here would be a duplicate
   * without one. Nor from the unattended sweep, whose brief is not a person.
   */
  it('and from nowhere else', async () => {
    const pool = strictPool()
    for (const body of [
      { surface: 'bot', messages: [{ role: 'user', content: message }] },
      { surface: 'business', messages: [{ role: 'user', content: message }] },
      {
        surface: 'miniapp',
        tools_only: true,
        messages: [{ role: 'user', content: message }],
      },
    ]) {
      await handleAgentChat(req(body), res() as never, PERSON, async () => pool)
    }
    await new Promise(r => setTimeout(r, 20))
    expect(pool.inserted).toHaveLength(0)
  })
})
