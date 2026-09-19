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
import { chainWasUnreadable } from '@/core/ton/chainRead'
import { logger } from '@/utils/logger'

export const TON_WATCH_CRON = '0 * * * *'

/** The owner, for the journal line. Never a payer's id: the journal is a feed. */
const OWNER = process.env.CRM_OWNER_ID || '144022504'

/**
 * A chain this watch cannot read is worth knowing about, and worth knowing
 * about ONCE. The cron fires hourly; a public API having a bad week would
 * otherwise be 24 identical pages a day, which is how an owner learns to swipe
 * the alerts away. The gate is a module variable rather than the shared
 * throttle because this is the only caller and the window is its own.
 */
const CHAIN_ALARM_EVERY_MS = 6 * 60 * 60 * 1000
let lastChainAlarmAt = 0

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
        .select('inv_id,amount,stars,payment_date,payment_method')
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

      /*
       * USDT IS NOT CHECKED HERE, AND SAYING SO IS THE WHOLE POINT.
       *
       * `findNativePaymentByComment` looks at native TON transfers. A USDT
       * top-up is a JETTON transfer to a different wallet, and this matcher
       * cannot see one -- so running it over a TON_USDT row would answer
       * "never arrived" about money it never looked for. That is the failure
       * this watch exists to prevent, pointed at itself: the first version
       * selected both methods and matched both the same way.
       *
       * The rows are still selected, on purpose: the day a USDT invoice
       * appears, the run says how many it could not judge rather than
       * silently reporting a clean channel. (The jetton amount parser is
       * separately known to be wrong -- PR #2147, open for owner review --
       * and there has never been a single TON_USDT row, measured
       * 2026-09-19.)
       */
      const native = invoices.filter(r => r.payment_method !== 'TON_USDT')
      const notChecked = invoices.length - native.length
      if (notChecked > 0) {
        logger.warn('[ton-watch] USDT invoices are not checked by this watch', {
          notChecked,
          why: 'jetton transfers need a jetton matcher, not findNativePaymentByComment',
        })
      }

      let asked = 0
      let unreadable: string | null = null

      for (const row of native) {
        try {
          const hit = await ton.findNativePaymentByComment(
            config.walletAddress,
            String(row.inv_id),
            Number(row.amount),
            /*
             * SECONDS, BECAUSE THE CHAIN COUNTS IN SECONDS.
             *
             * `tx.timestamp` is `tx.utime`, a UNIX timestamp in SECONDS; the
             * matcher drops anything older than this floor. Passing
             * `Date.parse()` handed it MILLISECONDS -- a floor roughly a
             * thousand times further in the future than any transfer TON will
             * ever carry, so every transaction was skipped and this watch
             * could never once have reported money that arrived. It ran
             * hourly, reported "none unclaimed", and was structurally
             * incapable of reporting anything else. The scene gets this
             * right: it stores `Math.floor(Date.now() / 1000)`
             * (tonNativePaymentScene/index.ts:146).
             */
            row.payment_date
              ? Math.floor(Date.parse(String(row.payment_date)) / 1000)
              : undefined
          )
          asked++
          if (hit)
            found.push({
              inv_id: String(row.inv_id),
              stars: Number(row.stars) || 0,
            })
        } catch (error) {
          if (!chainWasUnreadable(error)) throw error
          /*
           * The chain refused us. Asking again for the remaining rows would
           * hit the same wall (and, if it was a rate limit, deepen it), so
           * the sweep stops here and says what happened.
           */
          unreadable = error instanceof Error ? error.message : String(error)
          break
        }
      }

      if (unreadable && !found.length) {
        /*
         * NO HEARTBEAT HERE, DELIBERATELY. The quiet note means "I looked and
         * the channel is clean"; writing one now would record a clean channel
         * on the strength of a read that never happened -- the precise
         * failure this whole function exists to catch, committed by the
         * catcher. Silence plus a throttled page is the honest pair.
         */
        const due = Date.now() - lastChainAlarmAt >= CHAIN_ALARM_EVERY_MS
        if (due) {
          lastChainAlarmAt = Date.now()
          logger.error('💸 [ton-watch] cannot read the chain — TON unwatched', {
            why: unreadable,
            pending: native.length,
            since: 'this alarm repeats at most every 6h',
          })
        } else {
          logger.warn('[ton-watch] chain still unreadable', {
            why: unreadable,
            pending: native.length,
          })
        }
        return {
          did: 'chain unreadable' as const,
          why: unreadable,
          pending: native.length,
          notChecked,
          paged: due,
        }
      }

      if (!found.length) {
        const beat = await noteWatchQuietToHive(OWNER, {
          channel: 'TON',
          examined: asked,
        })
        return {
          did: 'none unclaimed' as const,
          checked: asked,
          notChecked,
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
        notChecked,
        // Money was found AND the sweep was cut short: what is reported is a
        // floor, not a total, and the run says so rather than implying it read
        // every pending row.
        cutShort: unreadable ?? undefined,
        noted,
      }
    })
  }
)
