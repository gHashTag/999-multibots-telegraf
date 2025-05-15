import { logger } from '../utils/logger'
// import { User } from '@/interfaces/user.interface' // REMOVED: No longer used
import { type ReplicateTrainingResponse as Training } from '../types' // CHANGED: Using local ReplicateTrainingResponse aliased as Training
import { PaymentType } from '../types' // CHANGED: Using local PaymentType
import { getDigitalAvatarBodyConfig } from '../config'
import { sendTelegramMessageFromWorker } from '@/utils/telegramHelpers'
import { getReplicateClient } from '../utils/replicateClient'
import {
  updateDigitalAvatarTraining,
  setLatestDigitalAvatarTrainingToError,
} from './modelTrainingsDb'
import {
  getDigitalAvatarUserProfile,
  updateUserNeuroTokens,
  DigitalAvatarUserProfile,
} from './userProfileDb'

interface ReplicateModelResponseForHelper {
  latest_version?: {
    id: string
  }
}

// Localized messages (Перенесено и экспортировано)
export const TRAINING_MESSAGES = {
  start: {
    ru: '🔍 Начинаем обучение модели...',
    en: '🔍 Starting model training...',
  },
  success: (modelName: string) => ({
    ru: `🎉 Модель ${modelName} готова!`,
    en: `🎉 Model ${modelName} ready!`,
  }),
  error: (error: string) => ({
    ru: `❌ Ошибка: ${error}`,
    en: `❌ Error: ${error}`,
  }),
  duplicateRequest: {
    ru: '⚠️ Запрос на обучение этой модели уже обрабатывается. Пожалуйста, подождите...',
    en: '⚠️ Your training request is already processing. Please wait...',
  },
}

/**
 * Общая информация, получаемая на начальном этапе обработки запроса на тренировку.
 */
export interface PreparedTrainingData {
  user: DigitalAvatarUserProfile
  currentBalance: number
  costInStars: number
  publicUrl: string
}

/**
 * Валидирует пользователя, его баланс и возвращает подготовленные данные.
 * @param telegram_id - ID пользователя в Telegram.
 * @param archivePublicUrl - ПУБЛИЧНЫЙ URL к архиву модели (например, с Pinata).
 * @param modelName - Имя модели.
 * @param triggerWord - Триггерное слово.
 * @param isRu - Язык пользователя (для сообщений об ошибках).
 * @param botName - Имя бота.
 * @param paymentOperationType - Тип платежа.
 * @param costForTraining - Рассчитанная стоимость.
 * @returns Объект с пользователем, балансом, стоимостью и публичным URL, или null в случае ошибки.
 */
export const validateAndPrepareTrainingRequest = async (
  telegramId: number,
  zipUrl: string, // Должен быть уже публичный URL
  modelName: string,
  triggerWord: string | undefined,
  isRu: boolean,
  botName: string,
  paymentOperationType: PaymentType,
  costForTraining: number // Стоимость уже рассчитана и передана
): Promise<PreparedTrainingData | null> => {
  const user = await getDigitalAvatarUserProfile(String(telegramId))

  if (!user) {
    logger.warn('User not found for training request', { telegramId })
    await sendTelegramMessageFromWorker(
      String(telegramId), // Corrected
      TRAINING_MESSAGES.error(
        isRu ? 'Пользователь не найден' : 'User not found'
      )[isRu ? 'ru' : 'en'],
      botName
    )
    return null
  }

  if (!user.replicate_username) {
    logger.warn('User replicate_username is missing', { telegramId })
    await sendTelegramMessageFromWorker(
      String(telegramId), // Corrected
      TRAINING_MESSAGES.error(
        isRu
          ? 'У пользователя отсутствует имя пользователя Replicate'
          : "User's Replicate username is missing"
      )[isRu ? 'ru' : 'en'],
      botName
    )
    return null
  }
  if (!user.api) {
    logger.warn('User replicate_api (user.api) is missing', { telegramId })
    await sendTelegramMessageFromWorker(
      String(telegramId), // Corrected
      TRAINING_MESSAGES.error(
        isRu
          ? 'У пользователя отсутствует API ключ Replicate'
          : "User's Replicate API key is missing"
      )[isRu ? 'ru' : 'en'],
      botName
    )
    return null
  }

  const currentBalance = user.neuro_tokens || 0
  if (currentBalance < costForTraining) {
    logger.warn('Insufficient balance for training', {
      telegramId,
      currentBalance,
      costForTraining,
    })
    await sendTelegramMessageFromWorker(
      String(telegramId), // Corrected
      TRAINING_MESSAGES.error(
        isRu
          ? `Недостаточно средств (${currentBalance} < ${costForTraining})`
          : `Insufficient funds (${currentBalance} < ${costForTraining})`
      )[isRu ? 'ru' : 'en'],
      botName
    )
    return null
  }

  // Списание средств
  const paymentSuccess = await updateUserNeuroTokens(
    user.id, // Use user.id (string, UUID)
    costForTraining, // Передаем положительное значение
    String(paymentOperationType) // New argument
  )
  if (!paymentSuccess) {
    logger.error('Payment failed during training preparation', {
      telegramId,
      userId: user.id,
    })
    await sendTelegramMessageFromWorker(
      String(telegramId), // Corrected
      TRAINING_MESSAGES.error(isRu ? 'Ошибка оплаты' : 'Payment failed')[
        isRu ? 'ru' : 'en'
      ],
      botName
    )
    return null
  }

  return {
    user,
    currentBalance, // Оставляем как есть в файле
    costInStars: costForTraining,
    publicUrl: zipUrl,
  }
}

/**
 * Обновляет запись о тренировке при ошибке.
 * @param userId - ID пользователя.
 * @param modelName - Имя модели.
 * @param error - Сообщение об ошибке.
 */
export async function updateTrainingRecordOnError(
  userId: string,
  modelName: string,
  error: string
): Promise<void> {
  try {
    const updateResult = await setLatestDigitalAvatarTrainingToError(
      userId,
      modelName,
      error
    )

    if (!updateResult) {
      logger.error(
        '[DB Error Handling] Failed to update training record on error using helper (or no record found)',
        {
          userId,
          modelName,
          originalError: error,
        }
      )
    } else {
      logger.info(
        '[DB Update via Helper] Training record updated to ERROR for user/model',
        {
          userId,
          modelName,
          error,
        }
      )
    }
  } catch (dbError: any) {
    logger.error(
      '[DB Exception Catch] Exception during updateTrainingRecordOnError when calling helper',
      {
        userId,
        modelName,
        originalError: error,
        exceptionMessage: dbError.message,
      }
    )
  }
}

/**
 * Запускает тренировку модели на Replicate.
 * @param user - Объект пользователя.
 * @param modelName - Имя модели.
 * @param zipUrl - Публичный URL архива.
 * @param triggerWord - Триггерное слово.
 * @param steps - Количество шагов.
 * @returns Объект с данными о запущенной тренировке Replicate.
 */
export async function startReplicateTraining(
  user: DigitalAvatarUserProfile,
  modelName: string,
  zipUrl: string,
  triggerWord: string,
  steps?: number
): Promise<Training> {
  const config = getDigitalAvatarBodyConfig()
  const ownerFromConfig = config.replicateUsername
  const destinationOwner = user.replicate_username || ownerFromConfig
  if (!destinationOwner) {
    throw new Error(
      'Replicate destination model owner could not be determined (user.replicate_username is null and REPLICATE_USERNAME from config is also null/undefined).'
    )
  }
  const destination = `${destinationOwner}/${modelName}`

  if (!config.apiUrl) {
    throw new Error(
      'API_URL is not configured. Cannot form Replicate webhook URL.'
    )
  }
  const webhookUrl = `${config.apiUrl}/api/replicate-webhook`

  const tokenForClient = user.api // User's token takes precedence
  if (!tokenForClient && !config.replicateApiToken) {
    // Log if neither user token nor module config token is available, getReplicateClient will throw
    logger.warn(
      'No Replicate API token found (user.api is null/undefined, and module config REPLICATE_API_TOKEN is also null/undefined) for startReplicateTraining',
      {
        userId: user.id,
      }
    )
  }
  const replicateClient = getReplicateClient(tokenForClient)

  try {
    const owner = config.replicateUsername || user.replicate_username
    const modelBaseName = modelName
    const version = config.replicateTrainingModelVersion

    if (!owner) {
      throw new Error(
        'Replicate model owner could not be determined (REPLICATE_USERNAME or user.replicate_username required).'
      )
    }
    if (!version) {
      throw new Error(
        'Replicate training model version (REPLICATE_TRAINING_MODEL_VERSION) is not configured.'
      )
    }

    const training = await replicateClient.trainings.create(
      owner,
      modelBaseName,
      version,
      {
        destination: destination as `${string}/${string}`,
        input: {
          input_images: zipUrl,
          token_string: triggerWord,
          use_face_detection_instead: true,
          max_train_steps: steps,
        },
        webhook: webhookUrl,
        webhook_events_filter: ['completed'],
      }
    )

    logger.info('Replicate training created:', { trainingId: training.id })
    const trainingResult: Training = training as Training

    return trainingResult
  } catch (error: any) {
    logger.error('[Replicate Error] Failed to start training', {
      destination: destination,
      error: error.message,
    })
    throw error
  }
}

/**
 * Форматирует имя модели для Replicate.
 * @param username - Имя пользователя Replicate.
 * @param modelName - Базовое имя модели.
 * @returns Полное имя модели в формате "username/modelName".
 */
export function formatReplicateModelName(
  username: string | null,
  modelName: string
): string {
  const config = getDigitalAvatarBodyConfig()
  const owner = username || config.replicateUsername
  if (!owner) {
    throw new Error(
      'Cannot determine Replicate model owner: username is null and config.replicateUsername is also not set.'
    )
  }
  return `${owner}/${modelName}`
}

// TODO: Добавить хелпер для копирования файла?
// export async function copyTrainingFile(...) { ... }

// --- Cache Logic --- (Перенесено из generateModelTraining.ts)
const replicateTrainingCache = new Map<
  string,
  {
    timestamp: number
    status: 'PENDING' | 'COMPLETED' | 'FAILED'
    trainingId?: string
  }
>()
export const CACHE_TTL_MS = 5 * 60 * 1000 // Экспортируем

export function checkAndSetTrainingCache(
  telegramId: string | number,
  modelName: string,
  status: 'PENDING' | 'COMPLETED' | 'FAILED',
  loggerInstance: typeof logger
): boolean {
  const cacheKey = `${telegramId}:${modelName}`
  const now = Date.now()
  const currentEntry = replicateTrainingCache.get(cacheKey)

  if (
    currentEntry &&
    currentEntry.status === 'PENDING' &&
    now - currentEntry.timestamp < CACHE_TTL_MS
  ) {
    loggerInstance.warn('Обнаружена активная тренировка в кэше', {
      telegram_id: telegramId,
      modelName,
      currentStatus: currentEntry.status,
      startedAt: new Date(currentEntry.timestamp).toISOString(),
    })
    return false
  }

  replicateTrainingCache.set(cacheKey, { timestamp: now, status })
  loggerInstance.info('Установлен статус начала тренировки в кэше', {
    telegram_id: telegramId,
    modelName,
    status: 'PENDING',
    timestamp: new Date(now).toISOString(),
  })

  for (const [key, entry] of replicateTrainingCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      replicateTrainingCache.delete(key)
    }
  }
  return true
}

export function updateTrainingStatus(
  telegramId: string | number,
  modelName: string,
  status: 'PENDING' | 'COMPLETED' | 'FAILED',
  loggerInstance: typeof logger,
  trainingId?: string
): void {
  const cacheKey = `${telegramId}:${modelName}`
  const entry = replicateTrainingCache.get(cacheKey)
  if (entry) {
    replicateTrainingCache.set(cacheKey, { ...entry, status, trainingId })
    loggerInstance.info('Обновлен статус тренировки в кэше', {
      telegram_id: telegramId,
      modelName,
      oldStatus: entry.status,
      newStatus: status,
      trainingId,
    })
  }
}
// --- End Cache Logic ---

/**
 * Fetches the latest model URL from Replicate.
 * @param modelName - The name of the model.
 * @param loggerInstance - Logger instance.
 * @returns The full model URL with version.
 */
export async function getLatestModelUrl(
  modelName: string,
  loggerInstance: typeof logger
): Promise<string> {
  const config = getDigitalAvatarBodyConfig()
  try {
    const username = config.replicateUsername
    if (!username) {
      throw new Error('REPLICATE_USERNAME is not set in module config')
    }
    // Assuming process.env.REPLICATE_API_TOKEN is still how the global Replicate client is authenticated.
    // If not, config.replicateApiToken needs to be used here for the fetch call authorization.
    const response = await fetch(
      `https://api.replicate.com/v1/models/${username}/${modelName}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.replicateApiToken}`, // USE MODULE CONFIG TOKEN
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        loggerInstance.warn(
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

    const data = (await response.json()) as ReplicateModelResponseForHelper
    loggerInstance.debug('data from getLatestModelUrl (helper):', data)
    if (!data.latest_version?.id) {
      throw new Error(
        `Latest version ID not found for model ${username}/${modelName}`
      )
    }
    const model_url = `${username}/${modelName}:${data.latest_version.id}`
    loggerInstance.debug(
      'model_url from getLatestModelUrl (helper):',
      model_url
    )
    return model_url
  } catch (error) {
    loggerInstance.error('Error fetching latest model url (helper):', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    throw error
  }
}

/**
 * Ensures a model exists on Replicate, creating it if necessary.
 * @param ownerUsername - The Replicate username of the model owner.
 * @param modelName - The name of the model.
 * @param triggerWord - The trigger word for the model (used in description if creating).
 * @param loggerInstance - Logger instance.
 * @param telegram_id - Optional telegram ID for logging context.
 */
export async function ensureReplicateModelExists(
  ownerUsername: string,
  modelName: string,
  triggerWord: string,
  loggerInstance: typeof logger,
  telegram_id?: number
): Promise<void> {
  const destination: `${string}/${string}` = `${ownerUsername}/${modelName}`
  let modelExists = false
  const replicateClient = getReplicateClient()

  try {
    loggerInstance.debug(`Checking if Replicate model exists: ${destination}`, {
      telegram_id,
    })
    await replicateClient.models.get(ownerUsername, modelName)
    loggerInstance.info(`Replicate model ${destination} exists.`, {
      telegram_id,
    })
    modelExists = true
  } catch (error) {
    if ((error as any)?.response?.status === 404) {
      loggerInstance.info(
        `Replicate model ${destination} does not exist. Creating...`,
        { telegram_id }
      )
      modelExists = false
    } else {
      loggerInstance.error('Error checking Replicate model existence:', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        telegram_id,
      })
      throw error
    }
  }

  if (!modelExists) {
    try {
      loggerInstance.info(`Creating Replicate model ${destination}...`, {
        telegram_id,
      })
      await replicateClient.models.create(ownerUsername, modelName, {
        description: `LoRA model trained with trigger word: ${triggerWord}`,
        visibility: 'public',
        hardware: 'gpu-t4',
      })
      loggerInstance.info(`Replicate model ${destination} created.`, {
        telegram_id,
      })
      await new Promise(resolve => setTimeout(resolve, 3000))
    } catch (error) {
      loggerInstance.error('API error during Replicate model creation:', {
        message: (error as Error).message,
        telegram_id,
      })
      throw error
    }
  }
}

/**
 * Polls Replicate for training status and updates the database.
 * @param initialTrainingDetails - The initial response from Replicate after starting a training.
 * @param dbTrainingRecordId - The ID of the training record in the local database.
 * @param loggerInstance - Logger instance.
 * @param telegram_id - Optional telegram ID for logging context.
 * @returns The final status of the training ('succeeded', 'failed', or 'canceled').
 */
export async function pollReplicateTrainingStatus(
  initialTrainingDetails: { id: string; status: string },
  dbTrainingRecordId: string,
  loggerInstance: typeof logger,
  telegram_id?: number
): Promise<string> {
  const currentReplicateTrainingId = initialTrainingDetails.id
  let currentPolledStatus = initialTrainingDetails.status
  let lastDbUpdatedStatus = initialTrainingDetails.status
  const replicateClient = getReplicateClient()

  loggerInstance.debug(
    `Starting polling for Replicate training: ${currentReplicateTrainingId}`,
    { telegram_id, initialStatus: currentPolledStatus }
  )

  while (
    currentPolledStatus !== 'succeeded' &&
    currentPolledStatus !== 'failed' &&
    currentPolledStatus !== 'canceled'
  ) {
    await new Promise(resolve => setTimeout(resolve, 10000)) // Polling interval

    if (!currentReplicateTrainingId) {
      loggerInstance.warn(
        'Replicate training ID became unavailable during polling, breaking loop.',
        { telegram_id }
      )
      throw new Error('Training ID became unavailable during polling.')
    }

    try {
      const updatedTrainingFromServer = await replicateClient.trainings.get(
        currentReplicateTrainingId
      )
      currentPolledStatus = updatedTrainingFromServer.status
      loggerInstance.debug(`Polled Replicate status: ${currentPolledStatus}`, {
        telegram_id,
        trainingId: currentReplicateTrainingId,
      })

      // Update DB only if the status has changed from what we last wrote
      if (
        currentPolledStatus.toUpperCase() !== lastDbUpdatedStatus.toUpperCase()
      ) {
        const updateResult = await updateDigitalAvatarTraining(
          dbTrainingRecordId,
          {
            status: currentPolledStatus.toUpperCase() as
              | 'PENDING'
              | 'PROCESSING'
              | 'SUCCEEDED'
              | 'FAILED',
          }
        )

        if (!updateResult) {
          loggerInstance.error(
            'Failed to update training status in DB during polling using helper',
            {
              dbTrainingRecordId,
              newStatus: currentPolledStatus,
              telegram_id,
            }
          )
          // Decide if we should throw or continue polling. For now, log and continue.
        } else {
          lastDbUpdatedStatus = currentPolledStatus // Update our tracker
          loggerInstance.info(
            `Updated DB training status to ${currentPolledStatus.toUpperCase()}`,
            { dbTrainingRecordId, telegram_id }
          )
        }
      }
    } catch (pollingError) {
      loggerInstance.error('Error during Replicate polling:', {
        trainingId: currentReplicateTrainingId,
        error: (pollingError as Error).message,
        stack: (pollingError as Error).stack,
        telegram_id,
      })
      // If polling fails, we might be in an inconsistent state.
      // Depending on the error, we might want to break or retry.
      // For now, let's break and let the main function handle it as a failed poll.
      // Consider returning a specific status like 'POLLING_FAILED'
      throw new Error(
        `Polling failed for training ID ${currentReplicateTrainingId}: ${(pollingError as Error).message}`
      )
    }
  }
  loggerInstance.info(
    `Polling finished for Replicate training: ${currentReplicateTrainingId}, final status: ${currentPolledStatus}`,
    { telegram_id }
  )
  return currentPolledStatus
}

/**
 * Starts a specific Replicate training using the 'flux-dev-lora-trainer' model.
 * This is tailored for the "Plan B" scenario in generateModelTraining.
 *
 * @param destinationModelId - The fully qualified destination model ID (e.g., 'username/modelname').
 * @param zipUrl - URL to the input images zip file.
 * @param triggerWord - The trigger word for the LoRA model.
 * @param steps - Number of training steps.
 * @param loggerInstance - Logger instance.
 * @param telegram_id - Optional telegram ID for logging context.
 * @returns The Replicate training response.
 */
export async function startFluxLoraTrainerReplicateTraining(
  destinationModelId: `${string}/${string}`,
  zipUrl: string,
  triggerWord: string,
  steps: number,
  loggerInstance: typeof logger,
  telegram_id?: number
): Promise<Training> {
  const replicateClient = getReplicateClient()
  try {
    loggerInstance.info(
      `Starting Replicate training with flux-dev-lora-trainer for ${destinationModelId}...`,
      { telegram_id, zipUrl, steps, triggerWord }
    )

    const training = await replicateClient.trainings.create(
      'ostris',
      'flux-dev-lora-trainer',
      'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      {
        destination: destinationModelId,
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

    loggerInstance.info(
      `Replicate training (flux-dev-lora-trainer) started. ID: ${training.id}`,
      { telegram_id, destinationModelId }
    )
    return training as Training
  } catch (error: any) {
    loggerInstance.error(
      'Error starting Replicate training with flux-dev-lora-trainer',
      {
        destinationModelId,
        error: error.message,
        stack: error.stack,
        telegram_id,
      }
    )
    throw error
  }
}
