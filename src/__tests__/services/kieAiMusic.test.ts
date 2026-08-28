/**
 * Mock test for Kie AI (Suno) music generation.
 *
 * Guards the fix in KieAiProvider.generateMusic: CREATE is POST /generate
 * (returns only a taskId), then the audio is fetched by polling
 * GET /generate/record-info until status is SUCCESS/FIRST_SUCCESS. Before the
 * fix the method POSTed /music/generate and read response.audio_url
 * synchronously, so it always returned no audio. axios is mocked, so no network
 * and no money spent.
 */
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  AxiosError: class AxiosError extends Error {},
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/inngest_app/client', () => ({
  inngest: { send: vi.fn() },
  createInngestFailureHandler: vi.fn(() => vi.fn()),
}))

vi.mock('@/utils/webhookHealthCheck', () => ({
  getAvailableCallbackUrl: vi.fn(async () => 'https://example.com/cb'),
  testAllWebhookUrls: vi.fn(),
}))

import axios from 'axios'
import { KieAiProvider } from '@/services/video-providers/KieAiProvider'

const post = axios.post as unknown as Mock
const get = axios.get as unknown as Mock

const CREATE_OK = {
  data: { code: 200, msg: 'success', data: { taskId: 'task-abc' } },
}
const success = (audioUrl: string, duration = 120) => ({
  data: {
    code: 200,
    msg: 'success',
    data: {
      status: 'SUCCESS',
      response: { sunoData: [{ audioUrl, duration }] },
    },
  },
})

describe('KieAiProvider.generateMusic (Suno, mocked)', () => {
  let provider: KieAiProvider

  beforeEach(() => {
    process.env.KIE_AI_API_KEY = 'test-key'
    post.mockReset()
    get.mockReset()
    provider = new KieAiProvider()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns audioUrl once the task reaches SUCCESS (immediate)', async () => {
    post.mockResolvedValue(CREATE_OK)
    get.mockResolvedValue(success('https://cdn.kie/song.mp3', 118))

    const res = await provider.generateMusic({
      model: 'suno-v4.5-plus',
      prompt: 'calm lofi beat',
      duration: 120,
      instrumental: true,
    })

    expect(res.success).toBe(true)
    expect(res.data?.audioUrl).toBe('https://cdn.kie/song.mp3')
    expect(res.data?.duration).toBe(118)
    expect(res.error).toBeUndefined()
  })

  it('CREATEs against /generate with the documented Suno body', async () => {
    post.mockResolvedValue(CREATE_OK)
    get.mockResolvedValue(success('https://cdn.kie/song.mp3'))

    await provider.generateMusic({
      model: 'suno-v4.5-plus',
      prompt: 'calm lofi beat',
      instrumental: true,
    })

    // CREATE endpoint and body
    const [createUrl, createBody] = post.mock.calls[0]
    expect(createUrl).toContain('/generate')
    expect(createUrl).not.toContain('/music/generate')
    expect(createBody.model).toBe('V4_5PLUS') // slug mapped to Suno enum
    expect(createBody.customMode).toBe(false)
    expect(createBody.instrumental).toBe(true)
    expect(typeof createBody.callBackUrl).toBe('string')
    expect(createBody).not.toHaveProperty('genre') // old, non-existent field

    // Poll endpoint
    const [pollUrl, pollCfg] = get.mock.calls[0]
    expect(pollUrl).toContain('/generate/record-info')
    expect(pollCfg.params.taskId).toBe('task-abc')
  })

  it('polls: PENDING then SUCCESS returns audio', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue(CREATE_OK)
    get
      .mockResolvedValueOnce({
        data: { code: 200, msg: 'ok', data: { status: 'PENDING' } },
      })
      .mockResolvedValueOnce(success('https://cdn.kie/late.mp3', 90))

    const p = provider.generateMusic({
      model: 'suno-v4.5-plus',
      prompt: 'ambient',
      instrumental: true,
    })
    // advance past the first backoff (5000ms), flushing the poll chain
    await vi.advanceTimersByTimeAsync(6000)
    const res = await p

    expect(res.success).toBe(true)
    expect(res.data?.audioUrl).toBe('https://cdn.kie/late.mp3')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('surfaces a terminal failure status as an error', async () => {
    post.mockResolvedValue(CREATE_OK)
    get.mockResolvedValue({
      data: {
        code: 200,
        msg: 'ok',
        data: { status: 'GENERATE_AUDIO_FAILED', errorMessage: 'boom' },
      },
    })

    const res = await provider.generateMusic({
      model: 'suno-v4.5-plus',
      prompt: 'x',
      instrumental: true,
    })

    expect(res.success).toBe(false)
    expect(res.data?.audioUrl).toBeUndefined()
    expect(res.error).toContain('boom')
  })

  it('fails cleanly when CREATE returns no taskId', async () => {
    post.mockResolvedValue({
      data: { code: 200, msg: 'no task', data: {} },
    })

    const res = await provider.generateMusic({
      model: 'suno-v4.5-plus',
      prompt: 'x',
      instrumental: true,
    })

    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
    expect(get).not.toHaveBeenCalled() // never polled without a taskId
  })
})
