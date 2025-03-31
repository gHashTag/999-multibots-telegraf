import { inngest } from '@/core/inngest/clients'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramId,
  updateUserBalance,
  updateUserLevelPlusOne,
  getUserBalance,
  createModelTrainingV2,
} from '@/core/supabase'
import {
  modeCosts,
  ModeEnum,
  calculateModeCost,
} from '@/price/helpers/modelsCost'
import { errorMessageAdmin } from '@/helpers/errorMessageAdmin'
import axios from 'axios'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
// Создаем простой интерфейс ApiError для временного использования
interface ApiError extends Error {
  response?: {
    status: number
  }
}

interface TrainingResponse {
  id: string
  status: string
  urls: { get: string }
  error?: string
  finetune_id?: string
}

// Активные тренировки для отслеживания
const activeTrainings = new Map<string, { cancel: () => void }>()

// Функция для кодирования файла в base64
async function encodeFileToBase64(url: string): Promise<string> {
  const response = await axios.get(url, { responseType: 'arraybuffer' })
  const buffer = Buffer.from(response.data)
  return buffer.toString('base64')
}

// Создаем Inngest функцию
export const modelTrainingV2 = inngest.createFunction(
  {
    id: 'model-training-v2',
  },
  { event: 'model-training/v2/requested' },
  async ({ event, step }) => {
    logger.info({
      message: '🚀 Model training initiated',
      eventId: event.id,
      data: event.data,
    })

    const {
      zipUrl,
      triggerWord,
      modelName,
      steps,
      telegram_id,
      is_ru,
      bot_name,
    } = event.data

    // Проверка окружения
    if (!process.env.BFL_API_KEY) {
      throw new Error('BFL_API_KEY is not set')
    }
    if (!process.env.BFL_WEBHOOK_URL) {
      throw new Error('BFL_WEBHOOK_URL is not set')
    }
    if (!process.env.REPLICATE_USERNAME) {
      throw new Error('REPLICATE_USERNAME is not set')
    }

    // Получаем бот по имени
    const botData = await step.run('get-bot', async () => {
      logger.info({
        message: '🤖 Getting bot instance',
        botName: bot_name,
        step: 'get-bot',
      })

      return getBotByName(bot_name)
    })

    // Извлекаем бота из результата функции getBotByName, используя приведение типов
    const bot = (botData as any).bot

    // Проверяем существование пользователя
    const userExists = await step.run('check-user-exists', async () => {
      logger.info({
        message: '🔍 Checking user existence',
        telegramId: telegram_id,
        step: 'check-user-exists',
      })

      const user = await getUserByTelegramId(telegram_id)
      if (!user) {
        logger.error({
          message: '❌ User not found',
          telegramId: telegram_id,
          step: 'check-user-exists',
        })
        throw new Error(`User with ID ${telegram_id} does not exist.`)
      }

      logger.info({
        message: '✅ User found',
        telegramId: telegram_id,
        userId: user.id,
        step: 'check-user-exists',
      })

      return user
    })

    // Увеличиваем уровень пользователя, если он на уровне 0
    if (userExists.level === 0) {
      await step.run('update-user-level', async () => {
        logger.info({
          message: '⬆️ Upgrading user level from 0 to 1',
          telegramId: telegram_id,
          currentLevel: userExists.level,
          step: 'update-user-level',
        })

        await updateUserLevelPlusOne(telegram_id, userExists.level)

        logger.info({
          message: '✅ User level updated successfully',
          telegramId: telegram_id,
          newLevel: 1,
          step: 'update-user-level',
        })
      })
    }

    // Проверяем и обрабатываем баланс
    const balanceOperation = await step.run('process-balance', async () => {
      logger.info({
        message: '💰 Processing user balance',
        telegramId: telegram_id,
        step: 'process-balance',
      })

      // Получаем текущий баланс и рассчитываем стоимость
      const currentBalance = await getUserBalance(telegram_id)
      const paymentAmount = calculateModeCost({
        mode: ModeEnum.DigitalAvatarBodyV2,
        steps,
      }).stars

      logger.info({
        message: '💲 Balance information',
        telegramId: telegram_id,
        currentBalance,
        paymentAmount,
        step: 'process-balance',
      })
      //

      // Проверяем и обрабатываем операцию с балансом через Inngest события
      // Так как processBalanceOperation был перенесен в paymentProcessor
      await inngest.send({
        id: `train-${telegram_id}-${Date.now()}-${modelName}-${uuidv4()}`,
        name: 'payment/process',
        data: {
          telegram_id,
          paymentAmount,
          is_ru,
          bot_name,
          description: `Payment for model training ${modelName} (steps: ${steps})`,
          type: 'outcome',
          metadata: {
            service_type: ModeEnum.DigitalAvatarBodyV2,
            model_name: modelName,
            steps: steps,
          },
        },
      })

      logger.info({
        message: '✅ Balance processed successfully',
        telegramId: telegram_id,
        step: 'process-balance',
      })

      return {
        currentBalance,
        paymentAmount,
        balanceCheck: { success: true },
      }
    })

    try {
      // Кодируем ZIP файл в base64
      const encodedZip = await step.run('encode-zip', async () => {
        logger.info({
          message: '📦 Encoding ZIP file to base64',
          zipUrl,
          step: 'encode-zip',
        })

        try {
          const result = await encodeFileToBase64(zipUrl)

          logger.info({
            message: '✅ ZIP file encoded successfully',
            zipUrl,
            step: 'encode-zip',
          })

          return result
        } catch (error) {
          logger.error({
            message: '❌ Failed to encode ZIP file',
            zipUrl,
            error: error.message,
            step: 'encode-zip',
          })
          throw error
        }
      })

      // Отправляем запрос на API для создания модели
      const training = await step.run('create-training', async () => {
        logger.info({
          message: '🌐 Sending request to BFL API for model creation',
          telegramId: telegram_id,
          triggerWord,
          modelName,
          steps,
          step: 'create-training',
        })

        try {
          const response = await fetch('https://api.us1.bfl.ai/v1/finetune', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Key': process.env.BFL_API_KEY,
            },
            body: JSON.stringify({
              file_data: encodedZip,
              finetune_comment: telegram_id,
              trigger_word: triggerWord,
              mode: 'character',
              iterations: steps,
              learning_rate: 0.000001,
              captioning: true,
              priority: 'high_res_only',
              finetune_type: 'full',
              lora_rank: 32,
              webhook_url: process.env.BFL_WEBHOOK_URL,
              webhook_secret: process.env.BFL_WEBHOOK_SECRET,
            }),
          })

          logger.info({
            message: '📡 Received response from BFL API',
            statusCode: response.status,
            step: 'create-training',
          })

          if (!response.ok) {
            logger.error({
              message: '❌ Failed to create model training',
              statusCode: response.status,
              step: 'create-training',
            })

            throw new Error(
              `Failed to initiate training with new API. Status: ${response.status}`
            )
          }

          const jsonResponse = (await response.json()) as TrainingResponse

          logger.info({
            message: '🎉 Model training initiated successfully',
            trainingResponse: jsonResponse,
            telegramId: telegram_id,
            modelName,
            step: 'create-training',
          })

          return jsonResponse
        } catch (error) {
          logger.error({
            message: '❌ Failed to create training',
            error: error.message,
            step: 'create-training',
          })
          throw error
        }
      })

      // Сохраняем информацию о тренировке в базу данных
      await step.run('save-training-to-db', async () => {
        logger.info({
          message: '💾 Saving training information to database',
          finetune_id: training.finetune_id,
          telegramId: telegram_id,
          modelName,
          step: 'save-training-to-db',
        })

        await createModelTrainingV2({
          finetune_id: training.finetune_id,
          telegram_id,
          model_name: modelName,
          trigger_word: triggerWord,
          zip_url: zipUrl,
          steps,
          api: 'bfl',
        })

        logger.info({
          message: '✅ Training information saved successfully',
          finetune_id: training.finetune_id,
          telegramId: telegram_id,
          modelName,
          step: 'save-training-to-db',
        })
      })

      // Отправляем уведомление пользователю
      await step.run('notify-user', async () => {
        logger.info({
          message: '📩 Sending notification to user',
          telegramId: telegram_id,
          modelName,
          step: 'notify-user',
        })

        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `✅ Обучение вашей модели "${modelName}" началось! Мы уведомим вас, когда модель будет готова.`
            : `✅ Your model "${modelName}" training has started! We'll notify you when it's ready.`
        )

        logger.info({
          message: '📨 Notification sent successfully',
          telegramId: telegram_id,
          step: 'notify-user',
        })
      })

      logger.info({
        message: '🏁 Model training process completed successfully',
        telegramId: telegram_id,
        modelName,
        finetune_id: training.finetune_id,
      })

      return {
        success: true,
        message: `Training initiated successfully: ${JSON.stringify(training)}`,
      }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при тренировке модели',
        description: 'Error during model training',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        params: event.data,
      })

      const { telegram_id, bot_name, is_ru, modelName, steps } = event.data

      // Обработка возврата средств
      try {
        const refundAmount = calculateModeCost({
          mode: ModeEnum.DigitalAvatarBodyV2,
          steps: Number(steps),
        }).stars

        logger.info({
          message: '💸 Начало процесса возврата средств',
          description: 'Starting refund process due to training error',
          telegram_id,
          refundAmount,
          error: error instanceof Error ? error.message : 'Unknown error',
        })

        // Отправляем событие возврата средств
        await inngest.send({
          id: `refund-${telegram_id}-${Date.now()}-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id,
            amount: refundAmount, // положительное значение для возврата
            type: 'refund',
            description: `Возврат средств за неудачную тренировку модели ${modelName}`,
            bot_name,
            metadata: {
              service_type: ModeEnum.DigitalAvatarBodyV2,
              error: error instanceof Error ? error.message : 'Unknown error',
              model_name: modelName,
              steps: Number(steps),
            },
          },
        })

        logger.info({
          message: '✅ Возврат средств выполнен',
          description: 'Refund processed successfully',
          telegram_id,
          refundAmount,
        })

        // Отправляем уведомление пользователю
        const { bot } = getBotByName(bot_name)
        if (bot) {
          const message = is_ru
            ? `❌ Произошла ошибка при тренировке модели. ${refundAmount} ⭐️ возвращены на ваш баланс.`
            : `❌ An error occurred during model training. ${refundAmount} ⭐️ have been refunded to your balance.`

          await bot.telegram.sendMessage(telegram_id, message)
        }
      } catch (refundError) {
        logger.error({
          message: '🚨 Ошибка при попытке возврата средств',
          description: 'Error during refund process',
          error:
            refundError instanceof Error
              ? refundError.message
              : 'Unknown error',
          originalError:
            error instanceof Error ? error.message : 'Unknown error',
          telegram_id,
        })
      }

      // Отправляем событие о неудаче
      await inngest.send({
        name: 'model-training-v2/failed',
        data: {
          ...event.data,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })

      throw error
    }
  }
)
