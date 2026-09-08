import { onOrphaned } from './tg-proposals'
import type { OrphanReason, PublicProposal } from './tg-proposals'
import {
  ensureInvoiceColumns,
  forgetInvoiceColumnsForTests,
} from './token-invoice'

/**
 * A draft that leaves the queue unsent takes its invoice out of "pending".
 *
 * Measured 2026-09-08: every crm_offer minted a Stars link AND wrote a
 * token_invoices row before the owner had seen the card. Press "Cancel" and
 * the draft was gone -- the row stayed, unredeemed, forever. The reconcile
 * that lists "unpaid invoices" then kept showing a sale nobody was asked to
 * make, and a second offer to the same person doubled it.
 *
 * What this does: on cancel / replace / expiry / failed send, stamp the row
 * with when and why. What it does NOT do: revoke the link. Telegram has no
 * such call, so /api/tokens/verify -- the ONE place that matches a Stars
 * payment to a row and credits the tokens -- keeps looking at cancelled
 * rows too, and clears the stamp when it redeems one. Redemption wins.
 * "Cancelled" here means "we no longer expect it", not "it cannot happen".
 */
type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
}
type GetPool = () => Pool | Promise<Pool>

let wired = false

/**
 * Register once per process. The queue module has no database of its own;
 * the server hands it one here, at startup, so a draft dropped by expiry
 * inside a tool call is marked just like one cancelled by a button.
 */
export function wireInvoiceOrphans(getPool: GetPool): void {
  if (wired) return
  wired = true
  onOrphaned((p, reason) => {
    // Fire and forget: nobody awaits a hang-up note, and a slow database
    // must not hold the button press that caused it.
    void markOrphaned(getPool, p, reason)
  })
}

/** For tests: forget the registration so the next wire takes effect. */
export function unwireInvoiceOrphans(): void {
  wired = false
  forgetInvoiceColumnsForTests()
  onOrphaned(null)
}

/**
 * The write itself. Returns whether the note landed; a failure is logged
 * with the row and the reason, because this is the only trace when the
 * database that keeps the journal is the thing that failed.
 */
export async function markOrphaned(
  getPool: GetPool,
  p: PublicProposal,
  reason: OrphanReason
): Promise<boolean> {
  if (p.invoiceId === undefined) return false
  try {
    const pool = await getPool()
    await ensureInvoiceColumns(pool)
    await pool.query(
      `UPDATE token_invoices
         SET cancelled_at = now(), cancel_reason = $2
       WHERE id = $1 AND redeemed = FALSE AND cancelled_at IS NULL`,
      [p.invoiceId, reason]
    )
    return true
  } catch (e) {
    console.warn(
      '[STARS] orphaned invoice not marked:',
      p.invoiceId,
      reason,
      String(e).slice(0, 120)
    )
    return false
  }
}
