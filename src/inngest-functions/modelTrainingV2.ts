import { inngest } from '@/core/inngest/clients'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
  getUserBalance,
  createModelTrainingV2,
} from '@/core/supabase'
import { ModeEnum, calculateModeCost } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

import axios from 'axios'

const MAX_ACTIVE_TRAININGS = 3

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
    await step.run('process-balance', async () => {
      logger.info({
        message: '💰 Processing user balance',
        telegramId: telegram_id,
        step: 'process-balance',
      })

      // Получаем текущий баланс и рассчитываем стоимость
      const currentBalance = await getUserBalance(telegram_id, bot_name)
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

      await inngest.send({
        id: `train-${telegram_id}-${Date.now()}-${modelName}-${uuidv4()}`,
        name: 'payment/process',
        data: {
          telegram_id,
          amount: calculateModeCost({
            mode: ModeEnum.DigitalAvatarBodyV2,
            steps,
          }).stars,
          is_ru,
          bot_name,
          description: `Payment for model training ${modelName} (steps: ${steps})`,
          type: 'money_expense',
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
      // Проверяем существующие тренировки
      const existingTrainings = await step.run(
        'check-existing-trainings',
        async () => {
          const { data: trainings, error } = await supabase
            .from('trainings')
            .select('*')
            .eq('telegram_id', telegram_id)
            .eq('status', 'active')

          if (error) {
            console.error('❌ Ошибка при проверке существующих тренировок:', {
              description: 'Error checking existing trainings',
              error: error instanceof Error ? error.message : String(error),
            })
            throw error instanceof Error ? error : new Error(String(error))
          }

          return trainings || []
        }
      )

      // Проверяем количество активных тренировок
      if (existingTrainings.length >= MAX_ACTIVE_TRAININGS) {
        throw new Error(
          is_ru
            ? `У вас уже есть ${existingTrainings.length} активных тренировок. Пожалуйста, дождитесь их завершения.`
            : `You already have ${existingTrainings.length} active trainings. Please wait for them to complete.`
        )
      }

      // Кодируем ZIP файл
      await step.run('encode-zip', async () => {
        try {
          const result = await encodeFileToBase64(zipUrl)

          logger.info({
            message: '✅ ZIP file encoded successfully',
            zipUrl,
            step: 'encode-zip',
          })

          return result
        } catch (error) {
          console.error('❌ Ошибка при кодировании ZIP файла:', {
            description: 'Error encoding ZIP file',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
          throw error instanceof Error
            ? error
            : new Error('Failed to encode ZIP file')
        }
      })

      // Отправляем запрос на API для создания модели
      const trainingResponse = await step.run(
        'create-training-bfl',
        async () => {
          try {
            const headers = {
              'Content-Type': 'application/json',
              'X-Key': process.env.BFL_API_KEY || '',
            } as const

            const response = await fetch(
              `${process.env.BFL_API_URL}/api/v1/finetune`,
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  name: modelName,
                  type: 'character',
                  instance_prompt: triggerWord,
                  class_prompt: 'person',
                  num_class_images: 0,
                  save_sample_prompt: triggerWord,
                  negative_prompt: '',
                  steps,
                }),
              }
            )

            if (!response.ok) {
              const errorText = await response.text()
              console.error('❌ Ошибка при создании тренировки в BFL API:', {
                description: 'Error creating training in BFL API',
                status: response.status,
                error: errorText,
              })
              throw new Error(`Failed to create training: ${errorText}`)
            }

            const data = await response.json()
            console.log('✅ Тренировка успешно создана в BFL API:', {
              description: 'Training created successfully in BFL API',
              finetune_id: data.finetune_id,
            })

            if (!data.finetune_id) {
              throw new Error('No finetune_id in response')
            }

            return data
          } catch (error) {
            console.error('❌ Ошибка при создании тренировки:', {
              description: 'Error creating training',
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            })
            throw error instanceof Error ? error : new Error(String(error))
          }
        }
      )

      // Сохраняем информацию о тренировке в базу данных
      await step.run('save-training-to-db', async () => {
        try {
          logger.info({
            message: '💾 Saving training information to database',
            finetune_id: trainingResponse.finetune_id,
            telegramId: telegram_id,
            modelName,
            step: 'save-training-to-db',
          })

          if (!trainingResponse.finetune_id) {
            throw new Error('No finetune_id in training response')
          }

          await createModelTrainingV2({
            finetune_id: trainingResponse.finetune_id,
            telegram_id,
            model_name: modelName,
            trigger_word: triggerWord,
            zip_url: zipUrl,
            steps,
            api: 'bfl',
          })

          logger.info({
            message: '✅ Training information saved successfully',
            finetune_id: trainingResponse.finetune_id,
            telegramId: telegram_id,
            modelName,
            step: 'save-training-to-db',
          })
        } catch (error) {
          console.error('❌ Ошибка при сохранении тренировки в базу данных:', {
            description: 'Error saving training to database',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
          throw error instanceof Error
            ? error
            : new Error('Failed to save training to database')
        }
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
        finetune_id: trainingResponse.finetune_id,
      })

      return {
        success: true,
        message: `Training initiated successfully: ${JSON.stringify(
          trainingResponse
        )}`,
      }
    } catch (error) {
      console.error('❌ Глобальная ошибка при создании тренировки:', {
        description: 'Global error in training creation',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Отправляем событие для возврата средств
      const refundEventId = `refund-${telegram_id}-${Date.now()}-${uuidv4()}`

      await inngest.send({
        id: refundEventId,
        name: 'payment/refund',
        data: {
          telegram_id,
          mode: ModeEnum.DigitalAvatarBodyV2,
          is_ru,
          bot_name,
          description: `Refund for failed model training: ${
            error instanceof Error ? error.message : String(error)
          }`,
          type: 'money_income',
          amount: calculateModeCost({
            mode: ModeEnum.DigitalAvatarBodyV2,
            steps,
          }).stars,
          metadata: {
            service_type: ModeEnum.DigitalAvatarBodyV2,
            model_name: modelName,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      })

      throw error instanceof Error ? error : new Error(String(error))
    }
  }
)
