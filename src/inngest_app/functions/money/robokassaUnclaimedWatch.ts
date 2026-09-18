/**
 * THE WATCHER THE ROUBLE CHANNEL NEVER HAD.
 *
 * Robokassa confirms a payment by calling our ResultURL within seconds. When
 * that call does not arrive -- and for nine months it did not, because the URL
 * we handed the provider was missing its `/api` prefix -- the row stays PENDING
 * and nothing ever asks again. Measured 2026-09-19 by running a reconcile by
 * hand: five people, 822 stars, 1854 roubles, paid and never credited
 * (docs/audit/paid-and-never-credited.md).
 *
 * That measurement happened because somebody thought to look. This is the
 * standing version of it, and the sibling of `ton-pending-watch`: it LOOKS and
 * it never pays.
 *
 * ── WHY ONLY THE RECENT ROWS ───────────────────────────────────────────────
 *
 * The backlog is 165 invoices, most of them abandoned checkouts from years
 * past, and twelve of them are the known debt already written down. Asking the
 * provider about all of them every day would be 165 requests to re-learn a list
 * that is in a file -- and it would raise the same alarm every morning until
 * somebody paid it, which is how an alarm becomes wallpaper. So the watch asks
 * about the window where a NEW loss can still be news.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 *
 * It writes nothing to payments_v2. Completing a payment moves money, and who
 * is made whole is the owner's decision. One journal line, where the owner
 * already looks, carrying a count and a total -- never a payer's id.
 */
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { logger } from '@/utils/logger'

export const ROBOKASSA_WATCH_CRON = '20 7 * * *'

/** How far back a pending invoice is still news rather than known debt. */
export const FRESH_DAYS = 30

/** A cap on one run's questions, so a bad day cannot become a flood. */
export const MAX_ASKED = 50

const OWNER = process.env.CRM_OWNER_ID || '144022504'

export const robokassaUnclaimedWatch = inngest.createFunction(
  {
    id: 'robokassa-unclaimed-watch',
    name: 'Money: roubles that arrived and were never credited',
    retries: 0,
    concurrency: { limit: 1 },
    // A watcher that dies quietly leaves the channel looking watched.
    onFailure: createInngestFailureHandler('robokassa-unclaimed-watch'),
  },
  { cron: ROBOKASSA_WATCH_CRON },
  async ({ event, step }) => {
    if (isSafeMode(event as never))
      return skippedInSafeMode('robokassa-unclaimed-watch')

    return step.run('ask the provider', async () => {
      const [{ supabase }, { askOpState }, { noteUnclaimedToHive }] =
        await Promise.all([
          import('@/core/supabase'),
          import('@/core/robokassa/opState'),
          import('@/services/hiveNote'),
        ])

      const since = new Date(
        Date.now() - FRESH_DAYS * 24 * 60 * 60 * 1000
      ).toISOString()

      const { data, error } = await supabase
        .from('payments_v2')
        .select('inv_id,stars,payment_date')
        .eq('status', 'PENDING')
        .eq('payment_method', 'Robokassa')
        .gte('payment_date', since)
        .limit(MAX_ASKED)
      if (error) {
        /*
         * A READ THAT FAILED IS NOT AN EMPTY CHANNEL -- the difference between
         * "nobody is owed anything" and "I could not look".
         */
        logger.error('[robokassa-watch] could not read pending invoices', {
          error: error.message,
        })
        return { did: 'unreadable' as const, why: error.message }
      }

      const invoices = data ?? []
      if (!invoices.length) return { did: 'nothing pending' as const }

      const creds = {
        login:
          process.env.ROBOKASSA_MERCHANT_LOGIN ||
          process.env.MERCHANT_LOGIN ||
          '',
        password2: process.env.ROBOKASSA_PASSWORD_2 || '',
      }
      if (!creds.login || !creds.password2) {
        /*
         * WITHOUT CREDENTIALS THERE IS NO ANSWER, and reporting "none unclaimed"
         * would be the tool inventing reassurance. `tri reconcile` printed the
         * same refusal for months and it read as "this cannot be done" -- so the
         * run says which half is missing, and says nothing about money.
         */
        logger.warn('[robokassa-watch] no merchant credentials; asked nothing')
        return { did: 'cannot ask' as const, pending: invoices.length }
      }

      const paid: Array<{ inv_id: string; stars: number }> = []
      let unknown = 0
      for (const row of invoices) {
        const answer = await askOpState(String(row.inv_id), creds)
        if (answer.verdict === 'PAID') {
          paid.push({
            inv_id: String(row.inv_id),
            stars: Number(row.stars) || 0,
          })
        } else if (answer.verdict === 'UNKNOWN') {
          unknown++
        }
      }

      if (!paid.length) {
        return {
          did: 'none unclaimed' as const,
          asked: invoices.length,
          unknown,
        }
      }

      const stars = paid.reduce((sum, p) => sum + p.stars, 0)
      logger.error(
        '💸 [robokassa-watch] paid at the provider, never credited',
        {
          invoices: paid.length,
          stars,
          inv_ids: paid.map(p => p.inv_id),
        }
      )
      const noted = await noteUnclaimedToHive(
        OWNER,
        { invoices: paid.length, stars },
        { channel: 'Robokassa' }
      )

      return {
        did: 'unclaimed' as const,
        invoices: paid.length,
        stars,
        unknown,
        noted,
      }
    })
  }
)
