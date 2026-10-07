import { describe, expect, it, vi } from 'vitest'
import {
  OWNER_VOICE_REFUSED_REASON,
  VOICE_CLONE_LOCKED_REASON,
  makeVoiceCloneSpeakTool,
  speakWithBusyRetry,
  type VoiceCloneEnv,
  type VoiceCloneSpeakDeps,
} from './voice-clone-speak'

const OWNER = '111'
const KEEPER = '333'
const STRANGER = '222'
const OWNER_REF = 'https://fly.storage.tigris.dev/vibee-assets/owner/voice.ogg'
const OWNER_BYTES = Buffer.from('RIFF-the-owners-own-voice')
const KEEPER_BYTES = Buffer.from('RIFF-a-keepers-own-voice')
const WAV = Buffer.from('RIFF-wav-out')

/*
 * A shelf that serves the owner's one object under every spelling of its
 * address, the way the bucket and the render's /s3/ proxy really do: host
 * and scheme case do not matter, the bucket may be in the host, a doubled
 * slash collapses. Anything else is the keeper's own recording.
 */
function shelf(ref: string): Buffer {
  const path = ref
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+/g, '/')
  return /(^|\/|\.)owner\/voice\.ogg$/.test(path) ? OWNER_BYTES : KEEPER_BYTES
}

function deps(
  over: Partial<VoiceCloneSpeakDeps> = {},
  env?: Partial<VoiceCloneEnv>
) {
  const d = {
    env: () => ({
      url: 'http://voice-clone.test:8080',
      key: 'test-key',
      ownerRef: OWNER_REF,
      ...env,
    }),
    sample: vi.fn(async (ref: string) => ({
      ok: true as const,
      bytes: shelf(ref),
    })),
    put: vi.fn(async () => 'https://shelf.test/voice-clone-1.wav'),
    mayClone: (who: string) => who === OWNER || who === KEEPER,
    isOwner: (who: string) => who === OWNER,
    fetch: vi.fn(
      async () =>
        new Response(new Uint8Array(WAV), {
          status: 200,
          headers: { 'Content-Type': 'audio/wav', 'X-Seconds': '3.25' },
        })
    ),
    ...over,
  }
  return d
}

const ctx = (telegramId: string) => ({ telegramId }) as any

describe('voice_clone_speak: locked to the owner and keepers', () => {
  it('refuses a non-keeper before any fetch, with or without ref_url', async () => {
    const d = deps()
    const tool = makeVoiceCloneSpeakTool(d)
    for (const args of [
      { text: 'hello' },
      { text: 'hello', ref_url: 'https://example.com/me.ogg' },
      { text: 'hello', ref_url: OWNER_REF },
    ]) {
      const r: any = await tool.handler(args, ctx(STRANGER))
      expect(r).toEqual({ done: false, reason: VOICE_CLONE_LOCKED_REASON })
    }
    const anon: any = await tool.handler({ text: 'hello' }, ctx(''))
    expect(anon.reason).toBe(VOICE_CLONE_LOCKED_REASON)
    expect(d.sample).not.toHaveBeenCalled()
    expect(d.fetch).not.toHaveBeenCalled()
    expect(d.put).not.toHaveBeenCalled()
  })

  it('refuses with a clear reason when VOICE_CLONE_KEY is missing', async () => {
    const d = deps({}, { key: '' })
    const r: any = await makeVoiceCloneSpeakTool(d).handler(
      { text: 'hello' },
      ctx(OWNER)
    )
    expect(r.done).toBe(false)
    expect(r.reason).toMatch(/VOICE_CLONE_KEY/)
    expect(d.fetch).not.toHaveBeenCalled()
    expect(d.sample).not.toHaveBeenCalled()
  })

  it("a keeper may not speak in the owner's voice: no ref_url, or its own address", async () => {
    const d = deps()
    const tool = makeVoiceCloneSpeakTool(d)
    const bare: any = await tool.handler({ text: 'hello' }, ctx(KEEPER))
    expect(bare.done).toBe(false)
    expect(bare.reason).toMatch(/ref_url is required/)
    const borrowed: any = await tool.handler(
      { text: 'hello', ref_url: OWNER_REF },
      ctx(KEEPER)
    )
    expect(borrowed).toEqual({
      done: false,
      reason: OWNER_VOICE_REFUSED_REASON,
    })
    // The exact address is the cheap first pass: refused before a download.
    expect(d.sample).not.toHaveBeenCalled()
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it.each([
    [
      'uppercase host',
      'https://FLY.storage.tigris.dev/vibee-assets/owner/voice.ogg',
    ],
    [
      'uppercase scheme',
      'HTTPS://fly.storage.tigris.dev/vibee-assets/owner/voice.ogg',
    ],
    [
      'virtual-host bucket',
      'https://vibee-assets.fly.storage.tigris.dev/owner/voice.ogg',
    ],
    [
      'http on the render /s3/',
      'http://vibee-render-production.up.railway.app/s3/owner/voice.ogg',
    ],
    [
      'doubled slash /s3//',
      'https://vibee-render-production.up.railway.app/s3//owner/voice.ogg',
    ],
  ])(
    "refuses the owner's sample spelled another way (%s) by its content",
    async (_label, spelling) => {
      const d = deps()
      const r: any = await makeVoiceCloneSpeakTool(d).handler(
        { text: 'hello', ref_url: spelling },
        ctx(KEEPER)
      )
      expect(r).toEqual({ done: false, reason: OWNER_VOICE_REFUSED_REASON })
      expect(d.fetch).not.toHaveBeenCalled()
      expect(d.put).not.toHaveBeenCalled()
    }
  )

  it("a keeper's own sample passes; the owner's hash is fetched once and kept", async () => {
    const d = deps()
    const tool = makeVoiceCloneSpeakTool(d)
    for (let i = 0; i < 2; i++) {
      const r: any = await tool.handler(
        {
          text: 'hello',
          ref_url: 'https://example.com/keeper.ogg',
          lang: 'en',
        },
        ctx(KEEPER)
      )
      expect(r).toMatchObject({ done: true, seconds: 3.25 })
    }
    const asked = (d.sample as any).mock.calls.map((c: any[]) => c[0])
    expect(asked.filter((u: string) => u === OWNER_REF)).toHaveLength(1)
    expect(d.fetch).toHaveBeenCalledTimes(2)
    const body = JSON.parse((d.fetch as any).mock.calls[0][1].body)
    expect(body.ref_b64).toBe(KEEPER_BYTES.toString('base64'))
  })

  it("refuses a keeper when the owner's sample cannot be had, and asks again next time", async () => {
    let ownerUp = false
    const d = deps({
      sample: vi.fn(async (ref: string) =>
        ref === OWNER_REF && !ownerUp
          ? { ok: false as const, why: 'down' }
          : { ok: true as const, bytes: shelf(ref) }
      ),
    })
    const tool = makeVoiceCloneSpeakTool(d)
    const args = { text: 'hello', ref_url: 'https://example.com/keeper.ogg' }
    const first: any = await tool.handler(args, ctx(KEEPER))
    expect(first.done).toBe(false)
    expect(first.reason).toMatch(/could not check the sample/)
    expect(d.fetch).not.toHaveBeenCalled()
    ownerUp = true
    const second: any = await tool.handler(args, ctx(KEEPER))
    expect(second.done).toBe(true)
  })

  it('speaks in the owner voice for the owner: Bearer key, body shape, upload, {url, seconds}', async () => {
    const d = deps()
    const r: any = await makeVoiceCloneSpeakTool(d).handler(
      { text: '  Привет, это Тринити.  ' }, // cyrillic-ok: test speech
      ctx(OWNER)
    )
    expect(r).toEqual({
      done: true,
      url: 'https://shelf.test/voice-clone-1.wav',
      seconds: 3.25,
    })
    // The owner's own call never needs the owner's hash.
    expect(d.sample).toHaveBeenCalledTimes(1)
    expect(d.sample).toHaveBeenCalledWith(OWNER_REF, 8 * 1024 * 1024)
    expect(d.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (d.fetch as any).mock.calls[0]
    expect(url).toBe('http://voice-clone.test:8080/speak')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      input: 'Привет, это Тринити.', // cyrillic-ok: test speech
      lang: 'ru',
      ref_b64: OWNER_BYTES.toString('base64'),
    })
    expect(d.put).toHaveBeenCalledTimes(1)
    const [bytes, mime, name] = (d.put as any).mock.calls[0]
    expect(Buffer.compare(bytes, WAV)).toBe(0)
    expect(mime).toBe('audio/wav')
    expect(name).toMatch(/^voice-clone-\d+\.wav$/)
  })

  it('says busy on 503 with the Retry-After it was given, and stores nothing', async () => {
    const d = deps({
      fetch: vi.fn(
        async () =>
          new Response('{"error":"busy"}', {
            status: 503,
            headers: { 'Retry-After': '7' },
          })
      ),
    })
    const r: any = await makeVoiceCloneSpeakTool(d).handler(
      { text: 'hello', ref_url: 'https://example.com/keeper.ogg', lang: 'en' },
      ctx(KEEPER)
    )
    expect(r).toMatchObject({ done: false, busy: true, retry_after: 7 })
    expect(r.reason).toMatch(/busy/)
    expect(d.put).not.toHaveBeenCalled()
  })

  it('says busy on 429 too, with a default wait when no Retry-After came', async () => {
    const d = deps({
      fetch: vi.fn(async () => new Response('busy', { status: 429 })),
    })
    const r: any = await makeVoiceCloneSpeakTool(d).handler(
      { text: 'hello' },
      ctx(OWNER)
    )
    expect(r).toMatchObject({ done: false, busy: true, retry_after: 15 })
  })
})

describe('speakWithBusyRetry', () => {
  function clock() {
    let t = 0
    const waits: number[] = []
    return {
      waits,
      now: () => t,
      sleep: async (ms: number) => {
        waits.push(ms)
        t += ms
      },
    }
  }

  it('backs off (the longer of its step and Retry-After) until not busy', async () => {
    const c = clock()
    const answers = [
      { done: false, busy: true, retry_after: 1 },
      { done: false, busy: true, retry_after: 45 },
      { done: false, busy: true, retry_after: 1 },
      { done: true, url: 'u' },
    ]
    const attempt = vi.fn(async () => answers.shift())
    const out = await speakWithBusyRetry(attempt, {
      deadlineMs: 600_000,
      firstWaitMs: 10_000,
      maxWaitMs: 60_000,
      ...c,
    })
    expect(out).toEqual({ done: true, url: 'u' })
    expect(attempt).toHaveBeenCalledTimes(4)
    expect(c.waits).toEqual([10_000, 45_000, 40_000])
  })

  it('gives up at the overall deadline and says so', async () => {
    const c = clock()
    const attempt = vi.fn(async () => ({
      done: false,
      busy: true,
      retry_after: 1,
      reason: 'busy',
    }))
    const out = await speakWithBusyRetry(attempt, {
      deadlineMs: 60_000,
      firstWaitMs: 10_000,
      maxWaitMs: 60_000,
      ...c,
    })
    expect(out.busy).toBe(true)
    expect(out.reason).toMatch(/gave up after 60 s/)
    // 10 + 20 = 30 s waited; the next 40 s step would cross the deadline.
    expect(c.waits).toEqual([10_000, 20_000])
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('returns a refusal at once and turns a throw into one', async () => {
    const c = clock()
    const refused = await speakWithBusyRetry(
      async () => ({ done: false, reason: 'no' }),
      { deadlineMs: 60_000, firstWaitMs: 10_000, maxWaitMs: 60_000, ...c }
    )
    expect(refused).toEqual({ done: false, reason: 'no' })
    const thrown = await speakWithBusyRetry(
      async () => {
        throw new Error('boom')
      },
      { deadlineMs: 60_000, firstWaitMs: 10_000, maxWaitMs: 60_000, ...c }
    )
    expect(thrown.done).toBe(false)
    expect(thrown.reason).toMatch(/boom/)
    expect(c.waits).toEqual([])
  })
})
