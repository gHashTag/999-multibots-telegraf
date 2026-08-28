/**
 * Per-user serialization for balance writes.
 *
 * WHY. Balance is a ledger SUM over payments_v2, not a lockable column, and no
 * atomic deduct RPC exists yet (#999). So two concurrent deductions for the
 * same user — a double-tap, a Telegram callback redelivery, a network retry —
 * both read the same balance, both pass the sufficiency check, and both insert
 * a MONEY_OUTCOME row: the balance goes negative and one payment buys two
 * generations (audited as CRITICAL, #999).
 *
 * Serializing balance writes per user in-process makes the second call wait for
 * the first to finish its read-check-insert, so it reads the already-reduced
 * balance and is refused. This is the interim mitigation for the dominant
 * vector (concurrent requests in one bot process). It is single-process only:
 * across multiple replicas the atomic RPC in #999 is still required, because a
 * Map lives in one process. Different users never contend (keyed by id).
 */
const chains = new Map<string, Promise<unknown>>()

export function withUserBalanceLock<T>(
  id: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = chains.get(id) ?? Promise.resolve()
  // Run fn after prev settles, regardless of whether prev resolved or rejected:
  // a failed previous operation must not wedge the queue for this user.
  const run = prev.then(fn, fn)
  chains.set(id, run)
  // Drop the entry once this is the tail, so the map does not grow unbounded.
  // Swallow the rejection here so the cleanup promise never becomes an
  // unhandled rejection; the caller still sees run's real outcome.
  run.then(
    () => {
      if (chains.get(id) === run) chains.delete(id)
    },
    () => {
      if (chains.get(id) === run) chains.delete(id)
    }
  )
  return run
}
