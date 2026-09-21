/**
 * AN INVOICE NOBODY PAID IS AN EVENT TOO.
 *
 * The study of 2026-09-22 found 8 club invoices, 4 people, 0 payments -- and
 * not one record of what happened in between. Telegram tells nobody when a
 * person closes the payment window in a chat, so "abandoned" can only be a
 * conclusion: an invoice older than an hour with no charge after it.
 *
 * This writes that conclusion as a `club_invoice_abandoned` row, once per
 * invoice (a unique index guarantees "once", whoever runs and however often),
 * so the funnel reads card -> invoice -> paid OR abandoned, without anybody
 * having to join tables by hand. The rule itself lives in trackEvent.ts
 * (`abandonedClubInvoices`), where it is tested apart from the schedule.
 *
 * It writes only to the funnel table; it charges nothing and messages nobody.
 */
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'

export const CLUB_ABANDON_WATCH_CRON = '20 * * * *'

export const clubInvoiceAbandonedWatch = inngest.createFunction(
  {
    id: 'club-invoice-abandoned-watch',
    name: 'Funnel: club invoices nobody paid',
    // A retry would read the same rows an hour early; the next run is an hour away.
    retries: 0,
    concurrency: { limit: 1 },
    onFailure: createInngestFailureHandler('club-invoice-abandoned-watch'),
  },
  { cron: CLUB_ABANDON_WATCH_CRON },
  async ({ event, step }) => {
    if (isSafeMode(event as never))
      return skippedInSafeMode('club-invoice-abandoned-watch')
    return step.run('mark', async () => {
      const { markAbandonedClubInvoices } = await import(
        '@/services/trackEvent'
      )
      // Throws when the table cannot be read: "could not look" must reach the
      // failure handler, not print as "nobody walked away".
      const marked = await markAbandonedClubInvoices()
      return { marked }
    })
  }
)
