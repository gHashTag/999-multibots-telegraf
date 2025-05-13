import { inngest } from '@/inngest_app/client'
import { NonRetriableError, EventPayload } from 'inngest'

import {
  updateUserBalance as updateUserBalanceInDB,
  updateUserLevelPlusOne as updateUserLevelPlusOneInDB,
  getUserByTelegramId, // <--- ИМПОРТИРУЕМ НУЖНУЮ ФУНКЦИЮ
} from '@/core/supabase'
import { INNGEST_EVENT_KEY } from '@/config' // Direct imports
import { logger } from '@/utils/logger' // Direct import
import type { ModelTraining } from '@/core/supabase/createModelTraining'

import type { ModelTrainingInngestEventData } from '../types'
// Импортируем хелперы
import {
  validateAndPrepareTrainingRequest,
  createTrainingRecord,
  startReplicateTraining,
  updateTrainingRecordOnError,
  formatReplicateModelName,
  getReplicateWebhookUrl,
} from '../helpers/trainingHelpers'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { sendTelegramMessageFromWorker } from '@/utils/telegramHelpers' // Подтверждаем использование этой функции

const EVENT_NAME = 'app/digital-avatar-body.generate-model-training'
if (!INNGEST_EVENT_KEY) {
  logger.warn(
    `INNGEST_EVENT_KEY is not set, using default event name: ${EVENT_NAME}`
  )
}

// Event interface (используем импортированный тип для data)
export interface GenerateModelTrainingEvent {
  name: typeof EVENT_NAME
  data: ModelTrainingInngestEventData // Используем импортированный тип
}

// --- Cache Logic (без изменений) ---
const replicateTrainingCache = new Map<
  string,
  {
    timestamp: number
    status: 'starting' | 'running' | 'completed' | 'failed'
    trainingId?: string
    // Добавим структуру похожую на ActiveCheckFromDB для консистентности?
    // source?: 'cache' | 'db'; // Не нужно здесь, только в результате проверки
    // replicate_id?: string | null;
    // created_at?: string;
    // model_name?: string;
  }
>()
const CACHE_TTL_MS = 5 * 60 * 1000

function checkAndSetTrainingCache(
  telegramId: string | number,
  modelName: string,
  status: 'starting',
  loggerInstance: typeof logger // Pass logger instance
): boolean {
  const cacheKey = `${telegramId}:${modelName}`
  const now = Date.now()
  const currentEntry = replicateTrainingCache.get(cacheKey)

  if (
    currentEntry &&
    currentEntry.status === 'running' &&
    now - currentEntry.timestamp < CACHE_TTL_MS
  ) {
    loggerInstance.warn({
      message: 'Обнаружена активная тренировка в кэше',
      telegram_id: telegramId,
      modelName,
      currentStatus: currentEntry.status,
      startedAt: new Date(currentEntry.timestamp).toISOString(),
    })
    return false
  }

  replicateTrainingCache.set(cacheKey, { timestamp: now, status })
  loggerInstance.info({
    message: 'Установлен статус начала тренировки в кэше',
    telegram_id: telegramId,
    modelName,
    status: 'starting',
    timestamp: new Date(now).toISOString(),
  })

  for (const [key, entry] of replicateTrainingCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      replicateTrainingCache.delete(key)
    }
  }
  return true
}

function updateTrainingStatus(
  telegramId: string | number,
  modelName: string,
  status: 'running' | 'completed' | 'failed',
  loggerInstance: typeof logger, // Pass logger instance
  trainingId?: string
): void {
  const cacheKey = `${telegramId}:${modelName}`
  const entry = replicateTrainingCache.get(cacheKey)
  if (entry) {
    replicateTrainingCache.set(cacheKey, { ...entry, status, trainingId })
    loggerInstance.info({
      message: 'Обновлен статус тренировки в кэше',
      telegram_id: telegramId,
      modelName,
      oldStatus: entry.status,
      newStatus: status,
      trainingId,
    })
  }
}
// --- End Cache Logic ---

// Localized messages (copied)
const TRAINING_MESSAGES = {
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

// Active trainings map (copied)
const activeTrainings = new Map<string, { cancel: () => void }>()

// Directly export the Inngest function
export const generateModelTraining = inngest.createFunction(
  {
    id: 'digital-avatar-body-generate-model-training-refactored',
    name: 'Digital Avatar Body - Generate Model Training (Refactored)',
    retries: 3,
    rateLimit: {
      key: 'event.data.telegramId',
      limit: 1,
      period: '10s',
    },
    // concurrency: { key: "event.data.telegramId", limit: 1 }, // Consider enabling
  },
  { event: 'digital-avatar/generate.model.training.requested' },
  async ({ event, step }: { event: EventPayload; step: any }) => {
    logger.info({
      message: 'Получено событие тренировки модели',
      eventName: event.name,
      timestamp: new Date(event.ts).toISOString(),
      telegramId: event.data.telegram_id,
    })

    const eventData = event.data as ModelTrainingInngestEventData
    const {
      telegram_id,
      is_ru,
      bot_name,
      model_name,
      zipUrl,
      steps,
      trigger_word,
      user_api,
      user_replicate_username,
      calculatedCost, // <--- Читаем рассчитанную стоимость из события
      // paymentType, // Удаляем, используем operation_type_for_refund
      operation_type_for_refund,
    } = eventData

    // const operationTypeForRefund = eventData.operation_type_for_refund // Перенесено выше
    const telegramIdNumber = Number(telegram_id) // <--- Преобразуем telegram_id в число
    if (isNaN(telegramIdNumber)) {
      logger.error('Invalid telegram_id received in event', { telegram_id })
      throw new NonRetriableError('Invalid telegram_id')
    }

    // Шаг 1: Валидация пользователя и баланса через хелпер
    const validationResult = await step.run(
      'validate-user-and-balance',
      async () => {
        return await validateAndPrepareTrainingRequest(
          telegramIdNumber, // <--- Передаем число
          zipUrl, // Используем zipUrl из события
          model_name,
          trigger_word,
          is_ru,
          bot_name,
          operation_type_for_refund, // Используем operation_type_for_refund как PaymentType
          calculatedCost // <--- Передаем рассчитанную стоимость
        )
      }
    )

    if (!validationResult) {
      logger.warn({
        message: 'Валидация пользователя или баланса не пройдена.',
        telegramId: telegram_id,
      })
      await sendTelegramMessageFromWorker(
        telegram_id, // Отправляем как строку
        `❌ Не удалось начать тренировку. Проверьте ваш баланс или данные пользователя.`,
        bot_name
      )
      throw new NonRetriableError('User validation or balance check failed.')
    }

    // Деструктурируем costInStars из результата валидации
    const { user, publicUrl, costInStars } = validationResult // costInStars теперь равен calculatedCost

    logger.info('User validation and cost calculation successful', {
      functionName: 'generateModelTraining',
      userId: user.id,
      cost: costInStars, // Используем costInStars (который равен calculatedCost)
      publicUrl: publicUrl,
    })

    // Шаг 2: Списание баланса
    await step.run('deduct-balance', async () => {
      logger.info('Attempting to deduct balance...', {
        functionName: 'generateModelTraining',
        userId: user.id,
        cost: costInStars, // Используем стоимость из validationResult
      })
      await updateUserBalance(
        String(user.id),
        user.balance - costInStars, // Используем стоимость из validationResult
        operation_type_for_refund, // Используем тип из события
        `Training ${model_name}`,
        {
          bot_name: bot_name,
          amount: costInStars, // Используем стоимость из validationResult
          model_name: model_name,
        }
      )
      logger.info('Balance deducted successfully', {
        functionName: 'generateModelTraining',
        userId: user.id,
        newBalance: user.balance - costInStars, // Используем стоимость из validationResult
      })
    })

    // Шаг 3: Запуск тренировки и создание записи в БД
    let replicateTrainingId: string | null = null
    let dbRecordId: string | null = null

    try {
      // Используем хелперы
      const replicateModelName = formatReplicateModelName(
        user_replicate_username,
        model_name
      )
      const webhookUrl = getReplicateWebhookUrl()

      const trainingResult = await step.run('start-replicate-training', () => {
        logger.info('Starting Replicate training...', {
          functionName: 'generateModelTraining',
          userId: user.id,
        })
        return startReplicateTraining(
          user, // <--- Передаем весь объект user
          model_name,
          publicUrl, // <--- Правильно: URL архива
          trigger_word, // <--- Правильно: Триггерное слово
          steps // <--- Правильно: Количество шагов (опционально)
        )
      })

      if (!trainingResult) {
        throw new Error(
          'Replicate training failed to start (null response from helper)'
        )
      }
      replicateTrainingId = trainingResult.id

      logger.info('Replicate training started successfully', {
        functionName: 'generateModelTraining',
        userId: user.id,
        replicateId: replicateTrainingId,
      })

      // Создаем/обновляем запись в БД
      const dbResult = await step.run('create-db-record', () => {
        logger.info('Creating/updating training record in DB...', {
          functionName: 'generateModelTraining',
          userId: user.id,
        })
        const recordData: ModelTraining = {
          id: '', // ID будет сгенерирован БД
          created_at: new Date().toISOString(), // Добавляем текущее время
          user_id: String(user.id),
          model_name: model_name,
          zip_url: publicUrl,
          cost: costInStars, // Используем стоимость из validationResult
          status: 'STARTING', // Сразу STARTING
          replicate_training_id: replicateTrainingId,
          replicate_model_name: replicateModelName,
          webhook_url: webhookUrl,
          trigger_word: trigger_word,
          steps: steps, // Сохраняем количество шагов
          model_url: null, // Инициализируем как null
          error: null, // Инициализируем как null
        }
        return createTrainingRecord(recordData)
      })

      if (!dbResult || dbResult.length === 0) {
        logger.error('Failed to create DB record after Replicate start', {
          functionName: 'generateModelTraining',
          userId: user.id,
          replicateId: replicateTrainingId,
        })
        // Consider step.sleep and retry or fail the function?
        // For now, log error and continue (training is running)
      } else {
        dbRecordId = dbResult[0].id
        logger.info('DB record created/updated successfully', {
          functionName: 'generateModelTraining',
          userId: user.id,
          dbRecordId: dbRecordId,
        })
      }

      // Используем импортированную функцию sendTelegramMessageFromWorker
      await sendTelegramMessageFromWorker(
        String(user.telegram_id), // Передаем telegram_id
        `✅ Тренировка модели ${model_name} успешно запущена! ID: ${replicateTrainingId}`,
        bot_name
      )
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error during training'
      logger.error(`[Inngest Training Error] ${errorMessage}`, {
        eventName: event.name,
        eventTs: event.ts, // <--- Используем event.ts вместо event.id
        data: event.data,
        error,
      })

      // Получаем данные из события для обновления записи об ошибке
      const {
        model_name,
        trigger_word,
        zipUrl: publicUrl,
        steps,
        calculatedCost,
      } = event.data // Достаем steps
      const user = await getUserByTelegramId(event.data.telegram_id) // <-- ИСПОЛЬЗУЕМ ПРАВИЛЬНУЮ ФУНКЦИЮ

      if (!user) {
        logger.error(
          '[Inngest Training Error] User not found, cannot update error record in DB for refund an cost.',
          { telegram_id: event.data.telegram_id }
        )
        throw new NonRetriableError('User not found for error update.')
      }

      await step.run('update-db-on-error', async () => {
        // Обновляем запись об ошибке, используя хелпер
        await updateTrainingRecordOnError(
          String(user.id), // userId
          model_name, // modelName
          errorMessage // error
        )
      })

      // Выбрасываем NonRetriableError, чтобы Inngest не повторял попытки
      throw new NonRetriableError(errorMessage)
    }
  }
)
