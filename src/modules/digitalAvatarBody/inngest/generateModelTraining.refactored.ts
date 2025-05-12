import { inngest } from '@/inngest_app/client'
import { NonRetriableError, EventPayload } from 'inngest'
import type { Prediction } from 'replicate'
import Replicate from 'replicate' // Direct import

import {
  getUserByTelegramId as fetchUserByTelegramId, // Renamed for clarity
  updateUserBalance as updateUserBalanceInDB, // Renamed for clarity
  updateUserLevelPlusOne as updateUserLevelPlusOneInDB, // Renamed for clarity
  getUserBalance as fetchUserBalanceFromDB, // Renamed for clarity
  createModelTraining as createModelTrainingInDB, // Renamed for clarity
  supabase, // Direct import
} from '@/core/supabase'
import { getBotByName as fetchBotByName } from '@/core/bot' // Direct import
import { ModeEnum } from '@/interfaces/modes'
// Removed import for calculateModeCost as calculateOverallCost seems more appropriate here
import {
  API_URL,
  COSTS, // Make sure COSTS includes NEURO_TRAIN_LORA
  REPLICATE_USERNAME,
  REPLICATE_TRAINING_MODEL_VERSION, // Assuming this is the correct var name now
  INNGEST_EVENT_KEY,
} from '@/config' // Direct imports
import { logger } from '@/utils/logger' // Direct import
import { PaymentType } from '@/interfaces/payments.interface'
import {
  CostDetails,
  calculateCost as calculateOverallCost, // Using the main cost calculator
} from '@/price/priceCalculator'

import type { User } from '@/interfaces/user.interface'
import type { ModelTraining } from '@/core/supabase/createModelTraining'
import type { SupabaseClient } from '@supabase/supabase-js'

// ========= ПОЛНОСТЬЮ УДАЛИТЬ СЛЕДУЮЩИЙ БЛОК (СТРОКИ ~36-42) =========
// import {
//   type ActiveCheckResult,
//   ErrorActiveCheck,
//   ActiveCheckFromDB,
//   ActiveCheckFromCache,
//   NoActiveCheck,
//   WebhookEventType, // Added type for WebhookEventType
// } from '../types'
// =====================================================================

import type { ModelTrainingInngestEventData } from '../types'

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
    // Use the directly imported logger
    logger.info({
      message: 'Получено событие тренировки модели',
      eventName: event.name,
      timestamp: new Date(event.ts).toISOString(),
      telegramId: event.data.telegram_id, // Исправлено на telegram_id
    })

    // Типизируем data явно, используя импортированный тип
    const eventData = event.data as ModelTrainingInngestEventData
    const {
      telegram_id: telegramId,
      is_ru,
      bot_name,
      model_name: modelName,
      zipUrl,
      steps,
      trigger_word,
    } = eventData

    // Приводим steps к числу, если оно передано
    const numSteps = typeof steps === 'string' ? parseInt(steps, 10) : steps

    const cacheKey = `${telegramId}:${modelName}`

    // --- Check for active training using direct Supabase call ---
    const activeCheck = await step.run(
      'check-active-training-refactored',
      async () => {
        try {
          // Исправляем cache.get
          const cached = replicateTrainingCache.get(cacheKey)
          if (cached) {
            logger.info({
              message: 'Активная тренировка найдена в кеше',
              cacheKey,
              cachedStatus: cached.status,
              telegram_id: telegramId,
            })
            // Возвращаем структуру, похожую на DB для консистентности
            return {
              exists: true,
              source: 'cache',
              status: cached.status,
              replicate_id: cached.trainingId,
              created_at: new Date(cached.timestamp).toISOString(),
              model_name: modelName,
            }
          }

          const { data: existingTrainings, error: dbError } = await supabase
            .from('trainings')
            .select('id, status, replicate_id, model_name, created_at')
            .eq('user_id', String(telegramId))
            .eq('model_name', modelName)
            .in('status', ['starting', 'processing'])
            .order('created_at', { ascending: false })
            .limit(1)

          if (dbError) throw dbError // Перебрасываем ошибку БД

          if (existingTrainings && existingTrainings.length > 0) {
            const latestTraining = existingTrainings[0]
            logger.info({
              message: 'Активная тренировка найдена в БД',
              ...latestTraining,
              telegram_id: telegramId,
            })
            const result = {
              exists: true,
              source: 'db',
              id: latestTraining.id,
              status: latestTraining.status,
              replicate_id: latestTraining.replicate_id,
              created_at: latestTraining.created_at,
              model_name: latestTraining.model_name,
            }
            // Исправляем cache.set
            replicateTrainingCache.set(cacheKey, {
              timestamp: Date.now(),
              status: latestTraining.status as 'starting' | 'running', // Уточняем тип
              trainingId: latestTraining.replicate_id ?? undefined,
            })
            return result
          } else {
            return { exists: false }
          }
        } catch (error: any) {
          logger.error({
            message: 'Ошибка проверки активной тренировки',
            error: error.message,
            stack: error.stack,
            telegram_id: telegramId,
          })
          return { exists: false, error: error.message }
        }
      }
    ) // Убираем as ActiveCheckResult, тип будет выведен

    // --- Get Bot instance ---
    const { bot } = await fetchBotByName(bot_name)
    if (!bot) {
      logger.error({ message: 'Бот не найден', botName: bot_name })
      throw new NonRetriableError(`❌ Бот ${bot_name} не найден`)
    }

    // --- Handle existing active training ---
    if (activeCheck?.exists) {
      const isRussian = is_ru === true
      try {
        await bot.telegram.sendMessage(
          telegramId,
          TRAINING_MESSAGES.duplicateRequest[isRussian ? 'ru' : 'en']
        )
      } catch (error: any) {
        logger.error({
          message: 'Не удалось отправить уведомление о дублированном запросе',
          error: error.message,
        })
      }
      logger.info({
        message:
          'Запрос на тренировку отклонен - обнаружена активная тренировка',
        telegram_id: telegramId,
        modelName: activeCheck.model_name,
        activeCheckSource: activeCheck.source,
      })
      return {
        success: false,
        message: 'Active training already exists',
        activeTrainingExists: true,
        trainingId: activeCheck.replicate_id,
      }
    }

    // --- Set Cache ---
    if (!checkAndSetTrainingCache(telegramId, modelName, 'starting', logger)) {
      // ... (без изменений) ...
    }

    // --- Instantiate Replicate Client ---
    const replicateClient = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN, // Ensure this is set in your environment
    })
    if (!process.env.REPLICATE_API_TOKEN) {
      logger.error('REPLICATE_API_TOKEN is not set in environment variables!')
      throw new NonRetriableError('Replicate API token is not configured.')
    }

    // --- Local helper to send messages ---
    const sendHelperMessage = async (
      text: string,
      parseMode?: 'MarkdownV2' | 'HTML'
    ) => {
      await step.run('send-message-refactored', async () => {
        try {
          await bot.telegram.sendMessage(telegramId, text, {
            parse_mode: parseMode,
          })
          logger.info({
            message: 'Сообщение отправлено',
            telegram_id: telegramId,
          })
          return true
        } catch (error: any) {
          logger.error({
            message: 'Ошибка отправки сообщения',
            error: error.message,
            telegram_id: telegramId,
          })
          return false // Don't fail the step for notification error
        }
      })
    }

    // --- Main Training Logic ---
    let balanceCheckResult: {
      success?: boolean
      currentBalance?: number
    } | null = null
    let calculatedCost: CostDetails | null = null
    let user: User | null = null
    const effectiveModelName = modelName

    try {
      const isRussian = is_ru === true
      await sendHelperMessage(TRAINING_MESSAGES.start[isRussian ? 'ru' : 'en'])

      // Step: Fetch user
      user = await step.run('fetch-user-refactored', async () => {
        const fetchedUser = await fetchUserByTelegramId(String(telegramId)) // Cast to string, Use direct fetchUserByTelegramId
        if (!fetchedUser) {
          logger.error({
            message: 'Пользователь не найден',
            telegram_id: telegramId,
          })
          throw new NonRetriableError('User not found') // Use NonRetriableError
        }
        logger.info({
          message: 'Пользователь найден',
          userId: fetchedUser.id,
          telegram_id: telegramId,
        })
        return fetchedUser
      })

      // Step: Update user level if needed
      if (user.level === 0) {
        await step.run('update-level-refactored', async () => {
          await updateUserLevelPlusOneInDB(String(telegramId), 0) // Cast to string, Use direct updateUserLevelPlusOneInDB
          logger.info({
            message: 'Уровень пользователя обновлен до 1',
            telegram_id: telegramId,
          })
        })
        user.level = 1 // Update local user object
      }

      // Step: Calculate Cost
      calculatedCost = await step.run('calculate-cost-refactored', async () => {
        // Исправляем вызов calculateCost
        // Убедимся, что numSteps имеет значение по умолчанию или выбрасываем ошибку, если steps не переданы
        const stepsToCalculate = numSteps ?? 1000 // Примерное значение по умолчанию, если steps не указаны
        if (!numSteps) {
          logger.warn({
            message:
              'Steps не переданы в событии, используется значение по умолчанию для расчета стоимости',
            defaultSteps: stepsToCalculate,
            telegram_id: telegramId,
          })
          // Возможно, стоит бросить NonRetriableError, если шаги обязательны
          // throw new NonRetriableError('Number of steps not provided in the event data');
        }
        // TODO: Определить, какая версия модели используется (v1 или v2)
        const modelVersion: 'v1' | 'v2' = 'v1' // Пока хардкодим v1
        const costDetails = calculateOverallCost(stepsToCalculate, modelVersion)
        if (!costDetails || typeof costDetails.stars !== 'number') {
          logger.error({
            message: 'Не удалось рассчитать стоимость тренировки',
            telegram_id: telegramId,
            costDetails,
          })
          throw new Error('Failed to calculate training cost') // Allow retry
        }
        logger.info({
          message: 'Стоимость тренировки рассчитана',
          cost: costDetails.stars,
          steps: stepsToCalculate,
          version: modelVersion,
          telegram_id: telegramId,
        })
        return costDetails
      })
      const paymentAmount = calculatedCost.stars!

      // Step: Check Balance
      balanceCheckResult = await step.run(
        'check-balance-refactored',
        async () => {
          const currentBalance = await fetchUserBalanceFromDB(
            String(telegramId)
          ) // Cast to string, Use direct fetchUserBalanceFromDB
          if (currentBalance === null || currentBalance < paymentAmount) {
            logger.warn({
              message: 'Недостаточно средств',
              required: paymentAmount,
              balance: currentBalance,
              telegram_id: telegramId,
            })
            return { success: false, currentBalance }
          }
          logger.info({
            message: 'Баланс достаточен',
            balance: currentBalance,
            telegram_id: telegramId,
          })
          return { success: true, currentBalance }
        }
      )

      if (!balanceCheckResult?.success) {
        await sendHelperMessage(
          is_ru === true
            ? `Недостаточно средств. Требуется: ${paymentAmount}, у вас: ${balanceCheckResult?.currentBalance ?? 0}`
            : `Insufficient funds. Required: ${paymentAmount}, balance: ${balanceCheckResult?.currentBalance ?? 0}`
        )
        throw new NonRetriableError('Insufficient balance')
      }
      const initialBalance = balanceCheckResult.currentBalance!

      // Step: Charge User
      const chargeResult = await step.run(
        'charge-user-refactored',
        async () => {
          const newBalance = initialBalance - paymentAmount
          await updateUserBalanceInDB(
            String(telegramId),
            newBalance,
            PaymentType.MONEY_OUTCOME,
            `Оплата тренировки модели ${effectiveModelName} (шагов: ${numSteps ?? 'N/A'})`, // Используем numSteps
            {
              /* metadata */
            }
          )
          logger.info({
            message: 'Средства успешно списаны',
            amount: paymentAmount,
            newBalance: newBalance,
            telegram_id: telegramId,
          })
          return {
            success: true,
            oldBalance: initialBalance,
            newBalance,
            paymentAmount,
          }
        }
      )

      // Step: Create/Get Replicate Model Destination
      const destination = await step.run(
        'create-replicate-model-refactored',
        async () => {
          const username = REPLICATE_USERNAME
          if (!username) {
            logger.error('REPLICATE_USERNAME is not set in config!')
            throw new NonRetriableError('REPLICATE_USERNAME not set in config')
          }
          try {
            // Check if model exists
            await replicateClient.models.get(username, effectiveModelName) // Use replicateClient
            logger.info({
              message: 'Существующая модель Replicate найдена',
              destination: `${username}/${effectiveModelName}`,
            })
            return `${username}/${effectiveModelName}`
          } catch (error: any) {
            if (error?.response?.status === 404) {
              logger.info({
                message: 'Модель Replicate не найдена, создаем новую...',
                modelName: effectiveModelName,
              })
              try {
                if (!trigger_word) {
                  // Добавляем проверку triggerWord
                  logger.error('Cannot create model without triggerWord')
                  throw new NonRetriableError(
                    'Trigger word is required to create a model'
                  )
                }
                const newModel = await replicateClient.models.create(
                  username,
                  effectiveModelName,
                  {
                    description: `LoRA: ${trigger_word}`, // Используем triggerWord
                    visibility: 'public', // Or 'private' if needed
                    hardware: 'gpu-t4', // Or other suitable hardware
                  }
                )
                logger.info({
                  message: 'Новая модель Replicate создана',
                  url: newModel.url,
                })
                // Add a small delay maybe? Replicate sometimes needs a moment
                await new Promise(resolve => setTimeout(resolve, 3000))
                return `${username}/${effectiveModelName}`
              } catch (createError: any) {
                logger.error({
                  message: 'Ошибка создания модели Replicate',
                  error: createError?.message || createError,
                })
                throw new Error(
                  `Failed to create Replicate model: ${createError?.message || createError}`
                ) // Allow retry
              }
            } else {
              // Other error during model check
              logger.error({
                message: 'Ошибка проверки модели Replicate',
                error: error?.message || error,
              })
              throw new Error(
                `Failed to check Replicate model: ${error?.message || error}`
              ) // Allow retry
            }
          }
        }
      )

      // Step: Start Replicate Training
      const trainingResult = await step.run(
        'start-replicate-training-refactored',
        async () => {
          // Добавляем проверки обязательных параметров
          if (!trigger_word) {
            logger.error('trigger_word is missing!')
            throw new NonRetriableError('trigger_word is missing')
          }
          if (!numSteps) {
            logger.error('steps is missing!')
            throw new NonRetriableError('steps is missing')
          }
          if (!zipUrl) {
            logger.error('zipUrl is missing!')
            throw new NonRetriableError('zipUrl is missing')
          }

          try {
            const trainingInput = {
              input_images: zipUrl, // Используем zipUrl
              // ... (параметры для LoRA trainer) ...
              trigger_word, // Используем triggerWord
              steps: numSteps, // Используем numSteps
              // ... другие параметры ...
            }

            logger.info({
              message: 'Starting Replicate training with input',
              input: trainingInput,
              destination,
            })

            const training = await replicateClient.trainings.create(
              REPLICATE_USERNAME!, // owner
              'sdxl-lora-trainer', // model_name - **UPDATE THIS**
              REPLICATE_TRAINING_MODEL_VERSION!, // version_id - **UPDATE THIS**
              {
                destination: destination as `${string}/${string}`,
                input: trainingInput,
                webhook: `${API_URL}/webhooks/replicate`,
                // Полагаемся на вывод типа, удаляем as string[]
                webhook_events_filter: ['completed'],
              }
            )

            logger.info({
              message: 'Тренировка Replicate запущена',
              trainingId: training.id,
              status: training.status,
            })

            // Create DB record
            const trainingRecordData: Omit<
              ModelTraining,
              'id' | 'created_at' | 'telegram_id'
            > = {
              user_id: String(user.id),
              replicate_training_id: training.id,
              model_name: effectiveModelName,
              status: training.status as ModelTraining['status'],
              cost: paymentAmount,
              zip_url: zipUrl,
              webhook_url: `${API_URL}/webhooks/replicate`,
              replicate_model_name: destination,
              error: null,
              trigger_word,
              steps: numSteps,
            }
            const dbRecord = (await createModelTrainingInDB(
              trainingRecordData
            )) as ModelTraining[] | null

            if (!dbRecord || dbRecord.length === 0) {
              logger.error({
                message: 'Ошибка: Запись о тренировке не была создана в БД',
                telegram_id: telegramId,
                replicateId: training.id,
              })
            }

            logger.info({
              message: 'Запись о тренировке сохранена в БД',
              replicateTrainingIdFromDB:
                dbRecord && dbRecord.length > 0
                  ? dbRecord[0]?.replicate_training_id
                  : 'Error: Record not created or replicate_training_id missing',
              replicateIdFromTrainingObject: training.id,
            })

            updateTrainingStatus(
              telegramId,
              effectiveModelName,
              'running',
              logger,
              training.id
            )
            return { training, dbRecord }
          } catch (error: any) {
            logger.error({
              message: 'Ошибка запуска тренировки Replicate',
              error: error?.message || error,
            })
            replicateTrainingCache.delete(cacheKey) // Clean cache on failure
            throw error // Allow retry
          }
        }
      )

      // --- Success ---
      logger.info({
        message: 'Процесс тренировки успешно запущен',
        trainingId: trainingResult.training.id,
        telegram_id: telegramId,
      })
      await sendHelperMessage(
        `Тренировка модели успешно запущена с ID: \`${trainingResult.training.id}\`\\. Вы получите уведомление по её завершении\\.`,
        'MarkdownV2'
      )

      return {
        status: 'submitted',
        trainingId: trainingResult.training.id,
        message: `Тренировка модели успешно запущена с ID: ${trainingResult.training.id}.`,
        currentBalance: initialBalance - paymentAmount, // Return updated balance
      }
    } catch (error: any) {
      logger.error({
        message: 'Критическая ошибка в процессе тренировки',
        error: error.message,
        stack: error.stack,
        telegram_id: telegramId,
      })
      replicateTrainingCache.delete(cacheKey) // Ensure cache is cleared on any error exit

      // --- Refund Logic on Error ---
      if (balanceCheckResult?.success && calculatedCost?.stars) {
        const refundAmount = calculatedCost.stars
        logger.info({
          message: '💸 Попытка возврата средств из-за ошибки',
          amount: refundAmount,
          telegram_id: telegramId,
        })
        try {
          await step.run('refund-user-on-error-refactored', async () => {
            const currentBalance = await fetchUserBalanceFromDB(
              String(telegramId)
            ) // Check balance again just in case
            if (currentBalance === null) {
              logger.error({
                message: 'Cannot refund: User balance not found!',
                telegram_id: telegramId,
              })
            } else {
              await updateUserBalanceInDB(
                String(telegramId),
                currentBalance + refundAmount,
                PaymentType.MONEY_INCOME,
                `Возврат средств за неудавшуюся тренировку модели ${effectiveModelName}`,
                {
                  /* metadata */
                }
              )
              logger.info({
                message: '✅ Средства успешно возвращены',
                amount: refundAmount,
                newBalance: currentBalance + refundAmount,
                telegram_id: telegramId,
              })
            }
          })
          await sendHelperMessage(
            is_ru === true
              ? `Произошла ошибка во время тренировки: ${error.message}. Средства возвращены.`
              : `An error occurred during training: ${error.message}. Funds have been refunded.`
          )
        } catch (refundError: any) {
          logger.error({
            message: 'CRITICAL: Ошибка возврата средств!',
            refundError: refundError.message,
            originalError: error.message,
            telegram_id: telegramId,
          })
          await sendHelperMessage(
            is_ru === true
              ? `Произошла ошибка тренировки (${error.message}), И НЕ УДАЛОСЬ ВЕРНУТЬ СРЕДСТВА! Срочно обратитесь в поддержку.`
              : `Training error (${error.message}), AND FAILED TO REFUND! Contact support urgently.`
          )
        }
      } else {
        await sendHelperMessage(
          is_ru === true
            ? `Произошла ошибка во время тренировки: ${error.message}`
            : `An error occurred during training: ${error.message}`
        )
      }

      // Cancel active training if applicable (copied logic)
      if (activeTrainings.has(String(telegramId))) {
        activeTrainings.get(String(telegramId))?.cancel()
        logger.info({
          message: 'Автоматическая отмена текущей тренировки из-за ошибки',
          telegram_id: telegramId,
        })
        activeTrainings.delete(String(telegramId)) // Remove from map after canceling
      }

      // Rethrow the original error for Inngest to handle retries/failures
      // Use NonRetriableError for errors that shouldn't be retried (like validation, config issues)
      if (error instanceof NonRetriableError) {
        throw error
      } else {
        // Allow retries for potentially transient errors (DB connection, Replicate API hiccups)
        throw error // Rethrow the original error that triggered the main catch block
      }
    } // Закрываем основной блок try...catch
  } // Закрываем async ({ event, step }) => { ... }
) // Закрываем inngest.createFunction
