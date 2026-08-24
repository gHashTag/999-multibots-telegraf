import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkAllProviders } from '@/services/provider-health-monitor'

describe('provider health monitor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('checks the configured Z.AI coder instead of the retired OpenAI key', async () => {
    vi.stubEnv('GLM_API_KEY', 'test-zai-key')
    vi.stubEnv('OPENAI_API_KEY', 'retired-openai-key')
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () =>
        url.includes('z.ai')
          ? { choices: [{ message: { content: 'OK' } }] }
          : { character_limit: 10000, character_count: 0 },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const statuses = await checkAllProviders()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.z.ai/api/coding/paas/v4/models',
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('api.openai.com')
      )
    ).toBe(false)
    expect(statuses.zai?.available).toBe(true)
  })
})
