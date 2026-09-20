/**
 * THE DAILY CLIENT REPORT, INTO THE OWNER'S DM.
 *
 * `dailySalesAdvisor` already writes the owner a morning message, but it is
 * about money: revenue, average check, cost. It cannot answer "who entered
 * which scene and where did they stop", because until now nothing recorded
 * that. This function is the other half — product usage, not cash — and it is
 * a separate function on purpose: when the wallet archive is slow or empty the
 * client report still goes out, and vice versa.
 *
 * Safe mode is honoured the same way: a manual invoke with `e2e_test: true`
 * must never reach a real owner (a probe once messaged thirteen of them).
 */

import { inngest } from '../../inngestClient'
import { createInngestFailureHandler } from '@/inngest_app/client'
import {
  isSafeMode,
  safeRecipient,
  skippedInSafeMode,
} from '@/inngest_app/safeMode'
import {
  fetchClientEvents,
  pruneClientEvents,
} from '@/core/telemetry/clientEvents'
import {
  buildClientTelemetryReport,
  unavailableReport,
} from '@/services/clientTelemetryReport'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'

/**
 * 07:00 UTC — 10:00 in Moscow, which has no daylight saving, so the offset is
 * fixed. Written in UTC like every other cron in this app: the `TZ=` prefix
 * the Inngest server accepts is unused anywhere here, and an unproven syntax
 * on a function nobody watches fails as silence.
 */
export const CLIENT_TELEMETRY_CRON = '0 7 * * *'
const OWNER_TZ = 'Europe/Moscow'
const DAY_MS = 86400000

/** Same fallback the bot uses elsewhere, so one owner is named in one way. */
function ownerId(): string {
  return String(ADMIN_IDS_ARRAY[0] || '144022504')
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.BOT_TOKEN_1
  if (!token || !chatId) return
  const parts = text.match(/[\s\S]{1,4000}/g) || [text]
  for (const part of parts) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: part, parse_mode: 'HTML' }),
    }).catch(() => {})
  }
}

export const clientTelemetryDaily = inngest.createFunction(
  {
    id: 'client-telemetry-daily',
    name: 'Clients: daily usage report to the owner',
    retries: 0,
    concurrency: { limit: 1 },
    onFailure: createInngestFailureHandler('client-telemetry-daily'),
  },
  { cron: CLIENT_TELEMETRY_CRON },
  async ({ event, step }) => {
    const now = Date.now()

    const built = await step.run('build-report', async () => {
      try {
        const rows = await fetchClientEvents(now - 2 * DAY_MS)
        const today = rows.filter(r => r.at >= now - DAY_MS)
        const previous = rows.filter(r => r.at < now - DAY_MS)
        return {
          ok: true,
          people: new Set(today.map(r => r.telegramId)).size,
          events: today.length,
          text: buildClientTelemetryReport({
            rows: today,
            previousRows: previous,
            now,
            tz: OWNER_TZ,
          }),
        }
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error)
        logger.error('[client-telemetry] cannot read events', { why })
        return {
          ok: false,
          people: 0,
          events: 0,
          text: unavailableReport(now, OWNER_TZ, why),
        }
      }
    })

    const id = ownerId()
    const recipient = safeRecipient(event as never, id)
    if (!recipient) {
      const skipped = skippedInSafeMode('client-telemetry-report')
      logger.warn('[client-telemetry] safe mode: send skipped', skipped)
      return skipped
    }
    await step.run('send', async () => {
      await sendTelegram(recipient, built.text)
      logger.info('[client-telemetry] report sent', {
        owner: id,
        recipient,
        redirected: recipient !== id,
        people: built.people,
        events: built.events,
        counted: built.ok,
      })
      return { sent: true }
    })

    // Keep the table the wallet shares from growing without a bound. Failure
    // here is logged inside and never fails the run.
    //
    // NOT IN SAFE MODE. This is the one step that destroys data, and a probe
    // exists to prove a function is harmless — a probe that quietly ran a
    // DELETE would be the opposite of that.
    const pruned = await step.run('prune', async () =>
      isSafeMode(event as never) ? 0 : pruneClientEvents(45)
    )

    return {
      counted: built.ok,
      people: built.people,
      events: built.events,
      pruned,
    }
  }
)
