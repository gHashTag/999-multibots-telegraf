import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADDRESS_REFUSED } from './web-guard'
import {
  REEL_ANALYZE_TOOLS,
  REEL_INPUT_ARGS,
  REEL_MAX_BYTES,
  analyzeReel,
  setReelExecForTests,
  type Exec,
} from './reel-analyze'

/**
 * reel_analyze downloads a url the MODEL chose, then hands the bytes to ffmpeg.
 * Two doors, and each is asserted here as the attack rather than the rule:
 *
 *  1. our socket: every hop of the chain passes web-guard, the body is capped
 *     by counting bytes, not by believing Content-Length;
 *  2. ffmpeg's socket: ffmpeg opens URLs itself (http, file, an HLS playlist
 *     dressed as an mp4), so it only ever sees the local temp file, and is
 *     told to open nothing else.
 */

// Vision and whisper are switched on so every ffmpeg call of the tool runs;
// neither reaches a network, because the frames and the mp3 never exist.
vi.mock('./media-vision', async importOriginal => ({
  ...(await importOriginal<typeof import('./media-vision')>()),
  visionConfig: () => ({
    base: 'https://vision.invalid',
    key: 'k',
    model: 'm',
  }),
  askVision: async () => 'FULL a face',
}))
vi.mock('./media-library', async importOriginal => ({
  ...(await importOriginal<typeof import('./media-library')>()),
  whisperConfig: () => ({
    base: 'https://whisper.invalid',
    key: 'k',
    model: 'm',
  }),
  whisperBytes: async () => 'words',
}))

const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }]
const PRIVATE_LOOKUP = async () => [{ address: '10.0.0.7', family: 4 }]

type Call = { url: string; init: RequestInit | undefined }
let calls: Call[] = []
let execCalls: { bin: string; args: string[] }[] = []
let prevExec: Exec

const PROBE_JSON = JSON.stringify({
  streams: [{ r_frame_rate: '30/1' }],
  format: { duration: '2.0' },
})

beforeEach(() => {
  calls = []
  execCalls = []
  prevExec = setReelExecForTests(async (bin, args) => {
    execCalls.push({ bin, args })
    if (bin === 'ffprobe') return { stdout: PROBE_JSON, stderr: '' }
    return { stdout: '', stderr: 'pts_time:1.0' }
  })
})

afterEach(() => {
  setReelExecForTests(prevExec)
})

/** A fetch that answers by url, and remembers every url it was asked for. */
function fakeFetch(answer: (url: string, n: number) => Response): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input instanceof URL ? input.href : input)
    calls.push({ url, init })
    return answer(url, calls.length)
  }) as typeof fetch
}

const mp4 = (bytes = 64, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes).fill(7), {
    status: 200,
    headers: { 'content-type': 'video/mp4', ...headers },
  })

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location } })

/** A body that never ends, sent under a Content-Length that says it is tiny. */
function endlessBody(declared: string): Response {
  const chunk = new Uint8Array(16 * 1024).fill(1)
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(chunk)
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'video/mp4', 'content-length': declared },
  })
}

describe('reel_analyze: the url is refused before any socket opens', () => {
  for (const url of [
    'http://127.0.0.1/reel.mp4',
    'http://10.1.2.3/reel.mp4',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/reel.mp4',
    'http://vibee-render.railway.internal/reel.mp4',
  ]) {
    it(`refuses ${url}`, async () => {
      const fetchImpl = fakeFetch(() => mp4())
      const r = await analyzeReel(url, {
        fetchImpl,
        lookupImpl: PUBLIC_LOOKUP,
      })
      expect(r.ok).toBe(false)
      // One fixed sentence: no status, nothing about which address is alive.
      expect(r.why).toBe(ADDRESS_REFUSED)
      expect(calls).toEqual([])
      expect(execCalls).toEqual([])
    })
  }

  it('refuses file:// in the analyser itself, not only in the tool handler', async () => {
    const fetchImpl = fakeFetch(() => mp4())
    const r = await analyzeReel('file:///etc/passwd', { fetchImpl })
    expect(r.ok).toBe(false)
    expect(calls).toEqual([])
    expect(execCalls).toEqual([])
  })

  it('the tool refuses file:// too', async () => {
    const tool = REEL_ANALYZE_TOOLS.find(t => t.name === 'reel_analyze')!
    const r = (await tool.handler(
      { url: 'file:///etc/passwd' },
      {} as never
    )) as {
      ok: boolean
    }
    expect(r.ok).toBe(false)
    expect(execCalls).toEqual([])
  })

  it('refuses a public-looking name that resolves to a private address', async () => {
    const fetchImpl = fakeFetch(() => mp4())
    const r = await analyzeReel('https://reels.example.com/a.mp4', {
      fetchImpl,
      lookupImpl: PRIVATE_LOOKUP,
    })
    expect(r).toMatchObject({ ok: false, why: ADDRESS_REFUSED })
    expect(calls).toEqual([])
  })
})

describe('reel_analyze: every redirect hop passes the guard', () => {
  for (const internal of [
    'http://169.254.169.254/latest/meta-data/iam/',
    'http://127.0.0.1:8080/admin',
    'http://postgres.railway.internal/',
    'file:///etc/passwd',
  ]) {
    it(`a public page that 302s to ${internal} is refused`, async () => {
      const fetchImpl = fakeFetch(() => redirect(internal))
      const r = await analyzeReel('https://reels.example.com/a.mp4', {
        fetchImpl,
        lookupImpl: PUBLIC_LOOKUP,
      })
      expect(r.ok).toBe(false)
      expect(String(r.why)).not.toMatch(/HTTP|30\d/)
      // The first hop was asked once, by hand; the internal target never.
      expect(calls.map(c => c.url)).toEqual(['https://reels.example.com/a.mp4'])
      expect(calls[0].init?.redirect).toBe('manual')
      expect(execCalls).toEqual([])
    })
  }

  it('downloads the FINAL url of a public chain, never following on its own', async () => {
    const fetchImpl = fakeFetch(url =>
      url.endsWith('/a.mp4') ? redirect('https://cdn.example.com/b.mp4') : mp4()
    )
    const r = await analyzeReel('https://reels.example.com/a.mp4', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(r.ok).toBe(true)
    const download = calls.at(-1)!
    expect(download.url).toBe('https://cdn.example.com/b.mp4')
    expect(download.init?.redirect).toBe('error')
  })

  it('a host that answers 200 to the probe and 302 to the download is refused', async () => {
    // The probe and the download are two requests; a server can tell them
    // apart. The second one must not follow anything either.
    const fetchImpl = fakeFetch((_url, n) =>
      n === 1 ? mp4() : redirect('http://169.254.169.254/latest/meta-data/')
    )
    const r = await analyzeReel('https://reels.example.com/a.mp4', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(r.ok).toBe(false)
    expect(calls.map(c => c.url)).not.toContain(
      'http://169.254.169.254/latest/meta-data/'
    )
    expect(execCalls).toEqual([])
  })
})

describe('reel_analyze: the download is capped by counting, not by believing', () => {
  it('one named cap: a reel is phone video, not a disk', () => {
    expect(REEL_MAX_BYTES).toBe(100 * 1024 * 1024)
  })

  it('a declared size over the cap is refused before the body is read', async () => {
    const fetchImpl = fakeFetch(() =>
      mp4(64, { 'content-length': String(REEL_MAX_BYTES + 1) })
    )
    const r = await analyzeReel('https://reels.example.com/a.mp4', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(r).toMatchObject({ ok: false, why: 'could not download the video' })
    expect(execCalls).toEqual([])
  })

  it('an endless body under a lying Content-Length stops at the cap', async () => {
    const fetchImpl = fakeFetch((_url, n) =>
      n === 1 ? mp4() : endlessBody('1000')
    )
    const r = await analyzeReel('https://reels.example.com/a.mp4', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
      maxBytes: 256 * 1024,
    })
    expect(r).toMatchObject({ ok: false, why: 'could not download the video' })
    expect(execCalls).toEqual([])
  })
})

describe('reel_analyze: ffmpeg never sees a url', () => {
  it('ffprobe and every ffmpeg call get only the local temp file, and may open nothing else', async () => {
    const fetchImpl = fakeFetch(() => mp4())
    const r = await analyzeReel('https://reels.example.com/a.mp4', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(r.ok).toBe(true)
    const bins = execCalls.map(c => c.bin)
    expect(bins).toContain('ffprobe')
    // scene cuts, one frame per shot, the voice
    expect(bins.filter(b => b === 'ffmpeg').length).toBeGreaterThanOrEqual(3)

    const tmp = os.tmpdir()
    for (const { args } of execCalls) {
      for (const a of args) {
        expect(a).not.toMatch(/^[a-z][a-z0-9+.-]*:\/\//i)
        expect(a).not.toContain('example.com')
      }
      // The input is the downloaded file, inside our own temp dir.
      const input =
        args.indexOf('-i') >= 0 ? args[args.indexOf('-i') + 1] : args.at(-1)!
      expect(path.isAbsolute(input)).toBe(true)
      expect(input.startsWith(tmp)).toBe(true)
      // A downloaded "mp4" can be an HLS playlist naming internal URLs or
      // file:///etc/passwd; ffmpeg would open them itself. The input options
      // that forbid it come before the input.
      const at = args.indexOf(input)
      const before = args.slice(0, at).join(' ')
      expect(before).toContain(REEL_INPUT_ARGS.join(' '))
    }
    expect(REEL_INPUT_ARGS).toEqual([
      '-protocol_whitelist',
      'file',
      '-format_whitelist',
      'mov,matroska',
    ])
  })
})
