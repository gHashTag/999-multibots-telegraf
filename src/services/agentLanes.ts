/**
 * AGENT TURNS DO NOT RUN INSIDE THE POLLING LOOP.
 *
 * Telegraf 4.16.3 polls like this (node_modules/telegraf/lib/core/network/
 * polling.js:73-74):
 *
 *   for await (const updates of this) await Promise.all(updates.map(handleUpdate))
 *
 * The next getUpdates is issued only when EVERY handler of the current batch
 * has settled, and src/index.ts creates each bot with `handlerTimeout:
 * Infinity`, so nothing lets go early. Three handlers used to await a whole
 * agent turn -- the business DM reply, the bot-DM agent fallback and the CRM
 * "prepare" / sweep -- and a turn lasts up to 420 s. For that long the bot
 * heard nothing: not other clients, not the owner's "Send" / "take over"
 * presses, not the owner typing into the chat, and not a pre_checkout_query, which
 * Telegram cancels after 10 s. Measured in production before this module:
 * pickup lag p90 13.5 s, max 126 s, once 234 s.
 *
 * So a handler now ENQUEUES the turn here and returns in milliseconds; the
 * lane runs it. What the awaited handler gave for free is kept on purpose:
 *
 *   - ONE RUN PER KEY AT A TIME. A key is one conversation ("biz:<conn>:<chat>",
 *     "dm:<chat>", "crm:<owner>"). Its next run starts only after the current
 *     one ends, so one chat never has two paid turns in flight.
 *   - A BURST IS ONE TURN (`enqueue`). Items for an idle key wait for a quiet
 *     moment -- `quietMs` after the LAST item, but never more than `capMs`
 *     after the first -- and then go as one batch. Items that arrive while a
 *     run is going accumulate and form ONE follow-up batch. Nothing is
 *     dropped: this replaces a single-flight Set that silently discarded every
 *     message of a burst but one (9 of 47 replies' worth, measured).
 *   - `exclusive` is the same lane without merging: jobs of one key run one by
 *     one, in order.
 *   - A GLOBAL CAP (`maxConcurrent`) on jobs running at once, across every bot
 *     in the process. A job waiting for a slot waits in FIFO order, and a batch
 *     is sealed only when its slot is granted, so items that arrive while it
 *     waits still join it.
 *   - NOTHING THROWS AT THE CALLER. A job that throws is logged and its key
 *     carries on; `enqueue` and `exclusive` never reject.
 *   - `drain` is for shutdown: it stops waiting out debounce windows, lets
 *     everything already accepted run, and reports the keys that did not
 *     finish in time, so somebody can be told who was left unanswered.
 *
 * Pure: no Telegram imports. The caller decides what a batch means.
 *
 * Logs carry ids and timings only, never message text:
 *   [lanes] enqueue {kind, pickupLagMs?}
 *   [lanes] run     {kind, laneWaitMs, merged, ms}
 */
import { logger } from '@/utils/logger'

export interface LaneOptions {
  /** Jobs running at once across every key. */
  maxConcurrent: number
  /** A burst is over when no item has arrived for this long. */
  quietMs: number
  /** ...or when this long has passed since its first item, whichever is first. */
  capMs: number
  /**
   * At this many waiting items the batch stops waiting for a quiet moment.
   * Items beyond it are still merged into the same batch: the caller caps the
   * merged text, so nothing is silently dropped here.
   */
  maxItems: number
  /** Injected so tests drive time by hand. */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  now?: () => number
}

export interface Lanes {
  /**
   * Add an item to a key's next batch. `run` receives every item of the batch
   * in arrival order; the latest `run` given for a key is the one used.
   */
  enqueue<T>(
    key: string,
    item: T,
    run: (batch: T[]) => Promise<void>,
    info?: { pickupLagMs?: number }
  ): void
  /** Run a job on a key after every earlier job of that key, never merged. */
  exclusive(key: string, job: () => Promise<void>): void
  /** A run is going, or something is waiting to run, on this key. */
  busy(key: string): boolean
  /** Items and jobs accepted on this key that no run has taken yet. */
  pending(key: string): number
  /**
   * Resolves when nothing is running or waiting, or when `timeoutMs` passes,
   * with the keys still unfinished at that moment.
   */
  drain(timeoutMs: number): Promise<{ unfinished: string[] }>
  stats(): { running: number; waiting: number; keys: number }
}

interface Lane {
  key: string
  running: boolean
  /** Sitting in the FIFO for a global slot. */
  queued: boolean
  items: unknown[]
  run: ((batch: unknown[]) => Promise<void>) | null
  firstAt: number
  lastAt: number
  timer: unknown
  /** The burst is over (quiet, cap, maxItems or drain) and may run. */
  ready: boolean
  jobs: Array<{ job: () => Promise<void>; at: number }>
}

const kindOf = (key: string): string => key.split(':', 1)[0] || 'lane'

export function createLanes(o: LaneOptions): Lanes {
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer =
    o.clearTimer ??
    ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const now = o.now ?? (() => Date.now())
  const maxConcurrent = Math.max(1, Math.floor(o.maxConcurrent))

  const lanes = new Map<string, Lane>()
  const waiting: Lane[] = []
  let active = 0
  let draining = false
  const idleWaiters: Array<() => void> = []

  const laneOf = (key: string): Lane => {
    let lane = lanes.get(key)
    if (!lane) {
      lane = {
        key,
        running: false,
        queued: false,
        items: [],
        run: null,
        firstAt: 0,
        lastAt: 0,
        timer: null,
        ready: false,
        jobs: [],
      }
      lanes.set(key, lane)
    }
    return lane
  }

  const unfinished = (): string[] =>
    [...lanes.values()]
      .filter(l => l.running || l.queued || l.items.length || l.jobs.length)
      .map(l => l.key)

  const tidy = (lane: Lane) => {
    if (
      !lane.running &&
      !lane.queued &&
      !lane.items.length &&
      !lane.jobs.length &&
      !lane.timer
    )
      lanes.delete(lane.key)
    if (active === 0 && !waiting.length && !unfinished().length) {
      for (const wake of idleWaiters.splice(0)) wake()
    }
  }

  const pump = () => {
    while (active < maxConcurrent && waiting.length) grant(waiting.shift()!)
  }

  /** Ask for a slot when the lane has something runnable and is not already in line. */
  const want = (lane: Lane) => {
    if (lane.running || lane.queued) return
    const runnable =
      lane.jobs.length > 0 || (lane.items.length > 0 && lane.ready)
    if (!runnable) return
    lane.queued = true
    waiting.push(lane)
    pump()
  }

  /** Re-time the burst after a new item: quiet after the last, capped from the first. */
  const arm = (lane: Lane) => {
    if (lane.timer) {
      clearTimer(lane.timer)
      lane.timer = null
    }
    const due = Math.min(lane.lastAt + o.quietMs, lane.firstAt + o.capMs)
    const delay = due - now()
    if (draining || lane.items.length >= o.maxItems || delay <= 0) {
      lane.ready = true
      want(lane)
      return
    }
    lane.ready = false
    lane.timer = setTimer(() => {
      lane.timer = null
      lane.ready = true
      want(lane)
    }, delay)
  }

  const grant = (lane: Lane) => {
    active += 1
    lane.queued = false
    lane.running = true
    const startedAt = now()
    const kind = kindOf(lane.key)
    let job: () => Promise<void>
    let waitedMs: number
    let merged: number
    const next = lane.jobs.shift()
    if (next) {
      job = next.job
      waitedMs = startedAt - next.at
      merged = 1
    } else {
      // The batch is sealed HERE, when the slot is granted, so items that
      // arrived while the lane waited for a slot are part of it.
      const batch = lane.items
      const run = lane.run!
      lane.items = []
      lane.ready = false
      if (lane.timer) {
        clearTimer(lane.timer)
        lane.timer = null
      }
      job = () => run(batch)
      waitedMs = startedAt - lane.firstAt
      merged = batch.length
    }
    // Started on a microtask so a synchronous throw is caught like an async one
    // and never unwinds into the handler that enqueued it.
    Promise.resolve()
      .then(job)
      .catch(error => {
        logger.error('[lanes] job failed', {
          kind,
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        logger.info('[lanes] run', {
          kind,
          laneWaitMs: Math.max(0, waitedMs),
          merged,
          ms: now() - startedAt,
        })
        active -= 1
        lane.running = false
        // A follow-up that already sat out its window goes to the back of the
        // line, behind keys that were waiting before it.
        if (lane.items.length && !lane.ready && !lane.timer) arm(lane)
        want(lane)
        pump()
        tidy(lane)
      })
  }

  return {
    enqueue(key, item, run, info) {
      const lane = laneOf(key)
      const t = now()
      if (!lane.items.length) lane.firstAt = t
      lane.items.push(item)
      lane.lastAt = t
      lane.run = run as (batch: unknown[]) => Promise<void>
      logger.info('[lanes] enqueue', {
        kind: kindOf(key),
        ...(info?.pickupLagMs !== undefined
          ? { pickupLagMs: Math.round(info.pickupLagMs) }
          : {}),
      })
      arm(lane)
    },

    exclusive(key, job) {
      const lane = laneOf(key)
      lane.jobs.push({ job, at: now() })
      logger.info('[lanes] enqueue', { kind: kindOf(key) })
      want(lane)
    },

    busy(key) {
      const lane = lanes.get(key)
      return Boolean(
        lane &&
          (lane.running || lane.queued || lane.items.length || lane.jobs.length)
      )
    },

    pending(key) {
      const lane = lanes.get(key)
      return lane ? lane.items.length + lane.jobs.length : 0
    },

    drain(timeoutMs) {
      draining = true
      // Nothing waits out a debounce window any more: every accepted item runs.
      for (const lane of [...lanes.values()])
        if (lane.items.length && !lane.ready) arm(lane)
      return new Promise(resolve => {
        let done = false
        let timer: unknown = null
        const finish = () => {
          if (done) return
          done = true
          if (timer) clearTimer(timer)
          const idx = idleWaiters.indexOf(onIdle)
          if (idx >= 0) idleWaiters.splice(idx, 1)
          draining = false
          resolve({ unfinished: unfinished() })
        }
        const onIdle = () => finish()
        if (active === 0 && !waiting.length && !unfinished().length) {
          finish()
          return
        }
        idleWaiters.push(onIdle)
        timer = setTimer(finish, Math.max(0, timeoutMs))
      })
    },

    stats() {
      return { running: active, waiting: waiting.length, keys: lanes.size }
    },
  }
}

/**
 * How long shutdown waits for accepted turns (SHUTDOWN_DRAIN_MS).
 *
 * It must end BEFORE the platform kills the container: Railway sends SIGTERM,
 * then SIGKILL after `drainingSeconds` (railway.toml sets 30; Railway's own
 * default is 0, which kills at once). 25 s leaves five for the owners' notices
 * and the exit. Garbage in the variable falls back to the default rather than
 * to 0, which would silently turn the drain off.
 */
export const SHUTDOWN_DRAIN_DEFAULT_MS = 25_000
export function shutdownDrainMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return SHUTDOWN_DRAIN_DEFAULT_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : SHUTDOWN_DRAIN_DEFAULT_MS
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

/**
 * The process-wide lanes every agent turn goes through.
 *
 * 1500 ms of quiet is longer than the gap between the parts of a burst a
 * person types or an album Telegram splits (a few hundred ms), and short
 * enough not to be felt against a turn that takes tens of seconds. The 5 s
 * cap stops a steady trickle from holding the answer back indefinitely.
 */
export const agentLanes: Lanes = createLanes({
  maxConcurrent: positiveInt(process.env.AGENT_LANES_MAX, 6),
  quietMs: 1500,
  capMs: 5000,
  maxItems: 20,
})
