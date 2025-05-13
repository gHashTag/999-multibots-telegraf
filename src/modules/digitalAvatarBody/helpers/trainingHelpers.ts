import { getUserByTelegramId, getUserBalance } from '@/core/supabase'
import { COSTS } from '@/config'
import { logger } from '@/utils/logger'
import { User } from '@/interfaces/user.interface'
import {
  createModelTraining as createModelTrainingInDB,
  ModelTraining,
} from '@/core/supabase/createModelTraining'
import { replicate } from '@/core/replicate'
import Replicate, { Training } from 'replicate'
import { getUserById } from '@/core/supabase/getUserById'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { createModelTraining } from '@/core/supabase/createModelTraining'
import { updateLatestModelTrainingQuick } from '@/core/supabase/trainings'
import * as config from '@/config'
import { getVideoUrl } from '@/core/supabase'
import { calculateCost } from '@/price/priceCalculator'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { API_URL, UPLOAD_DIR } from '@/config'
import { supabase } from '@/core/supabase'
// import { ReplicateTraining } from '@/interfaces/replicateTraining.interface'

/**
 * Общая информация, получаемая на начальном этапе обработки запроса на тренировку.
 */
export interface PreparedTrainingData {
  user: User
  currentBalance: number
  costInStars: number
  publicUrl: string
}

/**
 * Валидирует пользователя, его баланс и возвращает подготовленные данные.
 * @param telegram_id - ID пользователя в Telegram.
 * @param is_ru - Язык пользователя (для сообщений об ошибках).
 * @returns Объект с пользователем, балансом и стоимостью, или null в случае ошибки.
 */
export async function validateAndPrepareTrainingRequest(
  telegramId: number,
  filePath: string,
  modelName: string,
  triggerWord: string,
  isRu: boolean,
  botName: string,
  paymentType: PaymentType,
  calculatedCost: number
): Promise<PreparedTrainingData | null> {
  const telegramIdStr = String(telegramId)
  // 1. Получение пользователя
  const user = await getUserById(telegramIdStr)
  if (!user) {
    logger.warn(`User not found for telegram_id: ${telegramIdStr}`)
    return null
  }

  // 2. Проверка уровня пользователя
  if (user.level < 2) {
    logger.warn(
      `User ${user.id} level ${user.level} is insufficient for LORA training.`
    )
    return null
  }

  // 3. Расчет стоимости
  const costInStars = calculatedCost

  if (costInStars === undefined || costInStars === null || costInStars < 0) {
    logger.error(
      'Invalid calculatedCost provided to validateAndPrepareTrainingRequest',
      { calculatedCost }
    )
    return null
  }

  // 4. Проверка баланса
  const currentBalance = (await getUserBalance(telegramIdStr)) ?? 0
  if (currentBalance < costInStars) {
    logger.warn(
      `User ${user.id} has insufficient balance (${currentBalance} stars) for LORA training (cost: ${costInStars} stars).`
    )
    return null
  }

  // 5. Формирование публичного URL локально
  try {
    const fileName = path.basename(filePath) // Используем path.basename для извлечения имени файла
    const publicUrl = `${config.API_URL}/uploads/training_archives/${fileName}` // Формируем URL
    logger.info(`Constructed public URL: ${publicUrl}`, {
      telegramId,
      fileName,
    })

    return {
      user,
      currentBalance,
      costInStars,
      publicUrl, // Возвращаем созданный URL
    }
  } catch (error: any) {
    // Ошибка может возникнуть в path.basename, если filePath некорректен
    logger.error('Error constructing public URL from filePath', {
      telegramId,
      filePath,
      error: error.message,
    })
    // Пытаемся обновить запись об ошибке (если user есть)
    await updateTrainingRecordOnError(
      user.id,
      modelName,
      'Failed to construct public URL from file path'
    )
    return null
  }
}

/**
 * Создает запись о тренировке в базе данных.
 * @param trainingData - Данные для создания записи.
 * @returns Массив с созданной записью или null в случае ошибки.
 */
export async function createTrainingRecord(
  trainingData: ModelTraining
): Promise<ModelTraining[] | null> {
  try {
    if (typeof trainingData.user_id !== 'string') {
      trainingData.user_id = String(trainingData.user_id)
    }

    if (
      !trainingData.user_id ||
      !trainingData.model_name ||
      !trainingData.zip_url ||
      !trainingData.status
    ) {
      logger.error(
        '[Helper Error] Missing required fields for createTrainingRecord',
        { data: trainingData }
      )
      return null
    }

    const result = await createModelTrainingInDB(trainingData)
    logger.info({
      message: 'Запись о тренировке создана в БД',
      userId: trainingData.user_id,
      modelName: trainingData.model_name,
      status: trainingData.status,
    })
    return result ?? null
  } catch (error: any) {
    logger.error({
      message: 'Ошибка при создании записи о тренировке в БД',
      userId: trainingData.user_id,
      modelName: trainingData.model_name,
      error: error.message,
    })
    return null
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
    // Обновляем напрямую по userId и modelName
    const { error: updateError } = await supabase
      .from('model_trainings')
      .update({ status: 'ERROR', error: error })
      .eq('user_id', userId)
      .eq('model_name', modelName)
      .order('created_at', { ascending: false })
      .limit(1) // Обновляем только последнюю запись для этой модели пользователя

    if (updateError) {
      logger.error(
        '[DB Error] Failed to update training record on error (direct update)',
        {
          userId,
          modelName,
          originalError: error,
          dbError: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        }
      )
    } else {
      logger.info('[DB Update] Training record updated to ERROR', {
        userId,
        modelName,
        error,
      })
    }
  } catch (dbError: any) {
    logger.error('[DB Error Catch] Failed to update training record on error', {
      userId,
      modelName,
      originalError: error,
      dbError: dbError.message,
    })
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
  user: User,
  modelName: string,
  zipUrl: string,
  triggerWord: string,
  steps?: number
): Promise<Training> {
  const replicateModelName = formatReplicateModelName(
    user.replicate_username,
    modelName
  )
  const webhookUrl = getReplicateWebhookUrl()

  const token = user.api

  if (!token) {
    logger.warn('Replicate API key (user.api) not found for user', {
      userId: user.id,
    })
  }

  try {
    // Определяем владельца, имя модели и версию
    const owner = config.REPLICATE_USERNAME || user.replicate_username // Владелец модели (из конфига или пользователя)
    const modelBaseName = modelName // Базовое имя модели
    const version = config.REPLICATE_TRAINING_MODEL_VERSION // Версия тренера

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

    // Используем глобальный клиент replicate
    const training = await replicate.trainings.create(
      owner, // <--- owner
      modelBaseName, // <--- name
      version, // <--- version
      {
        // <--- options object
        destination: replicateModelName as `${string}/${string}`, // <--- Приведение типа
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
      destination: replicateModelName,
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
  if (!username) {
    logger.warn(
      'Replicate username is missing, cannot format model name correctly.'
    )
    // Возможно, стоит вернуть ошибку или значение по умолчанию
    return modelName // Возвращаем базовое имя как fallback
  }
  return `${username}/${modelName}`
}

/**
 * Возвращает URL для вебхука Replicate.
 * TODO: Сделать URL динамическим или конфигурируемым.
 * @returns URL вебхука.
 */
export function getReplicateWebhookUrl(): string {
  // TODO: Заменить на process.env или config
  return `${config.API_URL}/api/replicate-webhook`
}

// TODO: Добавить хелпер для копирования файла?
// export async function copyTrainingFile(...) { ... }
