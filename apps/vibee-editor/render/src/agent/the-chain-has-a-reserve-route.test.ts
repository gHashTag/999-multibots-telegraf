import { afterEach, describe, expect, it, vi } from 'vitest'
import { allProviders, providerOrder, reserveEnv } from './provider'
import {
  KNOWN_PROVIDERS,
  forgetProviderChoiceForTests,
} from './provider-choice'

/**
 * THE CHAIN HAS A RESERVE ROUTE. Spec: t27 specs/automation/agent-provider-chain.t27.
 *
 * 2026-09-13: three duet runs died with every paid provider at a limit --
 * z.ai twice (one subscription behind glm-5.3 and glm-4.5) and NVIDIA
 * 16/16. A fourth route to a different vendor is the owner's to point at,
 * with three variables; absent any of them, the chain is exactly as before.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  forgetProviderChoiceForTests()
})

const three = () => {
  vi.stubEnv('RESERVE_BASE_URL', 'https://vendor.example/v1/')
  vi.stubEnv('RESERVE_API_KEY', 'r')
  vi.stubEnv('RESERVE_MODEL', 'some/model')
}

describe('the reserve route', () => {
  it('sits after nemotron and before ollama in the default order', () => {
    expect(providerOrder()).toEqual([
      'zai',
      'zai-lite',
      'nemotron',
      'reserve',
      'ollama',
    ])
    expect(KNOWN_PROVIDERS).toContain('reserve')
  })

  it('exists only when all three variables are set', () => {
    vi.stubEnv('GLM_API_KEY', 'g')
    expect(allProviders().map(p => p.id)).toEqual(['zai', 'zai-lite'])
    vi.stubEnv('RESERVE_BASE_URL', 'https://vendor.example/v1')
    vi.stubEnv('RESERVE_API_KEY', 'r')
    expect(reserveEnv()).toBeNull()
    expect(allProviders().map(p => p.id)).toEqual(['zai', 'zai-lite'])
    vi.stubEnv('RESERVE_MODEL', 'some/model')
    expect(allProviders().map(p => p.id)).toEqual([
      'zai',
      'zai-lite',
      'reserve',
    ])
  })

  it('takes base, model and key from the variables; the trailing slash is trimmed', () => {
    three()
    const r = allProviders().find(p => p.id === 'reserve')!
    expect(r.base).toBe('https://vendor.example/v1')
    expect(r.model).toBe('some/model')
    expect(r.key).toBe('r')
    expect(r.thinking).toBe(false)
  })

  it('tools and vision are the owner\u2019s declaration: capable by default, RESERVE_TOOLS=0 drops it from tools-only turns', () => {
    three()
    expect(allProviders().find(p => p.id === 'reserve')!.tools).toBe(true)
    expect(allProviders().find(p => p.id === 'reserve')!.vision).toBe(false)
    vi.stubEnv('RESERVE_TOOLS', '0')
    vi.stubEnv('RESERVE_VISION', '1')
    const r = allProviders().find(p => p.id === 'reserve')!
    expect(r.tools).toBe(false)
    expect(r.vision).toBe(true)
    // What streamModel does under toolsOnly.
    expect(
      allProviders()
        .filter(p => p.tools)
        .map(p => p.id)
    ).toEqual([])
  })

  it('AGENT_PROVIDER=reserve moves it to the front, the rest keep their order', () => {
    vi.stubEnv('AGENT_PROVIDER', 'reserve')
    expect(providerOrder()).toEqual([
      'reserve',
      'zai',
      'zai-lite',
      'nemotron',
      'ollama',
    ])
  })
})
