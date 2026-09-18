/**
 * THE WATCHER THE TON CHANNEL NEVER HAD.
 *
 * TON credits when the PAYER presses "check payment": the coins carry the
 * invoice id in their comment, the scene looks at the chain, finds the transfer
 * and completes the row (scenes/tonNativePaymentScene). Nothing else ever
 * looks. Close the app, lose the message, get distracted -- the coins sit on a
 * public chain against a row that says PENDING, and there is no watcher at all.
 *
 * The same shape cost five people 822 stars on the other channel, and was found
 * only because somebody ran a reconcile by hand on 2026-09-19
 * (docs/audit/paid-and-never-credited.md). This is the standing version of that
 * question, asked once an hour.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 *
 * It does not credit. Not one row is written to payments_v2 here. Completing a
 * payment moves money, and who is made whole is the owner's decision -- a
 * watcher that also acted would be taking that decision every hour, silently,
 * on data it fetched from a third party. It writes ONE journal line instead,
 * where the owner already looks.
 *
 * ── WHY THE RULE IS BORROWED, NOT WRITTEN ──────────────────────────────────
 *
 * Matching uses `findNativePaymentByComment`, the scene's own function: the
 * comment must equal the invoice id, the amount must be within the fee margin,
 * and a transfer older than the invoice does not count. A watcher looser than
 * the credit path would raise alarms about money nobody sent; a stricter one
 * would stay silent about money somebody did. Both read as facts.
 */
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { logger } from '@/utils/logger'

export const TON_WATCH_CRON = '0 * * * *'

/** The owner, for the journal line. Never a payer's id: the journal is a feed. */
const OWNER = process.env.CRM_OWNER_ID || '144022504'

export const tonPendingWatch = inngest.createFunction(
  {
    id: 'ton-pending-watch',
    name: 'Money: TON that arrived and was never credited',
    /*
     * retries 0, like the seller's sweep: a retry would ask a rate-limited
     * public API again for an answer that has not changed, and the next run is
     * an hour away. concurrency 1 for the same reason.
     */
    retries: 0,
    concurrency: { limit: 1 },
    /*
     * A WATCHER THAT DIES QUIETLY IS WORSE THAN NO WATCHER: the channel would
     * look watched while nothing looked. The alert goes to the admin channel,
     * the same one the seller's sweep uses.
     */
    onFailure: createInngestFailureHandler('ton-pending-watch'),
  },
  { cron: TON_WATCH_CRON },
  async ({ event, step }) => {
    if (isSafeMode(event as never))
      return skippedInSafeMode('ton-pending-watch')

    return step.run('look', async () => {
      const [
        { supabase },
        { getTonConfig },
        ton,
        { noteUnclaimedToHive, noteWatchQuietToHive },
      ] = await Promise.all([
        import('@/core/supabase'),
        import('@/core/ton/config'),
        import('@/core/ton'),
        import('@/services/hiveNote'),
      ])

      const { data, error } = await supabase
        .from('payments_v2')
        .select('inv_id,amount,stars,payment_date')
        .eq('status', 'PENDING')
        .in('payment_method', ['TON_NATIVE', 'TON_USDT'])
      if (error) {
        /*
         * A READ THAT FAILED IS NOT AN EMPTY LIST. Returning "nothing found"
         * here would make a broken database look like a healthy channel, which
         * is the one mistake this family of tools keeps making.
         */
        logger.error('[ton-watch] could not read pending invoices', {
          error: error.message,
        })
        return { did: 'unreadable' as const, why: error.message }
      }

      const invoices = data ?? []
      if (!invoices.length) {
        /*
         * EVEN WITH NOTHING TO CHECK, SAY SO -- once per heartbeat. A watch
         * that speaks only when money is owed is indistinguishable from one
         * that has stopped, which is the flaw this function shipped with.
         */
        const beat = await noteWatchQuietToHive(OWNER, {
          channel: 'TON',
          examined: 0,
        })
        return { did: 'nothing pending' as const, beat }
      }

      const config = getTonConfig()
      const found: Array<{ inv_id: string; stars: number }> = []

      for (const row of invoices) {
        const hit = await ton.findNativePaymentByComment(
          config.walletAddress,
          String(row.inv_id),
          Number(row.amount),
          row.payment_date ? Date.parse(String(row.payment_date)) : undefined
        )
        if (hit)
          found.push({
            inv_id: String(row.inv_id),
            stars: Number(row.stars) || 0,
          })
      }

      if (!found.length) {
        const beat = await noteWatchQuietToHive(OWNER, {
          channel: 'TON',
          examined: invoices.length,
        })
        return {
          did: 'none unclaimed' as const,
          checked: invoices.length,
          beat,
        }
      }

      const stars = found.reduce((sum, f) => sum + f.stars, 0)
      logger.error('💸 [ton-watch] paid on chain, never credited', {
        invoices: found.length,
        stars,
        inv_ids: found.map(f => f.inv_id),
      })
      const noted = await noteUnclaimedToHive(OWNER, {
        invoices: found.length,
        stars,
      })

      return {
        did: 'unclaimed' as const,
        invoices: found.length,
        stars,
        noted,
      }
    })
  }
)
