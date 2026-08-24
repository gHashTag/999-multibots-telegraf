import { afterEach, describe, expect, it, vi } from 'vitest'
import { GLMProvider } from '@/core/openai/glm-provider'

describe('GLMProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the Z.AI coding endpoint and coder model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await new GLMProvider('test-key').chatCompletion([
      { role: 'user', content: 'test' },
    ])

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.z.ai/api/coding/paas/v4/chat/completions')
    expect(JSON.parse(request.body)).toMatchObject({ model: 'glm-5.3' })
  })
})
