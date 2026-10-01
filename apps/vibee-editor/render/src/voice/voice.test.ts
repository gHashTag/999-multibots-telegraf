/**
 * VOICE MODE, the server half: what must hold.
 *
 *   1. the language picks the engine -- Piper for Russian, Kokoro for English
 *      -- and a voice nobody offered falls back to the default, never reaches
 *      the engine as typed;
 *   2. markdown, links and emoji are not read aloud;
 *   3. a hosted whisper (Groq/OpenAI) is not mistaken for a free voice engine;
 *   4. the request that reaches speaches is the OpenAI shape it expects;
 *   5. one person cannot spend the shared CPU without bound.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_SPEAK_CHARS,
  pickVoice,
  resetVoiceBudgetForTests,
  speak,
  speakable,
  ttsConfig,
  withinBudget,
} from './voice'

const saved = { ...process.env }
beforeEach(() => {
  delete process.env.TTS_BASE_URL
  delete process.env.TTS_API_KEY
  process.env.WHISPER_BASE_URL = 'http://whisper.railway.internal:8000/v1'
  process.env.WHISPER_API_KEY = 'k'
  resetVoiceBudgetForTests()
})
afterEach(() => {
  process.env = { ...saved }
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
