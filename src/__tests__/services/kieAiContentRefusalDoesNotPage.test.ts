/**
 * GOOGLE REFUSING A PROMPT IS NOT AN OUTAGE.
 *
 * `utils/logger.ts` binds the Telegram transport at level 'error' (:231), so
 * every `logger.error` here is a push notification to the owner. Veo reports a
 * content-policy refusal as successFlag 3, and the poller announced it twice:
 * once as '[KieAiProvider] Video generation rejected by content policy' and
 * again, after the rethrow, as '[KieAiProvider] Error checking video status'.
 * Two pushes about a verdict the owner cannot appeal, on a prompt he has never
 * seen -- and the second one blamed his own poller for it.
 *
 * The other successFlag values share that catch block and are OURS:
 * successFlag 2 carries 'Generation timeout', 'Model not found' and
 * 'Insufficient credits'. Every quiet case below is therefore paired with a
 * noisy one on the same code path, because silencing a refusal is only correct
 * if an outage still shouts.
 *
 * axios is mocked: no network, no money.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

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
import { logger } from '@/utils/logger'
import { KieAiProvider } from '@/services/video-providers/KieAiProvider'

const get = axios.get as unknown as Mock

/** What the poller sees for a given successFlag. */
const record = (data: Record<string, unknown>) => ({
  data: { code: 200, msg: 'success', data },
})

/** The first argument of every call: the sentence the owner would read. */
const messages = (spy: unknown) =>
  (spy as Mock).mock.calls.map(c => String(c[0]))

describe('KieAiProvider.checkVideoStatus (mocked)', () => {
  let provider: KieAiProvider

  beforeEach(() => {
    process.env.KIE_AI_API_KEY = 'test-key'
    get.mockReset()
    vi.mocked(logger.error).mockClear()
    vi.mocked(logger.warn).mockClear()
    provider = new KieAiProvider()
  })

  it('does not page the owner when Google refuses the content', async () => {
    get.mockResolvedValue(
      record({
        successFlag: 3,
        errorCode: 'CONTENT_POLICY',
        errorMessage: 'Content rejected by Google policy',
      })
    )

    const res = await provider.checkVideoStatus('task-1')

    expect(res.success).toBe(false)
    expect(
      messages(logger.error),
      'a content refusal reached the owner alert group'
    ).toEqual([])
    expect(messages(logger.warn)).toContain(
      '[KieAiProvider] Video generation rejected by content policy'
    )
  })

  it('does not let the catch below re-announce it as a broken poller', async () => {
    get.mockResolvedValue(
      record({
        successFlag: 3,
        errorMessage: 'Content rejected by Google policy',
      })
    )

    await provider.checkVideoStatus('task-2')

    expect(
      messages(logger.error),
      'the rethrow was caught and titled "Error checking video status"'
    ).not.toContain('[KieAiProvider] Error checking video status')
    // The refusal is still recorded on the way out, under its own name.
    expect(messages(logger.warn)).toContain(
      '[KieAiProvider] Video status check ended in a content refusal'
    )
  })

  it('STILL pages when the generation itself failed (successFlag 2)', async () => {
    for (const errorMessage of [
      'Generation timeout',
      'Model not found',
      'Insufficient credits',
    ]) {
      vi.mocked(logger.error).mockClear()
      get.mockResolvedValue(record({ successFlag: 2, errorMessage }))

      await provider.checkVideoStatus('task-3')

      expect(
        messages(logger.error),
        `"${errorMessage}" stopped waking the owner`
      ).toContain('[KieAiProvider] Video generation failed')
    }
  })

  it('STILL pages when the poll itself breaks', async () => {
    get.mockRejectedValue(new Error('connect ECONNREFUSED'))

    const res = await provider.checkVideoStatus('task-4')

    expect(res.success).toBe(false)
    expect(messages(logger.error)).toContain(
      '[KieAiProvider] Error checking video status'
    )
  })

  it('STILL pages when the API answers with a non-200 code', async () => {
    get.mockResolvedValue({ data: { code: 500, msg: 'internal error' } })

    await provider.checkVideoStatus('task-5')

    expect(messages(logger.error)).toContain(
      '[KieAiProvider] Error checking video status'
    )
  })
})
