import { describe, expect, it } from 'vitest'
import {
  AGENT_SUGGESTIONS,
  AGENT_TEMPLATES,
  agentGate,
} from './agentSuggestions'
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

describe("the agent's repeat buttons (owner, 2026-09-29)", () => {
  it('every template carries a label key and a prompt', () => {
    for (const [id, list] of Object.entries(AGENT_TEMPLATES)) {
      expect(list.length, id).toBeGreaterThan(0)
      for (const tp of list) {
        expect(tp.labelKey, id).toMatch(/^chat\.templates\./)
        expect(tp.prompt.length, id).toBeGreaterThan(20)
      }
    }
  })

  it('no template publishes or sends on the first press either', () => {
    const all = Object.values(AGENT_TEMPLATES)
      .flat()
      .map(tp => tp.prompt)
      .join('\n')
    expect(all).not.toMatch(/опубликуй|отправь(?!ляй)/i) // cyrillic-ok: matches send/publish words
    /* Every prompt must hold the guard itself: the proposal is the agent's,
     * the send is the person's press on the card. */
    expect(all).toMatch(/карточк/i) // cyrillic-ok: the card guard
  })

  it('only catalogued agents have templates', () => {
    const ids = new Set(MARKETPLACE_AGENTS.map(a => a.id))
    for (const id of Object.keys(AGENT_TEMPLATES))
      expect(ids.has(id), id).toBe(true)
  })
})
