import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'

/**
 * THE BUCKET HALF OF THE SHELF: `s3Stat` and `s3OpenStream`.
 *
 * The `/s3/` route promises that a player seeking into a 100 MB video pulls
 * the slice it asked for, not the whole object, and that a missing key is a
 * 404 rather than a 502. Both promises are kept HERE, by what goes over the
 * wire to the bucket -- so the bucket below is a real HTTP server speaking
 * enough S3 for the real SDK, and it records every request it gets.
 */

const BUCKET = 'shelf-test-bucket'
function fixture(size: number, seed: number): Buffer {
  const out = Buffer.alloc(size)
  let x = seed >>> 0 || 1
  for (let i = 0; i < size; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    out[i] = x & 0xff
  }
  return out
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const ZIP = fixture(3 * 1024 * 1024 + 11, 3)
const OBJECTS: Record<string, Buffer> = { 'assets/1-archive.zip': ZIP }

const seen: Array<{ method: string; key: string; range?: string }> = []
let server: Server
let mod: typeof import('./s3-put')
const saved: Record<string, string | undefined> = {}
const ENV = {
  AWS_ENDPOINT_URL_S3: '',
  BUCKET_NAME: BUCKET,
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
  AWS_REGION: 'us-east-1',
  S3_FORCE_PATH_STYLE: 'true',
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://bucket')
    const prefix = `/${BUCKET}/`
    const key = u.pathname.startsWith(prefix)
      ? decodeURIComponent(u.pathname.slice(prefix.length))
      : ''
    const range = req.headers.range
    seen.push({ method: req.method ?? '', key, range })
    const obj = OBJECTS[key]
    if (!obj) {
      res.writeHead(404, { 'Content-Type': 'application/xml' })
      res.end(
        req.method === 'HEAD'
          ? undefined
          : '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>'
      )
      return
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/zip',
      ETag: '"abc123"',
      'Last-Modified': new Date(Date.UTC(2026, 8, 22)).toUTCString(),
      'Accept-Ranges': 'bytes',
    }
    const m = range ? /^bytes=(\d+)-(\d+)$/.exec(range) : null
    const body = m ? obj.subarray(Number(m[1]), Number(m[2]) + 1) : obj
    headers['Content-Length'] = String(body.length)
    if (m) headers['Content-Range'] = `bytes ${m[1]}-${m[2]}/${obj.length}`
    res.writeHead(m ? 206 : 200, headers)
    res.end(req.method === 'HEAD' ? undefined : body)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  ENV.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  // The module reads its endpoint and bucket once, at load.
  vi.resetModules()
  mod = await import('./s3-put')
})

afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await new Promise<void>(r => server.close(() => r()))
})

async function drain(s: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of s) chunks.push(Buffer.from(c as Uint8Array))
  return Buffer.concat(chunks)
}

describe('s3Stat', () => {
  it('answers the size and validators with a HEAD, and null for a missing key', async () => {
    seen.length = 0
    const st = await mod.s3Stat('assets/1-archive.zip')
    expect(st?.size).toBe(ZIP.length)
    expect(st?.etag).toBe('"abc123"')
    expect(st?.lastModified?.toISOString()).toBe('2026-09-22T00:00:00.000Z')
    expect(await mod.s3Stat('assets/none.zip')).toBeNull()
    expect(seen.map(s => s.method)).toEqual(['HEAD', 'HEAD'])
  })
})

describe('s3OpenStream', () => {
  it('a range goes to the bucket as a range: only that slice crosses the wire', async () => {
    seen.length = 0
    const got = await drain(
      await mod.s3OpenStream('assets/1-archive.zip', {
        start: 1_000_000,
        end: 1_065_535,
      })
    )
    expect(sha(got)).toBe(sha(ZIP.subarray(1_000_000, 1_065_536)))
    expect(seen).toEqual([
      {
        method: 'GET',
        key: 'assets/1-archive.zip',
        range: 'bytes=1000000-1065535',
      },
    ])
  })

  it('without a range it is the whole object, byte-identical', async () => {
    seen.length = 0
    const got = await drain(await mod.s3OpenStream('assets/1-archive.zip'))
    expect(sha(got)).toBe(sha(ZIP))
    expect(seen[0].range).toBeUndefined()
  })

  it('a missing key throws what isMissingObject recognises', async () => {
    const err = await mod.s3OpenStream('assets/none.zip').then(
      () => null,
      (e: unknown) => e
    )
    expect(err).not.toBeNull()
    expect(mod.isMissingObject(err)).toBe(true)
  })
})
