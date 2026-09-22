import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
// @ts-ignore -- plain .mjs shipped in the Bot API image, no types
import {
  createApiProxy,
  refersToLocalFile,
  readPartHeaders,
  MultipartScanner,
} from '../../deployment/telegram-bot-api/api-proxy.mjs'

const allowedBots = createRequire(__filename)(
  '../../deployment/telegram-bot-api/allowed-bots.cjs'
)

/**
 * THE DOOR IN FRONT OF OUR BOT API SERVER.
 *
 * The private network is shared with the per-person browser pod, so the port
 * the services use is a proxy that lets through only the bots this server
 * holds, and no `file:/` value -- in `--local` mode such a value makes the
 * server send any file on its disk, `tqueue.binlog` (every bot's pending
 * updates) included, to whoever asked.
 *
 * A fake upstream records what actually arrives. What matters as much as the
 * refusals is that a REFUSED request never reaches the server complete, and
 * that ordinary traffic -- Telegraf's multipart, undici's FormData, a message
 * that merely says "Profile:" -- passes untouched.
 */
const LISTED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const STRANGER = '900000099:ZZstrangerstrangerstrangerstrangerst'

type Seen = { url: string; body: Buffer; complete: boolean; headers: any }
let seen: Seen[] = []
let upstream: Server
let proxy: Server
let base = ''
let work = ''

beforeAll(async () => {
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = []
    const entry: Seen = {
      url: req.url || '',
      body: Buffer.alloc(0),
      complete: false,
      headers: req.headers,
    }
    seen.push(entry)
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      entry.body = Buffer.concat(chunks)
      entry.complete = true
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({ ok: true, result: { echoed: entry.body.length } })
      )
    })
  })
  await new Promise<void>(r => upstream.listen(0, '127.0.0.1', () => r()))

  work = await mkdtemp(path.join(tmpdir(), 'bot-api-proxy-'))
  allowedBots.writeAllowedBots(work, new Map([['900000011', 'Moved_test_bot']]))
  proxy = createApiProxy({
    upstream: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    allowed: allowedBots.allowListWatcher(work),
  })
  await new Promise<void>(r => proxy.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>(r => proxy.close(() => r()))
  await new Promise<void>(r => upstream.close(() => r()))
  await rm(work, { recursive: true, force: true })
})
beforeEach(() => {
  seen = []
})

const settle = () => new Promise(r => setTimeout(r, 50))

async function call(p: string, init?: RequestInit) {
  const res = await fetch(`${base}${p}`, init)
  const text = await res.text()
  await settle()
  return { status: res.status, text }
}

/** Sends raw bytes with the exact headers given -- no client reformatting. */
function raw(
  p: string,
  headers: Record<string, string>,
  body: Buffer | string
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(`${base}${p}`)
    const req = request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { ...headers, 'content-length': Buffer.byteLength(body) },
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end', () =>
          settle().then(() =>
            resolve({
              status: res.statusCode || 0,
              text: Buffer.concat(chunks).toString(),
            })
          )
        )
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

const completed = () => seen.filter(s => s.complete)

function multipart(
  boundary: string,
  parts: { head: string; body: string | Buffer }[],
  tail = '\r\n'
): Buffer {
  const out: Buffer[] = []
  for (const p of parts) {
    out.push(Buffer.from(`--${boundary}\r\n${p.head}\r\n\r\n`, 'latin1'))
    out.push(Buffer.isBuffer(p.body) ? p.body : Buffer.from(p.body))
    out.push(Buffer.from('\r\n'))
  }
  // Each part's trailing CRLF is the start of the next delimiter.
  out.push(Buffer.from(`--${boundary}--${tail}`))
  return Buffer.concat(out)
}

describe('which bots get through', () => {
  it('a bot on the allow-list: its call reaches the server and the answer comes back', async () => {
    const r = await call(`/bot${LISTED}/getMe`, { method: 'POST' })
    expect(r.status).toBe(200)
    expect(JSON.parse(r.text).ok).toBe(true)
    expect(completed().map(s => s.url)).toEqual([`/bot${LISTED}/getMe`])
  })

  it('any other bot -- a throwaway one from BotFather -- is refused before the server sees it', async () => {
    const r = await call(`/bot${STRANGER}/getMe`, { method: 'POST' })
    expect(r.status).toBe(403)
    expect(r.text).toContain('allow-list')
    expect(r.text).not.toContain('ZZstranger')
    expect(seen).toEqual([])
  })

  it('the allow-list is read as it changes: a bot removed is refused at once', async () => {
    allowedBots.writeAllowedBots(work, new Map())
    try {
      expect((await call(`/bot${LISTED}/getMe`)).status).toBe(403)
    } finally {
      allowedBots.writeAllowedBots(
        work,
        new Map([['900000011', 'Moved_test_bot']])
      )
    }
    expect((await call(`/bot${LISTED}/getMe`)).status).toBe(200)
  })

  it('nothing but /bot<token>/<method>: no file paths, no test DC, no stray files', async () => {
    for (const p of [
      `/file/bot${LISTED}/videos/file_0.mp4`,
      `/bot${LISTED}/test/getMe`,
      `/bot${LISTED}/getMe/extra`,
      `/bot${LISTED}`,
      '/tqueue.binlog',
      `/bot${LISTED}/get%4De`,
    ]) {
      expect((await call(p)).status, p).toBe(404)
    }
    expect(seen).toEqual([])
  })

  it('`/` passes through, so a service can tell the server is up', async () => {
    expect((await call('/?x=1')).status).toBe(200)
    expect(completed().map(s => s.url)).toEqual(['/'])
  })
})

describe('the allow-list from BOT_API_ALLOWED_IDS (the move without a shell)', () => {
  it('reads username=id and bare ids, comma- or space-separated', () => {
    const m = allowedBots.parseAllowedVariable(
      ' Moved_test_bot=900000011, 900000012\n@Third_test_bot=900000013 '
    )
    expect([...m.entries()]).toEqual([
      ['900000011', 'Moved_test_bot'],
      ['900000012', null],
      ['900000013', 'Third_test_bot'],
    ])
    expect(allowedBots.parseAllowedVariable(undefined).size).toBe(0)
    expect(allowedBots.parseAllowedVariable('').size).toBe(0)
  })

  it('a malformed entry stops the start, and a pasted token is never repeated back', () => {
    const pasted = `Moved_test_bot=900000011,${STRANGER}`
    let message = ''
    try {
      allowedBots.parseAllowedVariable(pasted)
    } catch (e) {
      message = String((e as Error).message)
    }
    expect(message).toContain('BOT_API_ALLOWED_IDS: entry 2 of 2')
    expect(message).not.toContain('ZZstranger')
    expect(message).not.toContain('900000099')
  })

  it('a bot named only by the variable gets through; the file cannot take it away', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bot-api-var-'))
    try {
      const ids = allowedBots.allowListWatcher(
        dir,
        allowedBots.parseAllowedVariable('Stranger_test_bot=900000099')
      )
      expect(ids().has('900000099')).toBe(true)
      allowedBots.writeAllowedBots(
        dir,
        new Map([['900000011', 'Moved_test_bot']])
      )
      expect([...ids()].sort()).toEqual(['900000011', '900000099'])
      allowedBots.writeAllowedBots(dir, new Map())
      expect([...ids()]).toEqual(['900000099'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('no file:/ value reaches the server', () => {
  const FILE = 'file:///var/lib/telegram-bot-api/tqueue.binlog'

  it('in the query string, plain or percent-encoded', async () => {
    for (const q of [
      `document=${FILE}`,
      `document=${encodeURIComponent(FILE)}`,
      `document=%2566ile%3A%2F%2F%2Fetc%2Fpasswd`,
    ]) {
      const r = await call(`/bot${LISTED}/sendDocument?chat_id=1&${q}`)
      expect(r.status, q).toBe(400)
    }
    expect(seen).toEqual([])
  })

  it('in a JSON body, plain, escaped, or nested in a JSON parameter', async () => {
    for (const body of [
      JSON.stringify({ chat_id: 1, document: FILE }),
      '{"chat_id":1,"document":"\\u0066ile:///etc/passwd"}',
      '{"chat_id":1,"document":"file:\\/\\/\\/etc\\/passwd"}',
      JSON.stringify({
        chat_id: 1,
        media: JSON.stringify([{ type: 'document', media: FILE }]),
      }),
    ]) {
      const r = await call(`/bot${LISTED}/sendMediaGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      expect(r.status, body).toBe(400)
    }
    expect(completed()).toEqual([])
  })

  it('in an urlencoded body', async () => {
    const r = await call(`/bot${LISTED}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ chat_id: '1', document: FILE }).toString(),
    })
    expect(r.status).toBe(400)
    expect(completed()).toEqual([])
  })

  it('in a text part of a multipart body -- and the server never gets that body whole', async () => {
    const B = 'b0undary'
    const body = multipart(B, [
      { head: 'content-disposition:form-data; name="chat_id"', body: '1' },
      { head: 'content-disposition:form-data; name="document"', body: FILE },
    ])
    const r = await raw(
      `/bot${LISTED}/sendDocument`,
      { 'content-type': `multipart/form-data; boundary=${B}` },
      body
    )
    expect(r.status).toBe(400)
    expect(completed()).toEqual([])
  })

  it('in a multipart part whose part type makes the server read it as urlencoded', async () => {
    const B = 'b0undary'
    const body = multipart(B, [
      {
        head: 'Content-Disposition: form-data; name="x"\r\nContent-Type: application/x-www-form-urlencoded',
        body: 'document=file%3A%2F%2F%2Fetc%2Fpasswd',
      },
    ])
    const r = await raw(
      `/bot${LISTED}/sendDocument`,
      { 'content-type': `multipart/form-data; boundary=${B}` },
      body
    )
    expect(r.status).toBe(400)
    expect(completed()).toEqual([])
  })

  it('behind a disposition key the proxy and the server would read differently', async () => {
    const B = 'b0undary'
    // A no-break space before `filename`: JavaScript's trim() drops it and
    // would call this part a FILE (unchecked); the server keeps it, ignores
    // the unknown key, and reads the part as a text value.
    const body = multipart(B, [
      {
        head: 'Content-Disposition: form-data; name="document"; \xa0filename="x"',
        body: FILE,
      },
    ])
    const r = await raw(
      `/bot${LISTED}/sendDocument`,
      { 'content-type': `multipart/form-data; boundary=${B}` },
      body
    )
    expect(r.status).toBe(400)
    expect(completed()).toEqual([])
  })
})

describe('ordinary traffic passes untouched', () => {
  it("undici's FormData with a file: every byte arrives", async () => {
    const bytes = Buffer.alloc(300_000, 7)
    // A file whose CONTENT happens to begin with file:/ is an upload, not a path.
    bytes.write('file:///not-a-path', 0)
    const form = new FormData()
    form.append('chat_id', '1')
    form.append('caption', 'Profile: File: [1] item')
    form.append('document', new Blob([bytes]), 'clip.mp4')
    const r = await call(`/bot${LISTED}/sendDocument`, {
      method: 'POST',
      body: form,
    })
    expect(r.status).toBe(200)
    const got = completed()
    expect(got).toHaveLength(1)
    const text = got[0].body.toString('latin1')
    expect(text).toContain('Profile: File: [1] item')
    expect(got[0].body.includes(bytes)).toBe(true)
  })

  it("Telegraf's multipart shape (lowercase header, no space after the colon, no trailing CRLF)", async () => {
    const B = 'a'.repeat(64)
    const body = multipart(
      B,
      [
        { head: 'content-disposition:form-data; name="chat_id"', body: '1' },
        {
          head: 'content-disposition:form-data; name="video"; filename="video.mp4"',
          body: Buffer.alloc(5000, 1),
        },
      ],
      ''
    )
    const r = await raw(
      `/bot${LISTED}/sendVideo`,
      { 'content-type': `multipart/form-data; boundary=${B}` },
      body
    )
    expect(r.status).toBe(200)
    expect(completed()[0].body.equals(body)).toBe(true)
  })

  it('a JSON message that merely mentions files', async () => {
    const r = await call(`/bot${LISTED}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: 1,
        text: '[Profile](https://t.me/x): see file: report.pdf, or http://a/file:/b',
      }),
    })
    expect(r.status).toBe(200)
    expect(completed()).toHaveLength(1)
  })

  it('a body the server would not read as arguments is refused, not forwarded', async () => {
    const r = await call(`/bot${LISTED}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'chat_id=1',
    })
    expect(r.status).toBe(415)
    expect(seen).toEqual([])
  })
})

describe('the parts of the check', () => {
  it('refersToLocalFile: where a value starts, under any escaping', () => {
    expect(refersToLocalFile('file:///x')).toBe(true)
    expect(refersToLocalFile('a=1&document=file:/x')).toBe(true)
    expect(refersToLocalFile('{"m":"\\u0066ile:/x"}')).toBe(true)
    expect(refersToLocalFile('%2522file%253A%252Fx')).toBe(true)
    expect(refersToLocalFile('Profile: yes')).toBe(false)
    expect(refersToLocalFile('see file: report')).toBe(false)
    expect(refersToLocalFile('[1] item')).toBe(false)
  })

  it('readPartHeaders: a file only by its filename key, anything odd refused', () => {
    expect(
      readPartHeaders('Content-Disposition: form-data; name="a"; filename="b"')
    ).toEqual({ isFile: true })
    expect(readPartHeaders('content-disposition:form-data; name="a"')).toEqual({
      isFile: false,
    })
    for (const bad of [
      'Content-Disposition: form-data; name="a"; filename*=UTF-8\'\'b',
      'Content-Disposition: form-data; name="a"\r\nContent-Disposition: form-data; name="b"; filename="c"',
      'Content-Disposition: form-data; name="a"\r\n folded',
      'Content-Disposition: form-data; foo; name="a"',
      'Content-Disposition: attachment; name="a"',
      'X-Other: 1\r\nContent-Disposition: form-data; name="a"',
    ]) {
      expect(typeof readPartHeaders(bad), bad).toBe('string')
    }
  })

  it('MultipartScanner: a delimiter split across chunks is still found', () => {
    const B = 'zz'
    const body = multipart(B, [
      {
        head: 'content-disposition:form-data; name="document"',
        body: 'file:/x',
      },
    ])
    const scanner = new MultipartScanner(B)
    let why: string | null = null
    for (const byte of body) {
      why = scanner.push(Buffer.from([byte])) || why
    }
    expect(why ?? scanner.end()).toContain('file:/')
  })

  it('MultipartScanner: no prologue, nothing after the end', () => {
    const B = 'zz'
    const good = multipart(B, [
      { head: 'content-disposition:form-data; name="a"', body: '1' },
    ])
    const s1 = new MultipartScanner(B)
    expect(s1.push(Buffer.concat([Buffer.from('junk\r\n'), good]))).toContain(
      'begin'
    )
    const s2 = new MultipartScanner(B)
    expect(s2.push(Buffer.concat([good, Buffer.from('more')]))).toContain(
      'after the closing'
    )
    const s3 = new MultipartScanner(B)
    expect(s3.push(good)).toBeNull()
    expect(s3.end()).toBeNull()
  })
})

describe('when the server is down', () => {
  it('502, so Telegraf retries instead of giving up', async () => {
    const dead = createApiProxy({
      upstream: 'http://127.0.0.1:1',
      allowed: () => new Set(['900000011']),
    })
    await new Promise<void>(r => dead.listen(0, '127.0.0.1', () => r()))
    const port = (dead.address() as AddressInfo).port
    const res = await fetch(`http://127.0.0.1:${port}/bot${LISTED}/getMe`)
    expect(res.status).toBe(502)
    await new Promise<void>(r => dead.close(() => r()))
  })
})
