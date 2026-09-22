/**
 * A PROVIDER THAT JUST TIMED OUT IS NOT ASKED FIRST BY THE NEXT PERSON.
 *
 * Production, 2026-09-22, the admin bot: turn 6b3f6cad logged
 * `[agent] provider skipped: zai: не ответил за 120с (таймаут)` -- the person
 * waited the whole deadline before the next provider in the chain was even
 * tried. Nothing remembered it, so the next turn would have waited the same
 * deadline on the same route, and so would every person after them, until the
 * vendor recovered by itself.
 *
 * A circuit breaker per provider, in memory, for this process only:
 *
 *   closed     -- asked in chain order, as before.
 *   open       -- after one timeout, or BREAKER_FAILURES_TO_OPEN failures in a
 *                 row, for BREAKER_COOLDOWN_MS. New turns ask it LAST, behind
 *                 every provider that is not open. Last, not never: a breaker
 *                 must not be the reason nobody was asked.
 *   half-open  -- the cooldown ran out. The first turn to reach it asks it in
 *                 its normal place, as a probe; turns that arrive while the
 *                 probe is in flight still ask it last. The probe's verdict
 *                 closes the breaker or opens it for another cooldown.
 *
 * WHAT IT DOES NOT TOUCH. The owner's /model choice and AGENT_PROVIDER decide
 * the ORDER (providerOrder, provider-choice.ts); the breaker only moves an
 * open route behind the others for a while and is forgotten on restart. The
 * persisted choice is never rewritten, so once the breaker closes the chosen
 * provider is first again. An explicit /model switch resets the chosen
 * provider's breaker: the owner who just picked a model expects it to answer
 * the next message, not to find it parked.
 *
 * LOGGED ON TRANSITIONS ONLY -- opened, probe failed, closed -- never per
 * turn. A route that stays open for minutes costs one line, not one line for
 * every person who was quietly routed around it.
 */

/** One timeout opens at once; other failures open after this many in a row. */
export const BREAKER_FAILURES_TO_OPEN = 3

/**
 * How long an open provider is asked last.
 *
 * Measured on vibee-render, 2026-09-20..22 (97 deployments' logs): the zai
 * timeouts and the turns the callers abandoned while waiting on a provider
 * came in clusters, not one-offs. The cost on each side is what decides the
 * number: while open, a turn that would have been answered by the head of
 * the chain is answered by the next provider instead (a model downgrade for
 * minutes); while wrongly closed, one person waits a whole silence deadline.
 * One probe per window caps the second cost at one person per window.
 */
export const BREAKER_COOLDOWN_MS = 5 * 60_000

export const BREAKER_LOG_PREFIX = '[agent] provider breaker'

/** Why a call failed, as far as the breaker cares. */
export type FailureKind = 'timeout' | 'error' | 'empty'

interface Entry {
  /** Failures in a row while closed. */
  failures: number
  /** 0 while closed; otherwise the moment the provider may be probed. */
  openUntil: number
  /** A probe is in flight; nobody else probes until it has a verdict. */
  probing: boolean
  /** The failure that opened it, for the chain's final error. */
  reason: string
}

const entries = new Map<string, Entry>()

/** Asked last on a new turn: open and cooling, or a probe already out. */
function parked(e: Entry | undefined, now: number): boolean {
  return !!e && e.openUntil !== 0 && (now < e.openUntil || e.probing)
}

/**
 * The chain in the order a new turn should ask it: every provider that is not
 * parked, in its configured order, then the parked ones, soonest-to-reopen
 * first. `parked` says which were moved and why, for the final "nobody
 * answered" error. Pure: ordering claims nothing.
 */
export function orderByBreaker<T extends { id: string }>(
  providers: readonly T[],
  now: number = Date.now()
): {
  ordered: T[]
  parked: Array<{ provider: T; until: number; reason: string }>
} {
  const ready: T[] = []
  const moved: Array<{ provider: T; until: number; reason: string }> = []
  for (const p of providers) {
    const e = entries.get(p.id)
    if (parked(e, now) && e) {
      moved.push({ provider: p, until: e.openUntil, reason: e.reason })
    } else ready.push(p)
  }
  moved.sort((a, b) => a.until - b.until)
  return { ordered: [...ready, ...moved.map(x => x.provider)], parked: moved }
}

/**
 * About to ask this provider. Returns true when this call is THE probe of a
 * half-open breaker, which the caller must settle with a verdict or with
 * releaseProbe -- otherwise the probe would stay claimed forever.
 */
export function claimProbe(id: string, now: number = Date.now()): boolean {
  const e = entries.get(id)
  if (!e || e.openUntil === 0 || now < e.openUntil || e.probing) return false
  e.probing = true
  return true
}

/** The call ended with no verdict -- the caller left, or the turn decides. */
export function releaseProbe(id: string): void {
  const e = entries.get(id)
  if (e) e.probing = false
}

/** The provider answered with something usable. Closes an open breaker. */
export function recordSuccess(id: string): void {
  const e = entries.get(id)
  if (!e) return
  if (e.openUntil !== 0) {
    console.log(`${BREAKER_LOG_PREFIX} closed: ${id} answered again`)
  }
  entries.delete(id)
}

/**
 * The provider failed this call. Returns true when this call opened (or
 * re-opened after a probe) the breaker -- the one moment worth a log line.
 */
export function recordFailure(
  id: string,
  kind: FailureKind,
  reason: string,
  now: number = Date.now()
): boolean {
  let e = entries.get(id)
  if (!e) {
    e = { failures: 0, openUntil: 0, probing: false, reason: '' }
    entries.set(id, e)
  }
  const secs = Math.round(BREAKER_COOLDOWN_MS / 1000)
  if (e.openUntil !== 0) {
    const wasProbe = e.probing || now >= e.openUntil
    e.probing = false
    e.openUntil = now + BREAKER_COOLDOWN_MS
    e.reason = reason
    // Asked as the last resort while open and failed again: the opening was
    // already logged, and a line here would be one per turn.
    if (!wasProbe) return false
    console.warn(
      `${BREAKER_LOG_PREFIX} probe failed, open again for ${secs}s: ${reason}`
    )
    return true
  }
  e.failures += 1
  if (kind !== 'timeout' && e.failures < BREAKER_FAILURES_TO_OPEN) return false
  e.openUntil = now + BREAKER_COOLDOWN_MS
  e.probing = false
  e.reason = reason
  const why = kind === 'timeout' ? 'timeout' : `${e.failures} failures in a row`
  console.warn(`${BREAKER_LOG_PREFIX} opened for ${secs}s (${why}): ${reason}`)
  return true
}

/** The owner picked this provider by hand: give it the next message. */
export function resetBreaker(id: string): void {
  const e = entries.get(id)
  if (e && e.openUntil !== 0) {
    console.log(`${BREAKER_LOG_PREFIX} closed: ${id} chosen by the owner`)
  }
  entries.delete(id)
}

/** Open providers and when each may be probed; for diagnostics. */
export function breakerSnapshot(): Array<{
  id: string
  openUntil: number
  probing: boolean
  reason: string
}> {
  return [...entries.entries()]
    .filter(([, e]) => e.openUntil !== 0)
    .map(([id, e]) => ({
      id,
      openUntil: e.openUntil,
      probing: e.probing,
      reason: e.reason,
    }))
}

/** For tests. */
export function forgetBreakersForTests(): void {
  entries.clear()
}
