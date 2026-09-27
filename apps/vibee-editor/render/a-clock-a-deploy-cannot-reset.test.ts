/**
 * THE ROUND CLOCK COUNTED THE PROCESS, NOT THE ROUNDS.
 *
 * The pace was a bare `setInterval(..., ROUNDS_EVERY_MIN)` in render-server.ts,
 * and setInterval starts counting when the process starts. Measured on the live
 * service on 2026-09-26: 13 deployments in 3.5 hours, longest life 45 minutes of
 * the 180 it needed, and no `[rounds]` line in ANY of those deployments' logs.
 * The daily check hit the same wall on 2026-09-24 and was cured by asking its
 * own table whether a run was due; this is that cure for rounds.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { roundIsDue } from './src/agent/rounds'
import {
  LAST_ROUND_KEY,
  lastRoundAt,
  runRoundIfDue,
} from './src/agent/rounds-wiring'
import { resetStrategiesForTests } from './src/agent/strategies'

const HOUR = 60 * 60 * 1000

/** Just enough of agent_strategies to answer the three statements it gets. */
const fakePool = (rows = new Map<string, unknown>()) => {
  const asked: string[] = []
  return {
    rows,
    asked,
    query: async (sql: string, params: unknown[] = []) => {
      asked.push(sql.trim().split('\n')[0])
      if (sql.includes('CREATE TABLE')) return { rows: [] }
      if (sql.startsWith('SELECT')) {
        const key = String(params[0])
        return rows.has(key)
          ? { rows: [{ value: rows.get(key) }] }
          : { rows: [] }
      }
      if (sql.includes('INSERT INTO agent_strategies')) {
        rows.set(String(params[0]), JSON.parse(String(params[1])))
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
}

describe('when a round is due', () => {
  it('is asked of the last round, and a first one is due at once', () => {
    expect(roundIsDue(null, 1_000, 3 * HOUR)).toBe(true)
  })

  it('is not due before the pace has passed, and is after', () => {
    const last = 10 * HOUR
    expect(roundIsDue(last, last + 179 * 60_000, 3 * HOUR)).toBe(false)
    expect(roundIsDue(last, last + 3 * HOUR, 3 * HOUR)).toBe(true)
  })

  it('survives a process that only just started', () => {
    /* The whole point: a one-minute-old process with an old last round is due. */
    const last = 0
    expect(roundIsDue(last, 4 * HOUR, 3 * HOUR)).toBe(true)
  })

  it('does not go silent forever if a clock jumped backwards', () => {
    expect(roundIsDue(5 * HOUR, 1 * HOUR, 3 * HOUR)).toBe(true)
  })
})

describe('the tick that asks the database', () => {
  beforeEach(() => {
    resetStrategiesForTests()
    process.env.ROUNDS_ENABLED = '1'
    process.env.ROUNDS_EVERY_MIN = '180'
  })

  it('says off when rounds are off, without touching the database', async () => {
    process.env.ROUNDS_ENABLED = '0'
    const pool = fakePool()
    expect(await runRoundIfDue(pool)).toBe('off')
    expect(pool.asked).toEqual([])
  })

  it('says not due when the last round is younger than the pace', async () => {
    const rows = new Map<string, unknown>([
      [LAST_ROUND_KEY, { at: new Date(Date.now() - 60_000).toISOString() }],
    ])
    const pool = fakePool(rows)
    expect(await runRoundIfDue(pool)).toBe('not due')
    /* And the mark is left exactly as it was: no walk, no write. */
    expect(await lastRoundAt(pool)).toBe(
      Date.parse(String((rows.get(LAST_ROUND_KEY) as { at: string }).at))
    )
  })

  it('remembers the round it starts BEFORE walking, so a deploy cannot double it', async () => {
    const rows = new Map<string, unknown>([
      [LAST_ROUND_KEY, { at: new Date(Date.now() - 4 * HOUR).toISOString() }],
    ])
    const pool = fakePool(rows)
    const before = Date.now()
    /*
     * The walk is injected and dies at once, the way a deploy kills a real
     * one -- with or without a browser on the machine running the test. What
     * it saw is the point: the mark was already written when it started.
     */
    let seenByWalk: number | null = null
    await runRoundIfDue(pool, {
      walk: async p => {
        seenByWalk = await lastRoundAt(p)
        throw new Error('the deploy killed the walk')
      },
    }).catch(() => {})
    expect(seenByWalk === null).toBe(false)
    expect(Number(seenByWalk)).toBeGreaterThanOrEqual(before)
    /* And a round that died half way still counts as a round that happened. */
    expect(Number(await lastRoundAt(pool))).toBeGreaterThanOrEqual(before)
  })

  it('reads the mark it wrote, and reads nothing from an empty table', async () => {
    expect(await lastRoundAt(fakePool())).toBeNull()
  })
})
