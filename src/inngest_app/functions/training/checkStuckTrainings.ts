/**
 * Inngest Cron Function: Check Stuck Trainings
 *
 * Runs every 30 minutes to detect trainings stuck in non-terminal states.
 * If Replicate shows the training is complete but the DB still shows PENDING/starting/processing,
 * this function sends the missing 'model/training.completed' event to trigger notification flow.
 *
 * Root cause: Webhook URL misconfiguration (e.g. pointing to VPS instead of fly.io)
 * causes Replicate callbacks to be lost, leaving trainings stuck forever.
 */

import Replicate from 'replicate'
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Trainings older than this are considered potentially stuck
const STUCK_THRESHOLD_HOURS = 3
// Trainings older than this trigger an admin alert
const ALERT_THRESHOLD_HOURS = 6

/**
 * Age of a training in hours, or null when the timestamp cannot be read.
 *
 * Exported so the rule can be checked without standing up the cron function.
 * The third outcome is explicit because the alternative is silence: NaN fails
 * every comparison, and a row nobody can date is exactly the row that needs
 * saying out loud.
 */
export function trainingAgeHours(
  createdAt: string | null | undefined,
  now: number = Date.now()
): number | null {
  // `new Date(null)` is the EPOCH, not an invalid date, so a null timestamp
  // would otherwise produce a real-looking age of about half a million hours --
  // past every threshold, raising an alert that says the training has been
  // stuck since 1970. Absence has to be rejected before the Date is built;
  // only a malformed non-empty value reaches the NaN check.
  if (createdAt === null || createdAt === undefined || createdAt === '') {
    return null
  }
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return null
  return (now - t) / (1000 * 60 * 60)
}

export const checkStuckTrainings = inngest.createFunction(
  {
    id: 'check-stuck-trainings',
    name: 'Check Stuck Model Trainings',
    onFailure: createInngestFailureHandler('Check Stuck Trainings'),
  },
  { cron: '*/30 * * * *' }, // Every 30 minutes
  async ({ step }) => {
    const startTime = Date.now()

    // Step 1: Find stuck trainings in DB
    const stuckTrainings = await step.run('find-stuck-trainings', async () => {
      const thresholdDate = new Date(
        Date.now() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000
      ).toISOString()

      const { data, error } = await supabase
        .from('model_trainings')
        .select(
          'id, telegram_id, bot_name, model_name, trigger_word, replicate_training_id, status, created_at, is_ru'
        )
        .in('status', ['PENDING', 'starting', 'processing'])
        .lt('created_at', thresholdDate)
        .not('replicate_training_id', 'like', 'pending-%') // Skip records without real Replicate IDs
        .order('created_at', { ascending: true })
        .limit(20)

      if (error) {
        logger.error('[CHECK STUCK] Failed to query stuck trainings', {
          error: error.message,
        })
        throw new Error(`DB query failed: ${error.message}`)
      }

      logger.info('[CHECK STUCK] Found stuck trainings', {
        count: data?.length || 0,
        threshold_hours: STUCK_THRESHOLD_HOURS,
      })

      return data || []
    })

    if (stuckTrainings.length === 0) {
      logger.info('[CHECK STUCK] No stuck trainings found')
      return { success: true, checked: 0, resolved: 0 }
    }

    // Step 2: Check each stuck training against Replicate API
    const results = await step.run('check-replicate-status', async () => {
      const token = process.env.REPLICATE_API_TOKEN
      if (!token) {
        logger.error(
          '[CHECK STUCK] REPLICATE_API_TOKEN not set, cannot check training status'
        )
        return { error: 'REPLICATE_API_TOKEN not configured', resolved: [] }
      }

      const replicate = new Replicate({ auth: token })
      const resolved: Array<{
        training_id: string
        telegram_id: string
        bot_name: string
        replicate_status: string
        output?: any
        error?: string
      }> = []
      const alerts: string[] = []

      for (const training of stuckTrainings) {
        try {
          const replicateTraining = await replicate.trainings.get(
            training.replicate_training_id
          )

          logger.info('[CHECK STUCK] Replicate status for training', {
            training_id: training.replicate_training_id,
            db_status: training.status,
            replicate_status: replicateTraining.status,
            has_output: !!replicateTraining.output,
          })

          // If Replicate shows a terminal status but DB doesn't - the webhook was lost
          const terminalStatuses = ['succeeded', 'failed', 'canceled']
          if (terminalStatuses.includes(replicateTraining.status)) {
            resolved.push({
              training_id: training.replicate_training_id,
              telegram_id: training.telegram_id,
              bot_name: training.bot_name || 'AI_STARS_bot',
              replicate_status: replicateTraining.status,
              output: replicateTraining.output,
              error:
                typeof replicateTraining.error === 'string'
                  ? replicateTraining.error
                  : undefined,
            })
          }

          // Check if training is very old (potential permanent stuck)
          //
          // An unreadable created_at makes this NaN, and every comparison with
          // NaN is false -- so `ageHours > ALERT_THRESHOLD_HOURS` was false and
          // the training was never alerted. That is the one case where the
          // alert matters most: the row is non-terminal, the user has paid and
          // is waiting, and nothing else in this loop will mention it again.
          // Silence there is indistinguishable from "nothing is stuck".
          const ageHours = trainingAgeHours(training.created_at)
          if (ageHours === null) {
            alerts.push(
              `Training ${training.replicate_training_id} for user ${training.telegram_id} ` +
                `has an unreadable created_at (${String(training.created_at)}) — age unknown, ` +
                `still ${replicateTraining.status} on Replicate`
            )
          } else if (
            ageHours > ALERT_THRESHOLD_HOURS &&
            !terminalStatuses.includes(replicateTraining.status)
          ) {
            alerts.push(
              `Training ${training.replicate_training_id} for user ${training.telegram_id} ` +
                `stuck for ${Math.round(ageHours)}h (Replicate: ${replicateTraining.status})`
            )
          }
        } catch (err) {
          logger.error('[CHECK STUCK] Failed to check training on Replicate', {
            training_id: training.replicate_training_id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      if (alerts.length > 0) {
        logger.warn('[CHECK STUCK] ALERT: Trainings stuck beyond threshold', {
          alerts,
          threshold_hours: ALERT_THRESHOLD_HOURS,
        })
      }

      return { resolved, alerts }
    })

    if (!results.resolved || results.resolved.length === 0) {
      logger.info('[CHECK STUCK] No resolved trainings to process')
      return {
        success: true,
        checked: stuckTrainings.length,
        resolved: 0,
        elapsed_ms: Date.now() - startTime,
      }
    }

    // Step 3: Send completion events for resolved trainings
    const sendResults = await step.run('send-completion-events', async () => {
      let sent = 0

      for (const resolved of results.resolved) {
        try {
          await inngest.send({
            name: 'model/training.completed',
            data: {
              training_id: resolved.training_id,
              status: resolved.replicate_status as
                | 'succeeded'
                | 'failed'
                | 'canceled',
              output: resolved.output,
              error: resolved.error,
              telegram_id: resolved.telegram_id,
              bot_name: resolved.bot_name,
            },
          })

          logger.info(
            '[CHECK STUCK] Sent completion event for stuck training',
            {
              training_id: resolved.training_id,
              status: resolved.replicate_status,
              telegram_id: resolved.telegram_id,
            }
          )

          sent++
        } catch (err) {
          logger.error('[CHECK STUCK] Failed to send completion event', {
            training_id: resolved.training_id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      return { sent }
    })

    const result = {
      success: true,
      checked: stuckTrainings.length,
      resolved: sendResults.sent,
      elapsed_ms: Date.now() - startTime,
    }

    logger.info('[CHECK STUCK] Cron check completed', result)
    return result
  }
)
