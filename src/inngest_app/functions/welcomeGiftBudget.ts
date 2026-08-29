/**
 * Per-process burst circuit-breaker for the free welcome-avatar gift.
 *
 * WHY. The welcome gift (is_welcome_gift) skips the user's balance and spends
 * the OWNER's provider money on every genuinely-new registration
 * (createUserScene, gated by wasCreated). Enabling it (#1082) opened that cost
 * with no bound. A precise, shared, restart-proof DAILY budget needs a durable
 * atomic counter in the database — there is no such table and adding one needs
 * owner DB access (same class as the missing #999 atomic-deduct RPC). This is
 * the part that CAN ship without a migration: a module-level counter that caps
 * how many gifts one process hands out before it resets.
 *
 * WHAT THIS IS — AND IS NOT (read before trusting it as a budget).
 *   - It is a BURST breaker, not a calendar-day budget. Railway redeploys on
 *     every merge to main and several autonomous loops merge here daily, so
 *     this process restarts often and the counter resets with it. It bounds a
 *     sudden flood or a wasCreated-misfire loop WITHIN one uptime window; it
 *     does not enforce a spend limit across a day.
 *   - It is PER-PROCESS. With more than one replica each keeps its own tally,
 *     so the effective ceiling is LIMIT × replicas.
 *   - It counts GRANTED ATTEMPTS, not charged generations (a granted attempt
 *     that later fails still consumed its slot) — deliberately conservative.
 *   - It never blocks an organic user: LIMIT sits far above any real
 *     new-user burst. If a genuine viral spike ever reaches it, raise LIMIT.
 *
 * Reversible: raise LIMIT, or drop the reserve step in welcomeAvatarGeneration.
 * A precise shared quota remains owner-blocked (needs a DB counter table).
 */

// Runaway backstop, not a spend budget. Far above any organic new-user burst;
// low enough that a bug-loop or flood is stopped instead of running unbounded.
// Owner tunes this (or funds a DB quota for a precise per-day limit).
const LIMIT = 500

let windowDay = ''
let used = 0

export interface WelcomeGiftSlot {
  granted: boolean
  used: number
  limit: number
}

/**
 * Reserve one welcome-gift slot from the per-process burst breaker.
 *
 * @param now injected so the day-rollover reset is testable.
 * @returns granted:false once LIMIT is reached for the current process/day.
 */
export function reserveWelcomeGiftSlot(now: Date): WelcomeGiftSlot {
  const day = now.toISOString().slice(0, 10)
  if (day !== windowDay) {
    windowDay = day
    used = 0
  }
  if (used >= LIMIT) {
    return { granted: false, used, limit: LIMIT }
  }
  used += 1
  return { granted: true, used, limit: LIMIT }
}

/** Test seam: reset the module counter between cases. */
export function __resetWelcomeGiftBudgetForTest(): void {
  windowDay = ''
  used = 0
}
