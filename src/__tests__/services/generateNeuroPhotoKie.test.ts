/**
 * Unit tests for the kie.ai NeuroPhoto service.
 *
 * No spending on setup (owner, 2026-10-06): axios is mocked -- no real
 * createTask ever leaves this suite. The only free kie.ai endpoint is
 * /api/v1/chat/credit and even that is not called here.
 *
 * '@/config/kie-jobs' stays REAL on purpose: one true spelling of the jobs
 * paths is the whole point of that module (three older pollers died on the
 * taskStatus sibling), so these tests assert against the real paths and
 * explicitly forbid the dead one.
 */
import { afterEach, beforeEach, describe, expect, it, vi, Mock } from 'vitest'

vi.mock('@/config', () => ({
  // A getter over process.env so vi.stubEnv drives the key without a
  // resetModules dance; the real '@/config' reads Infisical on import and
  // must never load inside a test.
  get KIE_AI_API_KEY() {
    return process.env.KIE_AI_API_KEY
  },
}))

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import axios from 'axios'
import { KIE_DEAD_STATUS_PATH } from '@/config/kie-jobs'
import { generateNeuroPhotoViaKie } from '@/services/generateNeuroPhotoKie'

const post = axios.post as unknown as Mock
const get = axios.get as unknown as Mock

const KIE_URL = 'https://kie.example/img.jpg'

function createdOk(taskId = 'task-1') {
  return { data: { code: 200, msg: 'success', data: { taskId } } }
}

// Start a run whose rejection/assertion is wired up by the caller.
function pending() {
  return generateNeuroPhotoViaKie('a cat', '9:16')
}

describe('generateNeuroPhotoViaKie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('KIE_AI_API_KEY', 'test-kie-key')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('throws without a configured key and touches no endpoint', async () => {
    vi.stubEnv('KIE_AI_API_KEY', '')
    await expect(generateNeuroPhotoViaKie('a cat', '9:16')).rejects.toThrow(
      'KIE_AI_API_KEY not configured'
    )
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('creates a nano-banana job with an explicit aspect ratio and polls recordInfo', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue(createdOk())
    get.mockResolvedValue({
      data: {
        data: {
          state: 'success',
          successFlag: 1,
          resultJson: JSON.stringify({ resultUrls: [KIE_URL] }),
        },
      },
    })

    const pending = generateNeuroPhotoViaKie('a cat in noir light', '9:16')
    await vi.advanceTimersByTimeAsync(3000)
    await expect(pending).resolves.toBe(KIE_URL)

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      'https://api.kie.ai/api/v1/jobs/createTask',
      {
        model: 'google/nano-banana',
        // aspect_ratio must be explicit: the API default is landscape, and a
        // neurophoto is looked at on a phone.
        input: { prompt: 'a cat in noir light', aspect_ratio: '9:16' },
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-kie-key',
        }),
      })
    )

    expect(get).toHaveBeenCalledWith(
      'https://api.kie.ai/api/v1/jobs/recordInfo',
      expect.objectContaining({
        params: { taskId: 'task-1' },
        headers: expect.objectContaining({
          Authorization: 'Bearer test-kie-key',
        }),
      })
    )

    // The dead sibling path (taskStatus) killed three older pollers: it must
    // never appear in any URL this service touches.
    const urls = [...post.mock.calls, ...get.mock.calls].map(c => String(c[0]))
    expect(urls.some(u => u.includes(KIE_DEAD_STATUS_PATH))).toBe(false)
  })

  it('accepts successFlag=1 without a state field (record parser fallback)', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue(createdOk('task-2'))
    get.mockResolvedValue({
      data: {
        data: {
          successFlag: 1,
          resultJson: JSON.stringify({ resultUrls: [KIE_URL] }),
        },
      },
    })

    const pending = generateNeuroPhotoViaKie('a cat', '1:1')
    await vi.advanceTimersByTimeAsync(3000)
    await expect(pending).resolves.toBe(KIE_URL)
  })

  it('throws the API message when createTask refuses', async () => {
    post.mockResolvedValue({ data: { code: 400, msg: 'bad model' } })
    await expect(generateNeuroPhotoViaKie('a cat', '9:16')).rejects.toThrow(
      'kie.ai createTask failed: bad model'
    )
    expect(get).not.toHaveBeenCalled()
  })

  it('throws when createTask returns no taskId', async () => {
    // msg must be falsy here: a truthy msg is surfaced instead of the
    // fallback (see the previous test), and 'ok' is truthy.
    post.mockResolvedValue({ data: { code: 200, msg: '', data: {} } })
    await expect(generateNeuroPhotoViaKie('a cat', '9:16')).rejects.toThrow(
      'kie.ai createTask failed: no taskId returned'
    )
  })

  it('surfaces the job failure message', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue(createdOk())
    get.mockResolvedValue({
      data: { data: { state: 'fail', failMsg: 'content policy violation' } },
    })

    // The rejection handler is attached BEFORE the timers advance: the
    // promise rejects inside advanceTimersByTimeAsync, and a promise that
    // rejects with nobody yet listening is an unhandled rejection.
    const assertion = expect(pending()).rejects.toThrow(
      'content policy violation'
    )
    await vi.advanceTimersByTimeAsync(3000)
    await assertion
  })

  it('times out after 180s with the taskId for manual recovery', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue(createdOk('task-slow'))
    get.mockResolvedValue({
      data: { data: { state: 'generating', successFlag: 0 } },
    })

    const assertion = expect(pending()).rejects.toThrow('task-slow')
    await vi.advanceTimersByTimeAsync(200000)
    // Credits were already spent at createTask; the taskId is the only
    // handle for a manual recovery, so it must be in the thrown message.
    await assertion
  })
})
