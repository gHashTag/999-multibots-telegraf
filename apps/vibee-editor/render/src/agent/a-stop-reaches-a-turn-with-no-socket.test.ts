/**
 * THE HOLE THIS CLOSES, AND WHY THE OBVIOUS FIX WOULD HAVE BEEN WORSE.
 *
 * Stop was built on the socket: the bot aborts its fetch, the turn sees its
 * signal between steps, nothing more is spent. True of every turn a person
 * is waiting on -- and of no other. The duet writes into a chat of its own;
 * an a2a call arrives over one request and leaves the run behind it. Press
 * Stop during either and the press reached nothing.
 *
 * The fix is a written record. The trap inside the fix is a record with no
 * time on it: "stopped" as a flag would stop the NEXT run too, and the run
 * after that, and a person who pressed Stop once would find the seller mute
 * for good. So the row holds a time and a run compares it with its own start.
 *
 * The second trap is the query itself. A stop that is read badly must not
 * end turns: if Postgres is slow or down, "no stop was written" is the only
 * safe answer, because the alternative is a hiccup cancelling everybody.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  requestStop,
  stopRequested,
  forgetStopsTableForTests,
  STOP_READ,
} from './agent-stops'

/** A pool that remembers what was asked and answers like Postgres would. */
function fakePool() {
  const stops = new Map<string, number>()
  const sql: string[] = []
  return {
    sql,
    stops,
    async query(q: string, params: unknown[] = []) {
      sql.push(q.split('\n')[0]!.trim())
      if (/CREATE TABLE/.test(q)) return { rows: [] }
      if (/INSERT INTO agent_stops/.test(q)) {
        stops.set(String(params[0]), Date.now())
        return { rows: [] }
      }
      if (/SELECT 1 FROM agent_stops/.test(q)) {
        /*
         * Postgres applies the conditions the query CARRIES. A stub that
         * filters by time whether or not the query says `at >` is kinder
         * than the database, and a guard written against a kind stub passes
         * while the real thing stops the wrong runs.
         */
        const at = stops.get(String(params[0]))
        if (at === undefined) return { rows: [] }
        if (!/at > to_timestamp/.test(q)) return { rows: [{ one: 1 }] }
        return { rows: at > Number(params[1]) ? [{ one: 1 }] : [] }
      }
      return { rows: [] }
    },
  }
}

beforeEach(() => forgetStopsTableForTests())

describe('a stop that outlives the socket', () => {
  it('a run started before the press sees it', async () => {
    const pool = fakePool()
    const began = Date.now() - 1000
    expect(await stopRequested(pool, '77', began)).toBe(false)
    await requestStop(pool, '77')
    expect(await stopRequested(pool, '77', began)).toBe(true)
  })

  it('THE TRAP: a press does not stop the runs that come after it', async () => {
    const pool = fakePool()
    await requestStop(pool, '77')
    // The next run begins now -- after the press. The press was about the
    // previous turn and must mean nothing here, or one press silences the
    // seller permanently.
    const nextRun = Date.now() + 1
    expect(await stopRequested(pool, '77', nextRun)).toBe(false)
  })

  it('one person stopping does not stop another', async () => {
    const pool = fakePool()
    const began = Date.now() - 1000
    await requestStop(pool, '77')
    expect(await stopRequested(pool, '88', began)).toBe(false)
  })

  it('THE TRAP: a database that refuses does not cancel anybody', async () => {
    const dead = {
      async query() {
        throw new Error('ECONNREFUSED')
      },
    }
    await expect(stopRequested(dead, '77', 0)).resolves.toBe(false)
    await expect(requestStop(dead, '77')).resolves.toBe('not written')
  })

  it('no pool, no owner, no nonsense time — all false, never a throw', async () => {
    const pool = fakePool()
    expect(await stopRequested(null, '77', 0)).toBe(false)
    expect(await stopRequested(pool, '  ', 0)).toBe(false)
    expect(await stopRequested(pool, '77', Number.NaN)).toBe(false)
    expect(await requestStop(pool, '')).toBe('not written')
  })

  it('the read is by owner AND by time, not by owner alone', () => {
    /*
     * Written against the exported query, not against a copy of it. The first
     * version of this guard asserted a string the TEST held, which passes
     * whatever the module does -- see the blind-guards skill.
     */
    expect(STOP_READ).toContain('owner_id = $1')
    expect(STOP_READ).toContain('at > to_timestamp($2 / 1000.0)')
  })
})
