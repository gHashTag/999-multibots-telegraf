import { NonRetriableError, type Inngest, type EventPayload } from 'inngest'

import { logger } from '../utils/logger'
import { inngest } from '@/inngest_app/client'
import type { ModelTrainingInngestEventData } from '../types'
// Импортируем хелперы
import {
  validateAndPrepareTrainingRequest,
  // createTrainingRecord, // Not used
  startReplicateTraining,
  // updateTrainingRecordOnError, // Not used
  // formatReplicateModelName, // Not used
  checkAndSetTrainingCache,
  updateTrainingStatus,
  TRAINING_MESSAGES,
  ensureReplicateModelExists,
  getLatestModelUrl,
  pollReplicateTrainingStatus,
  // getReplicateWebhookUrl, // Not used
} from '../helpers/trainingHelpers'
import { sendModuleTelegramMessage } from '../utils/telegramNotifier'
import type { DigitalAvatarUserProfile } from '../helpers/userProfileDb' // Added import for local user profile type
import { getBotByName } from '@/core/bot' // ADDED IMPORT

import {
  updateDigitalAvatarTraining,
  setDigitalAvatarTrainingError,
  getDigitalAvatarTrainingByReplicateIdWithUserDetails, // RESTORED
  type ModelTrainingWithUserDetails, // RESTORED
  type ModelTraining as LocalModelTraining, // RESTORED
} from '../helpers/modelTrainingsDb'
import { getDigitalAvatarBodyConfig } from '../config' // ADDED: Import module config

// Event interface (используем импортированный тип для data)
export interface GenerateModelTrainingEvent {
  name: string // Changed to string, as it will be a dynamic value from config
  data: ModelTrainingInngestEventData
}

// const activeTrainings = new Map<string, { cancel: () => void }>() // Not used

// Factory function that creates and returns the Inngest function
export const createGenerateModelTraining = (inngestInstance: Inngest) => {
  const config = getDigitalAvatarBodyConfig() // Get module config
  const eventNameFromConfig = config.inngestEventNameGenerateModelTraining

  if (!eventNameFromConfig) {
    // This case should ideally be caught by Zod schema if made mandatory
    // or have a default in the config getter itself.
    // For safety, logging an error and throwing if it somehow ends up empty.
    logger.error(
      '[InngestFunction] Critical: inngestEventNameGenerateModelTraining is not defined in module config.'
    )
    throw new Error(
      'Inngest event name for generate model training is not configured.'
    )
  }
  logger.info(
    `[InngestFunction] Registering Inngest function for event: ${eventNameFromConfig}`
  )

  return inngestInstance.createFunction(
    {
      id: 'digital-avatar-body-generate-model-training-v2',
      name: 'Digital Avatar Body - Generate Model Training v2',
      retries: 3,
      rateLimit: {
        key: 'event.data.telegram_id',
        limit: 1,
        period: '10s',
      },
    },
    { event: eventNameFromConfig },
    async ({ event, step }: { event: EventPayload; step: any }) => {
      let user: DigitalAvatarUserProfile | null | undefined = null

      // Type assertion for event.data
      // It's crucial that the event this function is subscribed to *actually* has this data structure.
      if (!event.data || typeof event.data !== 'object') {
        logger.error(
          '[InngestFunction] Event data is missing or not an object.',
          { eventName: event.name, eventData: event.data }
        )
        throw new NonRetriableError('Event data is missing or not an object.')
      }
      // Perform a more specific check if possible, or rely on the fields accessed later
      // For now, we cast it after the basic check.
      const eventSpecificData = event.data as ModelTrainingInngestEventData

      logger.info('[InngestFunction] Received model training event', {
        eventName: event.name,
        timestamp: new Date(event.ts).toISOString(),
        telegramId: eventSpecificData.telegram_id,
      })

      const {
        telegram_id,
        is_ru,
        bot_name,
        model_name,
        zipUrl,
        steps: trainingSteps,
        trigger_word,
        calculatedCost,
        operation_type_for_refund,
        trainingDbIdFromEvent,
      } = eventSpecificData // Use the asserted data object

      const telegramIdNumber = Number(telegram_id)
      if (isNaN(telegramIdNumber)) {
        logger.error('[InngestFunction] Invalid telegram_id received', {
          telegram_id,
        })
        throw new NonRetriableError('Invalid telegram_id: Must be a number.')
      }

      if (
        !checkAndSetTrainingCache(
          telegram_id.toString(),
          model_name,
          'PENDING',
          logger
        )
      ) {
        const botInfo = getBotByName(bot_name) // NEW: Get bot instance
        await sendModuleTelegramMessage(
          // NEW CALL
          telegram_id.toString(),
          TRAINING_MESSAGES.duplicateRequest[is_ru ? 'ru' : 'en'],
          botInfo
        )
        logger.warn('Duplicate training request identified by cache', {
          telegram_id,
          model_name,
        })
        return { status: 'Duplicate request, already processing by cache.' }
      }

      if (!trainingDbIdFromEvent) {
        logger.error(
          'Critical: trainingDbIdFromEvent is missing in Inngest event data for v2 function.',
          { eventData: eventSpecificData }
        )
        updateTrainingStatus(
          telegram_id.toString(),
          model_name,
          'FAILED',
          logger
        )
        const botInfoCrit = getBotByName(bot_name) // NEW: Get bot instance
        await sendModuleTelegramMessage(
          // NEW CALL
          telegram_id.toString(),
          TRAINING_MESSAGES.error('Internal configuration error.')[
            is_ru ? 'ru' : 'en'
          ],
          botInfoCrit
        )
        throw new NonRetriableError('trainingDbIdFromEvent is missing.')
      }
      const currentTrainingDbId = trainingDbIdFromEvent as string

      try {
        await step.run('send-initial-message', async () => {
          const botInfoInitial = getBotByName(bot_name) // NEW: Get bot instance
          return sendModuleTelegramMessage(
            // NEW CALL
            telegram_id.toString(),
            TRAINING_MESSAGES.start[is_ru ? 'ru' : 'en'],
            botInfoInitial
          )
        })

        const validationResult = await step.run(
          'validate-user-and-prepare-training',
          async () => {
            const validationRes = await validateAndPrepareTrainingRequest(
              telegramIdNumber,
              zipUrl,
              model_name,
              trigger_word,
              is_ru,
              bot_name,
              operation_type_for_refund,
              calculatedCost
            )
            if (validationRes) {
              user = validationRes.user
            }
            return validationRes
          }
        )

        if (!validationResult) {
          updateTrainingStatus(
            telegram_id.toString(),
            model_name,
            'FAILED',
            logger
          )
          logger.warn(
            'Валидация пользователя или подготовка к тренировке не пройдена.',
            { telegramId: telegram_id }
          )
          const botInfoValidation = getBotByName(bot_name) // NEW: Get bot instance
          await sendModuleTelegramMessage(
            // NEW CALL
            telegram_id.toString(),
            TRAINING_MESSAGES.error('Validation failed')[is_ru ? 'ru' : 'en'],
            botInfoValidation
          )
          throw new NonRetriableError(
            'User validation or training prep failed.'
          )
        }

        // const { publicUrl, costInStars } = validationResult // costInStars not used
        const { publicUrl } = validationResult
        if (!user || !user.id) {
          updateTrainingStatus(
            telegram_id.toString(),
            model_name,
            'FAILED',
            logger
          )
          logger.error(
            'User object or user.id is null before calling startReplicateTraining. This should not happen.',
            { telegram_id, userId: user?.id }
          )
          throw new NonRetriableError(
            'User object or user.id is null before calling startReplicateTraining. This should not happen.'
          )
        }

        await step.run('ensure-replicate-model-exists', async () => {
          if (!user || !user.replicate_username) {
            logger.error(
              'User replicate_username is missing before ensureReplicateModelExists',
              { telegram_id, userId: user?.id }
            )
            throw new NonRetriableError(
              'User replicate_username is required to ensure model exists.'
            )
          }
          await ensureReplicateModelExists(
            user.replicate_username,
            model_name,
            trigger_word,
            logger,
            telegramIdNumber
          )
        })

        updateTrainingStatus(
          telegram_id.toString(),
          model_name,
          'PENDING',
          logger,
          currentTrainingDbId
        )

        const replicateData = await step.run(
          'start-replicate-training',
          async () => {
            if (!user || !user.id) {
              updateTrainingStatus(
                telegram_id.toString(),
                model_name,
                'FAILED',
                logger,
                currentTrainingDbId
              )
              logger.error(
                'User object or user.id is null before calling startReplicateTraining. This should not happen.',
                {
                  telegram_id,
                  userId: user?.id,
                  trainingRecordId: currentTrainingDbId,
                }
              )
              throw new NonRetriableError(
                'User object or user.id is null before calling startReplicateTraining.'
              )
            }
            // Ensure created_at and updated_at are either Date objects or undefined.
            // If they are already Date objects (due to userProfileDb change), no conversion needed.
            // If they were strings and somehow bypassed userProfileDb conversion (unlikely), convert them.
            const createdAtDate =
              user.created_at instanceof Date
                ? user.created_at
                : user.created_at
                  ? new Date(user.created_at)
                  : undefined
            const updatedAtDate =
              user.updated_at instanceof Date
                ? user.updated_at
                : user.updated_at
                  ? new Date(user.updated_at)
                  : undefined

            const compliantUser: DigitalAvatarUserProfile = {
              ...user,
              id: String(user.id),
              created_at: createdAtDate,
              updated_at: updatedAtDate,
              telegram_id: String(user.telegram_id),
            } as DigitalAvatarUserProfile

            return await startReplicateTraining(
              compliantUser,
              model_name,
              publicUrl,
              trigger_word,
              trainingSteps
            )
          }
        )

        await step.run('update-training-record-with-replicate-id', async () => {
          logger.info('Mock: Update DB with Replicate ID', {
            trainingRecordId: currentTrainingDbId,
            replicateId: replicateData.id,
          })
          await updateDigitalAvatarTraining(currentTrainingDbId, {
            replicate_training_id: replicateData.id,
            status: 'PROCESSING',
          })
        })

        return {
          status: 'Training successfully submitted to Replicate.',
          replicate_id: replicateData.id,
          training_record_id: currentTrainingDbId,
        }
      } catch (error: any) {
        logger.error(`Error in Inngest training function: ${error.message}`, {
          telegramId: telegram_id,
          modelName: model_name,
          error: error.message,
          stack: error.stack,
          originalError: error.originalError, // if NonRetriableError wraps another
        })
        updateTrainingStatus(
          telegram_id.toString(),
          model_name,
          'FAILED',
          logger,
          currentTrainingDbId || undefined
        )

        if (currentTrainingDbId) {
          await step.run('update-training-record-on-error', async () => {
            if (user && user.id) {
              return setDigitalAvatarTrainingError(
                currentTrainingDbId,
                error.message
              )
            } else {
              logger.error(
                'User or user.id is undefined in catch block when calling updateTrainingRecordOnError',
                {
                  telegramId: telegram_id,
                  modelName: model_name,
                  trainingRecordId: currentTrainingDbId,
                }
              )
              return
            }
          })
        }

        const botInfoFinalError = getBotByName(bot_name) // NEW: Get bot instance
        await sendModuleTelegramMessage(
          // NEW CALL
          telegram_id.toString(),
          TRAINING_MESSAGES.error(error.message)[is_ru ? 'ru' : 'en'],
          botInfoFinalError
        )

        if (error instanceof NonRetriableError) {
          throw error
        }
        throw new NonRetriableError(`Training failed: ${error.message}`)
      }
    }
  )
}

// Inngest функция для обработки вебхуков от Replicate
export const handleReplicateWebhookDigitalAvatarBody = inngest.createFunction(
  {
    id: 'handle-replicate-webhook-digital-avatar-body',
    name: 'Handle Replicate Webhook Digital Avatar Body',
  },
  { event: 'replicate/webhook.digital_avatar_body' },
  async ({ event, logger }) => {
    const webhookData = event.data
    const replicateTrainingId = webhookData.id
    const status = webhookData.status

    if (!replicateTrainingId) {
      logger.error('Replicate Training ID missing in webhook payload', {
        payload: webhookData,
      })
      return { success: false, error: 'Missing Replicate Training ID' }
    }

    logger.info('Received webhook for Replicate training', {
      replicateTrainingId,
      status,
    })

    const trainingRecordWithUser =
      await getDigitalAvatarTrainingByReplicateIdWithUserDetails(
        replicateTrainingId
      )

    if (!trainingRecordWithUser) {
      logger.error(
        'Failed to find training record for webhook or user details using helper',
        {
          replicateTrainingId,
        }
      )
      return {
        success: false,
        error: 'Failed to find training record or user details using helper',
      }
    }

    const trainingRecord =
      trainingRecordWithUser as ModelTrainingWithUserDetails
    const dbRecordId = trainingRecord.id as string

    const userTelegramId = trainingRecord.users?.telegram_id
    const userBotName = trainingRecord.users?.bot_name
    const isRuUser = trainingRecord.users?.is_ru_language ?? false // Default to false if undefined

    // It is critical to have userTelegramId and userBotName for notifications
    if (!userTelegramId || typeof userBotName === 'undefined') {
      logger.error(
        'User telegram_id or bot_name missing in fetched record for webhook notification. Cannot send message.',
        {
          replicateTrainingId,
          userId: trainingRecord.user_id,
          retrievedUserSubObject: trainingRecord.users,
        }
      )
      // Do not proceed with message sending logic if these are missing.
      // However, DB update logic should still proceed.
    }

    try {
      if (status === 'succeeded') {
        const modelUrl = webhookData.output?.version
        await updateDigitalAvatarTraining(dbRecordId, {
          status: 'SUCCEEDED',
          model_url: modelUrl,
          error: null,
        })
        logger.info('Training succeeded, record updated', {
          replicateTrainingId,
          dbId: dbRecordId,
          modelUrl,
        })
        if (userTelegramId && userBotName) {
          // Check again before sending
          const botInfo = getBotByName(userBotName) // NEW: Get bot instance
          await sendModuleTelegramMessage(
            userTelegramId.toString(),
            TRAINING_MESSAGES.success(trainingRecord.model_name)[
              isRuUser ? 'ru' : 'en'
            ],
            botInfo
          )
        }
      } else {
        // This block handles other statuses like 'processing', 'starting', etc.
        // It should NOT try to map 'SUCCESS' to 'SUCCEEDED' as 'SUCCESS' isn't a valid Replicate webhook status.
        // The cast to LocalModelTraining['status'] should be safe if Replicate sends valid statuses
        // that are a subset or can be mapped to our LocalModelTraining statuses.
        // For now, we only update if the status is one of our defined ones.
        const ourWebhookStatus = status as LocalModelTraining['status']
        if (
          ourWebhookStatus &&
          Object.values([
            'PENDING',
            'PROCESSING',
            'FAILED',
            'CANCELED',
            'SUCCEEDED',
          ]).includes(ourWebhookStatus)
        ) {
          await updateDigitalAvatarTraining(dbRecordId, {
            status: ourWebhookStatus,
          })
          logger.info(
            `[Webhook] Successfully updated DB record ${dbRecordId} to status: ${ourWebhookStatus}`
          )
        } else {
          logger.warn(
            `[Webhook] Received unhandled status from Replicate: ${status} for DB record ${dbRecordId}. Not updating.`
          )
        }
      }
      return { success: true }
    } catch (error: any) {
      logger.error('Error processing webhook', {
        replicateTrainingId,
        dbId: trainingRecord?.id,
        error: error.message,
        stack: error.stack,
      })
      if (trainingRecord?.id) {
        try {
          await updateDigitalAvatarTraining(dbRecordId, {
            status: 'FAILED',
            error: `Webhook processing error: ${error.message}`.substring(
              0,
              255
            ),
          })
        } catch (dbUpdateError: any) {
          logger.error(
            'Failed to update DB record with webhook processing error',
            {
              dbId: dbRecordId,
              dbUpdateError: dbUpdateError.message,
            }
          )
        }
      }
      return { success: false, error: 'Webhook processing failed' }
    }
  }
)
