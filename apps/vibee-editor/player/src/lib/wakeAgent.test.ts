import { describe, it, expect } from 'vitest'
import { shouldWakeAgent, wakeMessage, AGENT_ACTIVE_MS } from './wakeAgent'
import type { JournalStep } from './browserJournal'

const now = Date.parse('2026-09-22T12:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()

describe('handing the wheel back wakes the agent', () => {
  it('wakes an agent whose turn has ended', () => {
    expect(
      shouldWakeAgent({
        agentWaiting: false,
        replying: false,
        lastStepAt: ago(5 * 60_000),
        now,
      })
    ).toBe(true)
    expect(
      shouldWakeAgent({
        agentWaiting: false,
        replying: false,
        lastStepAt: null,
        now,
      })
    ).toBe(true)
  })

  it('does not start a second driver beside a turn still running', () => {
    expect(
      shouldWakeAgent({
        agentWaiting: false,
        replying: false,
        lastStepAt: ago(AGENT_ACTIVE_MS - 1000),
        now,
      })
    ).toBe(false)
    expect(
      shouldWakeAgent({
        agentWaiting: true,
        replying: false,
        lastStepAt: null,
        now,
      })
    ).toBe(false)
    expect(
      shouldWakeAgent({
        agentWaiting: false,
        replying: true,
        lastStepAt: null,
        now,
      })
    ).toBe(false)
  })
})

describe('the wake message', () => {
  const step = (tool: string, at: string): JournalStep => ({
    at,
    tool,
    ok: true,
    ms: 1,
    detail: {},
  })
  it('carries the latest steps, oldest first, after the ask', () => {
    const steps = [
      step('browser_click', ago(1000)),
      step('browser_open', ago(2000)),
    ]
    expect(wakeMessage('Help', 'Last steps:', steps, s => s.tool)).toBe(
      'Help\n\nLast steps:\n• browser_open\n• browser_click'
    )
  })
  it('is just the ask when nothing was done yet', () => {
    expect(wakeMessage('Help', 'Last steps:', [], s => s.tool)).toBe('Help')
  })
})
