import { describe, expect, it } from 'vitest'
import { AGENT_SUGGESTIONS, agentGate } from './agentSuggestions'
import { MARKETPLACE_AGENTS } from '../../../packages/vibee-atoms/src/agent-marketplace'

describe('every specialist opens on its own questions (#2958)', () => {
  it('has at least three starters for each catalogued agent', () => {
    for (const a of MARKETPLACE_AGENTS) {
      expect(AGENT_SUGGESTIONS[a.id]?.length ?? 0, a.id).toBeGreaterThanOrEqual(
        3
      )
    }
  })

  it('no starter publishes or sends on the first press', () => {
    const all = Object.values(AGENT_SUGGESTIONS).flat().join('\n')
    expect(all).not.toMatch(/опубликуй|отправь/i) // cyrillic-ok: matches starter words
  })
})

describe('who may open an agent thread', () => {
  const g = (status: string, keeper: boolean | null, earned: boolean | null) =>
    agentGate({ id: 'job', status, keeper, earned })

  it('a live agent opens for everybody, at once', () => {
    expect(g('live', null, null)).toBe('job')
  })

  it("a trainee opens for a keeper -- the owner's own agents are never an advert", () => {
    expect(g('training', true, null)).toBe('job')
    expect(g('training', null, null)).toBe('wait')
  })

  it('a trainee that earned the market opens for anybody; one that did not, the market', () => {
    expect(g('training', false, true)).toBe('job')
    expect(g('training', false, false)).toBe('market')
    expect(g('training', false, null)).toBe('wait')
  })
})
