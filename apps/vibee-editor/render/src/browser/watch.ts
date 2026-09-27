/**
 * HOW LONG HAS THE BROWSER NOT BEEN A BROWSER?
 *
 * The pod was unreadable from 2026-09-24 to 26 -- `Runtime.evaluate` timing
 * out while `/json/version` answered perfectly -- and nobody could say that
 * afterwards. The state existed only in the moment: every probe printed a line
 * and forgot it, so "the browser broke three days ago" had to be reconstructed
 * from a Chromium start time found by hand inside the container.
 *
 * This keeps the one number that was missing: SINCE WHEN. A single row in the
 * strategies store, updated by a probe on a clock, so after a deploy and after
 * a night the answer to "is it well, and since when" is one read.
 *
 * ── IT WATCHES, IT DOES NOT HEAL ──────────────────────────────────────────
 *
 * Restarting the browser stays where it already is: the round (rounds-wiring.ts
 * -> runRound -> restartBrowserAsAgent). Two things restarting the same pod on
 * two clocks would fight, and a restart that lands while the person is typing
 * in their own browser is worse than a wedge they can see. So this module
 * records, and something with a person's consent acts. What it adds to healing
 * is the fact healing needed: how long it has been bad, which turns "restart
 * it again" into "it has been bad for two hours and three restarts did not
 * help", the sentence that would have ended the three-day bug on day one.
 *
 * The boot id (boot.ts) travels with the state, so a restart between two
 * probes is visible as a break rather than inferred from a gap.
 */

/** Where the watch keeps its one row. */
export const WATCH_KEY = 'browser:watch'

export interface WatchState {
  /** Did the last probe get a real answer out of a real page? */
  ok: boolean
  /** When that probe ran (ms since epoch). */
  at: number
  /** Since when it has been in this state, unbroken. */
  since: number
  /** Consecutive failures; 0 while it answers. */
  fails: number
  /** The last time it did answer, 0 if it never has. */
  lastOkAt: number
  /** Chromium's boot identity at the last probe, '' when unreadable. */
  bootId: string
  /** How many times the boot identity changed while being watched. */
  boots: number
}

export const FIRST_WATCH: WatchState = {
  ok: false,
  at: 0,
  since: 0,
  fails: 0,
  lastOkAt: 0,
  bootId: '',
  boots: 0,
}

/**
 * The next state from the previous one and one probe. Pure -- no clock, no pod,
 * no database -- because every interesting case here is a sequence, and a
 * sequence is only testable when the rule is separable from the world.
 */
export function nextWatch(
  prev: WatchState | null,
  probe: { ok: boolean; bootId: string; at: number }
): WatchState {
  const was = prev ?? FIRST_WATCH
  const changed = was.ok !== probe.ok || !was.at
  /*
   * A boot id counts as a new boot only when BOTH readings exist. An
   * unreadable pod reports '', and treating that as a change would count two
   * boots for every outage -- one into the dark and one out of it.
   */
  const rebooted = !!probe.bootId && !!was.bootId && probe.bootId !== was.bootId
  return {
    ok: probe.ok,
    at: probe.at,
    since: changed ? probe.at : was.since,
    fails: probe.ok ? 0 : was.fails + 1,
    lastOkAt: probe.ok ? probe.at : was.lastOkAt,
    /* Keep the last identity we could actually read: '' is not news. */
    bootId: probe.bootId || was.bootId,
    boots: was.boots + (rebooted ? 1 : 0),
  }
}

/**
 * One pass: probe the configured pod, fold the answer into the stored state,
 * write it back. Never throws -- a watch that can bring down the server it
 * watches from is worse than no watch. Returns null when there is nothing to
 * watch (no pod configured), which is not a failure.
 */
export async function runWatch(
  q: import('./sessions').Queryable,
  cdpEndpoint: string | undefined,
  nowMs: number
): Promise<WatchState | null> {
  const cdp = (cdpEndpoint || '').trim()
  if (!cdp) return null
  try {
    const [
      { readStrategy, writeStrategy },
      { browserAnswers, cdpHealthIo },
      { browserBootId },
    ] = await Promise.all([
      import('../agent/strategies'),
      import('./health'),
      import('./boot'),
    ])
    const prev = (await readStrategy(q, WATCH_KEY)) as WatchState | null
    const ok = await browserAnswers(cdp, await cdpHealthIo())
    const bootId = await browserBootId(cdp)
    const state = nextWatch(prev, { ok, bootId, at: nowMs })
    await writeStrategy(q, WATCH_KEY, state)
    return state
  } catch (e) {
    console.warn('[browser:watch] not recorded:', String(e).slice(0, 160))
    return null
  }
}

/** What is on record, without probing anything. */
export async function readWatch(
  q: import('./sessions').Queryable
): Promise<WatchState | null> {
  const { readStrategy } = await import('../agent/strategies')
  return (await readStrategy(q, WATCH_KEY)) as WatchState | null
}

/** Whole minutes, floored; negative clock skew reads as 0. */
export function minutesBetween(fromMs: number, toMs: number): number {
  if (!fromMs || toMs <= fromMs) return 0
  return Math.floor((toMs - fromMs) / 60_000)
}

/**
 * One line for a log: the sentence that did not exist for three days. The
 * person reads it in their own language in `tri pod`, which formats the state
 * itself -- this stays English, like every other line in the render's log.
 */
export function describeWatch(s: WatchState | null, nowMs: number): string {
  if (!s || !s.at) return 'never probed'
  const held = `${minutesBetween(s.since, nowMs)}m`
  if (s.ok) return `answering for ${held}`
  const last = s.lastOkAt
    ? `last real answer ${minutesBetween(s.lastOkAt, nowMs)}m ago`
    : 'never answered once'
  return `NOT answering for ${held} (${s.fails} failures in a row; ${last})`
}
