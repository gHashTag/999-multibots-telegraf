import axios, { AxiosError, AxiosResponse } from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import type {
  ModelTrainingRequest,
  ModelTrainingResponse,
  ModelTrainingInngestEventData,
} from '../types'
import type { DigitalAvatarBodyDependencies } from '../index'
import { MyContext } from '@/interfaces'
import { PaymentType } from '@/interfaces/payments.interface'
import { v4 as uuidv4 } from 'uuid'
import { calculateCost } from '@/price/priceCalculator'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import {
  createModelTraining,
  ModelTraining,
} from '@/core/supabase/createModelTraining'
import {
  COSTS,
  API_URL,
  UPLOAD_DIR,
  REPLICATE_TRAINING_MODEL_VERSION,
} from '@/config/index'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import { sendTelegramMessageFromWorker } from '@/utils/telegramHelpers'
import { inngest } from '@/inngest_app/client'
import {
  validateAndPrepareTrainingRequest,
  createTrainingRecord,
  startReplicateTraining,
  updateTrainingRecordOnError,
  formatReplicateModelName,
  getReplicateWebhookUrl,
} from '../helpers/trainingHelpers'
import type { Training } from 'replicate'
import { User } from '@/interfaces/user.interface'

// Определяем ожидаемый тип для результата inngest.send()
// Это поможет TypeScript, если он не может корректно вывести тип
/* // Тип не нужен, так как inngest.send теперь void
type ExpectedInngestSendResult = {
  ids?: string[] // Ожидаем, что ids это опциональный массив строк
  error?: any // Может быть поле error
  [key: string]: any // Позволяем другие поля, так как точная структура может варьироваться
}*/

/* // Закомментируем эту функцию, так как она не используется и вызывает ошибку с logger
// Функция для кодирования файла в base64 (остается для справки или потенциального использования)
async function encodeFileToBase64(filePath: string): Promise<string> {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    return fileBuffer.toString('base64')
  } catch (error) {
    // logger.error({ // Здесь была бы ошибка, если бы функция использовалась
    //   message: '❌ Ошибка при кодировании файла в base64',
    //   error: (error as Error).message, 
    //   filePath,
    // })
    throw error
  }
}
*/

// Сервис теперь - это обычная асинхронная функция, которая импортирует зависимости
export const startModelTraining = async (
  requestData: ModelTrainingRequest,
  ctx?: MyContext // Оставляем ctx опциональным, если он нужен для каких-то специфических действий
): Promise<ModelTrainingResponse> => {
  const {
    telegram_id,
    file_path,
    model_name,
    trigger_word,
    is_ru,
    bot_name,
    steps,
  } = requestData

  // **Шаг 1: Используем хелпер для валидации**
  // Определяем paymentType (может быть взят из requestData или по умолчанию)
  const paymentType = PaymentType.NEURO_TRAIN_LORA // Пример, нужно определить реальный тип

  // Преобразуем telegram_id в число для validateAndPrepareTrainingRequest
  const telegramIdNumber = Number(telegram_id)
  if (isNaN(telegramIdNumber)) {
    logger.error('Invalid telegram_id in requestData for Plan B', {
      telegram_id,
    })
    return {
      success: false,
      message: 'Invalid telegram_id provided',
      error: 'invalid_telegram_id',
    }
  }

  // !!! ВАЖНО: Расчет стоимости для Plan B !!!
  // Если Plan B (прямой вызов сервиса) будет использоваться, то здесь
  // нужно рассчитать стоимость на основе requestData.steps.
  // Пока что, для совместимости и чтобы не сломать, если steps не переданы,
  // будем использовать статичную стоимость из config, если steps не определены.
  // Но это место требует внимания, если Plan B станет основным с динамической стоимостью.
  let calculatedCostForPlanB: number
  const costPerStep = 0.22 // Стоимость за шаг, как в сцене
  if (steps && typeof steps === 'number' && steps > 0) {
    // Рассчитываем стоимость
    calculatedCostForPlanB = Math.round(steps * costPerStep) // Используем Math.round, как в сцене
    logger.info(
      `[Plan B Cost] Calculated based on steps: ${steps} * ${costPerStep} = ${calculatedCostForPlanB}`,
      { telegram_id }
    )
  } else {
    // Если steps не переданы или некорректны, используем стоимость по умолчанию
    calculatedCostForPlanB = COSTS.NEURO_TRAIN_LORA // Оставляем как fallback
    logger.warn(
      `[Plan B Cost] Steps not provided or invalid (${steps}). Using default cost: ${calculatedCostForPlanB}`,
      { telegram_id }
    )
  }

  const validationResult = await validateAndPrepareTrainingRequest(
    telegramIdNumber, // <--- Передаем число
    file_path, // Используем file_path
    model_name,
    trigger_word,
    is_ru,
    bot_name,
    paymentType, // Передаем тип оплаты
    calculatedCostForPlanB // <--- Передаем рассчитанную/статичную стоимость для Plan B
  )

  if (!validationResult) {
    // Ошибки (пользователь не найден или баланс недостаточен) уже залогированы в хелпере
    // Отправляем сообщение пользователю, если есть ctx
    const message = is_ru
      ? '❌ Не удалось начать тренировку. Проверьте ваш баланс или попробуйте позже.'
      : '❌ Could not start training. Check your balance or try again later.'
    if (ctx?.reply) {
      await ctx.reply(message)
    }
    return {
      success: false,
      message: 'Validation failed (user not found or insufficient balance)',
      error:
        validationResult === null
          ? 'user_not_found_or_insufficient_balance'
          : undefined,
    }
  }

  const { user, currentBalance, costInStars } = validationResult

  // **Шаг 2: Обработка файла (если нужен)**
  // Логика копирования файла остается здесь, так как она специфична для сервиса (Plan B)
  // или может понадобиться для отправки URL в Inngest (Plan A)
  const originalFilename = path.basename(file_path)
  const uniqueFilename = `test_${uuidv4()}_${originalFilename}`
  const targetDir = path.join(UPLOAD_DIR, 'training_archives')
  const targetPath = path.join(targetDir, uniqueFilename)
  const publicUrl = `${API_URL}/uploads/training_archives/${uniqueFilename}`

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
      logger.info(`Created directory: ${targetDir}`)
    }
    fs.copyFileSync(file_path, targetPath)
    logger.info(`File copied from ${file_path} to ${targetPath}`)
  } catch (error: any) {
    logger.error(
      `[File Error] Failed to process archive file: ${error.message}`,
      {
        telegram_id,
        file_path,
        targetPath,
      }
    )
    return {
      success: false,
      message: `Error processing the archive file: ${error.message}`,
      error: 'file_handling_error',
    }
  }

  // **Шаг 3: Выбор Плана (A или B) и выполнение**
  const usePlanB = process.env.USE_MODEL_TRAINING_PLAN_B === 'true'

  if (usePlanB) {
    // --- Plan B: Прямой вызов Replicate ---
    logger.info('[Plan B] Initiating direct Replicate training...', {
      telegram_id,
    })
    const transactionId = `PLAN_B_TRAINING_${uuidv4()}`
    let replicateTrainingId: string | null = null
    let dbRecordId: string | null = null

    try {
      // Списываем средства ПЕРЕД вызовом Replicate
      await updateUserBalance(
        String(user.id), // Используем user.id из хелпера и приводим к строке
        -costInStars, // Используем стоимость из хелпера
        PaymentType.NEURO_TRAIN_LORA,
        transactionId,
        { description: `Plan B Training: ${model_name}` }
      )
      logger.info(`[Plan B] Balance deducted: ${costInStars} stars`, {
        telegram_id,
      })

      // 4. Запуск тренировки в Replicate и создание записи в БД
      try {
        const replicateModelName = formatReplicateModelName(
          user.replicate_username, // Используем данные из user
          model_name
        )
        const webhookUrl = getReplicateWebhookUrl()

        // Используем user из validationResult, publicUrl и webhookUrl
        const trainingResult = await startReplicateTraining(
          user, // Передаем весь объект user
          model_name,
          publicUrl, // <--- Правильно: URL архива
          trigger_word, // <--- Правильно: Триггерное слово
          steps // <--- Правильно: Количество шагов (опционально)
        )

        if (!trainingResult) {
          throw new Error('Replicate training failed to start (null response)')
        }

        replicateTrainingId = trainingResult.id
        logger.info({
          message: 'Тренировка Replicate запущена',
          userId: user.id,
          replicateId: replicateTrainingId,
        })

        // Создаем запись в БД через хелпер
        const trainingRecordData = {
          user_id: String(user.id),
          model_name,
          zip_url: publicUrl,
          cost: costInStars,
          status: 'STARTING', // Сразу ставим STARTING, т.к. Replicate вызов прошел
          replicate_training_id: replicateTrainingId,
          replicate_model_name: replicateModelName, // Используем отформатированное имя
          webhook_url: webhookUrl, // Используем полученный URL
          api: user.api,
          trigger_word,
          user_replicate_username: user.replicate_username,
        }

        const createdRecord = await createTrainingRecord(trainingRecordData)

        if (!createdRecord || createdRecord.length === 0) {
          // Эта ошибка менее критична, логируем и продолжаем,
          // но статус не будет обновляться без записи в БД
          logger.error({
            message:
              'Не удалось создать запись в БД после успешного запуска Replicate',
            userId: user.id,
            replicateId: replicateTrainingId,
          })
          // Можно вернуть успех, но с предупреждением, или обработать иначе
        } else {
          dbRecordId = String(createdRecord[0].id) // Сохраняем ID записи из БД
          logger.info({
            message: 'Запись о тренировке успешно создана/обновлена в БД',
            userId: user.id,
            dbRecordId: dbRecordId,
          })
        }

        return {
          success: true,
          message: `Training started successfully. Replicate ID: ${replicateTrainingId}`,
          replicateTrainingId: replicateTrainingId,
          cost: costInStars,
        }
      } catch (error: any) {
        logger.error({
          message: 'Ошибка при запуске Replicate или записи в БД',
          userId: user.id,
          error: error.message,
        })

        // Убедимся, что dbRecordId - это строка
        const dbRecordIdString = String(dbRecordId)

        // Если есть ID записи в БД, пытаемся обновить статус на ERROR
        if (dbRecordIdString && user.api) {
          // Проверяем наличие user.api
          await updateTrainingRecordOnError(dbRecordIdString, error, user.api)
        } else {
          // Если записи в БД нет, но был ID от Replicate (маловероятно, но возможно)
          // Или если ошибка произошла до получения ID от Replicate
          logger.warn({
            message:
              'Не удалось обновить статус ошибки в БД (запись не найдена или ошибка до Replicate)',
            userId: user.id,
            replicateAttempted: !!replicateTrainingId,
          })
          // Пытаемся создать запись с ошибкой, если валидация прошла
          if (validationResult && publicUrl) {
            try {
              const replicateModelName = formatReplicateModelName(
                user.replicate_username,
                model_name
              )
              const webhookUrl = getReplicateWebhookUrl()
              const errorRecordData: ModelTraining = {
                id: '',
                created_at: new Date().toISOString(),
                user_id: String(user.id),
                model_name,
                zip_url: publicUrl,
                cost: costInStars,
                status: 'ERROR',
                error: `Failed to start training: ${error.message}`,
                replicate_model_name: replicateModelName,
                webhook_url: webhookUrl,
                trigger_word,
                replicate_training_id: null,
                model_url: null,
                steps: null,
              }
              await createTrainingRecord(errorRecordData)
            } catch (createError: any) {
              logger.error({
                message: 'Не удалось создать запись об ошибке в БД',
                userId: user.id,
                error: createError.message,
              })
            }
          }
        }

        return {
          success: false,
          message: `Failed to start Replicate training: ${error.message}`,
          error: 'replicate_failed', // Или 'db_create_failed' в зависимости от контекста
        }
      }
    } catch (error: any) {
      logger.error('[Plan B Error]', {
        telegram_id,
        error: error.message,
        stack: error.stack,
      })

      // Попытка вернуть средства, если списание было, но Replicate упал
      if (transactionId) {
        // Проверяем, была ли ошибка ДО или ПОСЛЕ вызова Replicate
        const refundTransactionId = `PLAN_B_TRAINING_REFUND_${uuidv4()}`
        try {
          await updateUserBalance(
            String(user.id), // Приводим user.id к строке
            costInStars, // Возвращаем полную стоимость
            PaymentType.NEURO_TRAIN_LORA,
            refundTransactionId,
            {
              description: `Refund Plan B Failed Training: ${model_name}`,
              error_message: error.message, // Оставляем error_message здесь, т.к. это metadata
            }
          )
          logger.info('[Plan B] Refund processed due to error', {
            telegram_id,
          })
        } catch (refundError: any) {
          logger.error('[Plan B Refund Error]', {
            telegram_id,
            error: refundError.message,
          })
        }
      }

      return {
        success: false,
        message: `Plan B Error: ${error.message}`,
        error: 'plan_b_replicate_error',
      }
    }
  } else {
    // --- Plan A: Отправка события в Inngest ---
    logger.info('[Plan A] Sending event to Inngest...', { telegram_id })
    try {
      await inngest.send({
        name: 'digital-avatar-body/model-training.requested',
        data: {
          telegram_id: String(telegram_id),
          bot_name: bot_name,
          model_name: model_name,
          trigger_word: trigger_word,
          zipUrl: publicUrl,
          cost_for_refund: costInStars, // Это costInStars из validationResult
          calculatedCost: costInStars, // <--- ДОБАВЛЕНО: Передаем ту же стоимость
          operation_type_for_refund: paymentType, // Используем paymentType
          is_ru: is_ru,
          user_api: user.api,
          user_replicate_username: user.replicate_username,
          steps: steps, // Передаем steps, если они есть
          // paymentType: paymentType, // Удалено, используем operation_type_for_refund
        } as ModelTrainingInngestEventData, // Убедимся, что тип совпадает
        user: { external_id: String(telegram_id) },
      })
      logger.info('[Plan A] Inngest event sent successfully', { telegram_id })

      return {
        success: true,
        message:
          'Plan A: Training request sent to background worker successfully.',
        cost: costInStars,
      }
    } catch (error: any) {
      logger.error('[Plan A Inngest Error]', {
        telegram_id,
        error: error.message,
        stack: error.stack,
      })
      return {
        success: false,
        message: `Plan A Error sending Inngest event: ${error.message}`,
        error: 'plan_a_inngest_error',
      }
    }
  }
}
