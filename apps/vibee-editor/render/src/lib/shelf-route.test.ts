import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  serveShelfRequest,
  shelfContentType,
  parseByteRange,
  playsAsStored,
  createShelfVideo,
  ffprobeJson,
  ffmpegH264,
  ShelfMissing,
  type ShelfStore,
  type ShelfVideo,
  type ByteRange,
  type ProbeResult,
} from './shelf-route'

/**
 * THE SHELF SERVES WHAT WAS STORED -- measured through a real HTTP server.
 *
 * Production, 2026-09-22: a 46 322 402-byte mp4 came back from `/s3/` as
 * 16 009 894 bytes, a `.zip` answered 500 `{"error":"Failed to process
 * video"}`, and HEAD answered 404. Every test below asks the same question a
 * browser, a provider or Telegram asks: what bytes and which headers arrive
 * at the other end of a socket.
 *
 * "Large" is 4 MB, generated here, never committed: big enough that a
 * buffering implementation and a streaming one differ, small enough for a
 * laptop. The 40 MB case lives in the PR's measurements, not in the repo.
 */

/** Deterministic bytes: the same fixture every run, no RNG in the assertion. */
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

const LARGE = 4 * 1024 * 1024 + 123
const ZIP = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  fixture(LARGE, 7),
])
const PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  fixture(300_000, 11),
  Buffer.from('\n%%EOF\n'),
])
const MP4 = fixture(1_500_000, 23)

/**
 * The bucket double. It keeps the objects by key and PARSES what it is
 * asked: `open` cuts exactly the range it receives, an unknown key throws
 * like S3 does, and every call is recorded -- so a route that forgot to pass
 * the range, or that opened a body for HEAD, is caught by what the double
 * saw, not by what the route claims.
 */
function fakeStore(objects: Record<string, Buffer>) {
  const calls: Array<{ op: 'stat' | 'open'; key: string; range?: ByteRange }> =
    []
  const store: ShelfStore = {
    async stat(key) {
      calls.push({ op: 'stat', key })
      const b = objects[key]
      return b ? { size: b.length, etag: `"${sha(b).slice(0, 8)}"` } : null
    },
    async open(key, range) {
      calls.push({ op: 'open', key, range })
      const b = objects[key]
      if (!b) {
        const e = new Error('NoSuchKey')
        e.name = 'NoSuchKey'
        throw e
      }
      const slice = range ? b.subarray(range.start, range.end + 1) : b
      // Several chunks, like a real socket, not one convenient buffer.
      const chunks: Buffer[] = []
      for (let i = 0; i < slice.length; i += 64 * 1024)
        chunks.push(slice.subarray(i, i + 64 * 1024))
      return Readable.from(chunks)
    },
  }
  return { store, calls }
}

let server: Server
let base = ''
let current: { store: ShelfStore; video?: ShelfVideo } = {
  store: fakeStore({}).store,
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void serveShelfRequest(req, res, current)
  })
  // Longer than any pause in these tests, so a pooled socket never races
  // the server closing it.
  server.keepAliveTimeout = 60_000
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()))
})

async function get(path: string, init: RequestInit = {}) {
  const res = await fetch(base + path, init)
  const body = Buffer.from(await res.arrayBuffer())
  return { res, body }
}

describe('documents and everything else: the stored bytes, with the right type', () => {
  it('a 4 MB zip comes back byte-identical as application/zip -- not a 500 from ffmpeg', async () => {
    const { store } = fakeStore({ 'assets/1-archive.zip': ZIP })
    current = { store }
    const { res, body } = await get('/s3/assets/1-archive.zip')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-length')).toBe(String(ZIP.length))
    expect(body.length).toBe(ZIP.length)
    expect(sha(body)).toBe(sha(ZIP))
  })

  it('a pdf comes back byte-identical as application/pdf', async () => {
    const { store } = fakeStore({ 'assets/2-contract.pdf': PDF })
    current = { store }
    const { res, body } = await get('/s3/assets/2-contract.pdf')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(sha(body)).toBe(sha(PDF))
  })

  it('the video outlet is never consulted for a document, an unknown extension or no extension', async () => {
    const playable = vi.fn(async () => ({ kind: 'original' as const }))
    const { store } = fakeStore({
      'assets/3-a.zip': ZIP,
      'assets/4-blob.bin': PDF,
      'assets/5-noext': PDF,
    })
    current = { store, video: { playable } }
    const bin = await get('/s3/assets/4-blob.bin')
    const bare = await get('/s3/assets/5-noext')
    await get('/s3/assets/3-a.zip')
    expect(bin.res.headers.get('content-type')).toBe('application/octet-stream')
    expect(bare.res.headers.get('content-type')).toBe(
      'application/octet-stream'
    )
    expect(sha(bin.body)).toBe(sha(PDF))
    expect(sha(bare.body)).toBe(sha(PDF))
    expect(playable).not.toHaveBeenCalled()
  })

  it('the type table names each document by what it is', () => {
    const cases: Array<[string, string]> = [
      ['a/x.pdf', 'application/pdf'],
      ['a/x.zip', 'application/zip'],
      [
        'a/x.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      [
        'a/x.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      [
        'a/x.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      ['a/x.odt', 'application/vnd.oasis.opendocument.text'],
      ['a/x.rtf', 'application/rtf'],
      ['a/x.txt', 'text/plain; charset=utf-8'],
      ['a/x.md', 'text/markdown; charset=utf-8'],
      ['a/x.csv', 'text/csv; charset=utf-8'],
      ['a/x.json', 'application/json; charset=utf-8'],
      ['a/X.JPG', 'image/jpeg'],
      ['a/x.heic', 'image/heic'],
      ['a/x.ogg', 'audio/ogg'],
      ['a/x.webm', 'audio/webm'],
      ['a/x.mp4', 'video/mp4'],
      ['a/x.mov', 'video/quicktime'],
      ['a/x.tar.gz', 'application/gzip'],
      ['a/x.unknownext', 'application/octet-stream'],
      ['a/noext', 'application/octet-stream'],
      ['a/.hidden', 'application/octet-stream'],
    ]
    for (const [key, type] of cases)
      expect(shelfContentType(key), key).toBe(type)
  })

  it('every answer says nosniff; html and svg open only in a script-less sandbox', async () => {
    const page = Buffer.from('<script>parent.alert(1)</script>')
    const { store } = fakeStore({
      'assets/6-page.html': page,
      'assets/7-pic.svg': page,
      'assets/8-doc.pdf': PDF,
    })
    current = { store }
    const html = await get('/s3/assets/6-page.html')
    const svg = await get('/s3/assets/7-pic.svg')
    const pdf = await get('/s3/assets/8-doc.pdf')
    for (const r of [html, svg, pdf])
      expect(r.res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(html.res.headers.get('content-security-policy')).toMatch(
      /^sandbox\b/
    )
    expect(svg.res.headers.get('content-security-policy')).toMatch(/^sandbox\b/)
    // Chrome refuses to render a PDF in a sandboxed document: none here.
    expect(pdf.res.headers.get('content-security-policy')).toBeNull()
    expect(sha(html.body)).toBe(sha(page))
  })

  it('a key that is not on the shelf is a 404, not a 500', async () => {
    current = { store: fakeStore({}).store }
    const { res } = await get('/s3/assets/none.zip')
    expect(res.status).toBe(404)
  })

  it('an object deleted between the stat and the read is a 404, not a 502', async () => {
    const { store } = fakeStore({})
    current = {
      store: {
        // The stat still sees it; the GET that follows finds nothing.
        stat: async () => ({ size: PDF.length }),
        open: store.open,
      },
    }
    const { res } = await get('/s3/assets/gone-meanwhile.pdf')
    expect(res.status).toBe(404)
  })

  it('a malformed percent-escape is a 400, and a percent-encoded key is decoded once', async () => {
    const { store, calls } = fakeStore({ 'assets/9 my file.pdf': PDF })
    current = { store }
    expect((await get('/s3/assets/%E0%A4%A.pdf')).res.status).toBe(400)
    const ok = await get('/s3/assets/9%20my%20file.pdf')
    expect(ok.res.status).toBe(200)
    expect(calls.filter(c => c.op === 'stat').map(c => c.key)).toEqual([
      'assets/9 my file.pdf',
    ])
  })
})

describe('HEAD and Range', () => {
  it('HEAD answers 200 with the real length and opens no body', async () => {
    const { store, calls } = fakeStore({ 'assets/10-big.zip': ZIP })
    current = { store }
    const res = await fetch(`${base}/s3/assets/10-big.zip`, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe(String(ZIP.length))
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(calls.map(c => c.op)).toEqual(['stat'])
  })

  it('a Range asks the bucket for exactly that slice and answers 206', async () => {
    const { store, calls } = fakeStore({ 'assets/11-big.zip': ZIP })
    current = { store }
    const { res, body } = await get('/s3/assets/11-big.zip', {
      headers: { Range: 'bytes=1000000-1000999' },
    })
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe(
      `bytes 1000000-1000999/${ZIP.length}`
    )
    expect(res.headers.get('content-length')).toBe('1000')
    expect(sha(body)).toBe(sha(ZIP.subarray(1_000_000, 1_001_000)))
    expect(calls.find(c => c.op === 'open')?.range).toEqual({
      start: 1_000_000,
      end: 1_000_999,
    })
  })

  it('an open-ended and a suffix range, and a range past the end is 416', async () => {
    const { store } = fakeStore({ 'assets/12-doc.pdf': PDF })
    current = { store }
    const tail = await get('/s3/assets/12-doc.pdf', {
      headers: { Range: `bytes=${PDF.length - 10}-` },
    })
    expect(tail.res.status).toBe(206)
    expect(sha(tail.body)).toBe(sha(PDF.subarray(PDF.length - 10)))
    const suffix = await get('/s3/assets/12-doc.pdf', {
      headers: { Range: 'bytes=-7' },
    })
    expect(suffix.res.status).toBe(206)
    expect(suffix.body.toString()).toBe('\n%%EOF\n')
    const past = await get('/s3/assets/12-doc.pdf', {
      headers: { Range: `bytes=${PDF.length}-` },
    })
    expect(past.res.status).toBe(416)
    expect(past.res.headers.get('content-range')).toBe(`bytes */${PDF.length}`)
  })

  it('parseByteRange: what is ignored, what is clamped, what is refused', () => {
    expect(parseByteRange(undefined, 100)).toBeNull()
    expect(parseByteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
    expect(parseByteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
    expect(parseByteRange('bytes=-30', 100)).toEqual({ start: 70, end: 99 })
    expect(parseByteRange('bytes=-300', 100)).toEqual({ start: 0, end: 99 })
    expect(parseByteRange('bytes=100-', 100)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=-0', 100)).toBe('unsatisfiable')
    // Several ranges, garbage, first > last: served whole (RFC 9110 lets us).
    expect(parseByteRange('bytes=0-1,5-6', 100)).toBeNull()
    expect(parseByteRange('items=0-1', 100)).toBeNull()
    expect(parseByteRange('bytes=9-2', 100)).toBeNull()
  })
})

describe('streaming, not buffering', () => {
  it('the first bytes reach the client while the source is still producing', async () => {
    /*
     * A source that hands over its first chunk and then WAITS until the
     * client has seen it. A route that collected the body before answering
     * would wait forever for the rest, and this test would time out.
     */
    let release: () => void = () => undefined
    const gate = new Promise<void>(r => (release = r))
    const first = Buffer.alloc(256 * 1024, 1)
    const rest = Buffer.alloc(256 * 1024, 2)
    current = {
      store: {
        stat: async () => ({ size: first.length + rest.length }),
        open: async () =>
          Readable.from(
            (async function* () {
              yield first
              await gate
              yield rest
            })()
          ),
      },
    }
    const res = await fetch(`${base}/s3/assets/13-stream.zip`)
    const reader = res.body!.getReader()
    let seen = 0
    while (seen < first.length) {
      const { value, done } = await reader.read()
      if (done) break
      seen += value.length
    }
    expect(seen).toBeGreaterThanOrEqual(first.length)
    release()
    while (!(await reader.read()).done) {
      /* drain */
    }
  })
})

describe('video: the stored bytes on request, a playable copy only where needed', () => {
  it('?original=1 answers the stored video byte-identical and never asks the outlet', async () => {
    const playable = vi.fn(async () => ({
      kind: 'file' as const,
      path: '/nope',
    }))
    const { store } = fakeStore({ 'assets/14-clip.mp4': MP4 })
    current = { store, video: { playable } }
    const { res, body } = await get('/s3/assets/14-clip.mp4?original=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(sha(body)).toBe(sha(MP4))
    expect(playable).not.toHaveBeenCalled()
  })

  it('without ?original the outlet decides: its copy, or the stored bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shelf-route-test-'))
    try {
      const copy = join(dir, 'copy.mp4')
      const copyBytes = fixture(10_000, 99)
      writeFileSync(copy, copyBytes)
      const { store } = fakeStore({
        'assets/15-hevc.mov': MP4,
        'assets/16-h264.mp4': MP4,
      })
      current = {
        store,
        video: {
          playable: async key =>
            key.endsWith('.mov')
              ? { kind: 'file', path: copy }
              : { kind: 'original' },
        },
      }
      const hevc = await get('/s3/assets/15-hevc.mov', {
        headers: { Range: 'bytes=0-99' },
      })
      expect(hevc.res.status).toBe(206)
      expect(hevc.res.headers.get('content-type')).toBe('video/mp4')
      expect(hevc.res.headers.get('content-range')).toBe('bytes 0-99/10000')
      expect(sha(hevc.body)).toBe(sha(copyBytes.subarray(0, 100)))
      const h264 = await get('/s3/assets/16-h264.mp4')
      expect(sha(h264.body)).toBe(sha(MP4))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a video the outlet cannot find is a 404', async () => {
    current = {
      store: fakeStore({}).store,
      video: {
        playable: async key => {
          throw new ShelfMissing(key)
        },
      },
    }
    expect((await get('/s3/assets/17-gone.mp4')).res.status).toBe(404)
  })
})

/* ── the decision itself ─────────────────────────────────────────────────── */

const H264_MP4: ProbeResult = {
  format: {
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    tags: { major_brand: 'isom' },
  },
  streams: [
    { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
    { codec_type: 'audio', codec_name: 'aac' },
  ],
}
const withVideo = (over: Record<string, unknown>): ProbeResult => ({
  ...H264_MP4,
  streams: [{ ...H264_MP4.streams![0], ...over }, H264_MP4.streams![1]],
})

describe('playsAsStored: the browser is the bar', () => {
  it('H.264 8-bit 4:2:0 with AAC in an .mp4 plays as stored', () => {
    expect(playsAsStored('assets/a.mp4', H264_MP4)).toBe(true)
    expect(playsAsStored('assets/a.m4v', H264_MP4)).toBe(true)
    expect(
      playsAsStored('assets/a.mp4', {
        ...H264_MP4,
        streams: [H264_MP4.streams![0]],
      })
    ).toBe(true)
  })

  it('everything short of that keeps the H.264 copy', () => {
    const no: Array<[string, string, ProbeResult]> = [
      ['HEVC (the iPhone default)', 'a.mp4', withVideo({ codec_name: 'hevc' })],
      ['H.264 High 10', 'a.mp4', withVideo({ pix_fmt: 'yuv420p10le' })],
      [
        'a rotation flag',
        'a.mp4',
        withVideo({ side_data_list: [{ rotation: -90 }] }),
      ],
      [
        'an old-style rotate tag',
        'a.mp4',
        withVideo({ tags: { rotate: '90' } }),
      ],
      ['a .mov name', 'a.mov', H264_MP4],
      [
        'a QuickTime file named .mp4',
        'a.mp4',
        {
          ...H264_MP4,
          format: { ...H264_MP4.format, tags: { major_brand: 'qt  ' } },
        },
      ],
      [
        'opus sound',
        'a.mp4',
        {
          ...H264_MP4,
          streams: [
            H264_MP4.streams![0],
            { codec_type: 'audio', codec_name: 'opus' },
          ],
        },
      ],
      [
        'two pictures',
        'a.mp4',
        { ...H264_MP4, streams: [H264_MP4.streams![0], H264_MP4.streams![0]] },
      ],
      [
        'not an mp4 at all',
        'a.mp4',
        { ...H264_MP4, format: { format_name: 'matroska,webm' } },
      ],
    ]
    for (const [why, key, probe] of no)
      expect(playsAsStored(`assets/${key}`, probe), why).toBe(false)
  })
})

describe('createShelfVideo: probe once, copy once, never serve half a file', () => {
  function tools(verdict: 'h264' | 'hevc', over: Record<string, unknown> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'shelf-video-test-'))
    const counts = { download: 0, probe: 0, transcode: 0 }
    const clock = { t: 1_000_000 }
    return {
      dir,
      counts,
      clock,
      tools: {
        cacheDir: join(dir, 'cache'),
        now: () => clock.t,
        retryAfterMs: 60_000,
        download: async (_key: string, dest: string) => {
          counts.download++
          writeFileSync(dest, MP4)
          return 'ok' as const
        },
        probe: async () => {
          counts.probe++
          return verdict === 'h264'
            ? H264_MP4
            : withVideo({ codec_name: 'hevc' })
        },
        transcode: async (_src: string, dest: string) => {
          counts.transcode++
          await new Promise(r => setTimeout(r, 20))
          writeFileSync(dest, 'h264 copy')
        },
        ...over,
      },
    }
  }

  it('an H.264 mp4 is probed once and then served as stored without a download', async () => {
    const t = tools('h264')
    try {
      const video = createShelfVideo(t.tools)
      expect(await video.playable('assets/a.mp4')).toEqual({ kind: 'original' })
      expect(await video.playable('assets/a.mp4')).toEqual({ kind: 'original' })
      // A fresh outlet (a restarted process) reads the verdict off the disk.
      expect(await createShelfVideo(t.tools).playable('assets/a.mp4')).toEqual({
        kind: 'original',
      })
      expect(t.counts).toEqual({ download: 1, probe: 1, transcode: 0 })
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  it('HEVC is transcoded once, even when three ranged requests arrive together', async () => {
    const t = tools('hevc')
    try {
      const video = createShelfVideo(t.tools)
      const all = await Promise.all([
        video.playable('assets/b.mov'),
        video.playable('assets/b.mov'),
        video.playable('assets/b.mov'),
      ])
      for (const p of all) expect(p.kind).toBe('file')
      const path = (all[0] as { path: string }).path
      expect(readFileSync(path, 'utf8')).toBe('h264 copy')
      expect(await video.playable('assets/b.mov')).toEqual({
        kind: 'file',
        path,
      })
      expect(t.counts).toEqual({ download: 1, probe: 1, transcode: 1 })
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  it('a failed transcode serves the stored bytes, leaves no half file, and is retried next time', async () => {
    let fail = true
    const t = tools('hevc', {
      transcode: async (_src: string, dest: string) => {
        writeFileSync(dest, 'half')
        if (fail) throw new Error('ffmpeg exited 1')
        writeFileSync(dest, 'h264 copy')
      },
    })
    try {
      const video = createShelfVideo(t.tools)
      expect(await video.playable('assets/c.mov')).toEqual({ kind: 'original' })
      fail = false
      // Inside the backoff the key is left alone: no download, no ffmpeg.
      expect(await video.playable('assets/c.mov')).toEqual({ kind: 'original' })
      expect(t.counts.download).toBe(1)
      t.clock.t += 60_001
      const second = await video.playable('assets/c.mov')
      expect(second.kind).toBe('file')
      expect(readFileSync((second as { path: string }).path, 'utf8')).toBe(
        'h264 copy'
      )
      expect(t.counts.download).toBe(2)
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  it('a key that is not in the bucket throws ShelfMissing', async () => {
    const t = tools('h264', { download: async () => 'missing' as const })
    try {
      await expect(
        createShelfVideo(t.tools).playable('assets/d.mp4')
      ).rejects.toBeInstanceOf(ShelfMissing)
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  /* A verdict that cannot change for a key is written down; each request
   * below would otherwise pull the whole object again (a <video> sends
   * several ranged requests, a HEAD is one more). */

  async function fiveTimes(video: ShelfVideo, key: string) {
    for (let i = 0; i < 5; i++)
      expect(await video.playable(key)).toEqual({ kind: 'original' })
  }

  it('a video over the ceiling is known from a stat: five requests, no download, and a restart remembers it', async () => {
    let stats = 0
    const t = tools('hevc', {
      stat: async () => {
        stats++
        return { size: 2_000_000_000 }
      },
      maxBytes: 1024 * 1024 * 1024,
    })
    try {
      await fiveTimes(createShelfVideo(t.tools), 'assets/huge.mov')
      await fiveTimes(createShelfVideo(t.tools), 'assets/huge.mov')
      expect(t.counts).toEqual({ download: 0, probe: 0, transcode: 0 })
      expect(stats).toBe(1)
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  it('without a stat, a download that hits the ceiling is still remembered: one download for five requests', async () => {
    const t = tools('hevc', {
      download: async () => {
        t.counts.download++
        return 'too-big' as const
      },
    })
    try {
      await fiveTimes(createShelfVideo(t.tools), 'assets/huge2.mov')
      expect(t.counts.download).toBe(1)
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  it('a file ffprobe refuses is remembered: one download and one probe for five requests', async () => {
    const t = tools('hevc', {
      probe: async () => {
        t.counts.probe++
        return null
      },
    })
    try {
      await fiveTimes(createShelfVideo(t.tools), 'assets/broken.mp4')
      expect(t.counts).toEqual({ download: 1, probe: 1, transcode: 0 })
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  it('an ffprobe that did not run is no verdict: left alone for a while, then tried again', async () => {
    let broken = true
    const t = tools('hevc', {
      probe: async () => {
        t.counts.probe++
        if (broken)
          throw Object.assign(new Error('spawn ffprobe ENOENT'), {
            code: 'ENOENT',
          })
        return withVideo({ codec_name: 'hevc' })
      },
    })
    try {
      const video = createShelfVideo(t.tools)
      await fiveTimes(video, 'assets/e.mov')
      expect(t.counts).toEqual({ download: 1, probe: 1, transcode: 0 })
      broken = false
      t.clock.t += 60_001
      expect((await video.playable('assets/e.mov')).kind).toBe('file')
      expect(t.counts).toEqual({ download: 2, probe: 2, transcode: 1 })
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  it('a download that came up short is no verdict: nothing is probed or written down', async () => {
    const t = tools('hevc', {
      stat: async () => ({ size: MP4.length + 1 }),
      maxBytes: 1024 * 1024 * 1024,
      probe: async () => {
        t.counts.probe++
        return null
      },
    })
    try {
      const video = createShelfVideo(t.tools)
      expect(await video.playable('assets/f.mov')).toEqual({ kind: 'original' })
      expect(t.counts).toEqual({ download: 1, probe: 0, transcode: 0 })
      t.clock.t += 60_001
      await video.playable('assets/f.mov')
      expect(t.counts.download).toBe(2)
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })

  it('a stat that finds no object is ShelfMissing, before any download', async () => {
    const t = tools('h264', {
      stat: async () => null,
      maxBytes: 1024 * 1024 * 1024,
    })
    try {
      await expect(
        createShelfVideo(t.tools).playable('assets/g.mp4')
      ).rejects.toBeInstanceOf(ShelfMissing)
      expect(t.counts.download).toBe(0)
    } finally {
      rmSync(t.dir, { recursive: true, force: true })
    }
  })
})

/* ── with the real ffprobe and ffmpeg ────────────────────────────────────── */

const HAS_FFMPEG = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe('the real tools', () => {
  it.skipIf(!HAS_FFMPEG)(
    'ffprobeJson: a file it refuses is null (a verdict); an ffprobe that cannot run throws (not one)',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'shelf-probe-'))
      const path = process.env.PATH
      try {
        const junk = join(dir, 'junk.mp4')
        writeFileSync(junk, 'this is not a video')
        expect(await ffprobeJson(junk)).toBeNull()
        process.env.PATH = dir
        await expect(ffprobeJson(junk)).rejects.toMatchObject({
          code: 'ENOENT',
        })
      } finally {
        process.env.PATH = path
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!HAS_FFMPEG)(
    'an H.264 mp4 is served as stored; an HEVC one gets an 8-bit H.264 copy; ?original=1 gives the HEVC bytes',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'shelf-real-'))
      try {
        const h264 = join(dir, 'h264.mp4')
        const hevc = join(dir, 'hevc.mp4')
        const lavfi = [
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=64x64:rate=10',
          '-t',
          '1',
        ]
        /*
         * Made ASYNCHRONOUSLY: a synchronous ffmpeg blocks the event loop for
         * seconds, the keep-alive socket of the previous test goes stale
         * meanwhile, and the next fetch dies on ECONNRESET -- a flake about
         * the test's own clock, not about the shelf.
         */
        const run = promisify(execFile)
        await run('ffmpeg', [
          '-v',
          'error',
          ...lavfi,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-y',
          h264,
        ])
        await run('ffmpeg', [
          '-v',
          'error',
          ...lavfi,
          '-c:v',
          'libx265',
          '-pix_fmt',
          'yuv420p10le',
          '-x265-params',
          'log-level=error',
          '-tag:v',
          'hvc1',
          '-y',
          hevc,
        ])
        const objects: Record<string, Buffer> = {
          'assets/1-h264.mp4': readFileSync(h264),
          'assets/2-hevc.mp4': readFileSync(hevc),
        }
        const { store } = fakeStore(objects)
        current = {
          store,
          video: createShelfVideo({
            cacheDir: join(dir, 'cache'),
            download: async (key, dest) => {
              if (!objects[key]) return 'missing'
              copyFileSync(key.includes('h264') ? h264 : hevc, dest)
              return 'ok'
            },
            probe: ffprobeJson,
            transcode: ffmpegH264,
          }),
        }
        const plain = await get('/s3/assets/1-h264.mp4')
        expect(sha(plain.body)).toBe(sha(objects['assets/1-h264.mp4']))

        const copy = await get('/s3/assets/2-hevc.mp4')
        expect(copy.res.status).toBe(200)
        expect(sha(copy.body)).not.toBe(sha(objects['assets/2-hevc.mp4']))
        const served = join(dir, 'served.mp4')
        writeFileSync(served, copy.body)
        const probed = await ffprobeJson(served)
        const v = probed?.streams?.find(s => s.codec_type === 'video')
        expect(v?.codec_name).toBe('h264')
        // The 10-bit source must not come out as High 10: Chrome shows black.
        expect(v?.pix_fmt).toBe('yuv420p')

        const raw = await get('/s3/assets/2-hevc.mp4?original=1')
        expect(sha(raw.body)).toBe(sha(objects['assets/2-hevc.mp4']))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    60_000
  )

  it.skipIf(!HAS_FFMPEG)(
    'an odd-sized 4:4:4 clip still gets its copy: 8-bit 4:2:0 needs even sides, so the copy is cut to them',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'shelf-odd-'))
      try {
        const odd = join(dir, 'odd.mp4')
        const out = join(dir, 'out.mp4')
        await promisify(execFile)('ffmpeg', [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=321x241:rate=10',
          '-t',
          '1',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv444p',
          '-y',
          odd,
        ])
        // Without the even-sides scale libx264 refuses: "width not divisible
        // by 2 (321x241)", and the file would go out as a 4:4:4 original.
        await ffmpegH264(odd, out)
        const probed = await ffprobeJson(out)
        const v = probed?.streams?.find(s => s.codec_type === 'video')
        expect(v?.codec_name).toBe('h264')
        expect(v?.pix_fmt).toBe('yuv420p')
        expect([
          (v as { width?: number })?.width,
          (v as { height?: number })?.height,
        ]).toEqual([320, 240])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    60_000
  )
})
