/**
 * Tell the server what Telegram said after openInvoice.
 *
 * Owner, 2026-09-10: a person could not pay and no error reached him. The
 * outcome used to stop here, on the screen. Now `cancelled` / `failed` /
 * `pending` / `unsupported` go to POST /api/pay/outcome, where the hive
 * journal turns them into an alarm or a note for the keepers
 * (render/src/agent/payment-alarms.ts). Fire and forget: reporting must
 * never delay or break the payment screen itself.
 */
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

export type PaySurface = 'club' | 'tokens' | 'feed'
export type PayOutcome = 'cancelled' | 'failed' | 'pending' | 'unsupported'

export function reportPayOutcome(
  surface: PaySurface,
  outcome: PayOutcome,
  detail: { error?: string; stars?: number } = {}
): void {
  try {
    void fetch(`${API_BASE}/api/pay/outcome`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surface,
        outcome,
        error: detail.error ? String(detail.error).slice(0, 200) : undefined,
        stars: detail.stars,
      }),
      keepalive: true,
    }).catch(() => {
      // Nothing to do: the screen already told the person.
    })
  } catch {
    // Same: reporting is best-effort by design.
  }
}
