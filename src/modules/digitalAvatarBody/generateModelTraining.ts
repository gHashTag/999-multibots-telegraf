import { replicate } from '@/core/replicate'
import {
  updateUserBalance,
  updateUserLevelPlusOne,
  supabase,
  createModelTraining,
  getUserByTelegramIdString,
} from '@/core/supabase'
import { processBalanceOperation } from '@/price/helpers'

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { PaymentType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { ModelTrainingResponse } from './types'
import { updateTrainingRecordOnError } from './helpers/trainingHelpers'

export interface ApiError extends Error {
  response?: {
    status: number
  }
}

interface TrainingResponse {
  id: string
  status: string
  urls: { get: string }
  error?: string
}

interface ReplicateModelResponse {
  latest_version?: {
    id: string
  }
}

const activeTrainings = new Map<string, { cancel: () => void }>()

async function getLatestModelUrl(modelName: string): Promise<string> {
  try {
    const username = process.env.REPLICATE_USERNAME
    if (!username) {
      throw new Error('REPLICATE_USERNAME is not set in environment variables')
    }
    const response = await fetch(
      `https://api.replicate.com/v1/models/${username}/${modelName}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn(
          `Model ${username}/${modelName} not found or has no version yet.`
        )
        throw new Error(
          `Model ${username}/${modelName} not found or has no version yet.`
        )
      }
      throw new Error(
        `Failed to fetch latest version id, status: ${response.status}`
      )
    }

    const data = (await response.json()) as ReplicateModelResponse
    logger.debug('data from getLatestModelUrl:', data)
    if (!data.latest_version?.id) {
      throw new Error(
        `Latest version ID not found for model ${username}/${modelName}`
      )
    }
    const model_url = `${username}/${modelName}:${data.latest_version.id}`
    logger.debug('model_url from getLatestModelUrl:', model_url)
    return model_url
  } catch (error) {
    logger.error('Error fetching latest model url:', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    throw error
  }
}

export async function generateModelTraining(
  zipUrl: string,
  triggerWord: string,
  modelName: string,
  steps: number,
  telegram_id: number,
  is_ru: boolean,
  bot: Telegraf<MyContext>,
  bot_name: string,
  gender: string
): Promise<ModelTrainingResponse> {
  const userExists = await getUserByTelegramIdString(telegram_id.toString())
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
  await updateUserLevelPlusOne(telegram_id.toString(), level)
  let currentTraining: TrainingResponse | null = null
  logger.debug(`Initial currentTraining: ${currentTraining}`, { telegram_id })

  const costResult = calculateModeCost({
    mode: ModeEnum.DigitalAvatarBody,
    steps: steps,
  })
  const paymentAmount = costResult.stars

  logger.info('Starting balance check for user (Plan B):', {
    telegram_id,
    paymentAmount,
    is_ru,
  })
  const balanceCheck = await processBalanceOperation({
    telegram_id: Number(telegram_id),
    paymentAmount,
    is_ru,
    bot_name: bot_name,
  } as any)
  logger.info('Balance check result (Plan B):', {
    telegram_id,
    success: balanceCheck.success,
    error: balanceCheck.error,
  })

  if (!balanceCheck.success) {
    const errorMsg =
      balanceCheck.error ||
      (is_ru ? 'Ошибка проверки баланса' : 'Balance check failed')
    logger.warn(
      `Balance check failed for user ${telegram_id} (Plan B): ${errorMsg}`
    )
    if (balanceCheck.error) {
      try {
        await bot.telegram.sendMessage(
          telegram_id.toString(),
          balanceCheck.error
        )
      } catch (notifyError) {
        logger.error(
          'Failed to send balance error notification to user (Plan B Training)',
          { telegramId: telegram_id, error: notifyError }
        )
      }
    }
    return { success: false, message: errorMsg, error: 'INSUFFICIENT_BALANCE' }
  }
  const initialBalance = balanceCheck.currentBalance

  let modelIdForResponse: string | undefined = undefined
  let modelUrlForResponse: string | undefined = undefined

  try {
    const username = process.env.REPLICATE_USERNAME
    if (!username) {
      throw new Error('REPLICATE_USERNAME is not set')
    }

    const destination: `${string}/${string}` = `${username}/${modelName}`
    modelIdForResponse = destination
    logger.debug('destination for replicate model (Plan B):', {
      destination,
      telegram_id,
    })
    let modelExists = false
    try {
      logger.debug(`Checking if model exists (Plan B): ${destination}`, {
        telegram_id,
      })
      await replicate.models.get(username, modelName)
      logger.info(`Model ${destination} exists (Plan B).`, { telegram_id })
      modelExists = true
    } catch (error) {
      if ((error as ApiError).response?.status === 404) {
        logger.info(
          `Model ${destination} does not exist (Plan B). Creating...`,
          { telegram_id }
        )
        modelExists = false
      } else {
        logger.error('Error checking model existence (Plan B):', {
          error: (error as Error).message,
          stack: (error as Error).stack,
          telegram_id,
        })
        throw error
      }
    }

    if (!modelExists) {
      try {
        logger.info(`Creating model ${destination} (Plan B)...`, {
          telegram_id,
        })
        await replicate.models.create(username, modelName, {
          description: `LoRA model trained with trigger word: ${triggerWord}`,
          visibility: 'public',
          hardware: 'gpu-t4',
        })
        logger.info(`Model ${destination} created (Plan B).`, { telegram_id })
        await new Promise(resolve => setTimeout(resolve, 3000))
      } catch (error) {
        logger.error('API error during model creation (Plan B):', {
          message: (error as Error).message,
          telegram_id,
        })
        throw error
      }
    }

    const dbTrainingRecord = await createModelTraining({
      telegram_id: telegram_id,
      model_name: modelName,
      trigger_word: triggerWord,
      zip_url: zipUrl,
      steps,
      status: 'starting',
      gender,
      api: 'replicate',
      bot_name: bot_name,
    } as any)
    logger.info(
      `Created DB training record ID (Plan B): ${(dbTrainingRecord as any)?.id ?? 'unknown'}`,
      { telegram_id }
    )

    logger.debug(`ZIP URL for training (Plan B): ${zipUrl}`, { telegram_id })
    if (!zipUrl || !zipUrl.startsWith('http')) {
      const zipErrorMsg = `Invalid ZIP URL provided for training (Plan B): ${zipUrl}`
      logger.error(zipErrorMsg, { telegram_id })
      if ((dbTrainingRecord as any)?.id) {
        await updateTrainingRecordOnError(userExists.id, modelName, zipErrorMsg)
      }
      throw new Error(zipErrorMsg)
    }

    logger.info(
      `Starting Replicate training for model ${destination} (Plan B)...`,
      { telegram_id }
    )
    currentTraining = await replicate.trainings.create(
      'ostris',
      'flux-dev-lora-trainer',
      'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      {
        destination,
        input: {
          steps,
          lora_rank: 128,
          optimizer: 'adamw8bit',
          batch_size: 1,
          resolution: '512,768,1024',
          autocaption: true,
          input_images: zipUrl,
          trigger_word: triggerWord,
          learning_rate: 0.0001,
          wandb_project: 'flux_train_replicate',
        },
      }
    )
    logger.info(
      `Replicate training started (Plan B). ID: ${currentTraining.id}`,
      { telegram_id }
    )

    await supabase
      .from('model_trainings')
      .update({
        replicate_training_id: currentTraining.id,
        status: 'processing',
      })
      .eq('id', (dbTrainingRecord as any)?.id ?? 'unknown')

    let trainingStatus = currentTraining.status
    while (
      trainingStatus !== 'succeeded' &&
      trainingStatus !== 'failed' &&
      trainingStatus !== 'canceled'
    ) {
      await new Promise(resolve => setTimeout(resolve, 10000))
      if (currentTraining?.id) {
        const updatedTraining = await replicate.trainings.get(
          currentTraining.id
        )
        trainingStatus = updatedTraining.status
        logger.debug(
          `Polling Replicate training status (Plan B): ${trainingStatus}`,
          { telegram_id, trainingId: currentTraining.id }
        )

        if (trainingStatus !== currentTraining.status) {
          await supabase
            .from('model_trainings')
            .update({ status: trainingStatus.toUpperCase() })
            .eq('replicate_training_id', currentTraining.id)
          currentTraining.status = trainingStatus
        }
      } else {
        logger.warn(
          'currentTraining.id is not available for polling, breaking loop.',
          { telegram_id }
        )
        throw new Error('Training ID became unavailable during polling.')
      }
    }

    if (trainingStatus === 'succeeded') {
      logger.info('Replicate training succeeded (Plan B).', {
        telegram_id,
        trainingId: currentTraining.id,
      })
      modelUrlForResponse = await getLatestModelUrl(modelName)

      await supabase
        .from('model_trainings')
        .update({
          status: 'SUCCEEDED',
          model_url: modelUrlForResponse,
        })
        .eq('replicate_training_id', currentTraining.id)

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
      const failureMsg = `Training ${trainingStatus} (Plan B): ${currentTraining.error || 'No specific error from Replicate'}`
      logger.error(failureMsg, {
        telegram_id,
        trainingId: currentTraining.id,
        errorDetails: currentTraining.error,
      })
      await updateTrainingRecordOnError(
        userExists.id,
        modelName,
        `Replicate training ${trainingStatus}: ${currentTraining.error || 'Unknown Replicate error'}`
      )

      const userErrorMessage = is_ru
        ? `К сожалению, тренировка модели "${modelName}" завершилась со статусом: ${trainingStatus}. ${currentTraining.error ? 'Детали: ' + currentTraining.error : ''}`
        : `Unfortunately, training for model "${modelName}" finished with status: ${trainingStatus}. ${currentTraining.error ? 'Details: ' + currentTraining.error : ''}`
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
        error: `REPLICATE_TRAINING_${trainingStatus.toUpperCase()}`,
      }
    }
  } catch (error: any) {
    logger.error('Critical error during model training (Plan B)', {
      telegram_id,
      model_name: modelName,
      error: error.message,
      stack: error.stack,
    })

    if (userExists && userExists.id) {
      await updateTrainingRecordOnError(
        userExists.id,
        modelName,
        error.message || 'Unknown critical error in Plan B training'
      )
    } else {
      logger.error(
        'User ID not available for updating training record on critical error (Plan B)',
        { telegram_id }
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
