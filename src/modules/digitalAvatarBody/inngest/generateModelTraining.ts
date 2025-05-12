import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import {
  API_URL,
  COSTS,
  REPLICATE_USERNAME,
  REPLICATE_TRAINING_MODEL_VERSION,
} from '@/config'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'
import {
  CostDetails,
  calculateCost as actualCalculateCost,
} from '@/price/priceCalculator'

import type { Logger } from 'winston'
import type { Inngest } from 'inngest'

import Replicate from 'replicate'
import type { Prediction } from 'replicate'
import type { User } from '@/interfaces/user.interface'
import type { ModelTraining } from '@/core/supabase/createModelTraining'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NonRetriableError } from 'inngest'

// Более чёткое определение типов
type ActiveCheckFromDB = {
  exists: true
  source: 'database'
  training: {
    id: any
    replicate_training_id: any
    status: any
  }
}

type ActiveCheckFromCache = {
  exists: true
  source: 'cache'
  cachedEntry: {
    timestamp: number
    status: string
    trainingId?: string
  }
}

type NoActiveCheck = {
  exists: false
}

type ErrorActiveCheck = {
  exists: false
  error: string
}

type ActiveCheckResult =
  | ActiveCheckFromDB
  | ActiveCheckFromCache
  | NoActiveCheck
  | ErrorActiveCheck

// 1. Изменим кэш на более надежный механизм с проверкой статуса
const replicateTrainingCache = new Map<
  string,
  {
    timestamp: number
    status: 'starting' | 'running' | 'completed' | 'failed'
    trainingId?: string
  }
>()

// 2. Функция проверки и установки статуса
function checkAndSetTrainingCache(
  telegram_id: string,
  modelName: string,
  status: 'starting',
  logger: Logger
): boolean {
  const cacheKey = `${telegram_id}:${modelName}`
  const now = Date.now()

  // Получаем текущую запись
  const currentEntry = replicateTrainingCache.get(cacheKey)

  // Проверяем только реально запущенные тренировки
  if (
    currentEntry &&
    currentEntry.status === 'running' &&
    now - currentEntry.timestamp < CACHE_TTL_MS
  ) {
    logger.warn({
      message: 'Обнаружена активная тренировка в кэше',
      telegram_id,
      modelName,
      currentStatus: currentEntry.status,
      startedAt: new Date(currentEntry.timestamp).toISOString(),
    })
    return false // Блокируем запуск - тренировка действительно идет
  }

  // Устанавливаем статус 'starting' - тренировка только начинается
  replicateTrainingCache.set(cacheKey, {
    timestamp: now,
    status,
  })

  logger.info({
    message: 'Установлен статус начала тренировки в кэше',
    telegram_id,
    modelName,
    status: 'starting',
    timestamp: new Date(now).toISOString(),
  })

  // Очистка устаревших записей
  for (const [key, entry] of replicateTrainingCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      replicateTrainingCache.delete(key)
    }
  }

  return true // Разрешаем запуск
}

// 3. Функция обновления статуса
function updateTrainingStatus(
  telegram_id: string,
  modelName: string,
  status: 'running' | 'completed' | 'failed',
  logger: Logger,
  trainingId?: string
): void {
  const cacheKey = `${telegram_id}:${modelName}`
  const entry = replicateTrainingCache.get(cacheKey)

  if (entry) {
    replicateTrainingCache.set(cacheKey, {
      ...entry,
      status,
      trainingId,
    })

    logger.info({
      message: 'Обновлен статус тренировки в кэше',
      telegram_id,
      modelName,
      oldStatus: entry.status,
      newStatus: status,
      trainingId,
    })
  }
}

// Время кэширования - 5 минут
const CACHE_TTL_MS = 5 * 60 * 1000

// Определяем типы для наших событий
interface TrainingEventData {
  bot_name: string
  is_ru: string | boolean
  modelName: string
  steps: string | number
  telegram_id: string
  triggerWord: string
  zipUrl: string
}

export interface ApiError extends Error {
  response?: {
    status: number
  }
}

const activeTrainings = new Map<string, { cancel: () => void }>()

// Локализованные сообщения
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

// Определяем интерфейс для зависимостей
export interface GenerateModelTrainingDependencies {
  replicate: Replicate
  supabase: SupabaseClient
  logger: Logger
  inngest: Inngest
  config: {
    API_URL: string
    REPLICATE_USERNAME: string
  }
  getUserByTelegramId: (telegram_id: string) => Promise<User | null>
  updateUserBalance: (
    telegram_id: string,
    amount: number,
    type: PaymentType,
    description?: string,
    metadata?: any
  ) => Promise<boolean>
  updateUserLevelPlusOne: (
    telegram_id: string,
    currentLevel: number
  ) => Promise<any>
  getUserBalance: (telegram_id: string) => Promise<number | null>
  createModelTraining: (
    training: ModelTraining
  ) => Promise<ModelTraining | null>
  getBotByName: (botName: string) => { bot?: any; name?: string }
  calculateCost: (params: {
    steps: number
    mode: ModeEnum
    telegram_id?: string
    bot_name?: string
  }) => CostDetails
}

// Фабричная функция для создания обработчика Inngest
export const createGenerateModelTrainingHandler = (
  deps: GenerateModelTrainingDependencies
) => {
  const {
    replicate,
    supabase,
    logger,
    config,
    getUserByTelegramId,
    updateUserBalance,
    updateUserLevelPlusOne,
    getUserBalance,
    createModelTraining,
    getBotByName,
    calculateCost,
  } = deps

  // Определяем функцию с правильной идемпотентностью
  return async ({ event, step }: { event: any; step: any }) => {
    // Добавляем информативный лог о входящем событии
    console.log('🎯 СОБЫТИЕ ТРЕНИРОВКИ ПОЛУЧЕНО:', {
      eventName: event.name,
      eventId: event.id,
      telegram_id: event.data.telegram_id,
      modelName: event.data.modelName,
      timestamp: new Date(event.ts).toISOString(),
    })

    logger.info({
      message: 'Получено событие тренировки модели',
      eventId: event.id,
      timestamp: new Date(event.ts).toISOString(),
      idempotencyKey: `train:${event.data.telegram_id}:${event.data.modelName}`,
    })

    // Приведение типов для event.data
    const eventData = event.data as TrainingEventData
    const cacheKey = `${eventData.telegram_id}:${eventData.modelName}`

    // ВАЖНО: Проверка наличия реальной активной тренировки в Replicate
    const activeCheck = (await step.run('check-active-training', async () => {
      try {
        // 1. Проверяем записи в базе данных
        const { data: existingTrainings } = await supabase
          .from('trainings')
          .select('id, replicate_training_id, status')
          .eq('telegram_id', eventData.telegram_id)
          .eq('model_name', eventData.modelName)
          .in('status', ['active', 'pending'])
          .order('created_at', { ascending: false })
          .limit(1)

        if (existingTrainings?.length > 0) {
          const training = existingTrainings[0]
          logger.info({
            message: 'Найдена активная тренировка в базе данных',
            trainingRecord: training,
          })

          // Если есть запись в БД, обновляем кэш
          if (training.replicate_training_id) {
            replicateTrainingCache.set(cacheKey, {
              timestamp: Date.now(),
              status: 'running',
              trainingId: training.replicate_training_id,
            })
          }

          return {
            exists: true,
            source: 'database',
            training,
          } as ActiveCheckFromDB
        }

        // 2. Кэш проверяем только если в БД нет записи
        const cachedEntry = replicateTrainingCache.get(cacheKey)
        if (
          cachedEntry?.status === 'running' &&
          Date.now() - cachedEntry.timestamp < CACHE_TTL_MS
        ) {
          logger.info({
            message: 'Найдена активная тренировка в кэше',
            cachedEntry,
          })
          return {
            exists: true,
            source: 'cache',
            cachedEntry,
          } as ActiveCheckFromCache
        }

        // Если ни в БД, ни в кэше нет активной тренировки
        return { exists: false } as NoActiveCheck
      } catch (error) {
        logger.error({
          message: 'Ошибка при проверке активных тренировок',
          error: (error as Error).message,
        })
        return {
          exists: false,
          error: (error as Error).message,
        } as ErrorActiveCheck
      }
    })) as ActiveCheckResult

    if (activeCheck.exists) {
      const { bot } = getBotByName(eventData.bot_name)
      if (bot) {
        const isRussian = eventData.is_ru === true || eventData.is_ru === 'true'
        try {
          await bot.telegram.sendMessage(
            eventData.telegram_id,
            TRAINING_MESSAGES.duplicateRequest[isRussian ? 'ru' : 'en']
          )
          if ('training' in activeCheck && activeCheck.training?.id) {
            await bot.telegram.sendMessage(
              eventData.telegram_id,
              isRussian
                ? `Вы можете отменить текущую тренировку, если хотите начать новую.`
                : `You can cancel the current training if you want to start a new one.`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: isRussian
                          ? '❌ Отменить текущую тренировку'
                          : '❌ Cancel current training',
                        callback_data: `cancel_train:${activeCheck.training.id}`,
                      },
                    ],
                  ],
                },
              }
            )
          }
        } catch (error) {
          logger.error({
            message: 'Не удалось отправить уведомление о дублированном запросе',
            error: (error as Error).message,
          })
        }
      }
      logger.info({
        message:
          'Запрос на тренировку отклонен - обнаружена активная тренировка',
        telegram_id: eventData.telegram_id,
        modelName: eventData.modelName,
        activeCheck,
      })
      return {
        success: false,
        message: 'Active training already exists',
        activeTrainingExists: true,
        trainingId:
          'training' in activeCheck
            ? activeCheck.training?.replicate_training_id
            : undefined,
      }
    }

    if (
      !checkAndSetTrainingCache(
        eventData.telegram_id,
        eventData.modelName,
        'starting',
        logger
      )
    ) {
      logger.warn({
        message:
          'Странная ошибка - кэш блокирует, но проверка активных тренировок прошла',
        telegram_id: eventData.telegram_id,
        modelName: eventData.modelName,
      })
    }

    logger.debug({ message: 'Данные события', data: eventData })
    const { bot } = getBotByName(eventData.bot_name)
    logger.info({
      message: 'Получен бот',
      botUsername: bot?.botInfo?.username || 'не найден',
      botName: eventData.bot_name,
    })

    if (!bot) {
      logger.error({ message: 'Бот не найден', botName: eventData.bot_name })
      throw new Error(`❌ Бот ${eventData.bot_name} не найден`)
    }
    const helpers = {
      sendMessage: async (message: string) => {
        await step.run('send-message', async () => {
          try {
            await bot.telegram.sendMessage(eventData.telegram_id, message)
            logger.info({
              message: 'Сообщение отправлено',
              telegram_id: eventData.telegram_id,
            })
            return true
          } catch (error) {
            logger.error({
              message: 'Ошибка отправки сообщения',
              error: (error as Error).message,
              telegram_id: eventData.telegram_id,
            })
            return false
          }
        })
      },
    }

    const trainingSteps = {
      validateInput: async () => {
        const { modelName, steps: rawSteps, is_ru } = eventData
        const steps = Number(rawSteps)
        if (isNaN(steps) || steps <= 0) {
          const errorMessage = is_ru
            ? 'Некорректное количество шагов'
            : 'Invalid steps count'
          logger.error({
            message: errorMessage,
            steps: rawSteps,
            telegram_id: eventData.telegram_id,
          })
          throw new Error(errorMessage)
        }
        logger.info({
          message: 'Входные данные валидны',
          modelName,
          steps,
          telegram_id: eventData.telegram_id,
        })
        return { modelName, steps }
      },

      checkUserAndBalance: async () => {
        const { telegram_id } = eventData
        return Promise.all([
          step.run('get-user', async () => {
            const user = await getUserByTelegramId(telegram_id)
            if (!user) {
              logger.error({
                message: 'Пользователь не найден',
                telegram_id,
              })
              return Promise.reject('User not found')
            }
            logger.info({
              message: 'Пользователь найден',
              userId: user.id,
              telegram_id,
            })
            return user
          }),
        ])
      },

      createTrainingRecord: async (trainingId: string, user: User) => {
        return await step.run('create-training-record', async () => {
          const steps = Number(eventData.steps)
          const trainingToCreate: ModelTraining = {
            user_id: String(user.id),
            model_name: eventData.modelName,
            trigger_word: eventData.triggerWord,
            zip_url: eventData.zipUrl,
            replicate_training_id: trainingId,
            status: 'pending',
          }
          logger.info(
            '🔵 Создание записи о тренировке в createTrainingRecord',
            trainingToCreate
          )
          const createdRecord = await createModelTraining(trainingToCreate)
          logger.info('Запись о тренировке создана в createTrainingRecord', {
            createdRecord,
          })
          return createdRecord
        })
      },

      createReplicateModel: async (modelName: string) => {
        const username = config.REPLICATE_USERNAME
        if (!username) throw new Error('REPLICATE_USERNAME not set in config')

        try {
          const existing = await replicate.models.get(username, modelName)
          logger.info('🔵 Существующая модель:', existing.url)
          return `${username}/${modelName}`
        } catch (error) {
          logger.info('🏗️ Создание новой модели...')
          try {
            const newModel = await replicate.models.create(
              username,
              modelName,
              {
                description: `LoRA: ${eventData.triggerWord}`,
                visibility: 'public',
                hardware: 'gpu-t4',
              }
            )
            logger.info('✅ Модель создана:', newModel.latest_version?.id)
            await new Promise(resolve => setTimeout(resolve, 5000))
            return `${username}/${modelName}`
          } catch (createError) {
            logger.error('❌ Ошибка создания модели:', createError)
            throw new Error('Failed to create model')
          }
        }
      },

      registerCancelHandler: (telegram_id: string, trainingId: string) => {
        const cancelProcess = {
          cancel: async () => {
            try {
              await replicate.trainings.cancel(trainingId)
              logger.info(`❌ Training ${trainingId} canceled`)
            } catch (error) {
              logger.error('Cancel error:', error)
            }
            activeTrainings.delete(telegram_id)
          },
        }
        activeTrainings.set(telegram_id, cancelProcess)
        logger.info('🛑 Cancel handler registered for:', telegram_id)
      },

      startTraining: async (destination: string) => {
        if (!eventData.zipUrl || !eventData.triggerWord) {
          throw new Error(
            '❌ Отсутствуют обязательные параметры: zipUrl или triggerWord'
          )
        }
        const training: Prediction = await replicate.trainings.create(
          'ostris',
          'flux-dev-lora-trainer',
          'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
          {
            destination: destination as `${string}/${string}`,
            input: {
              input_images: eventData.zipUrl,
              trigger_word: eventData.triggerWord,
              steps: Number(eventData.steps),
              lora_rank: 128,
              optimizer: 'adamw8bit',
              batch_size: 1,
              resolution: '512,768,1024',
              learning_rate: 0.0001,
              wandb_project: 'flux_train_replicate',
            },
            webhook: `${config.API_URL}/webhooks/replicate`,
            webhook_events_filter: ['completed'],
          }
        )

        logger.info('🚀 Training ID:', training.id)
        trainingSteps.registerCancelHandler(eventData.telegram_id, training.id)
        return training
      },
    }
    let balanceCheck: { success?: boolean; currentBalance?: number } | null =
      null
    const paymentAmount: number | null = null
    let trainingCost: CostDetails
    try {
      const isRussian = eventData.is_ru === true || eventData.is_ru === 'true'
      await helpers.sendMessage(
        TRAINING_MESSAGES.start[isRussian ? 'ru' : 'en']
      )

      const { modelName, steps } = await trainingSteps.validateInput()
      const [user] = await trainingSteps.checkUserAndBalance()
      logger.info({
        message: 'Пользователь найден',
        userId: user.id,
        telegram_id: eventData.telegram_id,
      })

      if (user.level === 0) {
        await step.run('update-level', () =>
          updateUserLevelPlusOne(eventData.telegram_id, 0)
        )
        logger.info({
          message: 'Уровень пользователя обновлен',
          telegram_id: eventData.telegram_id,
          newLevel: 1,
        })
      }

      trainingCost = calculateCost({
        steps: Number(steps),
        mode: ModeEnum.DigitalAvatarBody,
        telegram_id: String(eventData.telegram_id),
        bot_name: eventData.bot_name,
      })

      logger.info({
        message: 'Рассчитана стоимость тренировки',
        steps,
        paymentAmount: trainingCost.stars,
        telegram_id: eventData.telegram_id,
      })

      balanceCheck = await step.run('balance-check', async () => {
        const currentBalance = await getUserBalance(eventData.telegram_id)
        if (currentBalance === null || currentBalance < trainingCost.stars!) {
          if (bot) {
            await bot.telegram.sendMessage(
              eventData.telegram_id,
              isRussian
                ? `Недостаточно средств. Текущий баланс: ${currentBalance || 0}, необходимо: ${trainingCost.stars}`
                : `Insufficient funds. Current balance: ${currentBalance || 0}, required: ${trainingCost.stars}`
            )
          }
          return { success: false, currentBalance }
        }
        return {
          success: true,
          currentBalance: currentBalance,
        }
      })

      if (!balanceCheck?.success) {
        logger.warn({
          message: 'Недостаточно средств',
          currentBalance: balanceCheck?.currentBalance,
          requiredAmount: trainingCost.stars,
          telegram_id: eventData.telegram_id,
        })
        throw new Error('Insufficient balance')
      }

      logger.info({
        message: '💰 Списание средств за тренировку модели',
        telegram_id: eventData.telegram_id,
        currentBalance: balanceCheck.currentBalance!,
        paymentAmount: trainingCost.stars,
        newBalance: balanceCheck.currentBalance! - trainingCost.stars!,
        modelName,
        steps,
      })

      const chargeResult = await step.run('charge-user-balance', async () => {
        const newBalance = balanceCheck!.currentBalance! - trainingCost.stars!
        const current = await getUserBalance(eventData.telegram_id)
        if (current === null) {
          throw new Error('User not found')
        }
        await updateUserBalance(
          eventData.telegram_id,
          newBalance,
          PaymentType.MONEY_OUTCOME,
          `Оплата тренировки модели ${modelName} (шагов: ${steps})`,
          {
            payment_method: 'Training',
            bot_name: eventData.bot_name,
            language:
              eventData.is_ru === true || eventData.is_ru === 'true'
                ? 'ru'
                : 'en',
          }
        )
        return {
          success: true,
          oldBalance: current,
          newBalance,
          paymentAmount: trainingCost.stars,
        }
      })

      logger.info({
        message: '✅ Средства успешно списаны',
        chargeResult,
        telegram_id: eventData.telegram_id,
      })

      const destination = await step.run('create-replicate-model', async () => {
        try {
          const username = config.REPLICATE_USERNAME
          if (!username)
            throw new Error('REPLICATE_USERNAME не задан в конфиге')

          logger.info('🔍 Проверка существования модели', { modelName })
          try {
            const existing = await replicate.models.get(username, modelName)
            logger.info('🔵 Существующая модель найдена:', existing.url)
            return `${username}/${modelName}`
          } catch (error) {
            logger.info('🏗️ Создание новой модели...')
            const newModel = await replicate.models.create(
              username,
              modelName,
              {
                description: `LoRA: ${eventData.triggerWord}`,
                visibility: 'public',
                hardware: 'gpu-t4',
              }
            )
            logger.info('✅ Новая модель создана:', newModel.url)
            return `${username}/${modelName}`
          }
        } catch (error) {
          logger.error(
            '❌ Ошибка создания/проверки модели:',
            (error as Error).message
          )
          throw error
        }
      })

      logger.info('🎯 Модель определена:', destination)

      const trainingResult = await step.run(
        'start-replicate-training',
        async () => {
          try {
            const training = await trainingSteps.startTraining(destination)
            const trainingRecord = await trainingSteps.createTrainingRecord(
              training.id,
              user
            )
            logger.info({
              message: 'Тренировка запущена и сохранена в БД',
              trainingId: training.id,
              dbRecordId: trainingRecord ? trainingRecord.id : 'N/A',
            })
            updateTrainingStatus(
              eventData.telegram_id,
              eventData.modelName,
              'running',
              logger,
              training.id
            )
            return {
              training,
              dbRecord: trainingRecord,
            }
          } catch (error) {
            replicateTrainingCache.delete(
              `${eventData.telegram_id}:${eventData.modelName}`
            )
            throw error
          }
        }
      )

      logger.info('🚀 Тренировка создана:', trainingResult.training.id)
      updateTrainingStatus(
        eventData.telegram_id,
        eventData.modelName,
        'running',
        logger,
        trainingResult.training.id
      )

      logger.info({
        message: 'Тренировка успешно запущена',
        trainingId: trainingResult.training.id,
        telegram_id: eventData.telegram_id,
      })

      return {
        success: true,
        message: 'Обучение запущено. Ожидайте уведомления.',
        trainingId: trainingResult.training.id,
        dbRecord: trainingResult.dbRecord,
      }
    } catch (error) {
      logger.error({
        message: 'Критическая ошибка в процессе тренировки',
        error: (error as Error).message,
        stack: (error as Error).stack,
        telegram_id: eventData.telegram_id,
      })

      if (balanceCheck?.success && trainingCost && trainingCost.stars) {
        logger.info({
          message: '💸 Возврат средств за неудавшуюся тренировку',
          telegram_id: eventData.telegram_id,
          currentBalance: balanceCheck.currentBalance!,
          refundAmount: trainingCost.stars,
          modelName: eventData.modelName,
        })

        const refundResult = await step.run('refund-user-balance', async () => {
          const current = await getUserBalance(eventData.telegram_id)
          if (current === null) {
            throw new Error('User not found')
          }
          await updateUserBalance(
            eventData.telegram_id,
            balanceCheck!.currentBalance!,
            PaymentType.MONEY_INCOME,
            `Возврат средств за неудавшуюся тренировку модели ${eventData.modelName}`,
            {
              payment_method: 'Refund',
              bot_name: eventData.bot_name,
              language:
                eventData.is_ru === true || eventData.is_ru === 'true'
                  ? 'ru'
                  : 'en',
            }
          )
          return {
            success: true,
            oldBalance: current,
            newBalance: balanceCheck!.currentBalance!,
            refundAmount: trainingCost.stars,
          }
        })
        logger.info({
          message: '✅ Средства успешно возвращены',
          refundResult,
          telegram_id: eventData.telegram_id,
          error: (error as Error).message,
        })
      }

      const isRussian = eventData.is_ru === true || eventData.is_ru === 'true'
      await helpers.sendMessage(
        TRAINING_MESSAGES.error((error as Error).message)[
          isRussian ? 'ru' : 'en'
        ]
      )
      if (activeTrainings.has(eventData.telegram_id)) {
        activeTrainings.get(eventData.telegram_id)?.cancel()
        logger.info({
          message: 'Автоматический отменен текущей тренировки',
          telegram_id: eventData.telegram_id,
        })
      }
      throw error
    }
  }
}

// inngest event data
// "data": {
//   "bot_name": "neuro_blogger_bot",
//   "is_ru": true,
//   "modelName": "test_lora_model",
//   "steps": 1500,
//   "telegram_id": "144022504",
//   "triggerWord": "person1",
//   "zipUrl": "https://example.com/training-images.zip"
// },
