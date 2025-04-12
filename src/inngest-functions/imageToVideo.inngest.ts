import { inngest } from './clients'
import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '../core/supabase'
import { ModeEnum } from '../interfaces/modes'
import { calculateModeCost } from '../price/calculators/modeCalculator'
import { sendBalanceMessage } from '../price/helpers'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { TransactionType } from '../interfaces/payments.interface'
import { sendMediaToPulse } from '@/helpers/pulse'

/**
 * Интерфейс события для генерации видео из изображения
 */
export interface ImageToVideoEvent {
  name: 'image-to-video/generate'
  data: {
    telegram_id: string
    bot_name: string
    image_url: string
    model_id?: string
    duration?: number
    is_ru: boolean
    _test?: {
      skip_balance_check?: boolean
      skip_payment?: boolean
      skip_generation?: boolean
      skip_sending?: boolean
    }
  }
}

/**
 * Результат генерации видео
 */
interface VideoResult {
  success: boolean
  videoUrl?: string
  previewUrl?: string
  error?: string
  operationId?: string
  telegram_id?: string
}

/**
 * Функция для генерации видео из изображения
 */
export const imageToVideoFunction = inngest.createFunction(
  {
    id: 'image-to-video-generation',
    name: 'Image to Video Generation',
  },
  { event: 'image-to-video/generate' },
  async ({ event, step }) => {
    const validatedParams = event.data

    if (!validatedParams) {
      throw new Error('🚫 Не переданы параметры')
    }

    // Используем 'minimax' как модель по умолчанию, если не указана
    const modelId = validatedParams.model_id || 'minimax'

    // Прямое отправление платежного события для тестов
    if (validatedParams._test && !validatedParams._test.skip_payment) {
      try {
        const cost = calculateModeCost({
          mode: ModeEnum.ImageToVideo,
          modelId: modelId,
        }).stars

        logger.info('💰 [ТЕСТ] Отправка платежного события для тестирования', {
          description: 'Sending payment event for testing',
          telegram_id: validatedParams.telegram_id,
          cost,
          modelId,
        })

        await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id: validatedParams.telegram_id,
            amount: cost,
            stars: cost,
            type: TransactionType.MONEY_EXPENSE,
            description: validatedParams.is_ru
              ? 'Генерация видео из изображения (тест)'
              : 'Image to video generation (test)',
            bot_name: validatedParams.bot_name,
            service_type: ModeEnum.ImageToVideo,
            metadata: {
              image_url:
                validatedParams.image_url || 'https://example.com/test.jpg',
              is_test: true,
              operation_id: uuidv4(),
            },
          },
        })

        logger.info('✅ [ТЕСТ] Платежное событие успешно отправлено', {
          description: 'Test payment event successfully sent',
          telegram_id: validatedParams.telegram_id,
        })
      } catch (error) {
        logger.error(
          '❌ [ТЕСТ] Ошибка при отправке тестового платежного события',
          {
            description: 'Error sending test payment event',
            telegram_id: validatedParams.telegram_id,
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }

    // Получаем информацию о пользователе
    const userResult = await step.run('get-user', async () => {
      const user = await getUserByTelegramIdString(validatedParams.telegram_id)
      if (!user) {
        throw new Error('🚫 Пользователь не найден')
      }
      return user
    })

    // Отправляем уведомление о начале генерации
    await step.run('send-start-notification', async () => {
      const botResult = getBotByName(validatedParams.bot_name)
      if (!botResult.bot) {
        throw new Error('🚫 Бот не найден')
      }

      await botResult.bot.telegram.sendMessage(
        validatedParams.telegram_id,
        validatedParams.is_ru
          ? '🎬 Начинаю генерацию видео...'
          : '🎬 Starting video generation...'
      )
    })

    // Проверяем баланс
    if (!validatedParams._test?.skip_balance_check) {
      const cost = calculateModeCost({
        mode: ModeEnum.ImageToVideo,
        modelId: modelId,
      }).stars

      if (userResult.balance < cost) {
        const botResult = getBotByName(validatedParams.bot_name)
        if (!botResult.bot) {
          throw new Error('🚫 Бот не найден')
        }

        await sendBalanceMessage(
          validatedParams.telegram_id,
          userResult.balance,
          cost,
          validatedParams.is_ru,
          botResult.bot.telegram
        )
        return { insufficient_balance: true }
      }
    } else {
      logger.info('🔄 Пропуск проверки баланса в тестовом режиме', {
        description: 'Skipping balance check in test mode',
        telegram_id: validatedParams.telegram_id,
      })
    }

    // Списываем средства
    if (!validatedParams._test?.skip_payment) {
      await step.run('charge-user', async () => {
        const cost = calculateModeCost({
          mode: ModeEnum.ImageToVideo,
          modelId: modelId,
        }).stars

        logger.info('💰 Отправка платежного события', {
          description: 'Sending payment event',
          telegram_id: validatedParams.telegram_id,
          cost,
          modelId,
          service_type: ModeEnum.ImageToVideo,
        })

        await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id: validatedParams.telegram_id,
            amount: cost,
            stars: cost,
            type: TransactionType.MONEY_EXPENSE,
            description: validatedParams.is_ru
              ? 'Генерация видео из изображения'
              : 'Image to video generation',
            bot_name: validatedParams.bot_name,
            service_type: ModeEnum.ImageToVideo,
            metadata: {
              image_url: validatedParams.image_url,
              operation_id: uuidv4(),
            },
          },
        })

        logger.info('✅ Платежное событие успешно отправлено', {
          description: 'Payment event sent successfully',
          telegram_id: validatedParams.telegram_id,
        })
      })
    } else {
      logger.info('🔄 Пропуск оплаты в тестовом режиме', {
        description: 'Skipping payment in test mode',
        telegram_id: validatedParams.telegram_id,
      })
    }

    // Генерируем видео
    let videoResult: VideoResult = { success: false }

    if (!validatedParams._test?.skip_generation) {
      videoResult = await step.run('generate-video', async () => {
        try {
          const operationId = uuidv4()
          const response = await axios.post(
            'https://api.d-id.com/talks',
            {
              script: {
                type: 'text',
                input: 'Hello',
                provider: {
                  type: 'microsoft',
                  voice_id: 'en-US-JennyNeural',
                },
              },
              config: {
                result_format: 'mp4',
              },
              source_url: validatedParams.image_url,
            },
            {
              headers: {
                Authorization: `Basic ${process.env.D_ID_API_KEY}`,
                'Content-Type': 'application/json',
              },
            }
          )

          return {
            success: true,
            videoUrl: response.data.result_url,
            previewUrl: response.data.preview_url,
            operationId,
            telegram_id: validatedParams.telegram_id,
          }
        } catch (error) {
          console.error('Error generating video:', error)
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })
    }

    // Отправляем результат
    if (!validatedParams._test?.skip_sending && videoResult.videoUrl) {
      await step.run('send-result', async () => {
        const botResult = getBotByName(validatedParams.bot_name)
        if (!botResult.bot) {
          throw new Error('🚫 Бот не найден')
        }

        await botResult.bot.telegram.sendVideo(
          validatedParams.telegram_id,
          videoResult.videoUrl!,
          {
            caption: validatedParams.is_ru
              ? '✨ Ваше видео готово!'
              : '✨ Your video is ready!',
          }
        )

        // Отправляем видео в Pulse
        try {
          await sendMediaToPulse({
            mediaType: 'video',
            mediaSource: videoResult.videoUrl!,
            telegramId: validatedParams.telegram_id,
            username: userResult.username || '',
            language: validatedParams.is_ru ? 'ru' : 'en',
            serviceType: ModeEnum.ImageToVideo.toString(),
            botName: validatedParams.bot_name,
            additionalInfo: {
              'Исходное изображение': validatedParams.image_url,
            },
          })

          logger.info({
            message: '✅ Видео успешно отправлено в Pulse',
            description: 'Video successfully sent to Pulse channel',
            telegram_id: validatedParams.telegram_id,
            service: ModeEnum.ImageToVideo,
          })
        } catch (error) {
          logger.error({
            message: '❌ Ошибка при отправке видео в Pulse',
            description: 'Error sending video to Pulse channel',
            error: (error as Error).message,
            telegram_id: validatedParams.telegram_id,
          })
        }

        // Увеличиваем уровень пользователя
        await updateUserLevelPlusOne(
          validatedParams.telegram_id,
          validatedParams.bot_name
        )
      })
    }

    return videoResult
  }
)
