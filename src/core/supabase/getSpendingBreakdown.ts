import { supabase } from './client'
import { logger } from '@/utils/logger'
import { resolveUserService, UserService } from '@/utils/serviceMapping'

export type SpendingBreakdown = Array<
  [UserService, { count: number; stars: number }]
>

const PAGE = 1000

/**
 * Per-service spending computed from the ledger rows themselves.
 *
 * WHY NOT THE RPC. get_user_balance_stats_optimized groups by the service_type
 * column, and a database trigger rewrites that column into a short whitelist
 * ('other' for AI Photoshop, face swap, avatar transform; 'neuro_photo' for
 * Flux Kontext and the upscaler). Measured 2026-09-09 on the owner's ledger:
 * 949 of 3163 expense rows sat in "other" (38% of the spend) while metadata
 * and descriptions named the service. The trigger leaves `description` alone,
 * so processBalanceOperation writes "Payment for service: <mode>" there and
 * resolveUserService reads it back. This function is what lets the balance
 * screen use that.
 *
 * WHY PAGED. PostgREST caps one request at 1000 rows; the previous fallback
 * read a single page and summed a silently truncated ledger (the owner has
 * 3163 expense rows). Paged by id — the unique column; 1559 rows once shared a
 * single created_at second, so time is not a page key.
 *
 * Returns null when the ledger cannot be read, so the caller keeps the RPC
 * numbers instead of showing an empty breakdown as if nothing was spent.
 */
export async function getSpendingBreakdown(
  telegramId: string
): Promise<SpendingBreakdown | null> {
  try {
    const totals = new Map<UserService, { count: number; stars: number }>()
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('payments_v2')
        .select('service_type, description, stars')
        .eq('telegram_id', telegramId)
        .eq('type', 'MONEY_OUTCOME')
        .eq('status', 'COMPLETED')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      const rows = data ?? []
      for (const row of rows) {
        const service = resolveUserService(row.service_type, row.description)
        const current = totals.get(service) ?? { count: 0, stars: 0 }
        current.count += 1
        current.stars += Number(row.stars) || 0
        totals.set(service, current)
      }
      if (rows.length < PAGE) break
    }
    return [...totals.entries()].sort(([, a], [, b]) => b.stars - a.stars)
  } catch (error) {
    logger.warn(
      '[getSpendingBreakdown] ledger unreadable, caller keeps the RPC breakdown',
      {
        telegramId,
        error: error instanceof Error ? error.message : String(error),
      }
    )
    return null
  }
}
