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

  // checkKie is the front door of the kie-only world (owner, 2026-10-02):
  // every generated asset goes through kie.ai, so the probe must see the
  // provider's real state -- and must never spend a credit doing it.
  it('probes kie.ai through the free credit endpoint only', async () => {
    // No spending on setup (owner, 2026-10-06): /api/v1/chat/credit is the
    // only free kie.ai endpoint; createTask bills even on empty input.
    vi.stubEnv('KIE_AI_API_KEY', 'test-kie-key')
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () =>
        url.includes('kie.ai')
          ? { code: 200, msg: 'success', data: 250 }
          : { choices: [{ message: { content: 'OK' } }] },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const statuses = await checkAllProviders()

    const kieCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes('kie.ai')
    )
    expect(kieCalls.length).toBeGreaterThan(0)
    expect(kieCalls[0][0]).toBe('https://api.kie.ai/api/v1/chat/credit')
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes('createTask'))
    ).toBe(false)
    expect(statuses.kie?.available).toBe(true)
  })

  it('reports an invalid kie key as a standing fault', async () => {
    vi.stubEnv('KIE_AI_API_KEY', 'test-kie-key')
    const fetchMock = vi.fn(async (url: string) => ({
      ok: !url.includes('kie.ai'),
      status: url.includes('kie.ai') ? 401 : 200,
      text: async () => '',
      json: async () => ({}),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const statuses = await checkAllProviders()

    expect(statuses.kie?.available).toBe(false)
    expect(statuses.kie?.reason).toBe('Invalid key')
    expect(statuses.kie?.fault).toBe('standing')
  })

  it('fails closed when the kie balance is nearly gone', async () => {
    vi.stubEnv('KIE_AI_API_KEY', 'test-kie-key')
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () =>
        url.includes('kie.ai') ? { code: 200, msg: 'ok', data: 5 } : {},
    }))
    vi.stubGlobal('fetch', fetchMock)

    const statuses = await checkAllProviders()

    expect(statuses.kie?.available).toBe(false)
    expect(statuses.kie?.reason).toBe('Balance nearly exhausted (5 credits)')
    expect(statuses.kie?.fault).toBe('standing')
  })

  it('stays available when the balance is unreadable (fail-open)', async () => {
    // An unreadable balance is no proof of a broken provider; the probe
    // reports available and the next poll reads it again.
    vi.stubEnv('KIE_AI_API_KEY', 'test-kie-key')
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => '',
      // No `data` field: Number(undefined) is NaN, not zero -- the probe
      // must not read a malformed body as "0 credits left".
      json: async () =>
        url.includes('kie.ai') ? { code: 200, msg: 'ok' } : {},
    }))
    vi.stubGlobal('fetch', fetchMock)

    const statuses = await checkAllProviders()

    expect(statuses.kie?.available).toBe(true)
  })

  it('skips the probe and reports standing when the key is not set', async () => {
    vi.stubEnv('KIE_AI_API_KEY', '')
    // The url param exists only for call typing; this probe must not fetch
    // to kie.ai at all, so every call goes to the other providers.
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({}),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const statuses = await checkAllProviders()

    // Defensive filter, not a global not.toHaveBeenCalled: other providers'
    // probes may fetch if their keys exist in this environment.
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes('kie.ai'))
    ).toBe(false)
    expect(statuses.kie?.available).toBe(false)
    expect(statuses.kie?.reason).toBe('KIE_AI_API_KEY not set')
    expect(statuses.kie?.fault).toBe('standing')
  })
})
