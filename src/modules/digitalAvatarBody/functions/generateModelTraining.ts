import type { Inngest, EventPayload as InngestEvent } from 'inngest'
import { getBotByName, type BotInstanceResult } from '@/core/bot' // Correct import path
import type { ModelTrainingInngestEventData, TrainingStatus } from '../types' // Ensure TrainingStatus is imported
import { logger } from '../utils/logger'
import { sendModuleTelegramMessage } from '../utils/telegramNotifier'
import {
  // checkAndSetTrainingCache, // Commented out, seems unused and caused issues. Re-evaluate if needed.
  getLatestModelUrl,
  pollReplicateTrainingStatus,
  startReplicateTraining,
  updateTrainingRecordOnError, // Ensure this uses trainingId
  // updateTrainingStatus, // Directly using updateDigitalAvatarTraining with specific statuses
  ensureReplicateModelExists,
} from '../helpers/trainingHelpers'
import {
  getDigitalAvatarTrainingById,
  updateDigitalAvatarTraining,
  type ModelTraining, // Corrected: Changed LocalModelTraining to ModelTraining
} from '../helpers/modelTrainingsDb'
import { getDigitalAvatarUserProfile } from '../helpers/userProfileDb'
import { getDigitalAvatarBodyConfig } from '../config'
// Assuming TRAINING_MESSAGES is correctly defined in constants/messages.ts
// and provides localized strings or functions for them.
import { TRAINING_MESSAGES } from '../constants/messages'
import { Prediction } from 'replicate' // Replicate's Prediction type, used for status

// Function to check and set cache - might be needed if re-enabled
// For now, this logic is simplified by directly checking DB status or relying on Inngest's deduplication
function checkAndSetTrainingCache(
  telegram_id: string,
  model_name: string,
  status: 'PENDING' | 'COMPLETED' | 'FAILED', // These are statuses for updateTrainingStatus if used
  loggerInstance: typeof logger // Added loggerInstance
): boolean {
  // Simplified: In a real scenario, this would interact with a KV store or similar
  loggerInstance.info('checkAndSetTrainingCache called (currently a stub)', {
    telegram_id,
    model_name,
    status,
  })
  return true // Placeholder
}

// Define the expected structure of the event object for this Inngest function
// by extending Inngest's base EventPayload and specifying the 'data' type.
interface GenerateModelTrainingInngestEvent extends InngestEvent {
  data?: ModelTrainingInngestEventData // data is optional in base InngestEvent, align with it.
  // 'name', 'id', 'ts', 'v', 'user' are inherited from InngestEvent
}

// Interface for the expected result from step.run when calling startReplicateTraining
interface ReplicateStepRunResult {
  id: string
  status: Prediction['status'] // Use Prediction['status'] for strong typing from Replicate lib
  version?: string
  error?: any
  // Add other fields if they are reliably returned by step.run and used later
  // e.g., output?: any; if getLatestModelUrl needs it from this variable
}

export const createGenerateModelTraining = (inngestInstance: Inngest) => {
  const config = getDigitalAvatarBodyConfig()

  return inngestInstance.createFunction(
    {
      id: 'digital-avatar-body-generate-model-training-v2',
      name: 'Digital Avatar Body Generate Model Training V2',
    },
    { event: config.inngestEventNameGenerateModelTraining },
    async ({
      event,
      step,
    }: {
      event: GenerateModelTrainingInngestEvent
      step: any
    }) => {
      let user: Awaited<ReturnType<typeof getDigitalAvatarUserProfile>> = null

      // event.data is now strongly typed as ModelTrainingInngestEventData
      // We use '!' because for this specific event, 'data' is always expected.
      const {
        user_id, // from DB
        telegram_id, // string
        is_ru,
        bot_name,
        bot_token, // available
        model_name,
        publicUrl,
        steps,
        trigger_word,
        gender,
        db_model_training_id, // This is the crucial ID for our DB record
        calculatedCost, // available
        operation_type_for_refund, // available
        replicateModelDestination,
      } = event.data! // Use non-null assertion operator

      const functionName = 'inngest.generateModelTraining.v2'
      logger.info(
        `[${functionName}] Received event for DB record ID: ${db_model_training_id}`,
        {
          telegram_id,
          model_name,
        }
      )

      const botInfo: BotInstanceResult = getBotByName(bot_name)
      if (botInfo.error || !botInfo.bot) {
        logger.error(
          `[${functionName}] Bot instance ${bot_name} not found or error: ${botInfo.error}. Cannot send messages.`,
          { telegram_id, db_model_training_id }
        )
        // Cannot easily update DB here without user context if user_id is not yet validated
        // Consider how to handle this critical config error.
        // For now, we throw to let Inngest handle retries/failure.
        throw new Error(`Bot instance ${bot_name} not found. Critical error.`)
      }

      try {
        // 1. Get User Profile
        user = await getDigitalAvatarUserProfile(telegram_id) // telegram_id is string
        if (!user) {
          logger.error(
            `[${functionName}] User not found for telegram_id: ${telegram_id}. Aborting.`,
            { db_model_training_id }
          )
          await updateDigitalAvatarTraining(db_model_training_id, {
            status: 'FAILED',
            error_message: 'User profile not found in Inngest worker.',
          })
          // No bot message here as user context is missing for bot_name
          return {
            message: 'User not found, training failed.',
            db_model_training_id,
          }
        }
        // Verify consistency with user_id from event if needed, though telegram_id is primary key here
        if (user.id !== user_id) {
          logger.warn(
            `[${functionName}] User ID mismatch for telegram_id ${telegram_id}. Event user_id: ${user_id}, DB user_id: ${user.id}. Proceeding with DB user_id.`,
            { db_model_training_id }
          )
          // Potentially update the user_id in the event data if this is a concern
        }

        // 2. Check current status in DB to prevent re-processing completed/failed
        const initialDbRecord =
          await getDigitalAvatarTrainingById(db_model_training_id)
        if (!initialDbRecord) {
          logger.error(
            `[${functionName}] DB record ${db_model_training_id} not found. Aborting.`,
            { telegram_id }
          )
          // No user message as this is an internal error
          throw new Error(`DB record ${db_model_training_id} not found.`)
        }

        if (
          initialDbRecord.status === 'SUCCEEDED' ||
          initialDbRecord.status === 'FAILED' ||
          initialDbRecord.status === 'CANCELED'
        ) {
          logger.warn(
            `[${functionName}] Training ${db_model_training_id} already in terminal state: ${initialDbRecord.status}. Skipping.`,
            { telegram_id }
          )
          return {
            message: `Training already ${initialDbRecord.status}.`,
            db_model_training_id,
          }
        }
        // If PENDING_INNGest, we proceed. If PROCESSING, it might be a retry, also proceed.

        // Cache check (simplified)
        // The original checkAndSetTrainingCache was problematic.
        // Inngest offers built-in deduplication. If more complex logic is needed,
        // it should be re-evaluated with a proper KV store or DB check.
        // For now, we assume Inngest handles basic deduplication if event IDs are consistent.
        // Or, rely on checking the DB status as done above.

        // const isDuplicateByCache = !checkAndSetTrainingCache(
        //   telegram_id, // string
        //   model_name,
        //   'PENDING',
        //   logger
        // )
        // if (isDuplicateByCache) {
        //   logger.warn(
        //     `[${functionName}] Duplicate training request identified by cache (stub).`,
        //     { telegram_id, model_name, db_model_training_id }
        //   )
        //   await sendModuleTelegramMessage(
        //     telegram_id, // string
        //     TRAINING_MESSAGES.duplicateRequest[is_ru ? 'ru' : 'en'],
        //     botInfo // Pass BotInstanceResult
        //   )
        //   // Optionally update DB status to FAILED if this is a hard stop
        //   return { message: 'Duplicate request by cache.', db_model_training_id }
        // }

        // 3. Ensure Replicate Model Exists (Trainer)
        // The replicateUsername should be from config (trainer's account), not user's
        const trainerUsername = config.replicateUsername
        if (!trainerUsername) {
          logger.error(
            `[${functionName}] REPLICATE_USERNAME for trainer not set in module config. Aborting.`,
            { telegram_id, db_model_training_id }
          )
          await updateDigitalAvatarTraining(db_model_training_id, {
            status: 'FAILED',
            error_message: 'Replicate trainer username not configured.',
          })
          await sendModuleTelegramMessage(
            telegram_id, // string
            TRAINING_MESSAGES.error(
              'Internal configuration error (Replicate username).'
            )[is_ru ? 'ru' : 'en'],
            botInfo // Pass BotInstanceResult
          )
          return {
            message: 'Replicate trainer username not configured.',
            db_model_training_id,
          }
        }

        await step.run('ensure-replicate-model-exists', async () => {
          await ensureReplicateModelExists(
            trainerUsername,
            model_name, // User's desired model name
            trigger_word || '', // User's trigger word
            logger,
            Number(telegram_id) // ensureReplicateModelExists might expect number
          )
        })

        // 4. Start Replicate Training
        let replicateTraining: ReplicateStepRunResult | null = null // Use the new interface
        try {
          // The result of step.run is a JsonifyObject. We cast it to our expected serializable structure.
          replicateTraining = (await step.run(
            'start-replicate-training',
            async () => {
              // startReplicateTraining itself returns a Promise<Prediction>
              // but step.run will process it into a JsonifyObject.
              return await startReplicateTraining(
                user!,
                model_name,
                publicUrl,
                trigger_word || '',
                steps
              )
            }
          )) as ReplicateStepRunResult // Cast to the new interface
        } catch (startError: any) {
          logger.error(
            `[${functionName}] Error starting Replicate training for DB ID ${db_model_training_id}: ${startError.message}`,
            { telegram_id, error: startError }
          )
          await updateDigitalAvatarTraining(db_model_training_id, {
            status: 'FAILED',
            error_message: `Failed to start Replicate training: ${startError.message}`,
          })
          await sendModuleTelegramMessage(
            telegram_id,
            TRAINING_MESSAGES.error('Failed to start model training process.')[
              is_ru ? 'ru' : 'en'
            ],
            botInfo
          )
          return {
            message: 'Failed to start Replicate training.',
            db_model_training_id,
          }
        }

        if (!replicateTraining || !replicateTraining.id) {
          logger.error(
            `[${functionName}] Failed to start Replicate training or get ID for DB ID ${db_model_training_id}.`,
            { telegram_id }
          )
          await updateDigitalAvatarTraining(db_model_training_id, {
            status: 'FAILED',
            error_message: 'Replicate training did not return an ID.',
          })
          await sendModuleTelegramMessage(
            telegram_id, // string
            TRAINING_MESSAGES.error('Training start failed (no ID).')[
              is_ru ? 'ru' : 'en'
            ],
            botInfo // Pass BotInstanceResult
          )
          return {
            message: 'Replicate training start failed (no ID).',
            db_model_training_id,
          }
        }

        logger.info(
          `[${functionName}] Replicate training started. Replicate ID: ${replicateTraining.id}, DB ID: ${db_model_training_id}`,
          { telegram_id }
        )
        await updateDigitalAvatarTraining(db_model_training_id, {
          replicate_training_id: replicateTraining.id,
          status: 'PROCESSING', // Our local status
        })

        // 5. Poll Replicate Training Status
        // The polling logic is now part of pollReplicateTrainingStatus helper
        // It needs the initial Replicate training details and our DB record ID
        // Use config for timeout and interval

        const finalReplicateStatus = await step.run(
          'poll-replicate-status',
          async () => {
            return await pollReplicateTrainingStatus(
              {
                id: replicateTraining!.id, // From ReplicateStepRunResult
                status: replicateTraining!.status, // From ReplicateStepRunResult, should be Prediction['status'] compatible
              },
              String(db_model_training_id),
              logger,
              Number(telegram_id) // The 4th optional argument
            )
          }
        )

        // 6. Handle Final Status
        if (finalReplicateStatus === 'succeeded') {
          logger.info(
            `[${functionName}] Replicate training SUCCEEDED for DB ID: ${db_model_training_id}, Replicate ID: ${replicateTraining.id}`,
            { telegram_id }
          )
          const modelUrl = await step.run('get-latest-model-url', async () => {
            return await getLatestModelUrl(
              model_name, // modelName is user's desired model name
              logger // Pass logger
            )
          })

          await updateDigitalAvatarTraining(db_model_training_id, {
            status: 'SUCCEEDED', // Our local status
            model_url: modelUrl,
            replicate_model_version: replicateTraining.version, // Store the trained model version
          })

          // updateTrainingStatus(telegram_id, model_name, 'COMPLETED', logger, String(db_model_training_id)) // OLD
          // This was causing type errors. We are directly setting SUCCEEDED above.

          await sendModuleTelegramMessage(
            telegram_id, // string
            TRAINING_MESSAGES.success(model_name)[is_ru ? 'ru' : 'en'],
            botInfo // Pass BotInstanceResult
          )
          return {
            message: `Training succeeded. Model URL: ${modelUrl}`,
            db_model_training_id,
            replicate_id: replicateTraining.id,
          }
        } else {
          // Status is 'failed' or 'canceled' or any other non-succeeded terminal state
          const replicateError =
            replicateTraining.error || 'Unknown Replicate error'
          logger.error(
            `[${functionName}] Replicate training ${finalReplicateStatus} for DB ID: ${db_model_training_id}, Replicate ID: ${replicateTraining.id}. Error: ${replicateError}`,
            { telegram_id }
          )
          await updateDigitalAvatarTraining(db_model_training_id, {
            status: finalReplicateStatus === 'canceled' ? 'CANCELED' : 'FAILED', // Map to our status
            error_message:
              typeof replicateError === 'string'
                ? replicateError
                : JSON.stringify(replicateError),
            // replicate_output: replicateTraining.error ? JSON.stringify(replicateTraining.error) : undefined, // Old: error_message is better
          })

          // updateTrainingStatus(telegram_id, model_name, 'FAILED', logger, String(db_model_training_id)) // OLD

          await sendModuleTelegramMessage(
            telegram_id, // string
            TRAINING_MESSAGES.error(
              `${finalReplicateStatus}: ${typeof replicateError === 'string' ? replicateError : 'Details logged.'}`
            )[is_ru ? 'ru' : 'en'],
            botInfo // Pass BotInstanceResult
          )
          return {
            message: `Training ${finalReplicateStatus}. Error: ${replicateError}`,
            db_model_training_id,
            replicate_id: replicateTraining.id,
          }
        }
      } catch (error: any) {
        const errorMessage =
          error.message || 'Unknown error during Inngest training function'
        logger.error(
          `[${functionName}] CRITICAL error for DB ID ${db_model_training_id}: ${errorMessage}`,
          {
            telegram_id,
            stack: error.stack,
          }
        )
        // Attempt to update DB record to FAILED
        try {
          await updateDigitalAvatarTraining(db_model_training_id, {
            status: 'FAILED',
            error_message: `Critical Inngest worker error: ${errorMessage}`,
          })
        } catch (dbUpdateError: any) {
          logger.error(
            `[${functionName}] CRITICAL - Failed to update DB record ${db_model_training_id} to FAILED after main error: ${dbUpdateError.message}`,
            { telegram_id }
          )
        }

        // Attempt to notify user
        try {
          await sendModuleTelegramMessage(
            telegram_id, // string
            TRAINING_MESSAGES.error(
              'A critical error occurred during model training. Support has been notified.'
            )[is_ru ? 'ru' : 'en'],
            botInfo // Pass BotInstanceResult
          )
        } catch (notifyError: any) {
          logger.error(
            `[${functionName}] CRITICAL - Failed to notify user ${telegram_id} about critical training error: ${notifyError.message}`
          )
        }
        // Rethrow to let Inngest handle the failure according to its retry policy
        throw error
      }
    }
  )
}
