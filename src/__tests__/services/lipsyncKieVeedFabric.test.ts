/**
 * Mock test for the KIE lipsync money path (Veed Fabric).
 *
 * KieVeedFabricProvider.generate spends real money on ElevenLabs TTS + Kie.ai
 * createTask. axios and supabase are mocked, so no network and no money. The
 * existing fal-veed-fabric tests cover the FAL provider only (and run under
 * bun); the KIE veed/fabric path had no coverage.
 *
 * Contract checked: async webhook mode (returns status:'processing' with a
 * taskId, NOT success:true), recordId-over-taskId preference, the createTask
 * request body, the ElevenLabs text path, and the error codes.
 */
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  AxiosError: class AxiosError extends Error {},
}))

// Constructor throws unless both keys are present (read from @/config).
vi.mock('@/config', () => ({
  KIE_AI_API_KEY: 'test-kie',
  ELEVENLABS_API_KEY: 'test-11l',
  SUPABASE_URL: 'https://sb.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-srv',
}))

vi.mock('@/core/supabase/getVoiceId', () => ({ getVoiceId: vi.fn() }))
vi.mock('@/core/supabase', () => ({ supabase: {} }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ data: {}, error: null })),
        getPublicUrl: () => ({
          data: { publicUrl: 'https://sb.co/audio.mp3' },
        }),
      }),
    },
  })),
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import axios from 'axios'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import { KieVeedFabricProvider } from '@/core/lipsync/providers/kie-veed-fabric-provider'

const post = axios.post as unknown as Mock
const get = axios.get as unknown as Mock
const voiceId = getVoiceId as unknown as Mock

const CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask'

function baseInput(over: Record<string, unknown> = {}) {
  return {
    imageUrl: 'https://cdn.example/face.jpg',
    audioUrl: 'https://cdn.example/voice.mp3',
    telegramId: '123456789',
    provider: 'kie' as const,
    modelId: 'veed-fabric' as const,
    botName: 'test_bot',
    resolution: '720p' as const,
    ...over,
  }
}

// axios.post routes to ElevenLabs (text path) or Kie createTask.
function routeCreateTask(result: unknown) {
  post.mockImplementation((url: string) => {
    if (url.includes('elevenlabs')) {
      return Promise.resolve({ data: new ArrayBuffer(8) })
    }
    if (url.includes('createTask')) return Promise.resolve(result)
    return Promise.resolve({})
  })
}

describe('KieVeedFabricProvider.generate (lipsync, mocked)', () => {
  let provider: KieVeedFabricProvider

  beforeEach(() => {
    post.mockReset()
    get.mockReset()
    voiceId.mockReset()
    // Image + audio URL accessibility checks pass.
    get.mockResolvedValue({ status: 200, headers: {} })
    provider = new KieVeedFabricProvider()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('happy path (audioUrl present): returns processing, createTask body correct', async () => {
    routeCreateTask({
      status: 200,
      data: { data: { taskId: 't1', recordId: 'r1' } },
    })

    const res = (await provider.generate(baseInput())) as any

    expect(res.status).toBe('processing')
    expect(res.id).toBe('r1') // recordId preferred over taskId
    expect(res.taskId).toBe('r1')
    expect(res.provider).toBe('kie')
    expect(res.output).toBe('')
    expect(res).not.toHaveProperty('success') // async mode, not sync

    const createCall = post.mock.calls.find(c => c[0] === CREATE_TASK_URL)
    expect(createCall).toBeTruthy()
    expect(createCall![1].model).toBe('veed/fabric-1')
    expect(createCall![1].input.image_url).toBe('https://cdn.example/face.jpg')
    expect(createCall![1].input.audio_url).toBe('https://cdn.example/voice.mp3')
    expect(createCall![2].headers.Authorization).toBe('Bearer test-kie')

    // No ElevenLabs / voice lookup when audioUrl is already provided.
    expect(voiceId).not.toHaveBeenCalled()
    expect(post.mock.calls.some(c => String(c[0]).includes('elevenlabs'))).toBe(
      false
    )
  })

  it('invalid input (wrong provider) returns INVALID_INPUT with no calls', async () => {
    const res = (await provider.generate(baseInput({ provider: 'fal' }))) as any
    expect(res.code).toBe('INVALID_INPUT')
    expect(res.provider).toBe('kie')
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('text path without a voice id returns MISSING_VOICE_ID', async () => {
    voiceId.mockResolvedValue(null)
    const res = (await provider.generate(
      baseInput({ audioUrl: undefined, text: 'hello' })
    )) as any
    expect(res.code).toBe('MISSING_VOICE_ID')
    expect(post.mock.calls.some(c => String(c[0]).includes('elevenlabs'))).toBe(
      false
    )
  })

  it('text path happy: TTS via ElevenLabs, createTask gets the supabase audio url', async () => {
    voiceId.mockResolvedValue('voice-1')
    routeCreateTask({ status: 200, data: { data: { taskId: 't2' } } })

    const res = (await provider.generate(
      baseInput({ audioUrl: undefined, text: 'hello world' })
    )) as any

    expect(res.status).toBe('processing')
    expect(res.taskId).toBe('t2') // no recordId -> falls back to taskId

    const elevenCall = post.mock.calls.find(c =>
      String(c[0]).includes('/text-to-speech/voice-1')
    )
    expect(elevenCall).toBeTruthy()
    const createCall = post.mock.calls.find(c => c[0] === CREATE_TASK_URL)
    expect(createCall![1].input.audio_url).toBe('https://sb.co/audio.mp3')
  })

  it('createTask error surfaces the http status as the code', async () => {
    post.mockImplementation((url: string) => {
      if (url.includes('createTask')) {
        return Promise.reject({
          response: { status: 429, data: { msg: 'rate limit' } },
        })
      }
      return Promise.resolve({})
    })

    const res = (await provider.generate(baseInput())) as any
    expect(res.code).toBe('429')
    expect(res.provider).toBe('kie')
    expect(res.error).toContain('rate limit')
  })

  it('no taskId/recordId returns NO_TASK_ID', async () => {
    routeCreateTask({ status: 200, data: { data: {} } })
    const res = (await provider.generate(baseInput())) as any
    expect(res.code).toBe('NO_TASK_ID')
  })
})
