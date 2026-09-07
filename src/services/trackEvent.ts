import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * WHAT PEOPLE DO BETWEEN ARRIVING AND PAYING.
 *
 * Two tables already record the ends of the funnel: `payments_v2` knows about
 * invoices and charges, `prompts_history` knows about generations. Nothing
 * knows the middle -- and the middle is where everybody stops. 2380 people have
 * registered; 354 have ever generated anything.
 *
 * It is also why a payment defect lived nine months unnoticed. Top-ups stopped
 * completing in December 2025 and the only trace was rows sitting in PENDING.
 * The logs could not hold the evidence either: measured 2026-09-08, the whole
 * available log window is as old as the container, and this service deploys
 * many times a day. A population that a deploy erases is not a population.
 *
 * THE ONE RULE HERE: writing this may never be a reason a person waits, and may
 * never be a reason a person gets nothing. So every call is fire-and-forget --
 * `void track(...)`, not `await` -- the promise swallows everything, and the
 * table not existing yet is an ordinary outcome rather than an error. The
 * migration is sql/migrations/20260908_user_events.sql and the owner applies it.
 */

/**
 * The steps worth recording, and no others.
 *
 * Kept to a closed list on purpose: a free-text event name drifts, and a funnel
 * counted over drifting names measures the naming rather than the people.
 */
export type TrackedEvent =
  /** /start received -- the top of the funnel, and the only step everybody takes. */
  | 'start'
  /** The main menu was shown. Every path in the product ends here. */
  | 'menu_shown'
  /** They asked to top up: pressed the button or entered the payment scene. */
  | 'topup_opened'
  /** They asked for something paid and did not have the balance for it. */
  | 'refused_no_balance'
  /** They wrote something and nothing in the whole chain answered. */
  | 'unanswered_message'
  /** They pressed a button whose id reached no handler. */
  | 'unanswered_press'

interface Ctx {
  from?: { id?: number | string }
  botInfo?: { username?: string }
  chat?: { type?: string }
}

/**
 * Record one step. Never throws, never blocks, never awaited by the caller.
 *
 * Returns the promise so a test can await it; production calls it as
 * `void track(...)` and moves on.
 */
export async function track(
  ctx: Ctx,
  event: TrackedEvent,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const telegramId = ctx?.from?.id
    if (!telegramId) return

    const { error } = await supabase.from('user_events').insert({
      telegram_id: String(telegramId),
      bot_name: ctx?.botInfo?.username ?? null,
      event,
      detail: detail ?? null,
    })

    if (error) {
      /*
       * A missing table is the expected state until the migration is applied,
       * and it must not fill the log with noise. Anything else is worth one
       * quiet line -- but still not an exception, because the person on the
       * other end is waiting for an answer, not for bookkeeping.
       */
      const missing =
        error.message?.includes('does not exist') ||
        error.message?.includes('schema cache')
      if (!missing) {
        logger.warn('[track] event not recorded', {
          event,
          error: error.message?.slice(0, 120),
        })
      }
    }
  } catch {
    // Nothing here may reach the caller.
  }
}
