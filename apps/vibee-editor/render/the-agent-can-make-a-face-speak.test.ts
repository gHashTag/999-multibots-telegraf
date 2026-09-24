/**
 * THE AGENT CAN MAKE A FACE SPEAK -- AND IS PAID ONCE FOR IT.
 *
 * 2026-09-24: the owner asked the agent for a reel that opens on the owner's
 * photo and then speaks in the owner's own voice. No agent tool did photo +
 * voice -> talking face, although the render's own lipsync route did, so the
 * agent assembled old clips and described a lipsync it never made.
 * `lipsync_generate` is the missing tool. What is pinned here:
 *
 *   the money arithmetic -- parts, rounding, lead silence -- as pure functions;
 *   the part ceiling agreeing with the route's, read from render-server.ts;
 *   both spellings of our shelf, and nothing else, accepted;
 *   the REAL handler against a recording pool and a recording fetch: a refusal
 *   moves no tokens and asks no route, a success is ONE charge for every
 *   second, and a failure gives back exactly what was taken.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./src/agent/media-extract', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/agent/media-extract')>()),
  // The voice file is "on the shelf": the reader hands the tool a path.
  withShelfFile: async (
    _url: string,
    _max: number,
    use: (p: string, n: number) => Promise<unknown>
  ) => use('/tmp/voice-source.mp4', 1),
}))

/** What the ffmpeg layer was asked; the planning functions stay real. */
const ff = vi.hoisted(() => ({
  seconds: 21.4,
  cuts: [] as { start: number; duration: number }[],
  joined: 0,
  voice: [] as { leadSilence: number; maxSeconds: number }[],
}))
vi.mock('./src/agent/lipsync-voice', async importOriginal => {
  const real =
    await importOriginal<typeof import('./src/agent/lipsync-voice')>()
  const { writeFile } = await import('node:fs/promises')
  return {
    ...real,
    voiceTrack: async (
      _in: string,
      out: string,
      opts: { leadSilence: number; maxSeconds: number }
    ) => {
      ff.voice.push(opts)
      await writeFile(out, 'wav')
    },
    probeSeconds: async () => ff.seconds,
    cutPart: async (
      _in: string,
      out: string,
      part: { start: number; duration: number }
    ) => {
      ff.cuts.push(part)
      await writeFile(out, 'part')
    },
    probeSize: async () => ({ width: 480, height: 864 }),
    joinParts: async (_in: string[], out: string) => {
      ff.joined += 1
      await writeFile(out, 'reel')
    },
  }
})

import {
  LIPSYNC_PART_TARGET_SECONDS,
  LIPSYNC_ROUTE_MAX_SECONDS,
  LIPSYNC_TOOL_MAX_SECONDS,
  billedSecondsOf,
  leadSilenceOf,
  shelfKeyOf,
  splitPlan,
} from './src/agent/lipsync-voice'
import { TOKEN_PRICES } from './src/agent/billing-shared'

/** Invented id (9000000xx): no real person in the repository. */
const CALLER = '900000047'
const BUCKET = 'https://bucket.test/vibee-assets'
const RENDER = 'https://render.test'

describe('the arithmetic of a voice cut into parts', () => {
  it('a 20-second reel with 1.5 s of lead silence is three equal parts', () => {
    const parts = splitPlan(21.4)
    expect(parts).toHaveLength(3)
    for (const p of parts) {
      expect(p.duration).toBeCloseTo(21.4 / 3, 6)
      expect(p.duration).toBeLessThanOrEqual(LIPSYNC_PART_TARGET_SECONDS)
    }
    // Back to back, no gap and no overlap.
    expect(parts[1].start).toBeCloseTo(parts[0].duration, 6)
    expect(parts[2].start + parts[2].duration).toBeCloseTo(21.4, 6)
  })

  it('a voice under the target is one part, and nothing is one part of nothing', () => {
    expect(splitPlan(7)).toEqual([{ start: 0, duration: 7 }])
    expect(splitPlan(0)).toEqual([])
    expect(splitPlan(Number.NaN)).toEqual([])
  })

  it('each part is billed the way the route bills one call: rounded up', () => {
    // 3 x 7.133 s -> 3 x 8, not ceil(21.4) = 22: three calls, three roundings.
    expect(billedSecondsOf(splitPlan(21.4))).toBe(24)
    expect(billedSecondsOf(splitPlan(7))).toBe(7)
    expect(billedSecondsOf(splitPlan(9.5))).toBe(10)
  })

  it('lead silence is clamped to 0..3 s and junk means none', () => {
    expect(leadSilenceOf(1.5)).toBe(1.5)
    expect(leadSilenceOf('2')).toBe(2)
    expect(leadSilenceOf(9)).toBe(3)
    for (const junk of [undefined, null, -1, 'abc', Number.NaN])
      expect(leadSilenceOf(junk), String(junk)).toBe(0)
  })

  it('the part ceiling is the route ceiling, and a planned part stays under it', () => {
    const server = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const m = server.match(/const MAX_LIPSYNC_SECONDS = (\d+)/)
    expect(
      m,
      'MAX_LIPSYNC_SECONDS not found in render-server.ts'
    ).not.toBeNull()
    expect(LIPSYNC_ROUTE_MAX_SECONDS).toBe(Number(m![1]))
    expect(LIPSYNC_PART_TARGET_SECONDS).toBeLessThan(LIPSYNC_ROUTE_MAX_SECONDS)
    // The longest voice the tool takes still plans into parts the route takes.
    for (const p of splitPlan(LIPSYNC_TOOL_MAX_SECONDS))
      expect(p.duration).toBeLessThanOrEqual(LIPSYNC_PART_TARGET_SECONDS)
  })
})

describe('our shelf, in either spelling, and nothing else', () => {
  beforeEach(() => {
    vi.stubEnv('S3_PUBLIC_URL', BUCKET)
    vi.stubEnv('PUBLIC_URL', RENDER)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('the proxy and the bucket name the same key', () => {
    expect(shelfKeyOf(`${RENDER}/s3/assets/a.png`)).toBe('assets/a.png')
    expect(shelfKeyOf(`${BUCKET}/assets/a.png?x=1`)).toBe('assets/a.png')
  })

  it('anybody else, or a walk out of the bucket, is not ours', () => {
    for (const other of [
      'https://evil.test/assets/a.png',
      `${BUCKET}/../secret`,
      `${BUCKET}/assets/./a.png`,
      '',
      'not a url',
    ])
      expect(shelfKeyOf(other), other).toBeNull()
  })
})

describe('the real handler', () => {
  /** Every SQL with its parameters; a wallet with 1000 tokens. */
  const recordingPool = () => {
    const sqls: { sql: string; params: unknown[] }[] = []
    return {
      sqls,
      query: async (sql: string, params: unknown[] = []) => {
        sqls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
        return {
          rows: [{ balance: 1000, n: 0, count: 0, id: 77 }],
          rowCount: 1,
        }
      },
    }
  }
  const debits = (sqls: { sql: string; params: unknown[] }[]) =>
    sqls
      .filter(q => /balance = balance - /i.test(q.sql))
      .map(q => Number(q.params[1]))
  const credits = (sqls: { sql: string; params: unknown[] }[]) =>
    sqls
      .filter(q => /balance = balance \+ /i.test(q.sql))
      .map(q => Number(q.params[1]))

  let calls: { url: string; body: unknown }[]
  let failPart: number | null
  beforeEach(() => {
    vi.stubEnv('S3_PUBLIC_URL', BUCKET)
    vi.stubEnv('PUBLIC_URL', RENDER)
    vi.stubEnv('SELF_URL', RENDER)
    vi.stubEnv('KIE_AI_API_KEY', 'test-kie')
    vi.stubEnv('HOUSE_TELEGRAM_IDS', '')
    ff.seconds = 21.4
    ff.cuts = []
    ff.joined = 0
    ff.voice = []
    calls = []
    failPart = null
    let routeCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: { body?: unknown }) => {
        const u = String(url)
        let body: unknown = null
        try {
          body = JSON.parse(String(init?.body ?? 'null'))
        } catch {
          body = null
        }
        calls.push({ url: u, body })
        const json = (status: number, data: unknown) => ({
          ok: status < 400,
          status,
          json: async () => data,
          text: async () => JSON.stringify(data),
          arrayBuffer: async () => new ArrayBuffer(8),
          headers: new Headers(),
        })
        if (u.endsWith('/upload'))
          return json(200, {
            success: true,
            directUrl: `${BUCKET}/assets/up.bin`,
          })
        if (u.endsWith('/api/generate/lipsync')) {
          routeCalls += 1
          if (failPart !== null && routeCalls === failPart)
            return json(500, { success: false, error: 'provider down' })
          return json(200, {
            success: true,
            url: `https://kie.test/part-${routeCalls}.mp4`,
            provider: 'kie/infinitalk/from-audio',
          })
        }
        return json(200, {})
      })
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const tool = async () => {
    const { TOOLS } = await import('./src/agent/tools')
    const t = TOOLS.find(x => x.name === 'lipsync_generate')
    expect(t, 'lipsync_generate is not in the registry').toBeDefined()
    return t!
  }
  const ask = async (args: Record<string, unknown>) => {
    const pool = recordingPool()
    const r = (await (
      await tool()
    ).handler(args, {
      telegramId: CALLER,
      pool,
    } as never)) as Record<string, unknown>
    return { r, pool }
  }

  it('a file that is not on our shelf: nothing charged, nothing asked', async () => {
    const { r, pool } = await ask({
      image_url: 'https://evil.test/face.png',
      voice_url: `${BUCKET}/assets/voice.mp4`,
    })
    expect(r.done).toBe(false)
    expect(debits(pool.sqls)).toEqual([])
    expect(calls).toEqual([])
    expect(ff.voice).toEqual([])
  })

  it('a 20-second voice: one charge for every second, three parts, one reel', async () => {
    const { r, pool } = await ask({
      image_url: `${BUCKET}/assets/glam.png`,
      voice_url: `${RENDER}/s3/assets/IMG_3522.mp4`,
      lead_silence_s: 1.5,
    })
    expect(r.done, JSON.stringify(r)).toBe(true)
    // One deduction, for 3 parts x 8 billed seconds at the per-second price.
    const price = TOKEN_PRICES.lipsync_generate
    expect(price).toBeGreaterThan(0)
    expect(debits(pool.sqls)).toEqual([24 * price])
    expect(credits(pool.sqls)).toEqual([])
    // The voice was prepared with the silence the owner asked for.
    expect(ff.voice).toEqual([
      { leadSilence: 1.5, maxSeconds: LIPSYNC_TOOL_MAX_SECONDS },
    ])
    // Three calls of the route, each with the face as a PUBLIC bucket URL.
    const routes = calls.filter(c => c.url.endsWith('/api/generate/lipsync'))
    expect(routes).toHaveLength(3)
    for (const c of routes)
      expect((c.body as { image_url: string }).image_url).toBe(
        `${BUCKET}/assets/glam.png`
      )
    expect(ff.cuts).toHaveLength(3)
    expect(ff.joined).toBe(1)
    expect(r.parts).toBe(3)
    expect(String(r.url)).toContain(BUCKET)
  })

  it('a short voice is one part and is not joined', async () => {
    ff.seconds = 6.2
    const { r, pool } = await ask({
      image_url: `${RENDER}/s3/assets/face.jpg`,
      voice_url: `${RENDER}/s3/assets/voice.ogg`,
    })
    expect(r.done, JSON.stringify(r)).toBe(true)
    expect(debits(pool.sqls)).toEqual([7 * TOKEN_PRICES.lipsync_generate])
    expect(ff.joined).toBe(0)
  })

  it('a part the provider refuses: everything taken is given back, once', async () => {
    failPart = 2
    const { r, pool } = await ask({
      image_url: `${BUCKET}/assets/glam.png`,
      voice_url: `${BUCKET}/assets/voice.mp4`,
      lead_silence_s: 1.5,
    })
    expect(r.done).toBe(false)
    expect(String(r.reason)).toMatch(/возвращены/) // cyrillic-ok: the refusal copy
    const taken = debits(pool.sqls)
    expect(taken).toEqual([24 * TOKEN_PRICES.lipsync_generate])
    expect(credits(pool.sqls)).toEqual(taken)
  })

  it('a voice longer than the tool takes is cut at its ceiling, not refused after paying', async () => {
    ff.seconds = LIPSYNC_TOOL_MAX_SECONDS
    const { r, pool } = await ask({
      image_url: `${BUCKET}/assets/glam.png`,
      voice_url: `${BUCKET}/assets/long.mp4`,
    })
    expect(r.done, JSON.stringify(r)).toBe(true)
    expect(ff.voice[0].maxSeconds).toBe(LIPSYNC_TOOL_MAX_SECONDS)
    expect(debits(pool.sqls)).toEqual([
      billedSecondsOf(splitPlan(LIPSYNC_TOOL_MAX_SECONDS)) *
        TOKEN_PRICES.lipsync_generate,
    ])
  })
})
