import { logger } from '../utils/logger'
// import { User } from '@/interfaces/user.interface' // REMOVED: No longer used
import {
  type ReplicateTrainingResponse as Training,
  TrainingStatus,
} from '../types' // CHANGED: Using local ReplicateTrainingResponse aliased as Training and added TrainingStatus import
import { PaymentType } from '../types' // CHANGED: Using local PaymentType
import { getDigitalAvatarBodyConfig } from '../config'
import { sendTelegramMessageFromWorker } from '@/utils/telegramHelpers'
import { getReplicateClient } from '../utils/replicateClient'
import {
  updateDigitalAvatarTraining,
  setDigitalAvatarTrainingError,
} from './modelTrainingsDb'
import {
  getDigitalAvatarUserProfile,
  updateUserNeuroTokens,
  DigitalAvatarUserProfile,
} from './userProfileDb'
import { Prediction, Page, WebhookEventType } from 'replicate' // Removed ReplicateError

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
 * Обновляет запись о тренировке при ошибке, используя ID записи.
 * @param trainingId - ID записи тренировки в БД.
 * @param error - Сообщение об ошибке.
 */
export async function updateTrainingRecordOnError(
  trainingId: string, // Изменено: принимаем ID записи
  error: string
): Promise<void> {
  try {
    // const updateResult = await setLatestDigitalAvatarTrainingToError( // Старый вызов
    //   userId,
    //   modelName,
    //   error
    // )
    const updateResult = await setDigitalAvatarTrainingError(trainingId, error) // Новый вызов

    if (!updateResult) {
      logger.error(
        '[DB Error Handling] Failed to update training record on error using specific ID',
        {
          trainingId, // Обновлено для лога
          originalError: error,
        }
      )
    } else {
      logger.info(
        '[DB Update via Helper] Training record updated to ERROR for specific ID',
        {
          trainingId, // Обновлено для лога
          error,
        }
      )
    }
  } catch (dbError: any) {
    logger.error(
      '[DB Exception Catch] Exception during updateTrainingRecordOnError (using specific ID)',
      {
        trainingId, // Обновлено для лога
        originalError: error,
        exceptionMessage: dbError.message,
      }
    )
  }
}

// Helper to map Replicate SDK's Prediction status to our internal TrainingStatus
const mapReplicateStatusToTrainingStatus = (
  replicateStatus: Prediction['status']
): TrainingStatus => {
  switch (replicateStatus) {
    case 'starting':
    case 'processing':
      return 'PROCESSING'
    case 'succeeded':
      return 'SUCCEEDED'
    case 'failed':
      return 'FAILED'
    case 'canceled':
      return 'CANCELED'
    default:
      logger.warn(`Unknown Replicate status received: ${replicateStatus}`)
      return 'FAILED' // Default to FAILED for unknown statuses
  }
}

/**
 * Запускает тренировку модели на Replicate.
 * @param user - Объект пользователя.
 * @param modelName - Имя модели.
 * @param zipUrl - Публичный URL архива.
 * @param triggerWord - Триггерное слово.
 * @param stepsFromCaller - Количество шагов (опционально, будет использовано значение из конфига, если не предоставлено).
 * @returns Объект с данными о запущенной тренировке Replicate.
 */
export async function startReplicateTraining(
  user: DigitalAvatarUserProfile,
  modelName: string,
  zipUrl: string,
  triggerWord: string,
  stepsFromCaller?: number // Переименовано для ясности
): Promise<Prediction> {
  const config = getDigitalAvatarBodyConfig()
  const replicate = getReplicateClient()

  const destinationModel = formatReplicateModelName(
    user.replicate_username || config.replicateUsername, // Use user's replicate_username first, then config
    modelName
  )

  const effectiveSteps = stepsFromCaller || config.replicateDefaultSteps || 1500
  // instanceClass is not directly used by replicate.trainings.create in this way.
  // It's part of the input to the trainer model itself.
  // const instanceClass = triggerWord

  const webhookUrl = config.apiUrl
    ? `${config.apiUrl}/replicate-webhook`
    : undefined
  if (!webhookUrl) {
    logger.error(
      '[startReplicateTraining] API_URL is not defined in config, cannot create webhook URL'
    )
    throw new Error('API_URL is not defined, webhook URL cannot be created.')
  }

  const webhookEventsFilter: WebhookEventType[] = [
    'start',
    'output',
    'logs',
    'completed',
  ]

  const trainingInput = {
    input_images_zip_url: zipUrl,
    token_string: triggerWord,
    // instance_prompt: `a photo of a ${triggerWord} person`, // Example: this is model specific
    // gender: user.gender, // Example: this is model specific
    steps: effectiveSteps,
    // Any other specific inputs required by config.replicateTrainingModelVersion
  }

  logger.info(
    `[startReplicateTraining] Starting Replicate training for user ${user.id} with destination model ${destinationModel}, version ${config.replicateTrainingModelVersion}`,
    { trainingInput, webhookUrl, webhookEventsFilter }
  )

  try {
    const training = await replicate.trainings.create(
      config.replicateUsername, // Owner
      modelName, // Name of the model (without owner prefix)
      config.replicateTrainingModelVersion || 'version-not-set', // Version
      {
        // Fourth argument: object containing input and other options
        input: trainingInput, // trainingInput goes inside the 'input' field
        destination: destinationModel as `${string}/${string}`,
        webhook: webhookUrl,
        webhook_events_filter: webhookEventsFilter,
      }
    )
    logger.info(
      `[startReplicateTraining] Training started successfully for user ${user.id} with destination model ${destinationModel}, version ${config.replicateTrainingModelVersion}`,
      { trainingInput, webhookUrl, webhookEventsFilter }
    )
    return training as Prediction
  } catch (error: any) {
    logger.error('[Replicate API Error] Failed to start training:', {
      user_id: user.id,
      model_name: destinationModel,
      error_message: error.message,
      error_stack: error.stack,
      error_response: error.response?.data,
    })
    throw new Error(`Replicate API error: ${error.message}`)
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
  ownerUsername: string, // Это должен быть replicate_username пользователя или из конфига
  modelName: string,
  triggerWord: string, // triggerWord здесь не используется для создания модели
  loggerInstance: typeof logger,
  telegram_id?: number
): Promise<void> {
  const config = getDigitalAvatarBodyConfig()
  const replicate = getReplicateClient()

  // Используем ownerUsername, переданный в функцию, который должен быть актуальным replicate_username
  const destination = `${ownerUsername}/${modelName}`

  try {
    loggerInstance.debug(
      `[Replicate Helper] Checking if model exists: ${destination}`,
      { telegram_id }
    )
    await replicate.models.get(ownerUsername, modelName)
    loggerInstance.info(
      `[Replicate Helper] Model ${destination} already exists.`,
      { telegram_id }
    )
  } catch (error: any) {
    // Если модель не найдена (обычно ошибка 404), создаем ее
    if (error.response && error.response.status === 404) {
      loggerInstance.info(
        `[Replicate Helper] Model ${destination} not found. Creating...`,
        { telegram_id }
      )
      try {
        await replicate.models.create(
          ownerUsername, // Используем ownerUsername
          modelName, // Используем modelName
          {
            // Опции передаются третьим аргументом
            visibility: 'private', // или 'public', в зависимости от требований
            hardware: 'gpu-a40-small', // Выберите подходящее железо
            description: `Custom model for ${ownerUsername}, trigger: ${triggerWord}`,
            // cover_image_url: 'URL_К_ОБЛОЖКЕ_МОДЕЛИ', // Опционально
            // paper_url: 'URL_К_ОПИСАНИЮ_МОДЕЛИ', // Опционально
            // github_url: 'URL_К_GITHUB_РЕПОЗИТОРИЮ', // Опционально
            // category: 'image-generation', // Опционально
          }
        )
        loggerInstance.info(
          `[Replicate Helper] Model ${destination} created successfully.`,
          { telegram_id }
        )
      } catch (createError: any) {
        loggerInstance.error(
          `[Replicate API Error] Failed to create model ${destination}:`,
          {
            error_message: createError.message,
            error_stack: createError.stack,
            error_response: createError.response?.data,
            telegram_id,
          }
        )
        // Бросаем ошибку дальше, чтобы вызывающая функция могла ее обработать
        throw new Error(
          `Failed to create Replicate model ${destination}: ${createError.message}`
        )
      }
    } else {
      // Если произошла другая ошибка (не 404), также бросаем ее
      loggerInstance.error(
        `[Replicate API Error] Failed to check model ${destination}:`,
        {
          error_message: error.message,
          error_stack: error.stack,
          error_response: error.response?.data,
          telegram_id,
        }
      )
      throw new Error(
        `Failed to check Replicate model ${destination}: ${error.message}`
      )
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
