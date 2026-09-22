/**
 * THE /model VIEW SAYS WHICH MODEL IS ANSWERING, NOT ONLY WHICH WAS CHOSEN.
 *
 * With the breaker, a timed-out zai is parked for two minutes and zai-lite
 * answers every new turn -- while GET /api/agent/provider kept reporting zai
 * as `current`, and the breaker's state was visible only in the log line that
 * opened it. providerStatus() is what that route answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { providerStatus } from './provider-status'
import {
  BREAKER_COOLDOWN_MS,
  forgetBreakersForTests,
  recordFailure,
} from './provider-breaker'
import { forgetProviderChoiceForTests } from './provider-choice'

beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('NVIDIA_API_KEY', 'n')
  vi.stubEnv('AGENT_PROVIDER', '')
  vi.stubEnv('AGENT_MODEL', '')
  vi.stubEnv('RESERVE_BASE_URL', '')
  vi.stubEnv('OLLAMA_BASE_URL', '')
  vi.stubEnv('RAILWAY_SERVICE_QUEEN_OLLAMA_URL', '')
  vi.stubEnv('OLLAMA_ENABLED', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  forgetBreakersForTests()
  forgetProviderChoiceForTests()
})

describe('GET /api/agent/provider', () => {
  it('with every breaker closed, the chosen head is the one answering', () => {
    const s = providerStatus()
    expect(s.current?.id).toBe('zai')
    expect(s.answering?.id).toBe('zai')
    expect(s.breakers).toEqual([])
  })

  it('a parked provider is named, with its reason, and the one answering instead', () => {
    const now = Date.parse('2026-09-22T08:17:00Z')
    const reason = 'zai: timed out after 120 s'
    recordFailure('zai', 'timeout', reason, now)

    const s = providerStatus(now + 1000)
    // The configured head is unchanged: the owner's choice was not rewritten.
    expect(s.current?.id).toBe('zai')
    expect(
      s.answering,
      'the view still says zai while zai-lite answers'
    ).toEqual({ id: 'zai-lite', model: 'glm-4.5' })
    expect(s.breakers).toEqual([
      {
        id: 'zai',
        until: new Date(now + BREAKER_COOLDOWN_MS).toISOString(),
        probing: false,
        reason,
      },
    ])
    // What the bot already reads keeps its shape.
    expect(s.chain.map(p => p.id)).toEqual(['zai', 'zai-lite', 'nemotron'])
    expect(s).toHaveProperty('chosen', null)
    expect(s).toHaveProperty('env', null)
  })
})
