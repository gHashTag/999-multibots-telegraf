/**
 * THE SWEEP'S PULSE, ASKED ONCE A DAY -- spec: specs/automation/mail-push.t27
 * (gHashTag/t27, v2 #5174).
 *
 * The 5-min mail-push-sweep cron is a watcher, and a watcher's failure mode
 * is silence: someone else's deploy breaks it, the dashboard shows nothing,
 * and the owner's first signal is a letter that never reached his chat. The
 * render's mail_push_pulse tool reads the cursor's updated_at and answers
 * fresh/stale; this cron asks it daily and THROWS when the answer is not
 * fresh -- the throw is the alarm (the failure handler writes admin
 * Telegram), because a heartbeat that logs quietly is not an alarm.
 *
 * Rules:
 *   - PULSE_CRON '17 9 * * *' (the spec's, off the :00 mark): daily, in the
 *     owner's morning; PULSE_STALE_MIN 30 means six missed 5-min ticks.
 *   - retries 0: one alarm per outage day is the contract, not a retry loop.
 *   - concurrency 1: with retries 0 it cannot overlap itself anyway; the law
 *     is named where the other mail crons name it.
 *   - safe mode (e2e_test=true probes): skipped, nothing is sent.
 *   - a failed probe call alarms too: 'cannot prove the sweep lives' is the
 *     same silence as a stale cursor, and this cron exists to end silence.
 */
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { logger } from '@/utils/logger'
import { mailPushOwner } from './mailPushSweep'

/** The spec's PULSE_CRON: daily, off the :00 mark. */
export const MAIL_PUSH_PULSE_CRON = '17 9 * * *'

export const mailPushHeartbeat = inngest.createFunction(
  {
    id: 'mail-push-heartbeat',
    name: 'Mail: alarm when the mailbox push goes quiet',
    retries: 0,
    concurrency: { limit: 1 },
    onFailure: createInngestFailureHandler('mail-push-heartbeat'),
  },
  { cron: MAIL_PUSH_PULSE_CRON },
  async ({ event, step }) => {
    if (isSafeMode(event as never))
      return skippedInSafeMode('mail-push-heartbeat')

    const started = Date.now()
    const outcome = await step.run('pulse', async () => {
      const owner = mailPushOwner()
      if (!owner) {
        return { did: 'paused' as const, why: 'no owner id resolved' }
      }
      if (!process.env.RENDER_API_KEY) {
        return { did: 'paused' as const, why: 'RENDER_API_KEY not set' }
      }
      const { callTool } = await import('@/services/modelSwitch')
      let pulse: {
        baselined?: boolean
        fresh?: boolean
        age_min?: number
        updated_at?: string
        seen?: number
        sent_seen?: number
      }
      try {
        pulse = (await callTool(owner, 'mail_push_pulse', {})) as typeof pulse
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e)
        // A probe that cannot run cannot prove the sweep lives either; the
        // 5-min cron's own handler has already said its piece -- this throw
        // makes the silence impossible to miss from both doors.
        logger.error('[mail-push] pulse failed', { owner, why })
        throw new Error(`the pulse could not be read: ${why}`)
      }
      if (pulse.fresh !== true) {
        // The throw is the alarm: onFailure writes admin Telegram.
        throw new Error(
          `the mail push sweep is quiet: cursor age ${pulse.age_min ?? '?'} min ` +
            `(baselined ${pulse.baselined ?? false}, updated_at ${pulse.updated_at ?? 'none'}), ` +
            `stale past the spec's 30 min`
        )
      }
      return {
        did: 'fresh' as const,
        age_min: pulse.age_min ?? null,
        seen: pulse.seen ?? null,
        sent_seen: pulse.sent_seen ?? null,
      }
    })

    logger.info('[mail-push] pulse done', {
      outcome,
      ms: Date.now() - started,
    })
    return { outcome, ms: Date.now() - started }
  }
)
