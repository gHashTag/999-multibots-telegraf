/**
 * AGENT TURNS LEAVE THE POLLING LOOP: THE LANES THEY GO INTO.
 *
 * Telegraf fetches the next batch of updates only after every handler of the
 * current one has settled, so a handler that awaits a whole agent turn stops
 * the bot from hearing anything else -- other clients, the owner's presses, a
 * pre_checkout_query with its 10 s deadline. The lanes take the turn off the
 * handler: the handler enqueues and returns, the lane runs the turn.
 *
 * Every property below is one the lanes must keep so that leaving the loop
 * does not cost what the old awaited handler gave for free: one turn per chat
 * at a time, a burst answered once, a global cap on concurrent paid turns, and
 * a shutdown that can wait for what is still running.
 *
 * Fake clock and fake timers throughout, driven by hand, so the timing is
 * exact rather than "about".
 */
import { describe, it, expect, vi } from 'vitest'
import { createLanes, type LaneOptions } from '@/services/agentLanes'

/** A clock and a timer queue the test advances by hand. */
function fakeTime() {
  let now = 0
  let seq = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const setTimer = (fn: () => void, ms: number) => {
    const id = ++seq
    timers.set(id, { at: now + Math.max(0, ms), fn })
    return id
  }
  const clearTimer = (id: number) => {
    timers.delete(id)
  }
  /** Move the clock forward, firing due timers in order, settling promises between them. */
  const advance = async (ms: number) => {
    const until = now + ms
    for (;;) {
      await flush()
      let next: [number, { at: number; fn: () => void }] | undefined
      for (const entry of timers)
        if (entry[1].at <= until && (!next || entry[1].at < next[1].at))
          next = entry
      if (!next) break
      timers.delete(next[0])
      now = next[1].at
      next[1].fn()
    }
    now = until
    await flush()
  }
  return { setTimer, clearTimer, now: () => now, advance }
}

/** Let every pending microtask and promise chain settle. */
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function lanesWith(extra: Partial<LaneOptions> = {}) {
  const t = fakeTime()
  const lanes = createLanes({
    maxConcurrent: 6,
    quietMs: 1500,
    capMs: 5000,
    maxItems: 20,
    setTimer: t.setTimer,
    clearTimer: t.clearTimer as (h: unknown) => void,
    now: t.now,
    ...extra,
  })
  return { lanes, t }
}

describe('a burst on one key is one run', () => {
  it('three items within a second produce ONE run with all three, in order', async () => {
    const { lanes, t } = lanesWith()
    const runs: string[][] = []
    const run = async (batch: string[]) => {
      runs.push(batch)
    }
    lanes.enqueue('biz:c:900000001', 'a', run)
    await t.advance(400)
    lanes.enqueue('biz:c:900000001', 'b', run)
    await t.advance(400)
    lanes.enqueue('biz:c:900000001', 'c', run)
    // Quiet for less than the window since the last item: nothing yet.
    await t.advance(1400)
    expect(runs).toEqual([])
    await t.advance(200)
    expect(runs).toEqual([['a', 'b', 'c']])
  })

  it('the window restarts on each item, so the run starts quietMs after the LAST one', async () => {
    const { lanes, t } = lanesWith()
    const startedAt: number[] = []
    const run = async () => {
      startedAt.push(t.now())
    }
    lanes.enqueue('k:1', 1, run)
    await t.advance(1000)
    lanes.enqueue('k:1', 2, run)
    await t.advance(1000)
    lanes.enqueue('k:1', 3, run)
    await t.advance(3000)
    // Last item at 2000 ms, quiet 1500 ms: 3500, not 1500.
    expect(startedAt).toEqual([3500])
  })

  it('an item every second for ten seconds: the cap starts the first run by 5 s', async () => {
    const { lanes, t } = lanesWith()
    const runs: Array<{ at: number; batch: number[] }> = []
    const run = async (batch: number[]) => {
      runs.push({ at: t.now(), batch })
    }
    for (let i = 0; i < 10; i++) {
      lanes.enqueue('k:trickle', i, run)
      await t.advance(1000)
    }
    await t.advance(5000)
    expect(runs.length).toBeGreaterThan(0)
    expect(runs[0].at).toBeLessThanOrEqual(5000)
    // Nothing lost and nothing twice: every item is in exactly one batch.
    expect(runs.flatMap(r => r.batch)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('at maxItems the batch stops waiting for quiet, and nothing beyond it is dropped', async () => {
    const { lanes, t } = lanesWith({ maxItems: 3 })
    const runs: number[][] = []
    const run = async (batch: number[]) => {
      runs.push(batch)
    }
    for (let i = 0; i < 5; i++) lanes.enqueue('k:big', i, run)
    await t.advance(0)
    // No quiet window for a full batch...
    expect(runs).toEqual([[0, 1, 2]])
    // ...and the items after it are the follow-up, not lost.
    await t.advance(1500)
    expect(runs).toEqual([
      [0, 1, 2],
      [3, 4],
    ])
  })

  it('different keys do not merge', async () => {
    const { lanes, t } = lanesWith()
    const runs: string[][] = []
    const run = async (batch: string[]) => {
      runs.push(batch)
    }
    lanes.enqueue('k:a', 'a1', run)
    lanes.enqueue('k:b', 'b1', run)
    await t.advance(1500)
    expect(runs.sort()).toEqual([['a1'], ['b1']])
  })
})

describe('never two runs of one key at once', () => {
  it('an item that arrives while running produces a second run AFTER the first', async () => {
    const { lanes, t } = lanesWith()
    const gate = deferred()
    const log: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const run = async (batch: string[]) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      log.push(`start ${batch.join(',')}`)
      if (batch[0] === 'first') await gate.promise
      log.push(`end ${batch.join(',')}`)
      inFlight -= 1
    }
    lanes.enqueue('k:1', 'first', run)
    await t.advance(1500)
    expect(log).toEqual(['start first'])

    lanes.enqueue('k:1', 'second', run)
    lanes.enqueue('k:1', 'third', run)
    // Long past the window: still must not start while the first runs.
    await t.advance(60_000)
    expect(log).toEqual(['start first'])
    expect(lanes.busy('k:1')).toBe(true)
    expect(lanes.pending('k:1')).toBe(2)

    gate.resolve()
    await t.advance(0)
    expect(log).toEqual([
      'start first',
      'end first',
      'start second,third',
      'end second,third',
    ])
    expect(maxInFlight).toBe(1)
    expect(lanes.busy('k:1')).toBe(false)
  })

  it('the follow-up batch is debounced from its last item, not from the end of the run', async () => {
    const { lanes, t } = lanesWith()
    const gate = deferred()
    const starts: number[] = []
    const run = async (batch: string[]) => {
      starts.push(t.now())
      if (batch[0] === 'first') await gate.promise
    }
    lanes.enqueue('k:1', 'first', run)
    await t.advance(1500) // first run starts at 1500
    await t.advance(10_000)
    lanes.enqueue('k:1', 'late', run) // at 11500
    await t.advance(500)
    gate.resolve() // run ends at 12000, only 500 ms after the late item
    await t.advance(0)
    expect(starts).toEqual([1500])
    await t.advance(1000)
    expect(starts).toEqual([1500, 13_000])
  })

  it('exclusive jobs of one key run one after another, never merged', async () => {
    const { lanes, t } = lanesWith()
    const gate = deferred()
    const log: string[] = []
    lanes.exclusive('dm:1', async () => {
      log.push('a start')
      await gate.promise
      log.push('a end')
    })
    lanes.exclusive('dm:1', async () => {
      log.push('b')
    })
    await t.advance(0)
    expect(log).toEqual(['a start'])
    gate.resolve()
    await t.advance(0)
    expect(log).toEqual(['a start', 'a end', 'b'])
  })
})

describe('a global cap on concurrent turns', () => {
  it('with maxConcurrent 2 a third key waits, then runs when a slot frees (FIFO)', async () => {
    const { lanes, t } = lanesWith({ maxConcurrent: 2 })
    const gates = [deferred(), deferred(), deferred()]
    const started: string[] = []
    for (const [i, key] of ['dm:a', 'dm:b', 'dm:c'].entries()) {
      lanes.exclusive(key, async () => {
        started.push(key)
        await gates[i].promise
      })
    }
    await t.advance(0)
    expect(started).toEqual(['dm:a', 'dm:b'])
    expect(lanes.stats()).toMatchObject({ running: 2, waiting: 1 })
    gates[1].resolve()
    await t.advance(0)
    expect(started).toEqual(['dm:a', 'dm:b', 'dm:c'])
    gates[0].resolve()
    gates[2].resolve()
    await t.advance(0)
    expect(lanes.stats()).toMatchObject({ running: 0, waiting: 0, keys: 0 })
  })

  it('items that arrive while their key waits for a slot join the batch it will run', async () => {
    const { lanes, t } = lanesWith({ maxConcurrent: 1 })
    const gate = deferred()
    const runs: string[][] = []
    lanes.exclusive('crm:1', () => gate.promise)
    const run = async (batch: string[]) => {
      runs.push(batch)
    }
    lanes.enqueue('biz:c:1', 'x', run)
    await t.advance(1500)
    lanes.enqueue('biz:c:1', 'y', run)
    await t.advance(10_000)
    expect(runs).toEqual([])
    gate.resolve()
    await t.advance(0)
    expect(runs).toEqual([['x', 'y']])
  })
})

describe('failure and shutdown', () => {
  it('a throwing job is logged and the key carries on; the caller never sees a rejection', async () => {
    const { lanes, t } = lanesWith()
    const ran: string[] = []
    expect(() =>
      lanes.exclusive('dm:1', async () => {
        throw new Error('boom')
      })
    ).not.toThrow()
    expect(() =>
      lanes.exclusive('dm:1', () => {
        throw new Error('sync boom')
      })
    ).not.toThrow()
    lanes.exclusive('dm:1', async () => {
      ran.push('after')
    })
    const run = vi.fn(async () => {
      throw new Error('batch boom')
    })
    lanes.enqueue('biz:c:1', 'x', run)
    await t.advance(1500)
    lanes.enqueue('biz:c:1', 'y', async b => {
      ran.push(`batch ${b.join(',')}`)
    })
    await t.advance(1500)
    expect(ran).toEqual(['after', 'batch y'])
    expect(lanes.stats()).toMatchObject({ running: 0, waiting: 0 })
  })

  it('drain resolves as soon as everything has finished, with nothing unfinished', async () => {
    const { lanes, t } = lanesWith()
    const gate = deferred()
    lanes.exclusive('dm:1', () => gate.promise)
    let result: { unfinished: string[] } | undefined
    void lanes.drain(25_000).then(r => {
      result = r
    })
    await t.advance(1000)
    expect(result).toBeUndefined()
    gate.resolve()
    await t.advance(0)
    expect(result).toEqual({ unfinished: [] })
  })

  it('drain does not sit out the debounce: waiting items run at once', async () => {
    const { lanes, t } = lanesWith()
    const runs: string[][] = []
    lanes.enqueue('biz:c:1', 'x', async b => {
      runs.push(b)
    })
    let result: { unfinished: string[] } | undefined
    void lanes.drain(25_000).then(r => {
      result = r
    })
    await t.advance(0)
    expect(runs).toEqual([['x']])
    expect(result).toEqual({ unfinished: [] })
  })

  it('drain returns the unfinished keys when a job hangs past the timeout', async () => {
    const { lanes, t } = lanesWith({ maxConcurrent: 1 })
    lanes.exclusive('biz:c:900000001', () => new Promise(() => {}))
    lanes.enqueue('biz:c:900000002', 'queued', async () => {})
    let result: { unfinished: string[] } | undefined
    void lanes.drain(25_000).then(r => {
      result = r
    })
    await t.advance(24_999)
    expect(result).toBeUndefined()
    await t.advance(1)
    expect(result?.unfinished.sort()).toEqual([
      'biz:c:900000001',
      'biz:c:900000002',
    ])
  })

  it('an idle drain resolves at once', async () => {
    const { lanes } = lanesWith()
    await expect(lanes.drain(25_000)).resolves.toEqual({ unfinished: [] })
  })
})
