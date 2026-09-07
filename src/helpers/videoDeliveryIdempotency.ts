/**
 * Bounded per-job delivery idempotency for video jobs.
 *
 * A completed video job can be delivered more than once: provider webhooks are
 * at-least-once (retries), a persistent "update status" button can race the
 * poller. Each delivery path claims the IMMUTABLE job id before its delivery
 * await; a duplicate claim returns false and the caller skips the re-send (and,
 * where present, the re-charge / public repost).
 *
 * The set is bounded so a long-lived multi-bot process cannot grow it without
 * limit — it evicts oldest-first (FIFO) once it exceeds the cap. In-process only
 * (resets on restart); a durable guard would be a per-job marker on payments_v2.
 *
 * Each caller gets its OWN claimer (its own set) via the factory, so job-id
 * namespaces from different providers (kie taskId, ai-reels telegram-<id>-<ts>,
 * poller provider jobId) cannot collide into a false skip.
 */
const DEFAULT_MAX = 1000

// A claimer with an additive release(), for callers that must undo a claim
// when delivery fails BEFORE any send (so a legitimate at-least-once retry can
// re-deliver). Existing callers keep calling it as a plain (jobId) => boolean.
export type VideoDeliveryClaimer = ((jobId: string) => boolean) & {
  release(jobId: string): void
}

export function createVideoDeliveryClaimer(
  max: number = DEFAULT_MAX
): VideoDeliveryClaimer {
  const delivered = new Set<string>()
  const claim = function claimVideoJobDelivery(jobId: string): boolean {
    // has()+add() is synchronous, so it is atomic w.r.t. the event loop: the
    // first entry for a job wins, a racing re-entry gets false.
    if (delivered.has(jobId)) return false
    delivered.add(jobId)
    if (delivered.size > max) {
      const oldest = delivered.values().next().value
      if (oldest !== undefined) delivered.delete(oldest)
    }
    return true
  } as VideoDeliveryClaimer
  // Undo a claim. Use ONLY when nothing was delivered yet (pre-send failure);
  // releasing after a send was attempted could allow a duplicate delivery.
  claim.release = function release(jobId: string): void {
    delivered.delete(jobId)
  }
  return claim
}
