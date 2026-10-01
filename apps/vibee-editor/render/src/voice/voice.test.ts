/**
 * VOICE MODE, the server half: what must hold.
 *
 *   1. the language picks the engine -- Piper for Russian, Kokoro for English
 *      -- and a voice nobody offered falls back to the default, never reaches
 *      the engine as typed;
 *   2. markdown, links and emoji are not read aloud;
 *   3. a hosted whisper (Groq/OpenAI) is not mistaken for a free voice engine;
 *   4. the request that reaches speaches is the OpenAI shape it expects;
 *   5. one person cannot spend the shared CPU without bound;
 *   6. the transcriber is told the language when the caller knows it, and
 *      only a language it was offered;
 *   7. warming loads the models through speaches' own admin door, treats
 *      "already loaded" as success, never warms a hosted whisper, never throws;
 *   8. Russian goes to GigaAM first when it is configured, anything that goes
 *      wrong there falls back to whisper, and nothing else is routed to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SPEAK_CHARS,
  EARS_TIMEOUT_MS,
  hear,
  mouthTimeoutMs,
  pickVoice,
  resetVoiceBudgetForTests,
  speak,
  speakable,
  spokenLanguage,
  ttsConfig,
  voiceStatus,
  warm,
  withinBudget,
} from './voice'

const saved = { ...process.env }
beforeEach(() => {
  delete process.env.TTS_BASE_URL
  delete process.env.TTS_API_KEY
  delete process.env.VOICE_HEAR_RU_URL
  delete process.env.VOICE_HEAR_RU_KEY
  delete process.env.VOICE_HEAR_EN_URL
  delete process.env.VOICE_HEAR_EN_KEY
  delete process.env.VOICE_SPEAK_URL
  delete process.env.VOICE_SPEAK_KEY
  process.env.WHISPER_BASE_URL = 'http://whisper.railway.internal:8000/v1'
  process.env.WHISPER_API_KEY = 'k'
  resetVoiceBudgetForTests()
})
afterEach(() => {
  process.env = { ...saved }
  vi.unstubAllGlobals()
})

describe('pickVoice', () => {
  it('speaks Russian with Piper and English with Kokoro', () => {
    expect(pickVoice('ru', 'dmitri')).toEqual({
      model: 'speaches-ai/piper-ru_RU-dmitri-medium',
      voice: 'dmitri',
    })
    expect(pickVoice('en', 'am_michael')).toEqual({
      model: 'speaches-ai/Kokoro-82M-v1.0-ONNX',
      voice: 'am_michael',
    })
  })

  it('never passes an unknown voice through', () => {
    expect(pickVoice('ru', '../../etc').voice).toBe('irina')
    expect(pickVoice('en', 'irina').voice).toBe('af_heart')
    expect(pickVoice(undefined, undefined).voice).toBe('irina')
  })
})

describe('speakable', () => {
  it('drops markup, links and emoji', () => {
    expect(
      speakable(
        '**Готово!** 🎉 Смотри [тут](https://x.y/z) и `код` https://a.b'
      )
    ).toBe('Готово! Смотри тут и код')
  })

  it('caps the length', () => {
    expect(speakable('а'.repeat(5000)).length).toBe(MAX_SPEAK_CHARS)
  })
})

describe('ttsConfig', () => {
  it('uses our own speaches by default', () => {
    expect(ttsConfig()?.base).toBe('http://whisper.railway.internal:8000/v1')
  })

  it('refuses a hosted whisper as a voice engine', () => {
    process.env.WHISPER_BASE_URL = 'https://api.groq.com/openai/v1'
    expect(ttsConfig()).toBeNull()
    process.env.WHISPER_BASE_URL = 'https://api.openai.com/v1'
    expect(ttsConfig()).toBeNull()
  })

  it('an explicit TTS_BASE_URL wins', () => {
    process.env.WHISPER_BASE_URL = 'https://api.groq.com/openai/v1'
    process.env.TTS_BASE_URL = 'http://tts.internal/v1/'
    expect(ttsConfig()?.base).toBe('http://tts.internal/v1')
  })
})

describe('speak', () => {
  it('sends the OpenAI speech shape and returns mp3', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }) as unknown as typeof fetch
    const out = await speak(
      { text: 'Привет **мир**', lang: 'ru', voice: 'denis' },
      fake
    )
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.audio.length).toBe(3)
    expect(seen!.url).toBe(
      'http://whisper.railway.internal:8000/v1/audio/speech'
    )
    expect(JSON.parse(String(seen!.init.body))).toEqual({
      model: 'speaches-ai/piper-ru_RU-denis-medium',
      voice: 'denis',
      input: 'Привет мир',
      response_format: 'mp3',
    })
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer k'
    )
  })

  it('says nothing for nothing, and reports an engine failure as 502', async () => {
    let calls = 0
    const fake = (async () => {
      calls++
      return new Response('boom', { status: 500 })
    }) as unknown as typeof fetch
    expect(await speak({ text: '🎉 **' }, fake)).toMatchObject({
      ok: false,
      status: 400,
    })
    expect(calls).toBe(0)
    expect(await speak({ text: 'hi', lang: 'en' }, fake)).toMatchObject({
      ok: false,
      status: 502,
    })
    expect(calls).toBe(1)
  })
})

describe('the mouth (own Kokoro/Piper pool)', () => {
  const mp3 = () => new Response(new Uint8Array([7, 7]), { status: 200 })
  const set = () => {
    process.env.VOICE_SPEAK_URL = 'http://mouth.railway.internal:8080/'
    process.env.VOICE_SPEAK_KEY = 'mk'
  }

  it('speaks through the mouth first, with its key, lang and voice', async () => {
    set()
    const urls: string[] = []
    let seen: RequestInit | null = null
    const fake = (async (url: string, init: RequestInit) => {
      urls.push(url)
      seen = init
      return mp3()
    }) as unknown as typeof fetch
    const out = await speak(
      { text: 'Hello **there**', lang: 'en', voice: 'bm_george' },
      fake
    )
    expect(out).toMatchObject({ ok: true, engine: 'mouth' })
    expect(urls).toEqual(['http://mouth.railway.internal:8080/speak'])
    expect(JSON.parse(String(seen!.body))).toEqual({
      input: 'Hello there',
      lang: 'en',
      voice: 'bm_george',
    })
    expect((seen!.headers as Record<string, string>).authorization).toBe(
      'Bearer mk'
    )
    expect(voiceStatus().speakVia).toBe('mouth')
  })

  it('falls back to speaches when the mouth refuses, fails or is silent', async () => {
    set()
    for (const broken of [
      () => new Response('no', { status: 500 }),
      () => {
        throw new Error('ECONNREFUSED')
      },
      () => new Response(new Uint8Array(0), { status: 200 }),
    ]) {
      const urls: string[] = []
      const fake = (async (url: string) => {
        urls.push(url)
        return url.includes('mouth') ? broken() : mp3()
      }) as unknown as typeof fetch
      const out = await speak({ text: 'Привет', lang: 'ru' }, fake)
      expect(out).toMatchObject({ ok: true, engine: 'speaches' })
      expect(urls).toEqual([
        'http://mouth.railway.internal:8080/speak',
        'http://whisper.railway.internal:8000/v1/audio/speech',
      ])
    }
  })

  it('gives up on a hung mouth within its budget and asks speaches', async () => {
    set()
    vi.useFakeTimers()
    try {
      const fake = (async (url: string, init: RequestInit) => {
        if (!url.includes('mouth')) return mp3()
        return new Promise((_, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(new Error('aborted'))
          )
        )
      }) as unknown as typeof fetch
      const pending = speak({ text: 'Hi', lang: 'en' }, fake)
      await vi.advanceTimersByTimeAsync(mouthTimeoutMs(2) - 1)
      let done = false
      void pending.then(() => (done = true))
      await vi.advanceTimersByTimeAsync(0)
      expect(done).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await pending).toMatchObject({ ok: true, engine: 'speaches' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('without its URL and key, only speaches is asked', async () => {
    process.env.VOICE_SPEAK_URL = 'http://mouth.railway.internal:8080'
    const urls: string[] = []
    const fake = (async (url: string) => {
      urls.push(url)
      return mp3()
    }) as unknown as typeof fetch
    expect(await speak({ text: 'Hi', lang: 'en' }, fake)).toMatchObject({
      engine: 'speaches',
    })
    expect(urls).toEqual([
      'http://whisper.railway.internal:8000/v1/audio/speech',
    ])
    expect(voiceStatus().speakVia).toBe('speaches')
  })

  it('a mouth alone still speaks, and its failure is a 502', async () => {
    set()
    delete process.env.WHISPER_BASE_URL
    delete process.env.TTS_BASE_URL
    const ok = (async () => mp3()) as unknown as typeof fetch
    expect(await speak({ text: 'Hi' }, ok)).toMatchObject({
      ok: true,
      engine: 'mouth',
    })
    const bad = (async () =>
      new Response('x', { status: 500 })) as unknown as typeof fetch
    expect(await speak({ text: 'Hi' }, bad)).toMatchObject({
      ok: false,
      status: 502,
    })
  })

  it('grows the budget with the text', () => {
    expect(mouthTimeoutMs(600)).toBeGreaterThan(mouthTimeoutMs(20))
    expect(mouthTimeoutMs(20)).toBeGreaterThanOrEqual(3_000)
  })
})

describe('withinBudget', () => {
  it('stops one person at the limit and leaves another alone', () => {
    const t = 1_000_000
    let allowed = 0
    for (let i = 0; i < 40; i++) if (withinBudget('a', 'hear', t)) allowed++
    expect(allowed).toBe(30)
    expect(withinBudget('b', 'hear', t)).toBe(true)
    expect(withinBudget('a', 'hear', t + 61_000)).toBe(true)
  })
})

describe('hear', () => {
  it('names the language when told one, and only ru or en', async () => {
    process.env.WHISPER_MODEL = 'deepdml/faster-whisper-large-v3-turbo-ct2'
    const sent: Array<string | null> = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push((init.body as FormData).get('language') as string | null)
      return new Response(JSON.stringify({ text: ' привет ' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const audio = Buffer.from([1, 2, 3])
    // whisperBytes may knock twice (streamed, then plain); every knock counts.
    expect(await hear(audio, 'audio/webm;codecs=opus', 'ru')).toEqual({
      text: 'привет',
      engine: 'whisper',
    })
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every(l => l === 'ru')).toBe(true)
    sent.length = 0
    expect((await hear(audio, 'audio/webm', 'de'))?.text).toBe('привет')
    expect((await hear(audio, 'audio/webm'))?.text).toBe('привет')
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every(l => l === null)).toBe(true)
  })

  describe('Russian ears (GigaAM)', () => {
    const audio = Buffer.from([1, 2, 3])
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    // Records every knock: which door, and with what key.
    function ears(gigaam: () => Response | Promise<Response>) {
      const doors: string[] = []
      const keys: Array<string | null> = []
      vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
        if (url.includes('gigaam')) {
          doors.push('gigaam')
          keys.push(new Headers(init.headers).get('authorization'))
          return gigaam()
        }
        doors.push('whisper')
        return json({ text: ' от whisper ' })
      })
      return { doors, keys }
    }
    beforeEach(() => {
      process.env.VOICE_HEAR_RU_URL = 'http://gigaam.railway.internal:8080/'
      process.env.VOICE_HEAR_RU_KEY = 'gk'
    })

    it('hears Russian through GigaAM alone, with its key', async () => {
      const { doors, keys } = ears(() => json({ text: ' привет ', ms: 90 }))
      expect(await hear(audio, 'audio/webm', 'ru')).toEqual({
        text: 'привет',
        engine: 'gigaam',
      })
      expect(doors).toEqual(['gigaam'])
      expect(keys).toEqual(['Bearer gk'])
    })

    it('trusts an empty GigaAM answer instead of asking whisper', async () => {
      const { doors } = ears(() => json({ text: '' }))
      expect(await hear(audio, 'audio/webm', 'ru')).toEqual({
        text: '',
        engine: 'gigaam',
      })
      expect(doors).toEqual(['gigaam'])
    })

    it.each([
      ['refused', () => json({ error: 'too long' }, 413)],
      // A failing door's empty text is not silence.
      ['failing', () => json({ text: '' }, 503)],
      ['answered nonsense', () => json({ words: 'x' })],
      [
        'unreachable',
        () => {
          throw new Error('ECONNREFUSED')
        },
      ],
    ])('falls back to whisper when GigaAM is %s', async (_why, gigaam) => {
      const { doors } = ears(gigaam)
      const heard = await hear(audio, 'audio/webm', 'ru')
      expect(heard).toEqual({ text: 'от whisper', engine: 'whisper' })
      expect(doors[0]).toBe('gigaam')
      expect(doors.slice(1).every(d => d === 'whisper')).toBe(true)
      expect(doors.length).toBeGreaterThan(1)
    })

    it('falls back to whisper when GigaAM is slow', async () => {
      vi.useFakeTimers()
      try {
        const doors: string[] = []
        // GigaAM never answers; only the abort signal can end its knock.
        vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
          if (!url.includes('gigaam')) {
            doors.push('whisper')
            return Promise.resolve(json({ text: 'от whisper' }))
          }
          doors.push('gigaam')
          return new Promise<Response>((_, reject) =>
            init.signal?.addEventListener('abort', () =>
              reject(new Error('aborted'))
            )
          )
        })
        const heard = hear(audio, 'audio/webm', 'ru')
        await vi.advanceTimersByTimeAsync(EARS_TIMEOUT_MS + 1)
        expect(await heard).toEqual({ text: 'от whisper', engine: 'whisper' })
        expect(doors[0]).toBe('gigaam')
      } finally {
        vi.useRealTimers()
      }
    })

    it('never sends English or an unknown language to GigaAM', async () => {
      const { doors } = ears(() => json({ text: 'не должно' }))
      expect((await hear(audio, 'audio/webm', 'en'))?.engine).toBe('whisper')
      expect((await hear(audio, 'audio/webm'))?.engine).toBe('whisper')
      expect((await hear(audio, 'audio/webm', 'RU'))?.engine).toBe('whisper')
      expect(doors.includes('gigaam')).toBe(false)
    })

    it('is not used without its key', async () => {
      delete process.env.VOICE_HEAR_RU_KEY
      const { doors } = ears(() => json({ text: 'не должно' }))
      expect((await hear(audio, 'audio/webm', 'ru'))?.engine).toBe('whisper')
      expect(doors.includes('gigaam')).toBe(false)
    })
  })

  describe('English ears (Parakeet)', () => {
    const audio = Buffer.from([1, 2, 3])
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    /** Each door is told apart by its host; whisper answers everything else. */
    function doors(parakeet: () => Response) {
      const knocked: string[] = []
      const keys: Array<string | null> = []
      vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
        const host = new URL(url).hostname.split('.')[0]
        knocked.push(
          host === 'parakeet' || host === 'gigaam' ? host : 'whisper'
        )
        if (host === 'parakeet') {
          keys.push(new Headers(init.headers).get('authorization'))
          return parakeet()
        }
        if (host === 'gigaam') return json({ text: 'по-русски' })
        return json({ text: ' from whisper ' })
      })
      return { knocked, keys }
    }
    beforeEach(() => {
      process.env.VOICE_HEAR_RU_URL = 'http://gigaam.railway.internal:8080'
      process.env.VOICE_HEAR_RU_KEY = 'gk'
      process.env.VOICE_HEAR_EN_URL = 'http://parakeet.railway.internal:8080/'
      process.env.VOICE_HEAR_EN_KEY = 'pk'
    })

    it('hears English through Parakeet alone, with its own key', async () => {
      const { knocked, keys } = doors(() =>
        json({ text: ' Open my calendar. ' })
      )
      expect(await hear(audio, 'audio/webm', 'en')).toEqual({
        text: 'Open my calendar.',
        engine: 'parakeet',
      })
      expect(knocked).toEqual(['parakeet'])
      expect(keys).toEqual(['Bearer pk'])
    })

    it('keeps Russian on GigaAM and an unnamed language on whisper', async () => {
      const { knocked } = doors(() => json({ text: 'should not' }))
      expect((await hear(audio, 'audio/webm', 'ru'))?.engine).toBe('gigaam')
      expect((await hear(audio, 'audio/webm'))?.engine).toBe('whisper')
      expect(knocked.includes('parakeet')).toBe(false)
    })

    it('falls back to whisper when Parakeet fails', async () => {
      const { knocked } = doors(() => json({ error: 'down' }, 503))
      expect(await hear(audio, 'audio/webm', 'en')).toEqual({
        text: 'from whisper',
        engine: 'whisper',
      })
      expect(knocked[0]).toBe('parakeet')
    })

    it('says which ears each language has', () => {
      delete process.env.VOICE_HEAR_RU_KEY
      expect(voiceStatus()).toMatchObject({
        hearRu: 'whisper',
        hearEn: 'parakeet',
      })
    })
  })

  it('spokenLanguage passes only what the player may say', () => {
    expect(spokenLanguage('en')).toBe('en')
    expect(spokenLanguage('ru')).toBe('ru')
    expect(spokenLanguage('RU')).toBeUndefined()
    expect(spokenLanguage(['ru'])).toBeUndefined()
  })
})

describe('warm', () => {
  const recorder = (status: number) => {
    const urls: string[] = []
    const auth: string[] = []
    const fake = (async (url: string, init: RequestInit) => {
      urls.push(url)
      auth.push((init.headers as Record<string, string>).Authorization)
      expect(init.method).toBe('POST')
      return new Response('', { status })
    }) as unknown as typeof fetch
    return { urls, auth, fake }
  }

  it('loads the transcriber and the chosen voice beside /v1', async () => {
    process.env.WHISPER_MODEL = 'deepdml/faster-whisper-large-v3-turbo-ct2'
    const r = recorder(201)
    expect(await warm('ru', 'dmitri', r.fake)).toEqual({
      hear: 'loaded',
      speak: 'loaded',
    })
    expect(r.urls.sort()).toEqual([
      'http://whisper.railway.internal:8000/api/ps/deepdml/faster-whisper-large-v3-turbo-ct2',
      'http://whisper.railway.internal:8000/api/ps/speaches-ai/piper-ru_RU-dmitri-medium',
    ])
    expect(r.auth).toEqual(['Bearer k', 'Bearer k'])
  })

  it('"already loaded" is ready, anything else failed, a throw is failed', async () => {
    expect(await warm('en', 'af_heart', recorder(409).fake)).toEqual({
      hear: 'ready',
      speak: 'ready',
    })
    expect(await warm('en', 'af_heart', recorder(403).fake)).toEqual({
      hear: 'failed',
      speak: 'failed',
    })
    const boom = (async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await warm('en', 'af_heart', boom)).toEqual({
      hear: 'failed',
      speak: 'failed',
    })
  })

  it('never knocks on a hosted whisper', async () => {
    process.env.WHISPER_BASE_URL = 'https://api.groq.com/openai/v1'
    const r = recorder(201)
    expect(await warm('ru', 'irina', r.fake)).toEqual({
      hear: 'none',
      speak: 'none',
    })
    expect(r.urls).toEqual([])
  })
})
