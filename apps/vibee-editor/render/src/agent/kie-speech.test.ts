import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KIE_TTS_DEFAULT_VOICE,
  KIE_TTS_MODEL,
  KIE_TTS_PROVIDER,
  KIE_TTS_VOICES,
  kieVoiceFor,
} from '@vibee/atoms'
import {
  kieSpeechInput,
  speakOnKie,
  voicesAnswer,
  type RunKieJob,
} from './kie-speech'
import * as kieRun from './kie-run'

/*
 * SPEECH GOES TO KIE, AND ONLY TO KIE (owner rule, kie-only skill).
 *
 * The render server cannot be imported (it listens on import), so the route
 * is pinned by its source below and the behaviour by the module it calls.
 */

const start = kieRun['запустить'] // cyrillic-ok: existing export
const poll = kieRun['состояниеЗадания'] // cyrillic-ok: existing export

/** The same shape as runExplicitKieJob in render-server.ts, without waits. */
const realRunJob: RunKieJob = async (model, input) => {
  const started = await start(model, input)
  if (!started.taskId) throw new Error(started['отказ'] || 'refused')
  for (let i = 0; i < 3; i += 1) {
    const state = await poll(started.taskId)
    if (state.url) return { url: state.url, taskId: started.taskId }
    if (state['отказ']) throw new Error(state['отказ'])
  }
  throw new Error('still running')
}

const requested: string[] = []
const bodies: Array<Record<string, unknown>> = []

beforeEach(() => {
  requested.length = 0
  bodies.length = 0
  vi.stubEnv('KIE_AI_API_KEY', 'test-kie-key-not-a-secret')
  vi.stubEnv('ELEVENLABS_API_KEY', '')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url)
      requested.push(href)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      if (href.includes('/jobs/createTask')) {
        return new Response(
          JSON.stringify({ code: 200, data: { taskId: 't1' } })
        )
      }
      if (href.includes('/jobs/recordInfo')) {
        return new Response(
          JSON.stringify({
            data: {
              state: 'success',
              resultUrls: ['https://kie.example/a.mp3'],
            },
          })
        )
      }
      return new Response('unexpected', { status: 599 })
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('/api/voices', () => {
  it('answers the Kie list with no ElevenLabs key and no network call', () => {
    const answer = voicesAnswer()
    expect(answer.success).toBe(true)
    expect(answer.provider).toBe(KIE_TTS_PROVIDER)
    expect(answer.voices.length).toBeGreaterThan(0)
    expect(answer.voices[0].id).toBe(KIE_TTS_DEFAULT_VOICE)
    expect(requested).toEqual([])
  })

  it('every voice is an id Kie documents, with Kie preview audio', () => {
    for (const v of KIE_TTS_VOICES) {
      expect(v.id).toMatch(/^[A-Za-z0-9]{20}$/)
      expect(v.preview_url).toBe(
        `https://static.aiquickdraw.com/elevenlabs/voice/${v.id}.mp3`
      )
    }
    expect(new Set(KIE_TTS_VOICES.map(v => v.id)).size).toBe(
      KIE_TTS_VOICES.length
    )
  })
})

describe('kieVoiceFor', () => {
  it('keeps a listed id, finds a listed name, defaults the rest', () => {
    const bella = KIE_TTS_VOICES.find(v => v.name === 'Bella')!
    expect(kieVoiceFor(bella.id)).toBe(bella.id)
    expect(kieVoiceFor(undefined, '  bella ')).toBe(bella.id)
    // An old MiniMax id from a cached list never reaches Kie.
    expect(kieVoiceFor('Russian_ReliableMan')).toBe(KIE_TTS_DEFAULT_VOICE)
    expect(kieVoiceFor('Rachel', 'Rachel')).toBe(KIE_TTS_DEFAULT_VOICE)
    expect(kieVoiceFor(42)).toBe(KIE_TTS_DEFAULT_VOICE)
  })
})

describe('kieSpeechInput', () => {
  it('clamps the slider to the 0.7-1.2 Kie documents', () => {
    expect(kieSpeechInput('hi', { speed: 2 }).speed).toBe(1.2)
    expect(kieSpeechInput('hi', { speed: 0.5 }).speed).toBe(0.7)
    expect(kieSpeechInput('hi', { speed: 1.1 }).speed).toBe(1.1)
    expect(kieSpeechInput('hi', { speed: 'fast' }).speed).toBe(1)
    expect(kieSpeechInput('hi').speed).toBe(1)
  })
})

describe('speakOnKie', () => {
  it('speaks through api.kie.ai only, never elevenlabs.io', async () => {
    const bella = KIE_TTS_VOICES.find(v => v.name === 'Bella')!
    const spoken = await speakOnKie(
      'hello',
      { voiceId: bella.id, speed: 1.5 },
      realRunJob
    )
    expect(spoken).toEqual({
      url: 'https://kie.example/a.mp3',
      taskId: 't1',
      provider: KIE_TTS_PROVIDER,
    })
    expect(requested.length).toBeGreaterThan(0)
    for (const href of requested) {
      expect(href).toContain('api.kie.ai')
      expect(href).not.toContain('elevenlabs.io')
    }
    expect(bodies[0]).toMatchObject({
      model: KIE_TTS_MODEL,
      input: { text: 'hello', voice: bella.id, speed: 1.2 },
    })
  })

  it('a refused non-default model falls back to the default once', async () => {
    const seen: string[] = []
    const warn = vi.fn()
    const spoken = await speakOnKie(
      'hi',
      { model: 'elevenlabs/text-to-speech-turbo-2-5' },
      async model => {
        seen.push(model)
        if (model !== KIE_TTS_MODEL) throw new Error('no')
        return { url: 'u', taskId: 't' }
      },
      warn
    )
    expect(seen).toEqual(['elevenlabs/text-to-speech-turbo-2-5', KIE_TTS_MODEL])
    expect(spoken.provider).toBe(KIE_TTS_PROVIDER)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a refused default model is reported, not retried', async () => {
    const run = vi.fn(async () => {
      throw new Error('kie said no')
    })
    await expect(speakOnKie('hi', {}, run)).rejects.toThrow('kie said no')
    expect(run).toHaveBeenCalledTimes(1)
  })
})

const SERVER = fs.readFileSync(
  path.join(__dirname, '..', '..', 'render-server.ts'),
  'utf8'
)
const handler = (route: string): string => {
  const at = SERVER.indexOf(`req.url === '${route}'`)
  expect(at, `${route} handler not found`).toBeGreaterThan(-1)
  const next = SERVER.indexOf('req.url === ', at + route.length + 20)
  return SERVER.slice(at, next === -1 ? at + 12_000 : next)
}

describe('the routes are wired to Kie', () => {
  it('/api/voices makes no ElevenLabs call and logs no error', () => {
    const voices = handler('/api/voices')
    expect(voices).toContain('voicesAnswer()')
    expect(voices).not.toContain('elevenlabs')
    expect(voices).not.toContain('console.error')
    expect(voices).not.toContain('fetch(')
  })

  it('/api/generate/audio has no direct ElevenLabs leg', () => {
    const audio = handler('/api/generate/audio')
    expect(audio).not.toContain('elevenlabs.io')
    expect(audio).not.toContain('xi-api-key')
    expect(SERVER).not.toContain('elevenLabsKey(')
    expect(audio).toContain('speakOnKie(')
  })

  it('a clone Kie cannot speak is refused before the charge', () => {
    const audio = handler('/api/generate/audio')
    const refuse = audio.indexOf('cloneVoice && !replicateLive()')
    const charge = audio.indexOf('chargeMiniAppUser')
    expect(refuse).toBeGreaterThan(-1)
    expect(charge).toBeGreaterThan(refuse)
    expect(audio.slice(refuse, charge)).toContain('CLONE_NEEDS_REPLICATE')
    expect(audio.slice(refuse, charge)).toContain('422')
  })
})
