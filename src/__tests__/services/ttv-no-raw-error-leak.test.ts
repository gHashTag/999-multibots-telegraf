import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * generateTextToVideo must not echo a raw upstream error to the user.
 *
 * When a Kie.ai/Sora provider call throws an axios error, the catch block's
 * general fallback used to return `API Error: ${errorMessage}` — where
 * errorMessage = error.response?.data?.error || error.response?.data?.message
 * || error.message. That raw upstream body (internal host, request id, a token
 * fragment, or the bare axios message) reached the user through
 * handleTextToVideoDirect, which shows response.error verbatim. The detail is
 * already logged; the user should see a clean line, like every other branch of
 * the same catch (429/402/NSFW). Proven both directions: with the raw
 * interpolation restored, the UPSTREAM_DETAIL below appears in result.error.
 */

const UPSTREAM_DETAIL =
  'internal-kie-host.prod:5432 rid=abc123-do-not-show-user'

vi.mock('@/config', () => ({
  isDev: false,
  SECRET_API_KEY: 'test-secret',
  PUBLIC_URL: 'https://example.test',
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/config/unified-video-models.config', () => ({
  getUnifiedModelConfig: vi.fn(() => ({ provider: 'kie' })),
}))

// The provider is loaded via a dynamic import inside the source; the '@' alias
// and the source's relative './video-providers/KieAiProvider' resolve to the
// same module id, so this mock intercepts it.
vi.mock('@/services/video-providers/KieAiProvider', () => {
  const axiosLikeError = {
    isAxiosError: true,
    message: 'Request failed with status code 500',
    code: 'ERR_BAD_RESPONSE',
    config: { url: 'https://api.kie.ai/v1/secret-endpoint' },
    response: { status: 500, data: { error: UPSTREAM_DETAIL } },
  }
  return {
    KieAiProvider: class {
      async generateSoraVideo() {
        throw axiosLikeError
      }
      async generateVideo() {
        throw axiosLikeError
      }
    },
  }
})

import { generateTextToVideo } from '@/services/generateTextToVideo'

describe('generateTextToVideo does not leak a raw provider error to the user', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a curated message, not the raw upstream error body', async () => {
    const res = await generateTextToVideo({
      prompt: 'a cat riding a bike',
      videoModel: 'sora-2',
      telegram_id: '1',
      username: 'tester',
      is_ru: true,
      bot_name: 'test_bot',
    } as any)

    expect(res.success).toBe(false)
    expect(res.error, 'a user-facing error must be present').toBeTruthy()
    // The raw upstream body and its telltale fragments must not surface.
    expect(res.error).not.toContain(UPSTREAM_DETAIL)
    expect(res.error).not.toContain('5432')
    expect(res.error).not.toContain('internal-kie-host')
    expect(res.error).not.toContain('api.kie.ai')
  })
})
