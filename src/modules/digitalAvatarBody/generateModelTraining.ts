import { replicate } from '@/core/replicate' // Removed as no longer directly used
import {} from // updateUserLevelPlusOne, // Removed global import
// getUserByTelegramIdString, // Removed global import
'@/core/supabase'
// import { processBalanceOperation } from '@/price/helpers' // REMOVED GLOBAL IMPORT

// import { Telegraf } from 'telegraf' // No longer directly needed as parameter
// import { MyContext } from '@/interfaces' // Not used
import { ModeEnum } from './types'
// import { calculateModeCost } from '@/price/helpers/modelsCost' // REMOVED Global import
import { logger } from './utils/logger'
import {
  updateTrainingRecordOnError,
  getLatestModelUrl,
  ensureReplicateModelExists,
  pollReplicateTrainingStatus,
  startReplicateTraining,
  validateAndPrepareTrainingRequest, // ADDED IMPORT
} from './helpers/trainingHelpers'
import {
  updateDigitalAvatarTraining,
  createDigitalAvatarTraining,
} from './helpers/modelTrainingsDb'
import {
  getDigitalAvatarUserProfile,
  incrementUserLevelForAvatarTraining,
} from './helpers/userProfileDb' // Added module-local imports
import { getBotByName } from '@/core/bot'
import { getDigitalAvatarBodyConfig } from './config' // Import new config getter
import { PaymentType } from './types'
import { calculateDigitalAvatarBodyCost } from './helpers/pricingHelpers' // ADDED Local import

// export interface ApiError extends Error { // Not used
//   response?: {
//     status: number
//   }
// }

interface TrainingResponse {
  id: string
  status: string
  urls: { get: string }
  error?: string
}

// const activeTrainings = new Map<string, { cancel: () => void }>() // Not used

export async function generateModelTraining(
  zipUrl: string,
  triggerWord: string,
  modelName: string,
  steps: number,
  telegram_id: number,
  is_ru: boolean,
  bot_name: string,
  gender: string,
  sendMessage: (chatId: string, text: string) => Promise<void>
): Promise<any> {
  const config = getDigitalAvatarBodyConfig() // Get config once
  const botInstanceResult = getBotByName(bot_name)
  if (botInstanceResult.error || !botInstanceResult.bot) {
    logger.error(
      `Failed to get bot instance for ${bot_name} (Plan B): ${botInstanceResult.error}`,
      { telegram_id }
    )
    return {
      success: false,
      message: `Bot instance ${bot_name} not found.`,
      error: 'BOT_INSTANCE_NOT_FOUND',
    }
  }
  const bot = botInstanceResult.bot

  // const userExists = await getUserByTelegramIdString(telegram_id.toString()) // OLD CALL
  let userExists = await getDigitalAvatarUserProfile(telegram_id.toString()) // Use let as it might be reassigned by preparationResult
  let dbRecordIdToUpdate: string | undefined = undefined // MOVED and INITIALIZED
  let validatedUser = userExists // Initialize with userExists, will be updated if preparationResult is valid

  if (!userExists) {
    const errorMsg = `User with ID ${telegram_id} does not exist.`
    logger.error(errorMsg, { telegram_id })
    try {
      await bot.telegram.sendMessage(
        telegram_id.toString(),
        is_ru
          ? 'Ваш профиль не найден. Пожалуйста, перезапустите бота командой /start.'
          : 'Your profile was not found. Please restart the bot with /start.'
      )
    } catch (notifyError) {
      logger.error('Failed to send user_not_found notification (Plan B)', {
        telegramId: telegram_id,
        error: notifyError,
      })
    }
    return { success: false, message: errorMsg, error: 'USER_NOT_FOUND' }
  }
  const level = userExists.level
  // await updateUserLevelPlusOne(telegram_id.toString(), level) // OLD CALL
  await incrementUserLevelForAvatarTraining(userExists.id, level) // NEW CALL
  let currentTraining: TrainingResponse | null = null
  logger.debug(`Initial currentTraining: ${currentTraining}`, { telegram_id })

  const costResult = calculateDigitalAvatarBodyCost({
    // NEW CALL
    mode: ModeEnum.DigitalAvatarBody, // ModeEnum is already local
    steps: steps,
  })
  const paymentAmount = costResult.stars

  logger.info(
    `Starting validation and preparation for training (Plan B). User: ${telegram_id}, Cost: ${paymentAmount}`,
    { telegram_id }
  )
  const preparationResult = await validateAndPrepareTrainingRequest(
    telegram_id,
    zipUrl, // validateAndPrepareTrainingRequest also checks this URL, ensure consistency or simplify
    modelName,
    triggerWord,
    is_ru,
    bot_name,
    PaymentType.MONEY_OUTCOME, // Explicitly set as outcome
    paymentAmount
  )

  if (!preparationResult) {
    // validateAndPrepareTrainingRequest already sends a message to the user on failure.
    logger.warn(
      `Validation and preparation failed for user ${telegram_id} (Plan B).`,
      { telegram_id }
    )
    // The error message to return should be generic as user already got details.
    return {
      success: false,
      message: is_ru
        ? 'Ошибка подготовки к тренировке модели.'
        : 'Failed to prepare for model training.',
      error: 'PREPARATION_FAILED',
    }
  }

  let finalCost = costResult.stars // Default to calculatedCost, can be updated
  if (preparationResult && preparationResult.user) {
    validatedUser = preparationResult.user
    userExists = preparationResult.user // Keep userExists in sync or ensure validatedUser is prime
    finalCost = preparationResult.costInStars
  } else {
    // This case should ideally not be hit if validateAndPrepareTrainingRequest handles its errors properly
    // and returns null, which is checked above. If it *can* return a non-null object without a .user,
    // that's a contract violation by validateAndPrepareTrainingRequest or a logic error here.
    // For now, if preparationResult is falsy, validatedUser remains userExists, and finalCost remains calculatedCost.
    // If preparationResult is truthy but .user is falsy, this is an unexpected state.
    logger.warn(
      'Preparation result was truthy, but user was not defined in it. Using initial user and cost.',
      { telegram_id }
    )
  }

  // At this point, user exists, balance was sufficient, and cost has been deducted.
  // validatedUser should hold the correct user profile to proceed with.

  // Increment user level after successful payment and user validation
  await incrementUserLevelForAvatarTraining(
    validatedUser.id,
    validatedUser.level
  )

  let modelIdForResponse: string | undefined = undefined
  let modelUrlForResponse: string | undefined = undefined

  try {
    const username = config.replicateUsername // NEW WAY
    if (!username) {
      // This check might be redundant if EnvSchema in config ensures it, but good for safety
      // However, validateAndPrepareTrainingRequest should have already checked for replicate_username on user
      // if (!validatedUser.replicate_username) { // This check might be more relevant here
      //   throw new Error('User does not have Replicate username configured after validation.')
      // }
      // username = validatedUser.replicate_username;
      // Or rely on config.replicateUsername as the primary source for the training destination
      throw new Error(
        'REPLICATE_USERNAME is not set in module config for training destination.'
      )
    }

    await ensureReplicateModelExists(
      username, // Use username from config
      modelName,
      triggerWord,
      logger,
      telegram_id
    )

    modelIdForResponse = `${username}/${modelName}` // Use username from config
    logger.debug('destination for replicate model (Plan B):', {
      destination: modelIdForResponse,
      telegram_id,
    })

    const dbTrainingRecord = await createDigitalAvatarTraining({
      user_id: validatedUser.id, // USE validatedUser
      telegram_id: telegram_id.toString(),
      model_name: modelName,
      trigger_word: triggerWord,
      steps_amount: steps,
      status: 'PENDING',
      gender: gender as 'male' | 'female',
      api: 'replicate',
      bot_name: bot_name,
      cost_in_stars: finalCost,
    })
    logger.info(
      `Created DB training record ID (Plan B): ${(dbTrainingRecord as any)?.id ?? 'unknown'}`,
      { telegram_id }
    )
    dbRecordIdToUpdate = (dbTrainingRecord as any)?.id // Assign here

    logger.debug(`ZIP URL for training (Plan B): ${zipUrl}`, { telegram_id })
    if (!zipUrl || !zipUrl.startsWith('http')) {
      const zipErrorMsg = `Invalid ZIP URL provided for training (Plan B): ${zipUrl}`
      logger.error(zipErrorMsg, { telegram_id })
      if (dbRecordIdToUpdate) {
        // NEW check using variable from outer scope
        await updateTrainingRecordOnError(
          dbRecordIdToUpdate, // CORRECTED: Pass ID
          zipErrorMsg // CORRECTED: Pass error message
        )
      }
      throw new Error(zipErrorMsg)
    }

    logger.info(
      `Starting Replicate training for model ${modelIdForResponse} (Plan B)...`,
      { telegram_id }
    )
    currentTraining = (await startReplicateTraining(
      validatedUser,
      modelName,
      zipUrl,
      triggerWord,
      steps
    )) as TrainingResponse
    logger.info(
      `Replicate training started (Plan B). ID: ${currentTraining.id}`,
      { telegram_id }
    )

    if (!dbRecordIdToUpdate) {
      // Check if dbRecordIdToUpdate was set correctly
      throw new Error(
        'DB Training Record ID not found after creation for PROCESSING update.'
      )
    }

    await updateDigitalAvatarTraining(dbRecordIdToUpdate, {
      replicate_training_id: currentTraining.id,
      status: 'PROCESSING',
    })

    const finalTrainingStatus = await pollReplicateTrainingStatus(
      currentTraining,
      dbRecordIdToUpdate,
      logger,
      telegram_id
    )

    if (finalTrainingStatus === 'succeeded') {
      logger.info('Replicate training succeeded (Plan B).', {
        telegram_id,
        trainingId: currentTraining.id,
      })
      modelUrlForResponse = await getLatestModelUrl(modelName, logger)

      await updateDigitalAvatarTraining(dbRecordIdToUpdate, {
        status: 'SUCCEEDED',
        model_url: modelUrlForResponse,
      })

      const successMessage = is_ru
        ? `🎉 Ваша модель "${modelName}" успешно обучена и готова к использованию! Вы можете найти ее в списке ваших моделей.`
        : `🎉 Your model "${modelName}" has been successfully trained and is ready to use! You can find it in your models list.`
      try {
        await bot.telegram.sendMessage(telegram_id.toString(), successMessage)
      } catch (notifyError) {
        logger.error('Failed to send training success notification (Plan B)', {
          telegramId: telegram_id,
          error: notifyError,
        })
      }
      return {
        success: true,
        message: is_ru
          ? 'Модель успешно обучена!'
          : 'Model trained successfully!',
        replicateTrainingId: currentTraining.id,
        model_id: modelIdForResponse,
        model_url: modelUrlForResponse,
      }
    } else {
      const failureMsg = `Training ${finalTrainingStatus} (Plan B): ${currentTraining.error || 'No specific error from Replicate'}`
      logger.error(failureMsg, {
        telegram_id,
        trainingId: currentTraining.id,
        errorDetails: currentTraining.error,
      })
      if (dbRecordIdToUpdate) {
        await updateTrainingRecordOnError(
          dbRecordIdToUpdate,
          `Replicate training ${finalTrainingStatus}: ${currentTraining.error || 'Unknown Replicate error'}`
        )
      } else {
        logger.warn(
          'DB Record ID not available for updateTrainingRecordOnError after polling',
          { telegram_id, modelName }
        )
      }

      const userErrorMessage = is_ru
        ? `К сожалению, тренировка модели "${modelName}" завершилась со статусом: ${finalTrainingStatus}. ${currentTraining.error ? 'Детали: ' + currentTraining.error : ''}`
        : `Unfortunately, training for model "${modelName}" finished with status: ${finalTrainingStatus}. ${currentTraining.error ? 'Details: ' + currentTraining.error : ''}`
      try {
        await bot.telegram.sendMessage(telegram_id.toString(), userErrorMessage)
      } catch (notifyError) {
        logger.error(
          'Failed to send training failure/canceled notification (Plan B)',
          { telegramId: telegram_id, error: notifyError }
        )
      }
      return {
        success: false,
        message: failureMsg,
        replicateTrainingId: currentTraining.id,
        error: `REPLICATE_TRAINING_${finalTrainingStatus.toUpperCase()}`,
      }
    }
  } catch (error: any) {
    logger.error('Critical error during model training (Plan B)', {
      telegram_id,
      model_name: modelName,
      error: error.message,
      stack: error.stack,
    })

    if (dbRecordIdToUpdate) {
      await updateTrainingRecordOnError(
        dbRecordIdToUpdate,
        error.message || 'Unknown critical error in Plan B training'
      )
    } else if (currentTraining?.id) {
      logger.error(
        'DB Record ID not available for critical error update, Replicate ID was ',
        {
          replicateTrainingId: currentTraining.id,
          originalError: error.message,
          telegram_id,
        }
      )
    } else {
      logger.error(
        'Neither DB Record ID nor Replicate Training ID available for critical error update (Plan B)',
        { telegram_id, originalError: error.message }
      )
    }

    const userMessage = is_ru
      ? `Во время тренировки модели "${modelName}" произошла критическая ошибка. Мы уже занимаемся этим.`
      : `A critical error occurred while training the model "${modelName}". We are investigating.`
    try {
      await bot.telegram.sendMessage(telegram_id.toString(), userMessage)
    } catch (notifyError) {
      logger.error(
        'Failed to send critical training error notification to user (Plan B)',
        { telegramId: telegram_id, error: notifyError }
      )
    }

    return {
      success: false,
      message: `Training failed critically: ${error.message}`,
      error: 'TRAINING_PROCESS_CRITICAL_ERROR',
    }
  }
}
