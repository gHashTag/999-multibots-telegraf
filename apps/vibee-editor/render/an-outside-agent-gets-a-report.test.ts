/**
 * Owner, 2026-09-22: the report after browser work, for agents that drive
 * over /mcp too. They have no end of turn; their work ends when they go
 * quiet, and then exactly one report covers all of it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const reports: Array<{ id: string; since: number; settle?: boolean }> = []
vi.mock('./src/browser/after-turn', () => ({
  reportAfterTurn: async (
    _pool: unknown,
    id: string,
    turn: { since: number; settle?: boolean }
  ) => {
    reports.push({ id, since: turn.since, settle: turn.settle })
    return 'sent'
  },
}))

import {
  noteExternalStep,
  stopExternalReportsForTests,
  EXTERNAL_QUIET_MS,
} from './src/browser/agent-tools'

const ctx = { telegramId: '9000000041', pool: {} } as never

beforeEach(() => {
  reports.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-22T12:00:00Z'))
})
afterEach(() => {
  stopExternalReportsForTests()
  vi.useRealTimers()
})

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await vi.dynamicImportSettled()
}

describe('an agent over /mcp', () => {
  it('gets ONE report after it goes quiet, covering all its steps', async () => {
    const start = Date.now()
    noteExternalStep(ctx)
    vi.advanceTimersByTime(EXTERNAL_QUIET_MS - 1000)
    noteExternalStep(ctx) /* still working: the window is pushed back */
    vi.advanceTimersByTime(EXTERNAL_QUIET_MS - 1000)
    await flush()
    expect(reports).toEqual([])
    vi.advanceTimersByTime(2000)
    await flush()
    expect(reports).toHaveLength(1)
    expect(reports[0].since).toBeLessThanOrEqual(start)
    expect(reports[0].settle).toBe(false)
  })

  it('a new piece of work after the report is a new report', async () => {
    noteExternalStep(ctx)
    vi.advanceTimersByTime(EXTERNAL_QUIET_MS + 1)
    await flush()
    noteExternalStep(ctx)
    vi.advanceTimersByTime(EXTERNAL_QUIET_MS + 1)
    await flush()
    expect(reports).toHaveLength(2)
    expect(reports[1].since).toBeGreaterThan(reports[0].since)
  })
})
