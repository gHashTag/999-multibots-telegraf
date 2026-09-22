import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { serveShelfRequest, type ShelfStore } from './shelf-route'
import {
  isPublicShelfKey,
  shelfLinkFor,
  shelfReadAccess,
  SHELF_LINK_TTL_S,
} from './shelf-access'
import { handleCrmMedia } from '../agent/media-library-route'

/**
 * AN OLD DOCUMENT KEY IS NOT PUBLIC ON ITS OWN.
 *
 * Until 2026-09-22 the ingest stored a client's attachment from a private
 * chat as `assets/<ms>-file-<message id>.<ext>` -- or, before that, under the
 * sender's own file name -- and `/s3/` answered every document with a 500.
 * Once the route served documents, such a key was a link anyone could walk
 * to. These tests ask the route through a real socket, the way a stranger
 * with a guessed key would, and the way the owner with a handed-out link
 * would.
 */

const SHELF = 'https://shelf.test'
const OLD_PDF = 'assets/1758000000000-file-4242.pdf'
const OLD_NAMED = 'assets/1757000000000-contract.docx'
const OLD_TXT = 'assets/1757000000001-file-7.txt'
const OLD_ZIP = 'assets/1757000000002-file-8.zip'
const OLD_BIN = 'assets/1757000000003-file-9.bin'
const OLD_TGS = 'assets/1757000000004-file-10.tgs'
const OLD_BARE = 'assets/1757000000005-file-11'
const NEW_PDF = 'assets/1759000000000-0123456789abcdef-file-4242.pdf'
const OLD_JPG = 'assets/1757000000006-photo-12.jpg'
const OLD_OGG = 'assets/1757000000007-voice-13.ogg'
const OLD_MP4 = 'assets/1757000000008-video-14.mp4'
const OLD_JSON = 'assets/1757000000009-captions.json'

const DOC = Buffer.from('%PDF-1.4\nclient contract\n%%EOF\n')
const ALL: Record<string, Buffer> = Object.fromEntries(
  [
    OLD_PDF,
    OLD_NAMED,
    OLD_TXT,
    OLD_ZIP,
    OLD_BIN,
    OLD_TGS,
    OLD_BARE,
    NEW_PDF,
    OLD_JPG,
    OLD_OGG,
    OLD_MP4,
    OLD_JSON,
  ].map(k => [k, DOC])
)

/** A bucket that records every question, so "never asked" is observable. */
function fakeStore(objects: Record<string, Buffer>) {
  const asked: string[] = []
  const store: ShelfStore = {
    async stat(key) {
      asked.push(`stat ${key}`)
      const b = objects[key]
      return b ? { size: b.length } : null
    },
    async open(key, range) {
      asked.push(`open ${key}`)
      const b = objects[key] ?? Buffer.alloc(0)
      return Readable.from([range ? b.subarray(range.start, range.end + 1) : b])
    },
  }
  return { store, asked }
}

const SERVER_KEY = 'server-key-for-tests-only'
let server: Server
let base = ''
let bucket = fakeStore(ALL)

const savedEnv = { ...process.env }
beforeAll(async () => {
  process.env.PUBLIC_URL = SHELF
  process.env.SESSION_SIGNING_KEY = 'x'.repeat(48)
  server = createServer((req, res) => {
    void serveShelfRequest(req, res, {
      store: bucket.store,
      // The wiring render-server.ts uses, with a stand-in for hasServerKey.
      access: (key, query, r) =>
        shelfReadAccess(key, query, r.headers['x-api-key'] === SERVER_KEY),
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  process.env = savedEnv
  await new Promise<void>(r => server.close(() => r()))
})
beforeEach(() => {
  bucket = fakeStore(ALL)
})

const enc = (key: string) => key.split('/').map(encodeURIComponent).join('/')
async function ask(path: string, init: RequestInit = {}) {
  const res = await fetch(base + path, init)
  return { res, body: Buffer.from(await res.arrayBuffer()) }
}
/** The path and query of a link `shelfLinkFor` handed out. */
const local = (link: string) => {
  const u = new URL(link)
  return u.pathname + u.search
}

describe('a walkable document key without a credential is refused', () => {
  it.each([OLD_PDF, OLD_NAMED, OLD_TXT, OLD_ZIP, OLD_BIN, OLD_TGS, OLD_BARE])(
    '%s: 403 on GET, and the bucket is never asked',
    async key => {
      const { res, body } = await ask(`/s3/${enc(key)}`)
      expect(res.status).toBe(403)
      expect(body.includes(DOC)).toBe(false)
      expect(bucket.asked).toEqual([])
    }
  )

  it('HEAD, a Range, ?original=1 and both together are refused the same way', async () => {
    const path = `/s3/${enc(OLD_PDF)}`
    const head = await fetch(base + path, { method: 'HEAD' })
    const range = await ask(path, { headers: { Range: 'bytes=0-3' } })
    const original = await ask(`${path}?original=1`)
    const both = await ask(`${path}?original=true`, {
      headers: { Range: 'bytes=-5' },
    })
    for (const r of [head, range.res, original.res, both.res])
      expect(r.status).toBe(403)
    // No Content-Length of the real object leaks through HEAD either.
    expect(head.headers.get('content-length')).not.toBe(String(DOC.length))
    expect(bucket.asked).toEqual([])
  })

  it('percent-encoding the key does not change the answer', async () => {
    for (const path of [
      '/s3/%61ssets/1758000000000-file-4242.pdf',
      '/s3/assets%2F1758000000000-file-4242.pdf',
      '/s3/assets/1758000000000-file-4242%2Epdf',
      '/s3/assets/1758000000000-file-4242.PDF',
    ]) {
      const { res } = await ask(path)
      expect(res.status, path).toBe(403)
    }
    expect(bucket.asked).toEqual([])
  })

  it('a key dressed in the random shape and walked back with dot segments is still refused', async () => {
    for (const key of [
      'assets/1-0123456789abcdef-x/../1758000000000-file-4242.pdf',
      'assets/./1758000000000-file-4242.pdf',
      'assets//1758000000000-file-4242.pdf',
      '/assets/1758000000000-file-4242.pdf',
      'assets/1-0123456789abcdef-x/..',
      'assets/1-0123456789abcdef-x\\..\\1758000000000-file-4242.pdf',
    ]) {
      const { res } = await ask(`/s3/${encodeURIComponent(key)}`)
      expect(res.status, key).toBe(403)
    }
    expect(bucket.asked).toEqual([])
  })

  it('a session, an initData or an agent key alone opens nothing: they say who asks, not whose file it is', async () => {
    const { res } = await ask(`/s3/${enc(OLD_PDF)}`, {
      headers: {
        Authorization: 'Bearer anything',
        'X-Telegram-Init-Data': 'user=%7B%22id%22%3A900000001%7D&hash=0',
        'X-Agent-Key': 'agent-key',
      },
    })
    expect(res.status).toBe(403)
  })
})

describe('the same key opens with the server key or a link the service handed out', () => {
  it('X-Api-Key: the stored bytes, and not for a shared cache', async () => {
    const { res, body } = await ask(`/s3/${enc(OLD_PDF)}`, {
      headers: { 'X-Api-Key': SERVER_KEY },
    })
    expect(res.status).toBe(200)
    expect(body.equals(DOC)).toBe(true)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('a wrong X-Api-Key is refused', async () => {
    const { res } = await ask(`/s3/${enc(OLD_PDF)}`, {
      headers: { 'X-Api-Key': SERVER_KEY + 'x' },
    })
    expect(res.status).toBe(403)
  })

  it('a signed link opens on GET, HEAD, Range and ?original=1', async () => {
    const link = shelfLinkFor(`${SHELF}/s3/${OLD_PDF}`)
    expect(link).toMatch(/[?&]exp=\d+&sig=[A-Za-z0-9_-]{43}$/)
    const path = local(link)
    const got = await ask(path)
    expect(got.res.status).toBe(200)
    expect(got.body.equals(DOC)).toBe(true)
    expect(got.res.headers.get('cache-control')).toBe('private, no-store')
    const head = await fetch(base + path, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(String(DOC.length))
    const range = await ask(path, { headers: { Range: 'bytes=0-3' } })
    expect(range.res.status).toBe(206)
    expect(range.body.toString()).toBe('%PDF')
    expect((await ask(`${path}&original=1`)).res.status).toBe(200)
  })

  it('a signed link for a name with spaces opens, however the path is encoded', async () => {
    const key = 'assets/1757000000010-my contract.pdf'
    bucket = fakeStore({ [key]: DOC })
    const link = shelfLinkFor(`${SHELF}/s3/${enc(key)}`)
    const q = new URL(link).search
    expect((await ask(`/s3/${enc(key)}${q}`)).res.status).toBe(200)
    expect(
      (await ask(`/s3/assets/1757000000010-my%20contra%63t.pdf${q}`)).res.status
    ).toBe(200)
  })

  it("an expired, a tampered or another key's signature is refused", async () => {
    const day = SHELF_LINK_TTL_S * 1000
    const stale = new URL(
      shelfLinkFor(`${SHELF}/s3/${OLD_PDF}`, Date.now() - day - 1000)
    )
    expect((await ask(stale.pathname + stale.search)).res.status).toBe(403)

    const fresh = new URL(shelfLinkFor(`${SHELF}/s3/${OLD_PDF}`))
    const sig = fresh.searchParams.get('sig') as string
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    const tampered = new URL(fresh)
    tampered.searchParams.set('sig', flipped)
    expect((await ask(tampered.pathname + tampered.search)).res.status).toBe(
      403
    )

    const later = new URL(fresh)
    later.searchParams.set(
      'exp',
      String(Number(fresh.searchParams.get('exp')) + 3600)
    )
    expect((await ask(later.pathname + later.search)).res.status).toBe(403)

    // The signature of one document does not open its neighbour.
    expect((await ask(`/s3/${enc(OLD_NAMED)}${fresh.search}`)).res.status).toBe(
      403
    )
  })

  it('without a signing key nothing is signed and nothing signed is believed', async () => {
    const link = shelfLinkFor(`${SHELF}/s3/${OLD_PDF}`)
    const saved = process.env.SESSION_SIGNING_KEY
    delete process.env.SESSION_SIGNING_KEY
    try {
      expect(shelfLinkFor(`${SHELF}/s3/${OLD_PDF}`)).toBe(
        `${SHELF}/s3/${OLD_PDF}`
      )
      expect((await ask(local(link))).res.status).toBe(403)
    } finally {
      process.env.SESSION_SIGNING_KEY = saved
    }
  })
})

describe('what was public stays public', () => {
  it('a new key with the random part opens without anything, as #2842 decided', async () => {
    const { res, body } = await ask(`/s3/${enc(NEW_PDF)}`)
    expect(res.status).toBe(200)
    expect(body.equals(DOC)).toBe(true)
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000')
    expect(shelfLinkFor(`${SHELF}/s3/${NEW_PDF}`)).toBe(
      `${SHELF}/s3/${NEW_PDF}`
    )
  })

  it.each([OLD_JPG, OLD_OGG, OLD_JSON])(
    '%s under the old shape opens without anything, and its link is not signed',
    async key => {
      const { res } = await ask(`/s3/${enc(key)}`)
      expect(res.status).toBe(200)
      expect(shelfLinkFor(`${SHELF}/s3/${key}`)).toBe(`${SHELF}/s3/${key}`)
    }
  )

  it('an old-shape video opens as stored with ?original=1', async () => {
    const { res } = await ask(`/s3/${enc(OLD_MP4)}?original=1`)
    expect(res.status).toBe(200)
  })

  it('a link somewhere else, or not on /s3/, is handed out untouched', () => {
    for (const url of [
      `https://elsewhere.test/s3/${OLD_PDF}`,
      `${SHELF}/renders/${OLD_PDF}`,
      'not a url',
    ])
      expect(shelfLinkFor(url)).toBe(url)
  })

  it('the decision, key by key', () => {
    expect(isPublicShelfKey(OLD_PDF)).toBe(false)
    expect(isPublicShelfKey(OLD_BARE)).toBe(false)
    expect(isPublicShelfKey(NEW_PDF)).toBe(true)
    expect(isPublicShelfKey('manifests/run-1-manifest.json')).toBe(true)
    expect(isPublicShelfKey('renders/1-render.mp4')).toBe(true)
    expect(isPublicShelfKey('assets/1-0123456789ABCDEF-x.pdf')).toBe(false)
    expect(isPublicShelfKey('assets/1-0123456789abcde-x.pdf')).toBe(false)
  })
})

describe('the owner gets links that open', () => {
  it('GET /api/crm/media signs an old document and leaves a photo and a new key alone', async () => {
    const at = new Date('2026-09-01T00:00:00Z')
    const rows = [OLD_PDF, OLD_JPG, NEW_PDF].map((k, i) => ({
      id: i + 1,
      owner_id: '900000001',
      lead_id: '900000002',
      surface: 'ingest',
      msg_id: i + 1,
      at,
      out: false,
      kind: k.endsWith('.jpg') ? 'image' : 'file',
      name: k.split('/').pop(),
      mime: null,
      bytes: DOC.length,
      url: `${SHELF}/s3/${k}`,
    }))
    const pool = {
      query: async (sql: string) =>
        /SELECT/.test(sql) ? { rows } : { rows: [] },
    }
    const out: { status?: number; body?: string } = {}
    const res = {
      writeHead(code: number) {
        out.status = code
        return this
      },
      end(b: string) {
        out.body = b
      },
    }
    const req = { method: 'GET', url: '/api/crm/media?lead=900000002' }
    await handleCrmMedia(req as never, res as never, '900000001', () => pool)
    expect(out.status).toBe(200)
    const items = JSON.parse(out.body as string).items as Array<{ url: string }>
    expect(items[0].url).toMatch(/\?exp=\d+&sig=/)
    expect(items[1].url).toBe(`${SHELF}/s3/${OLD_JPG}`)
    expect(items[2].url).toBe(`${SHELF}/s3/${NEW_PDF}`)
    // And the signed one really opens.
    const { res: opened } = await ask(local(items[0].url))
    expect(opened.status).toBe(200)
  })
})

/**
 * A POOL THAT REMEMBERS: what the POST stored is what the GET lists. It knows
 * the two user_media statements the route runs and throws on anything else,
 * so a door that wrote somewhere unexpected fails instead of passing on an
 * empty `rows: []`. `fresh: false` keeps the background describe out of it --
 * the rows are what this test is about.
 */
function libraryPool() {
  const rows: Array<Record<string, unknown>> = []
  return {
    rows,
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ').trim()
      if (/^CREATE (TABLE|INDEX) IF NOT EXISTS user_media/.test(q))
        return { rows: [] }
      if (q.startsWith('INSERT INTO user_media')) {
        const [owner_id, lead_id, surface, msg_id, at, out, kind, name] = params
        const url = params[10]
        rows.push({
          id: rows.length + 1,
          owner_id,
          lead_id,
          surface,
          msg_id,
          at,
          out,
          kind,
          name,
          url,
        })
        return { rows: [{ id: rows.length, fresh: false }] }
      }
      if (q.startsWith('SELECT') && q.includes('FROM user_media')) {
        const [owner, lead] = params
        return {
          rows: rows.filter(r => r.owner_id === owner && r.lead_id === lead),
        }
      }
      throw new Error(`pool not taught: ${q.slice(0, 80)}`)
    },
  }
}

function jsonRes() {
  const out: { status?: number; body?: any } = {}
  return {
    out,
    writeHead(code: number) {
      out.status = code
      return this
    },
    end(b: string) {
      out.body = JSON.parse(b)
    },
  }
}

function postReq(body: unknown) {
  const s = Readable.from([JSON.stringify(body)]) as any
  s.method = 'POST'
  s.url = '/api/crm/media'
  return s
}

describe('a caller cannot register a walkable key to have it signed', () => {
  /*
   * The door GET signs from is the door POST writes through, and POST takes
   * anyone the server can identify naming themselves as the lead. A guessed
   * old key stored there would come back signed: 403 turned into 200 for
   * somebody else's document.
   */
  const CALLER = '900000003'

  it('POST skips an old document key in every spelling, and GET then signs nothing', async () => {
    const pool = libraryPool()
    const posted = jsonRes()
    await handleCrmMedia(
      postReq({
        lead: CALLER,
        surface: 'bot',
        items: [
          { kind: 'file', name: 'a.pdf', url: `${SHELF}/s3/${OLD_PDF}` },
          {
            kind: 'file',
            name: 'b.pdf',
            url: `${SHELF}/s3/assets/1-0123456789abcdef-x/../1758000000000-file-4242.pdf`,
          },
          {
            kind: 'file',
            name: 'c.pdf',
            url: `${SHELF}/s3/assets/1758000000000-file-4242%2Epdf?v=1`,
          },
          { kind: 'file', name: 'd.docx', url: `${SHELF}/s3/${OLD_NAMED}` },
          // Public by rules 1 and 2: stored as before.
          { kind: 'image', name: 'p.jpg', url: `${SHELF}/s3/${OLD_JPG}` },
          { kind: 'file', name: 'n.pdf', url: `${SHELF}/s3/${NEW_PDF}` },
        ],
      }),
      posted as never,
      CALLER,
      () => pool
    )
    expect(posted.out.status).toBe(200)
    expect(pool.rows.map(r => r.url)).toEqual([
      `${SHELF}/s3/${OLD_JPG}`,
      `${SHELF}/s3/${NEW_PDF}`,
    ])

    const listed = jsonRes()
    await handleCrmMedia(
      { method: 'GET', url: `/api/crm/media?lead=${CALLER}` } as never,
      listed as never,
      CALLER,
      () => pool
    )
    expect(listed.out.status).toBe(200)
    const urls = (listed.out.body.items as Array<{ url: string }>).map(
      x => x.url
    )
    expect(urls).toHaveLength(2)
    for (const u of urls) expect(u).not.toMatch(/[?&]sig=/)
  })

  it('a batch of walkable keys only is refused whole, and nothing is written', async () => {
    const pool = libraryPool()
    const posted = jsonRes()
    await handleCrmMedia(
      postReq({
        lead: CALLER,
        surface: 'bot',
        items: [OLD_PDF, OLD_TXT, OLD_ZIP, OLD_BARE].map(k => ({
          kind: 'file',
          name: 'x',
          url: `${SHELF}/s3/${k}`,
        })),
      }),
      posted as never,
      CALLER,
      () => pool
    )
    expect(posted.out.status).toBe(400)
    expect(posted.out.body.error).toMatch(/^url:/)
    expect(pool.rows).toHaveLength(0)
  })
})

describe('media kinds the old route never streamed', () => {
  /*
   * Rule 1 reads the route's type table, and that table names `.tif`,
   * `.tiff` and `.ico` as images -- kinds the route before 2026-09-22 sent to
   * ffmpeg instead of streaming. A `.tif` is how a scanned document sent as
   * a file looks, so under a walkable key it stays behind the gate.
   */
  const OLD_TIF = 'assets/1757000000020-file-21.tif'
  const OLD_TIFF = 'assets/1757000000021-scan.TIFF'
  const OLD_ICO = 'assets/1757000000022-file-22.ico'
  const OLD_OGA = 'assets/1757000000023-voice-23.oga'
  const NEW_TIF = 'assets/1759000000001-0123456789abcdef-scan.tif'

  it.each([OLD_TIF, OLD_TIFF, OLD_ICO])(
    '%s under the old shape is refused, and a signed link opens it',
    async key => {
      bucket = fakeStore({ [key]: DOC })
      expect(isPublicShelfKey(key)).toBe(false)
      const { res } = await ask(`/s3/${enc(key)}`)
      expect(res.status).toBe(403)
      expect(bucket.asked).toEqual([])
      const opened = await ask(local(shelfLinkFor(`${SHELF}/s3/${key}`)))
      expect(opened.res.status).toBe(200)
    }
  )

  it('a tif under the random shape stays public by rule 2', async () => {
    bucket = fakeStore({ [NEW_TIF]: DOC })
    expect(isPublicShelfKey(NEW_TIF)).toBe(true)
    expect((await ask(`/s3/${enc(NEW_TIF)}`)).res.status).toBe(200)
  })

  it('an old .oga voice note stays public: the transcriber fetches it with no credential', async () => {
    bucket = fakeStore({ [OLD_OGA]: DOC })
    expect(isPublicShelfKey(OLD_OGA)).toBe(true)
    expect((await ask(`/s3/${enc(OLD_OGA)}`)).res.status).toBe(200)
  })
})

describe('every spelling of our shelf gets a link that opens', () => {
  /*
   * shelfLinkFor used to sign only an absolute URL on the current origin:
   * a relative `/s3/` row, which every by-key reader (`shelfObject`) takes
   * as ours, came back unsigned and answered 403 in the mini app.
   */
  it.each([
    ['relative', `/s3/${OLD_PDF}`],
    ['relative, no leading slash', `s3/${OLD_PDF}`],
    ['with a query of its own', `${SHELF}/s3/${OLD_PDF}?v=2#page=3`],
    ['with a dot segment', `${SHELF}/s3/assets/x/../${OLD_PDF.slice(7)}`],
    ['percent-encoded', `${SHELF}/s3/${OLD_PDF.replace('.pdf', '%2Epdf')}`],
  ])('%s: signed, absolute, and it opens', async (_what, url) => {
    const link = shelfLinkFor(url)
    expect(link.startsWith(`${SHELF}/s3/`)).toBe(true)
    expect(link).toMatch(/\?exp=\d+&sig=[A-Za-z0-9_-]{43}$/)
    const { res, body } = await ask(local(link))
    expect(res.status).toBe(200)
    expect(body.equals(DOC)).toBe(true)
  })

  it('a relative public key is handed out as it was', () => {
    expect(shelfLinkFor(`/s3/${OLD_JPG}`)).toBe(`/s3/${OLD_JPG}`)
    expect(shelfLinkFor(`/s3/${NEW_PDF}`)).toBe(`/s3/${NEW_PDF}`)
  })
})
