import { TelegramId } from '@/interfaces/telegram.interface'
import { inngest } from '@/inngest-functions/clients'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { sendBalanceMessage } from '@/price/helpers'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { TransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { sendMediaToPulse } from '@/helpers/pulse'

/**
 * Интерфейс события для генерации видео из текста
 */
interface TextToVideoEvent {
  data: {
    prompt: string // Текстовое описание видео
    telegram_id: TelegramId
    is_ru: boolean
    bot_name: string
    model_id?: string // ID модели для генерации
    aspect_ratio?: string // Соотношение сторон (по умолчанию '16:9')
    duration?: number // Длительность видео в секундах
    _test?: {
      insufficient_balance?: boolean
      api_error?: boolean
      skip_generation?: boolean
      skip_sending?: boolean
      skip_payment?: boolean
    }
    username?: string
  }
}

/**
 * Результат генерации видео
 */
type VideoResult =
  | { success: true; videoUrl: string; previewUrl?: string }
  | { success: false; error: string }

/**
 * Функция для генерации видео из текста
 */
export const textToVideoFunction = inngest.createFunction(
  {
    name: 'text-to-video-generation',
    id: 'text-to-video',
    concurrency: { limit: 5 },
    retries: 2,
  },
  { event: 'text-to-video.requested' },
  async ({ event, step }: any) => {
    let validatedParams: TextToVideoEvent['data'] | null = null
    let operationId: string | null = null
    let videoUrl: string | null = null
    let previewUrl: string | null = null

    try {
      // Шаг 1: Валидация входных параметров
      validatedParams = (await step.run('validate-input', () => {
        if (
          !event.data ||
          !event.data.prompt ||
          !event.data.telegram_id ||
          event.data.is_ru === undefined ||
          !event.data.bot_name
        ) {
          throw new Error('Missing required fields')
        }

        // Проверяем, что модель поддерживает текст
        const modelId = event.data.model_id || 'kling-v1.6-pro'
        const modelConfig =
          VIDEO_MODELS_CONFIG[modelId as keyof typeof VIDEO_MODELS_CONFIG]
        if (!modelConfig || !modelConfig.inputType.includes('text')) {
          throw new Error(`Model ${modelId} does not support text input`)
        }

        const validData: TextToVideoEvent['data'] = {
          prompt: event.data.prompt,
          telegram_id: event.data.telegram_id,
          is_ru: event.data.is_ru,
          bot_name: event.data.bot_name,
          model_id: modelId,
          aspect_ratio: event.data.aspect_ratio || '16:9',
          duration: event.data.duration || 6,
        }

        if (event.data._test) {
          validData._test = event.data._test
        }

        if (event.data.username) {
          validData.username = event.data.username
        }

        return validData
      })) as TextToVideoEvent['data']

      if (!validatedParams) {
        throw new Error('Validation failed - missing required parameters')
      }

      const params = validatedParams

      // Прямое отправление платежного события для тестов
      if (params._test && !params._test.skip_payment) {
        try {
          const cost = calculateModeCost({
            mode: ModeEnum.TextToVideo,
            modelId: params.model_id || 'kling-v1.6-pro',
          }).stars

          logger.info(
            '💰 [ТЕСТ] Отправка платежного события для тестирования',
            {
              description: 'Sending payment event for testing',
              telegram_id: params.telegram_id,
              cost,
              modelId: params.model_id || 'kling-v1.6-pro',
            }
          )

          await inngest.send({
            name: 'payment/process',
            data: {
              telegram_id: params.telegram_id,
              amount: cost,
              stars: cost,
              type: TransactionType.MONEY_EXPENSE,
              description: params.is_ru
                ? 'Создание видео из текста (тест)'
                : 'Text to video generation (test)',
              bot_name: params.bot_name,
              service_type: ModeEnum.TextToVideo,
              metadata: {
                prompt: params.prompt || 'Test prompt',
                is_test: true,
                operation_id: operationId || uuidv4(),
              },
            },
          })

          logger.info('✅ [ТЕСТ] Платежное событие успешно отправлено', {
            description: 'Test payment event successfully sent',
            telegram_id: params.telegram_id,
          })
        } catch (error) {
          logger.error(
            '❌ [ТЕСТ] Ошибка при отправке тестового платежного события',
            {
              description: 'Error sending test payment event',
              telegram_id: params.telegram_id,
              error: error instanceof Error ? error.message : String(error),
            }
          )
        }
      }

      // Шаг 2: Получение информации о пользователе
      const user = await step.run('get-user-info', async () => {
        const userResult = await getUserByTelegramIdString(params.telegram_id)
        if (!userResult) throw new Error('User not found')

        // Увеличиваем уровень пользователя, если это его первый запрос на создание видео
        if (userResult.level === 9) {
          await updateUserLevelPlusOne(userResult.telegram_id, userResult.level)
        }

        return userResult
      })

      // Генерируем уникальный ID операции
      operationId = await step.run('generate-operation-id', () => {
        return uuidv4()
      })

      // Шаг 3: Отправляем уведомление о начале генерации
      await step.run('send-generating-notification', async () => {
        const botResult = getBotByName(params.bot_name)
        if (!botResult?.bot) {
          throw new Error(`Bot ${params.bot_name} not found`)
        }
        const { bot } = botResult

        await bot.telegram.sendMessage(
          params.telegram_id,
          params.is_ru
            ? '⏳ Начинаем процесс создания видео из текста...'
            : '⏳ Starting the text-to-video generation process...'
        )

        return { sent: true }
      })

      // Шаг 4: Расчет стоимости операции
      const costCalculation = await step.run('calculate-cost', async () => {
        // Получаем модель из конфигурации
        const selectedModel =
          VIDEO_MODELS_CONFIG[
            params.model_id as keyof typeof VIDEO_MODELS_CONFIG
          ] || VIDEO_MODELS_CONFIG['kling-v1.6-pro']

        if (!selectedModel) {
          throw new Error(`Model ${params.model_id} not found in configuration`)
        }

        // Рассчитываем стоимость операции
        const cost = calculateModeCost({
          mode: ModeEnum.TextToVideo,
          modelId: selectedModel.id,
          numImages: 1,
        })

        console.log('💰 Стоимость операции:', {
          description: 'Operation cost',
          cost,
          model: selectedModel.id,
          basePrice: selectedModel.basePrice,
        })

        return {
          cost,
          model: selectedModel,
          operationId,
        }
      })

      // Шаг 5: Проверка баланса пользователя
      await step.run('check-balance', async () => {
        // Тестовый случай для недостаточного баланса
        if (params._test?.insufficient_balance) {
          throw new Error('Insufficient balance (test)')
        }

        // Реальная проверка баланса
        if (user.balance < costCalculation.cost.stars) {
          const botResult = getBotByName(params.bot_name)
          if (!botResult?.bot) {
            throw new Error(`Bot ${params.bot_name} not found`)
          }

          // Отправляем сообщение о недостаточном балансе
          await sendBalanceMessage(
            params.telegram_id,
            user.balance,
            costCalculation.cost.stars,
            params.is_ru,
            botResult.bot.telegram
          )

          throw new Error('Insufficient balance')
        }

        return { sufficient: true }
      })

      // Шаг 6: Списание средств с баланса пользователя (если не в тестовом режиме пропуска оплаты)
      if (!params._test?.skip_payment) {
        await step.run('charge-user', async () => {
          // Рассчитываем стоимость заново для гарантии точности
          const cost = calculateModeCost({
            mode: ModeEnum.TextToVideo,
            modelId: params.model_id || 'kling-v1.6-pro',
            numImages: 1,
          }).stars

          logger.info('💰 Отправка платежного события для Text-to-Video', {
            description: 'Sending payment event for Text-to-Video',
            cost,
            telegram_id: params.telegram_id,
            modelId: params.model_id || 'kling-v1.6-pro',
          })

          await inngest.send({
            name: 'payment/process',
            data: {
              telegram_id: params.telegram_id,
              amount: cost,
              stars: cost,
              type: TransactionType.MONEY_EXPENSE,
              description: params.is_ru
                ? 'Создание видео из текста'
                : 'Text to video generation',
              bot_name: params.bot_name,
              service_type: ModeEnum.TextToVideo,
              operation_id: operationId,
              metadata: {
                prompt: params.prompt,
                model: params.model_id,
              },
            },
          })

          logger.info('✅ Платежное событие успешно отправлено', {
            description: 'Payment event successfully sent',
            telegram_id: params.telegram_id,
            operation_id: operationId,
          })

          return { charged: true }
        })
      } else {
        logger.info('🔄 Пропуск оплаты в тестовом режиме', {
          description: 'Skipping payment in test mode',
          telegram_id: params.telegram_id,
        })
      }

      // Шаг 7: Генерация видео
      await step.run('generate-video', async () => {
        // Тестовый случай для ошибки API
        if (params._test?.api_error) {
          throw new Error('API error (test)')
        }

        try {
          // Формируем данные для API запроса
          const apiData = {
            prompt: params.prompt,
            model: params.model_id,
            aspect_ratio: params.aspect_ratio,
            duration: params.duration,
          }

          // Отправляем запрос к API
          const response = await axios.post(
            `${process.env.VIDEO_API_URL}/generate`,
            apiData,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.VIDEO_API_KEY}`,
              },
            }
          )

          if (!response.data || !response.data.videoUrl) {
            throw new Error('Invalid API response')
          }

          videoUrl = response.data.videoUrl
          if (response.data.previewUrl) {
            previewUrl = response.data.previewUrl
          }

          return {
            success: true,
            videoUrl,
            previewUrl,
          } as VideoResult
        } catch (error) {
          console.error('❌ Ошибка при генерации видео:', String(error))
          throw error
        }
      })

      // Шаг 8: Отправка результата пользователю
      await step.run('send-result', async () => {
        const botResult = getBotByName(params.bot_name)
        if (!botResult?.bot) {
          throw new Error(`Bot ${params.bot_name} not found`)
        }
        const { bot } = botResult

        // Отправляем превью, если есть
        if (previewUrl) {
          await bot.telegram.sendPhoto(params.telegram_id, previewUrl, {
            caption: params.is_ru
              ? '🎬 Превью сгенерированного видео'
              : '🎬 Preview of generated video',
          })
        }

        // Отправляем видео
        if (videoUrl) {
          await bot.telegram.sendVideo(params.telegram_id, videoUrl, {
            caption: params.is_ru
              ? '✨ Ваше видео готово!'
              : '✨ Your video is ready!',
          })

          // Отправка видео в Pulse для мониторинга
          try {
            const username = params.username || 'User'

            // Используем новую функцию sendMediaToPulse
            await sendMediaToPulse({
              mediaType: 'video',
              mediaSource: videoUrl,
              telegramId: params.telegram_id,
              username: username,
              language: params.is_ru ? 'ru' : 'en',
              serviceType: 'TextToVideo',
              prompt: params.prompt,
              botName: params.bot_name || 'unknown',
              additionalInfo: {
                Модель: params.model_id || 'unknown',
                'Соотношение сторон': params.aspect_ratio || '16:9',
                Длительность: `${params.duration || 6}s`,
              },
            })

            logger.info('✅ Видео отправлено в @neuro_blogger_pulse', {
              description: 'Video sent to pulse group using sendMediaToPulse',
              telegram_id: params.telegram_id,
              prompt_preview: params.prompt.slice(0, 50) + '...',
            })
          } catch (pulseError) {
            logger.error(
              '❌ Ошибка при отправке видео в @neuro_blogger_pulse',
              {
                description: 'Error sending video to pulse group',
                error:
                  pulseError instanceof Error
                    ? pulseError.message
                    : String(pulseError),
                telegram_id: params.telegram_id,
              }
            )
          }
        }

        return { sent: true }
      })

      // Возвращаем успешный результат
      return {
        success: true,
        videoUrl,
        previewUrl,
        operationId,
        telegram_id: params.telegram_id,
      }
    } catch (error) {
      // Обработка ошибок
      console.error('❌ Error in text-to-video generation:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)

      // Отправляем сообщение об ошибке пользователю
      try {
        const botResult = getBotByName(validatedParams?.bot_name || '')
        if (botResult?.bot && validatedParams) {
          await errorMessage(
            new Error(errorMsg),
            validatedParams.telegram_id,
            validatedParams.is_ru
          )

          // Отправляем уведомление администратору
          await errorMessageAdmin(
            new Error(
              `Error in text-to-video generation: ${errorMsg}${operationId ? `. Operation ID: ${operationId}` : ''}`
            )
          )
        }
      } catch (notifyError) {
        console.error('❌ Error sending error notification:', notifyError)
      }

      // Возвращаем ошибку
      return {
        success: false,
        error: errorMsg,
        operationId,
        telegram_id: validatedParams?.telegram_id,
      }
    }
  }
)
