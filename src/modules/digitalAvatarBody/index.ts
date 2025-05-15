import type {
  InitiateModelTrainingPayload,
  ModelTrainingInngestEventData,
  InitiateModelTrainingResult,
  // ReplicateTrainingResponse, // Not directly used in this file's public API
} from './types'
import { logger } from './utils/logger'
import { sendModuleTelegramMessage } from './utils/telegramNotifier'
import { publishDigitalAvatarTrainingEvent } from './utils/inngestPublisher'
import { getBotByName, type BotInstanceResult } from '@/core/bot'
import { inngest } from '@/inngest_app/client' // Assuming this is the correct Inngest client for publishing
import {
  validateAndPrepareTrainingRequest,
  type PreparedTrainingData, // Import type for validationResult
} from './helpers/trainingHelpers'
import {
  createDigitalAvatarTraining,
  // updateDigitalAvatarTraining, // Not used in this specific function
} from './helpers/modelTrainingsDb'
import { getDigitalAvatarUserProfile } from './helpers/userProfileDb'
import { getDigitalAvatarBodyConfig } from './config'
import { TRAINING_MESSAGES } from './constants/messages'
import { generateModelTraining as generateModelTrainingPlanB } from './generateModelTraining'

export type { InitiateModelTrainingPayload, InitiateModelTrainingResult }

export const initiateDigitalAvatarModelTraining = async (
  payload: InitiateModelTrainingPayload
): Promise<InitiateModelTrainingResult> => {
  const functionName = 'initiateDigitalAvatarModelTraining'
  logger.info(`[${functionName}] Received request.`, { payload })

  const config = getDigitalAvatarBodyConfig()

  const botInstanceResult: BotInstanceResult = getBotByName(payload.bot_name)

  if (botInstanceResult.error || !botInstanceResult.bot) {
    const errorMessage = `Bot instance ${payload.bot_name} not found or error: ${botInstanceResult.error}`
    logger.error(`[${functionName}] ${errorMessage}`, {
      telegram_id: payload.telegram_id,
    })
    return {
      success: false,
      message: TRAINING_MESSAGES.error(
        `Bot instance ${payload.bot_name} not found.`
      )[payload.is_ru ? 'ru' : 'en'],
      error_type: 'BOT_INSTANCE_NOT_FOUND',
    }
  }
  // const bot = botInstanceResult.bot // Not needed if passing botInstanceResult around

  const user = await getDigitalAvatarUserProfile(String(payload.telegram_id))
  if (!user) {
    logger.error(`[${functionName}] User not found.`, {
      telegram_id: payload.telegram_id,
    })
    // Message is sent by getDigitalAvatarUserProfile if not found, or handle here if needed
    // For now, assume getDigitalAvatarUserProfile sends a message or we rely on validateAndPrepareTrainingRequest
    // await sendModuleTelegramMessage(
    //   String(payload.telegram_id),
    //   TRAINING_MESSAGES.userNotFound[payload.is_ru ? 'ru' : 'en'],
    //   botInstanceResult
    // )
    return {
      success: false,
      message: TRAINING_MESSAGES.userNotFound[payload.is_ru ? 'ru' : 'en'],
      error_type: 'USER_NOT_FOUND',
    }
  }

  // Validate and prepare. Cost is calculated and passed in payload.calculatedCost
  const validationResult: PreparedTrainingData | null =
    await validateAndPrepareTrainingRequest(
      Number(payload.telegram_id), // Corrected: pass telegram_id as number
      payload.publicUrl,
      payload.model_name,
      payload.trigger_word || '',
      payload.is_ru,
      payload.bot_name,
      payload.operation_type_for_refund,
      payload.calculatedCost
    )

  if (!validationResult) {
    // validateAndPrepareTrainingRequest sends its own error messages
    logger.warn(
      `[${functionName}] Validation failed or user/funds insufficient (validationResult is null).`,
      {
        telegram_id: payload.telegram_id,
      }
    )
    return {
      success: false,
      // Attempt to provide a generic message if validateAndPrepareTrainingRequest somehow didn't send one
      message: TRAINING_MESSAGES.error(
        'Validation failed or insufficient funds. Please check balance.'
      )[payload.is_ru ? 'ru' : 'en'],
      error_type: 'VALIDATION_FAILED_OR_INSUFFICIENT_FUNDS',
    }
  }

  // If validationResult is not null, validationResult.user should exist as per PreparedTrainingData type
  // No need for: if (!validationResult.user) { ... }

  const dbTrainingRecord = await createDigitalAvatarTraining({
    user_id: validationResult.user.id, // Use user from validationResult
    telegram_id: String(payload.telegram_id),
    model_name: payload.model_name,
    trigger_word: payload.trigger_word,
    steps_amount:
      payload.stepsAmount || payload.steps || config.replicateDefaultSteps,
    gender: payload.gender,
    status: 'PENDING_INNGest',
    api: 'replicate',
    bot_name: payload.bot_name,
    cost_in_stars: validationResult.costInStars, // Use cost from validation result
  })

  if (!dbTrainingRecord || !dbTrainingRecord.id) {
    logger.error(
      `[${functionName}] Failed to create database record for training.`,
      {
        telegram_id: payload.telegram_id,
      }
    )
    await sendModuleTelegramMessage(
      String(payload.telegram_id),
      TRAINING_MESSAGES.error('Database error during record creation.')[
        payload.is_ru ? 'ru' : 'en'
      ],
      botInstanceResult
    )
    return {
      success: false,
      message: TRAINING_MESSAGES.error(
        'Database error during record creation.'
      )[payload.is_ru ? 'ru' : 'en'],
      error_type: 'DB_ERROR',
    }
  }

  const eventPayload: ModelTrainingInngestEventData = {
    user_id: validationResult.user.id,
    telegram_id: String(payload.telegram_id),
    is_ru: payload.is_ru,
    bot_name: payload.bot_name,
    bot_token: payload.bot_token,
    model_name: payload.model_name,
    publicUrl: payload.publicUrl,
    steps: payload.stepsAmount || payload.steps || config.replicateDefaultSteps,
    trigger_word: payload.trigger_word,
    gender: payload.gender,
    db_model_training_id: dbTrainingRecord.id,
    calculatedCost: validationResult.costInStars,
    operation_type_for_refund: payload.operation_type_for_refund,
  }

  try {
    logger.info(`[${functionName}] Publishing event to Inngest for training.`, {
      db_model_training_id: dbTrainingRecord.id,
      telegram_id: payload.telegram_id,
    })
    await publishDigitalAvatarTrainingEvent(
      inngest, // 1. Inngest client
      config.inngestEventNameGenerateModelTraining, // 2. Event name
      eventPayload, // 3. Event data
      { telegram_id: String(payload.telegram_id) } // 4. Optional user payload for Inngest
    )

    await sendModuleTelegramMessage(
      String(payload.telegram_id),
      TRAINING_MESSAGES.start[payload.is_ru ? 'ru' : 'en'],
      botInstanceResult
    )

    return {
      success: true,
      message: TRAINING_MESSAGES.start[payload.is_ru ? 'ru' : 'en'],
      training_id: dbTrainingRecord.id,
      plan: 'A',
    }
  } catch (inngestError: any) {
    logger.error(
      `[${functionName}] Failed to publish event to Inngest. Attempting Plan B.`,
      {
        error: inngestError,
        db_model_training_id: dbTrainingRecord.id,
        telegram_id: payload.telegram_id,
      }
    )
    try {
      const planBResult = await generateModelTrainingPlanB(
        payload.publicUrl,
        payload.trigger_word || '',
        payload.model_name,
        payload.stepsAmount || payload.steps || config.replicateDefaultSteps,
        Number(payload.telegram_id),
        payload.is_ru,
        payload.bot_name,
        payload.gender || 'female',
        async (chatId, text) => {
          await sendModuleTelegramMessage(chatId, text, botInstanceResult)
        }
      )

      if (planBResult.success) {
        logger.info(
          `[${functionName}] Plan B executed successfully after Inngest failure.`,
          {
            db_model_training_id: dbTrainingRecord.id,
            replicate_id: planBResult.replicateTrainingId,
            telegram_id: payload.telegram_id,
          }
        )
        return {
          success: true,
          message: TRAINING_MESSAGES.start[payload.is_ru ? 'ru' : 'en'],
          training_id: dbTrainingRecord.id,
          replicate_id: planBResult.replicateTrainingId,
          plan: 'B',
        }
      } else {
        logger.error(`[${functionName}] Plan B also failed.`, {
          planBError: planBResult.message,
          db_model_training_id: dbTrainingRecord.id,
          telegram_id: payload.telegram_id,
        })
        await sendModuleTelegramMessage(
          String(payload.telegram_id),
          TRAINING_MESSAGES.error('Training initiation failed via all plans.')[
            payload.is_ru ? 'ru' : 'en'
          ],
          botInstanceResult
        )
        return {
          success: false,
          message:
            planBResult.message ||
            TRAINING_MESSAGES.error('Plan B execution failed.')[
              payload.is_ru ? 'ru' : 'en'
            ],
          training_id: dbTrainingRecord.id,
          error_type: 'PLAN_B_ERROR',
          plan: 'B',
        }
      }
    } catch (planBErr: any) {
      logger.error(`[${functionName}] Critical error in Plan B execution.`, {
        error: planBErr,
        db_model_training_id: dbTrainingRecord.id,
        telegram_id: payload.telegram_id,
      })
      await sendModuleTelegramMessage(
        String(payload.telegram_id),
        TRAINING_MESSAGES.error('Critical error during training initiation.')[
          payload.is_ru ? 'ru' : 'en'
        ],
        botInstanceResult
      )
      return {
        success: false,
        message: TRAINING_MESSAGES.error(
          'Critical error during training initiation.'
        )[payload.is_ru ? 'ru' : 'en'],
        training_id: dbTrainingRecord.id,
        error_type: 'PLAN_B_CRITICAL_ERROR',
        plan: 'B',
      }
    }
  }
}
