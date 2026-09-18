/**
 * CLAIM A PENDING INVOICE BEFORE CREDITING IT.
 *
 * Spec: t27 specs/functions/payment-ai-server-process.t27 (NOTE 2026-09-17).
 *
 * The Robokassa ResultURL route (api_server/routes/robokassa.routes.ts) flips
 * a payments_v2 row PENDING -> COMPLETED with a compare-and-set and credits
 * only when it won. The Inngest function payment-ai-server-process is a second
 * settlement path for the same rows (its events come from outside this repo)
 * and until 2026-09-17 it did neither: updateUserBalance set COMPLETED by
 * inv_id unconditionally, reported true even when no row matched, and never
 * compared the amount the event carried with the amount that was invoiced.
 *
 * This helper is the one place both facts are checked, atomically where it
 * matters:
 *   - the row must exist                          -> 'unknown-invoice'
 *   - the paid amount must equal the invoiced one -> 'amount-mismatch'
 *   - the flip is `.eq('status', PENDING)`; zero rows updated means another
 *     delivery already credited it                -> 'already-claimed'
 * Only 'claimed' may be followed by a credit. A caller decides what each
 * refusal means for it; this function never credits and never notifies.
 */
import { supabaseAdmin } from './client'
import { PaymentStatus } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'

export type ClaimInvoiceResult =
  | { ok: true; outcome: 'claimed'; invoiced: number }
  | { ok: false; outcome: 'unknown-invoice' }
  | { ok: false; outcome: 'amount-mismatch'; invoiced: number; paid: number }
  | { ok: false; outcome: 'already-claimed'; status: string }
  | { ok: false; outcome: 'db-error'; error: string }

/** Whole-currency comparison: payments_v2.amount is parseFloat(OutSum) in RUB. */
export function amountsMatch(invoiced: unknown, paid: number): boolean {
  const a = Number(invoiced)
  return Number.isFinite(a) && Math.round(a) === Math.round(paid)
}

export async function claimPendingInvoice(
  invId: string | number,
  paidRub: number
): Promise<ClaimInvoiceResult> {
  const inv_id = String(invId)
  const { data: row, error: readError } = await supabaseAdmin
    .from('payments_v2')
    .select('inv_id, status, amount')
    .eq('inv_id', inv_id)
    .maybeSingle()

  if (readError) {
    logger.error('[claim-invoice] read failed', { inv_id, error: readError })
    return { ok: false, outcome: 'db-error', error: readError.message }
  }
  if (!row) return { ok: false, outcome: 'unknown-invoice' }

  if (!amountsMatch(row.amount, paidRub)) {
    logger.error('[claim-invoice] amount mismatch, not crediting', {
      inv_id,
      invoiced: row.amount,
      paid: paidRub,
    })
    return {
      ok: false,
      outcome: 'amount-mismatch',
      invoiced: Number(row.amount),
      paid: paidRub,
    }
  }

  if (row.status !== PaymentStatus.PENDING) {
    return { ok: false, outcome: 'already-claimed', status: String(row.status) }
  }

  const { data: claimed, error: updateError } = await supabaseAdmin
    .from('payments_v2')
    .update({
      status: PaymentStatus.COMPLETED,
      payment_date: new Date().toISOString(),
    })
    .eq('inv_id', inv_id)
    .eq('status', PaymentStatus.PENDING)
    .select('inv_id')

  if (updateError) {
    logger.error('[claim-invoice] update failed', {
      inv_id,
      error: updateError,
    })
    return { ok: false, outcome: 'db-error', error: updateError.message }
  }
  if (!claimed || claimed.length === 0) {
    // Lost the race: a concurrent delivery flipped it between our read and
    // our update. It credited; we must not.
    return { ok: false, outcome: 'already-claimed', status: 'COMPLETED' }
  }
  return { ok: true, outcome: 'claimed', invoiced: Number(row.amount) }
}
