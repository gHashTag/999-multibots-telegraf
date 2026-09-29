/**
 * THE MAILBOX'S CLOCK -- spec: specs/automation/mail-push.t27 (gHashTag/t27).
 *
 * The render's mail_push_sweep tool does the whole job: settles yesterday's
 * taps, reads the Inbox, pushes every new letter to the owner's Telegram as
 * a card that already carries a drafted reply. This cron is only its
 * heartbeat: every five minutes, one POST to the render's /mcp door as the
 * owner, over the server key -- the same door crmProactive.ts uses for
 * crm_ingest_chats, here driven by Inngest so every sweep is a run: visible
 * in the dashboard, inspectable, rerunnable.
 *
 * Rules (the spec's, in the places that keep them):
 *   - concurrency 1 AND a render-side latch: two sweeps would race the one
 *     cursor row. The cron law covers runs; the latch inside the tool covers
 *     two POSTs meeting in the render process when slow drafts outlast the
 *     interval (PUSH_PER_TICK x DRAFT_TIMEOUT_S can reach the interval).
 *   - retries 0: a retry after a partial push pushes the same letters twice.
 *     The next tick is five minutes away.
 *   - safe mode (e2e_test=true probes): skipped, nothing is sent.
 *   - a step budget (90 s, the CRM sweep's own law, imported not copied): a
 *     healthy tick answers in seconds; a burst of slow drafts can outlive
 *     the five minutes the Railway edge allows a step's request. Stopping
 *     the WAIT loses a line in the trace, not the work -- the sweep runs in
 *     the render process and lands its cards regardless of this socket, and
 *     the next tick settles whatever taps came in.
 */
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'
import { SWEEP_STEP_BUDGET_MS, withStepBudget } from '../crm/crmProactiveSweep'

/** The spec's CRON: mail lands in the chat within one interval. */
export const MAIL_PUSH_CRON = '*/5 * * * *'

/**
 * Whose mailbox, whose Telegram: the same one person the CRM tick sweeps
 * (CRM_PROACTIVE_OWNER falls back to the first admin id) -- requireOwner on
 * the render compares against OWNER_TELEGRAM_ID, and that is this owner.
 */
export function mailPushOwner(env: NodeJS.ProcessEnv = process.env): string {
  return String(
    env.MAIL_PUSH_OWNER || env.CRM_PROACTIVE_OWNER || ADMIN_IDS_ARRAY[0] || ''
  )
}

export const mailPushSweep = inngest.createFunction(
  {
    id: 'mail-push-sweep',
    name: "Mail: push the owner's mailbox to his chat",
    retries: 0,
    concurrency: { limit: 1 },
    onFailure: createInngestFailureHandler('mail-push-sweep'),
  },
  { cron: MAIL_PUSH_CRON },
  async ({ event, step }) => {
    if (isSafeMode(event as never)) return skippedInSafeMode('mail-push')

    const started = Date.now()
    const outcome = await step.run('sweep', async () => {
      const owner = mailPushOwner()
      if (!owner) {
        return { did: 'paused' as const, why: 'no owner id resolved' }
      }
      if (!process.env.RENDER_API_KEY) {
        return { did: 'paused' as const, why: 'RENDER_API_KEY not set' }
      }
      const { callTool } = await import('@/services/modelSwitch')
      const at = Date.now()
      try {
        // callTool's own timeout (170 s) is longer than the budget on
        // purpose: the budget wins the race and reports 'slow', and the
        // loser keeps fetching with its rejection swallowed -- the render
        // finishes the sweep either way.
        return await withStepBudget(
          callTool(owner, 'mail_push_sweep', {}),
          SWEEP_STEP_BUDGET_MS,
          () => {
            const ms = Date.now() - at
            logger.warn('[mail-push] sweep outlasted the step budget', {
              owner,
              ms,
              budgetMs: SWEEP_STEP_BUDGET_MS,
            })
            return {
              did: 'slow' as const,
              why: 'обход почты идёт дольше бюджета шага, продолжается на рендере', // cyrillic-ok
              ms,
            }
          }
        )
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e)
        logger.error('[mail-push] tick failed', { owner, why })
        return { did: 'failed' as const, why }
      }
    })

    // 'slow' and 'failed' have already logged themselves above.
    const did = (outcome as { did?: string }).did
    if (did && did !== 'slow' && did !== 'failed') {
      logger.info('[mail-push] tick done', {
        outcome,
        ms: Date.now() - started,
      })
    }
    return { outcome, ms: Date.now() - started }
  }
)
