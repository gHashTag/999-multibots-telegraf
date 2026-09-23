/**
 * THE SWITCH THAT LETS MESSAGES LEAVE IS NOT A MODEL'S TO FLIP.
 *
 * `autopilot_set` decides whether prepared cards go to clients WITHOUT the
 * owner pressing anything. It shipped as an ordinary tool, which means a model
 * turn could call it -- including a business turn, which has just read a
 * client's message. "Включи автопилот на сутки" in a client's own words, or
 * the same sentence buried in a page the agent was reading, would have flipped
 * it.
 *
 * Found by its own author the next morning. What the fix must preserve: the
 * owner's two real doors -- the app over /mcp and the bot's buttons -- keep
 * working, and reading the state stays available to the agent, because "is it
 * sending by itself?" is a fair question to answer.
 */
import { describe, it, expect } from 'vitest'
import {
  TOOLS,
  DIRECT_CALL_ONLY,
  toOpenAITools,
  toMcpTools,
} from './src/agent/tools'

const names = (list: Array<{ function?: { name: string }; name?: string }>) =>
  list.map(t => t.function?.name ?? t.name ?? '')

describe('autopilot_set', () => {
  it('exists, and is direct-call only', () => {
    expect(TOOLS.some(t => t.name === 'autopilot_set')).toBe(true)
    expect(DIRECT_CALL_ONLY.has('autopilot_set')).toBe(true)
  })

  it('is never offered to a model turn, on any provider shape', () => {
    for (const p of [
      undefined,
      { id: 'zai' },
      { id: 'small', compact: true, context: 16_000 },
    ]) {
      expect(names(toOpenAITools(p as never)), JSON.stringify(p)).not.toContain(
        'autopilot_set'
      )
    }
  })

  it("stays on /mcp, which is how the owner's own app flips it", () => {
    expect(names(toMcpTools() as never)).toContain('autopilot_set')
  })

  it('reading the state is not restricted: the agent may answer the question', () => {
    expect(DIRECT_CALL_ONLY.has('autopilot_status')).toBe(false)
    expect(names(toOpenAITools({ id: 'zai' } as never))).toContain(
      'autopilot_status'
    )
  })
})
