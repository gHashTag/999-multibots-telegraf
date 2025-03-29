import { replicate } from '@/core/replicate'
import {
  createModelTraining,
  updateLatestModelTraining,
  supabase,
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { getBotByName } from '@/core/bot'
import {
  modeCosts,
  ModeEnum,
  calculateModeCost,
} from '@/price/helpers/modelsCost'
import { inngest } from '@/core/inngest/clients'
import { API_URL } from '@/config'
import { BalanceHelper } from '@/helpers/inngest/balanceHelpers'
import { logger } from '@utils/logger'
import { v4 as uuidv4 } from 'uuid'

import type { Prediction } from 'replicate'

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
  status: 'starting'
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

// Получаем полный URL из относительного пути
function getFullUrlFromRelative(relativePath: string): string {
  // Убираем ведущий слеш, если есть
  const normalizedPath = relativePath.startsWith('/')
    ? relativePath.substring(1)
    : relativePath

  // Проверяем, является ли путь уже полным URL
  if (
    normalizedPath.startsWith('http://') ||
    normalizedPath.startsWith('https://')
  ) {
    return normalizedPath
  }

  // Формируем полный URL
  return `${API_URL}/${normalizedPath}`
}

// Определяем функцию с правильной идемпотентностью
export const generateModelTraining = inngest.createFunction(
  {
    id: 'model-training',
    concurrency: 2,
  },
  { event: 'model-training/start' },
  async ({ event, step }) => {
    // Добавляем информативный лог о входящем событии
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
          error: error.message,
        })
        // При ошибке проверки разрешаем запуск для надежности
        return { exists: false, error: error.message } as ErrorActiveCheck
      }
    })) as ActiveCheckResult

    // Если есть активная тренировка, не начинаем новую
    if (activeCheck.exists) {
      // Получение бота для отправки уведомления
      const { bot } = getBotByName(eventData.bot_name)

      if (bot) {
        const isRussian = eventData.is_ru === true || eventData.is_ru === 'true'
        try {
          await bot.telegram.sendMessage(
            eventData.telegram_id,
            TRAINING_MESSAGES.duplicateRequest[isRussian ? 'ru' : 'en']
          )

          // Если есть информация о тренировке в БД, добавляем кнопку отмены
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
            error: error.message,
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

    // Теперь, когда мы уверены, что активной тренировки нет,
    // устанавливаем статус 'starting'
    if (
      !checkAndSetTrainingCache(
        eventData.telegram_id,
        eventData.modelName,
        'starting'
      )
    ) {
      logger.warn({
        message:
          'Странная ошибка - кэш блокирует, но проверка активных тренировок прошла',
        telegram_id: eventData.telegram_id,
        modelName: eventData.modelName,
      })
      // Всё равно продолжаем, так как мы проверили отсутствие реальной тренировки
    }

    // 🔄 Вспомогательные функции
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
              error: error.message,
              telegram_id: eventData.telegram_id,
            })
            return false
          }
        })
      },
    }

    // 🧩 Основные шаги процесса
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
            const user = await getUserByTelegramIdString(telegram_id)
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

      createTrainingRecord: async (trainingId: string) => {
        await step.run('create-training-record', async () => {
          // Преобразуем steps в число
          const steps = Number(eventData.steps)

          const training = {
            telegram_id: eventData.telegram_id,
            model_name: eventData.modelName,
            trigger_word: eventData.triggerWord,
            zip_url: eventData.zipUrl,
            steps: steps, // Теперь гарантированно число
            replicate_training_id: trainingId,
          }
          logger.info('🔵 Создание записи о тренировке', training)
          createModelTraining(training)
          return training
        })
      },

      createReplicateModel: async (modelName: string) => {
        const username = process.env.REPLICATE_USERNAME
        if (!username) throw new Error('REPLICATE_USERNAME not set')

        try {
          const existing = await replicate.models.get(username, modelName)
          logger.info({
            message: '🔵 Существующая модель:',
            url: existing.url,
          })
          return `${username}/${modelName}`
        } catch (error) {
          logger.info({
            message: '🏗️ Создание новой модели...',
            error: error.message,
          })
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
            logger.info({
              message: '✅ Модель создана:',
              id: newModel.latest_version?.id,
            })
            await new Promise(resolve => setTimeout(resolve, 5000))
            return `${username}/${modelName}`
          } catch (createError) {
            logger.error({
              message: '❌ Ошибка создания модели:',
              error: createError,
            })
            throw new Error('Failed to create model')
          }
        }
      },

      registerCancelHandler: (telegram_id: string, trainingId: string) => {
        const cancelProcess = {
          cancel: async () => {
            try {
              await replicate.trainings.cancel(trainingId)
              logger.info({
                message: `❌ Training ${trainingId} canceled`,
              })
            } catch (error) {
              logger.error({
                message: 'Cancel error:',
                error: error,
              })
            }
            activeTrainings.delete(telegram_id)
          },
        }
        activeTrainings.set(telegram_id, cancelProcess)
        logger.info({
          message: '🛑 Cancel handler registered for:',
          telegram_id,
        })
      },

      startTraining: async (destination: string) => {
        if (!eventData.zipUrl || !eventData.triggerWord) {
          throw new Error(
            '❌ Отсутствуют обязательные параметры: zipUrl или triggerWord'
          )
        }

        // Преобразуем относительный путь в полный URL
        const fullImageUrl = getFullUrlFromRelative(eventData.zipUrl)

        logger.info({
          message: '🔗 Преобразуем URL для изображений',
          originalUrl: eventData.zipUrl,
          fullImageUrl,
        })

        // Доп. проверка на корректность URL
        if (!fullImageUrl || !fullImageUrl.startsWith('http')) {
          logger.error({
            message: '❌ Некорректный URL изображений после преобразования',
            fullImageUrl,
          })

          const isRussian =
            eventData.is_ru === true || eventData.is_ru === 'true'
          const errorMessage = isRussian
            ? 'Ошибка URL изображений. Проверьте доступность архива.'
            : 'Invalid image URL. Please check archive accessibility.'

          await helpers.sendMessage(
            TRAINING_MESSAGES.error(errorMessage)[isRussian ? 'ru' : 'en']
          )

          throw new Error(`Ошибка URL: ${fullImageUrl}`)
        }

        try {
          const training: Prediction = await replicate.trainings.create(
            'ostris',
            'flux-dev-lora-trainer',
            'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
            {
              destination: destination as `${string}/${string}`,
              input: {
                input_images: fullImageUrl,
                trigger_word: eventData.triggerWord,
                steps: Number(eventData.steps), // Преобразуем в число
                lora_rank: 128,
                optimizer: 'adamw8bit',
                batch_size: 1,
                resolution: '512,768,1024',
                learning_rate: 0.0001,
                wandb_project: 'flux_train_replicate',
              },
              webhook: `${API_URL}/webhooks/replicate`,
              webhook_events_filter: ['completed'],
            }
          )

          logger.info({
            message: '🚀 Training ID:',
            id: training.id,
          })
          trainingSteps.registerCancelHandler(
            eventData.telegram_id,
            training.id
          )
          return training
        } catch (error) {
          // Детально логируем ошибку
          logger.error({
            message: '❌ Ошибка запуска тренировки в Replicate',
            error: error.message,
            stack: error.stack,
            inputs: {
              destination,
              imageUrl: fullImageUrl,
              triggerWord: eventData.triggerWord,
              steps: Number(eventData.steps),
            },
          })

          // Обрабатываем ошибку для пользователя
          const isRussian =
            eventData.is_ru === true || eventData.is_ru === 'true'
          let errorMessage = error.message

          // Распознаем конкретные ошибки и даем понятные пояснения
          if (errorMessage.includes('is not a valid URL scheme')) {
            errorMessage = isRussian
              ? 'Ошибка URL изображений. Проверьте, что загруженный архив доступен по HTTPS.'
              : 'Invalid image URL. Please ensure the uploaded ZIP file is accessible via HTTPS.'
          } else if (errorMessage.includes('validation')) {
            errorMessage = isRussian
              ? 'Ошибка валидации данных. Проверьте формат и содержимое архива.'
              : 'Data validation error. Please check the format and content of your ZIP archive.'
          }

          await helpers.sendMessage(
            TRAINING_MESSAGES.error(errorMessage)[isRussian ? 'ru' : 'en']
          )

          // Пробрасываем ошибку дальше
          throw new Error(`Ошибка запуска тренировки: ${errorMessage}`)
        }
      },
    }
    let balanceCheck: { success?: boolean; currentBalance?: number } | null =
      null
    const paymentAmount: number | null = null
    // 🚀 Основной процесс
    try {
      // Преобразуем is_ru к булевому типу если это строка
      const isRussian = eventData.is_ru === true || eventData.is_ru === 'true'
      await helpers.sendMessage(
        TRAINING_MESSAGES.start[isRussian ? 'ru' : 'en']
      )

      // 1. Валидация входных данных
      const { modelName, steps } = await trainingSteps.validateInput()

      // 2. Проверка пользователя и баланса
      const [user] = await trainingSteps.checkUserAndBalance()
      logger.info({
        message: 'Пользователь найден',
        userId: user.id,
        telegram_id: eventData.telegram_id,
      })

      // 3. Обновление уровня при необходимости
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

      // 4. Расчет стоимости
      const cost = calculateModeCost({
        mode: ModeEnum.DigitalAvatarBody,
        steps: steps,
      })
      const paymentAmount = Number(cost)

      logger.info({
        message: 'Рассчитана стоимость тренировки',
        steps,
        paymentAmount,
        telegram_id: eventData.telegram_id,
      })

      // 5. Проверка баланса
      balanceCheck = await step.run('check-user-balance', async () => {
        const result = await BalanceHelper.checkBalance(
          eventData.telegram_id,
          paymentAmount,
          {
            notifyUser: true,
            isRu:
              typeof eventData.is_ru === 'string'
                ? eventData.is_ru === 'true'
                : Boolean(eventData.is_ru),
          }
        )

        if (!result.success) {
          logger.error({
            message: 'Недостаточно средств',
            currentBalance: result?.currentBalance,
            requiredAmount: paymentAmount,
            telegram_id: eventData.telegram_id,
          })
        }

        return result
      })

      if (!balanceCheck?.success) {
        return {
          success: false,
          error: 'Insufficient funds',
          telegram_id: eventData.telegram_id,
          currentBalance: balanceCheck.currentBalance,
          paymentAmount,
          newBalance: Number(balanceCheck.currentBalance) - paymentAmount,
          modelName,
          steps,
        }
      }

      // 6. Списание средств
      // Сначала логируем начало операции
      logger.info({
        message: '💰 Списание средств за тренировку модели',
        telegram_id: eventData.telegram_id,
        currentBalance: balanceCheck.currentBalance,
        paymentAmount,
        newBalance: balanceCheck.currentBalance - paymentAmount,
        modelName,
        steps,
      })

      // Затем выполняем списание в отдельном шаге
      const chargeResult = await step.run('charge-user-balance', async () => {
        const newBalance = balanceCheck.currentBalance - paymentAmount

        // Обновляем баланс через Inngest
        await inngest.send({
          id: `train-${
            eventData.telegram_id
          }-${Date.now()}-${modelName}-${steps}-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: eventData.telegram_id,
            paymentAmount: paymentAmount,
            is_ru: eventData.is_ru,
            bot_name: eventData.bot_name,
            type: 'outcome',
            description: `Payment for model training`,
            metadata: {
              service_type: ModeEnum.DigitalAvatarBody,
              model_name: modelName,
              steps: steps,
            },
          },
        })

        return {
          success: true,
          oldBalance: balanceCheck.currentBalance,
          newBalance,
          paymentAmount,
        }
      })

      logger.info({
        message: '✅ Средства успешно списаны',
        chargeResult,
        telegram_id: eventData.telegram_id,
      })

      // 7. Создание/проверка модели Replicate
      const destination = await step.run('create-replicate-model', async () => {
        try {
          const username = process.env.REPLICATE_USERNAME
          if (!username) throw new Error('REPLICATE_USERNAME не задан')

          logger.info('🔍 Проверка существования модели', { modelName })
          try {
            const existing = await replicate.models.get(username, modelName)
            logger.info({
              message: '🔵 Существующая модель найдена:',
              url: existing.url,
            })
            return `${username}/${modelName}`
          } catch (error) {
            logger.info({
              message: '🏗️ Создание новой модели...',
              error: error.message,
            })
            const newModel = await replicate.models.create(
              username,
              modelName,
              {
                description: `LoRA: ${eventData.triggerWord}`,
                visibility: 'public',
                hardware: 'gpu-t4',
              }
            )
            logger.info({
              message: '✅ Новая модель создана:',
              url: newModel.url,
            })
            return `${username}/${modelName}`
          }
        } catch (error) {
          logger.error({
            message: '❌ Ошибка создания/проверки модели:',
            error: error.message,
          })
          throw error
        }
      })

      logger.info({
        message: '🎯 Модель определена:',
        destination,
      })

      // Запуск тренировки с Replicate
      const trainingResult = await step.run(
        'start-replicate-training',
        async () => {
          try {
            const training = await trainingSteps.startTraining(destination)

            // ⚠️ Сразу сохраняем ID в базу данных здесь же
            // Так мы гарантируем, что даже если дальнейший код сломается,
            // запись в БД будет создана
            const trainingRecord = await createModelTraining({
              telegram_id: eventData.telegram_id,
              model_name: eventData.modelName,
              trigger_word: eventData.triggerWord,
              zip_url: eventData.zipUrl,
              steps: Number(eventData.steps),
              replicate_training_id: training.id,
              cancel_url: training.urls?.cancel,
              status: 'pending', // Начальный статус
            })

            logger.info({
              message: 'Тренировка запущена и сохранена в БД',
              trainingId: training.id,
              dbRecordId: trainingRecord.id,
            })

            // Теперь можно обновить кэш
            updateTrainingStatus(
              eventData.telegram_id,
              eventData.modelName,
              'running',
              training.id
            )
            updateLatestModelTraining(
              eventData.telegram_id,
              eventData.modelName,
              {
                status: 'running',
                replicate_training_id: training.id,
              },
              'replicate'
            )
            return {
              training,
              dbRecord: trainingRecord,
            }
          } catch (error) {
            // Очистка кэша при ошибке
            replicateTrainingCache.delete(
              `${eventData.telegram_id}:${eventData.modelName}`
            )
            throw error
          }
        }
      )

      logger.info({
        message: '🚀 Тренировка создана:',
        id: trainingResult.training.id,
      })

      // Обновляем статус в кэше
      updateTrainingStatus(
        eventData.telegram_id,
        eventData.modelName,
        'running',
        trainingResult.training.id
      )

      // Возвращаем результат
      logger.info({
        message: 'Тренировка успешно запущена',
        trainingId: trainingResult.training.id,
        telegram_id: eventData.telegram_id,
      })

      return {
        success: true,
        message: 'Обучение запущено. Ожидайте уведомления.',
        trainingId: trainingResult.training.id,
      }
    } catch (error) {
      logger.error({
        message: 'Критическая ошибка в процессе тренировки',
        error: error.message,
        stack: error.stack,
        telegram_id: eventData.telegram_id,
      })

      // Возврат средств в случае ошибки
      if (balanceCheck?.success && paymentAmount) {
        // Сначала логируем операцию
        logger.info({
          message: '💸 Возврат средств за неудавшуюся тренировку',
          telegram_id: eventData.telegram_id,
          currentBalance: balanceCheck.currentBalance,
          refundAmount: paymentAmount,
          modelName: eventData.modelName,
        })

        // Затем выполняем возврат через Inngest
        await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id: eventData.telegram_id,
            paymentAmount,
            type: 'income',
            description: `Возврат средств за неудавшуюся тренировку модели ${eventData.modelName}`,
            bot_name: eventData.bot_name,
          },
        })
      }

      // Преобразуем is_ru к булевому типу если это строка
      const isRussian = eventData.is_ru === true || eventData.is_ru === 'true'

      await helpers.sendMessage(
        TRAINING_MESSAGES.error(error.message)[isRussian ? 'ru' : 'en']
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
)
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
