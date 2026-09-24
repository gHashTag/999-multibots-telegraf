import { describe, expect, it } from 'vitest'
import { AGENT_SUGGESTIONS } from './agentSuggestions'
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
