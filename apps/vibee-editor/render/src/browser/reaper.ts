/**
 * PODS THAT NOBODY IS WATCHING GO OUT.
 *
 * This is the whole economics of the feature. Measured 2026-09-20: a pod
 * costs ~743 MiB at rest and starts in about ten seconds. A hundred people
 * with a pod each, left running, is 74 GB of memory held for nothing; the
 * same hundred, reaped when idle, is whatever handful are actually working.
 * Ten seconds to come back is the price, and it is cheap.
 *
 * ── WHAT "IDLE" IS ALLOWED TO MEAN ────────────────────────────────────────
 *
 * Not "the mini app has not asked recently". The app polls the session route
 * every ten seconds to notice an agent starting work, and the first version
 * of this touched the row on every one of those polls -- which would have
 * kept every pod of every person with the app open alive forever, and this
 * reaper would have had nothing to do. The bug was in the definition, not in
 * the sweep.
 *
 * Idle means: no viewer socket has been open, and nothing has driven the pod,
 * since `last_seen_at`. That row is touched by real use -- the WebSocket that
 * carries the person's keyboard, while it is open -- and by an explicit
 * start. It is NOT touched by a status poll.
 *
 * ── WHAT IS NEVER REAPED ──────────────────────────────────────────────────
 *
 * A session younger than the grace period, whatever its timestamps say. A pod
 * takes ten seconds to answer and a person may take a minute to look at it;
 * reaping during that window would make "open my browser" fail for reasons
 * the person cannot see.
 *
 * THE PROFILE IS NEVER TOUCHED HERE. Reaping stops a browser; it does not
 * sign anybody out. That distinction is the whole reason profiles live in
 * their own table (`profiles.ts`).
 */

import { dropSession, type Queryable } from './sessions'
import type { PodDriver } from './pod-driver'

/** Long enough that a coffee does not cost the session; short enough to matter. */
export const IDLE_LIMIT_MS = 10 * 60 * 1000

/** Nothing is reaped before this, no matter how quiet it looks. */
export const MIN_AGE_MS = 2 * 60 * 1000

export interface ReapCandidate {
  telegramId: string
  sessionId: string
  podId: string | null
  lastSeenMs: number
  createdMs: number
}

/**
 * Which of these have gone quiet. Pure, so the rule can be tested without a
 * clock, a database or a container runtime.
 */
export function dueForReaping(
  rows: readonly ReapCandidate[],
  nowMs: number,
  idleMs: number = IDLE_LIMIT_MS,
  minAgeMs: number = MIN_AGE_MS
): ReapCandidate[] {
  return rows.filter(r => {
    /* Too young to judge: it may still be coming up. */
    if (nowMs - r.createdMs < minAgeMs) return false
    /*
     * A row with no use yet is measured from its birth, not from zero --
     * otherwise a session created and never opened would look infinitely
     * idle and be reaped the instant it passed the minimum age.
     */
    const active = Math.max(r.lastSeenMs, r.createdMs)
    return nowMs - active >= idleMs
  })
}

export interface SweepResult {
  looked: number
  reaped: string[]
  failed: string[]
}

/**
 * One pass. Stops each quiet pod and forgets its row; a pod that refuses to
 * stop keeps its row, so the next pass tries again rather than leaving a
 * running browser that nothing can name.
 */
export async function sweepIdleSessions(
  pool: Queryable,
  driver: PodDriver,
  nowMs: number = Date.now(),
  idleMs: number = IDLE_LIMIT_MS
): Promise<SweepResult> {
  const { rows } = await pool.query(
    `SELECT telegram_id, session_id, pod_id,
            extract(epoch from last_seen_at) * 1000 AS last_seen_ms,
            extract(epoch from created_at)   * 1000 AS created_ms
       FROM browser_sessions`,
    []
  )

  const candidates: ReapCandidate[] = rows.map(r => ({
    telegramId: String(r.telegram_id),
    sessionId: String(r.session_id),
    podId:
      r.pod_id === null || r.pod_id === undefined ? null : String(r.pod_id),
    lastSeenMs: Number(r.last_seen_ms) || 0,
    createdMs: Number(r.created_ms) || 0,
  }))

  const out: SweepResult = { looked: candidates.length, reaped: [], failed: [] }
  for (const c of dueForReaping(candidates, nowMs, idleMs)) {
    try {
      if (c.podId) await driver.stop(c.podId)
      await dropSession(pool, c.telegramId)
      out.reaped.push(c.sessionId)
    } catch {
      /* Left in place on purpose: the next pass will try it again. */
      out.failed.push(c.sessionId)
    }
  }
  return out
}
