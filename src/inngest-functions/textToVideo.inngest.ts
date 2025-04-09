import { TelegramId } from '@/interfaces/telegram.interface'
import { inngest } from '@/inngest-functions/clients'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { ModeEnum, calculateModeCost } from '@/price/helpers/modelsCost'
import { sendBalanceMessage } from '@/price/helpers'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { logger } from '@/utils/logger'
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

    logger.info('🚀 Starting text-to-video generation process:', {
      event_id: event.id,
      telegram_id: event.data?.telegram_id,
      model_id: event.data?.model_id,
      username: event.data?.username
    })

    try {
      // Шаг 1: Валидация входных параметров
      logger.info('📝 Step 1: Validating input parameters...')
      validatedParams = (await step.run('validate-input', () => {
        logger.info('Input validation - Received parameters:', {
          prompt: event.data?.prompt,
          telegram_id: event.data?.telegram_id,
          is_ru: event.data?.is_ru,
          bot_name: event.data?.bot_name,
          model_id: event.data?.model_id
        })
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
        logger.error('❌ Validation failed - missing required parameters')
        throw new Error('Validation failed - missing required parameters')
      }

      const params = validatedParams
      logger.info('✅ Input validation successful:', {
        model_id: params.model_id,
        aspect_ratio: params.aspect_ratio,
        duration: params.duration
      })

      // Шаг 2: Получение информации о пользователе
      logger.info('👤 Step 2: Getting user information...')
      const user = await step.run('get-user-info', async () => {
        logger.info('Fetching user info for telegram_id:', params.telegram_id)
        const userResult = await getUserByTelegramIdString(params.telegram_id)
        if (!userResult) {
          logger.error('❌ User not found:', params.telegram_id)
          throw new Error('User not found')
        }

        logger.info('User info retrieved:', {
          telegram_id: userResult.telegram_id,
          level: userResult.level,
          username: userResult.username
        })

        // Увеличиваем уровень пользователя, если это его первый запрос на создание видео
        if (userResult.level === 9) {
          logger.info('🆙 Upgrading user level from 9 to 10')
          await updateUserLevelPlusOne(userResult.telegram_id, userResult.level)
        }

        return userResult
      })

      // Генерируем уникальный ID операции
      operationId = await step.run('generate-operation-id', () => {
        const id = uuidv4()
        logger.info('🔑 Generated operation ID:', id)
        return id
      })

      // Шаг 3: Отправляем уведомление о начале генерации
      logger.info('📨 Step 3: Sending generation start notification...')
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
          ]
        if (!selectedModel) {
          throw new Error(`Model ${params.model_id} not found in configuration`)
        }

        // Рассчитываем стоимость операции
        const cost = calculateModeCost({
          mode: ModeEnum.TextToVideo,
          numImages: 1,
        })

        logger.info('💰 Стоимость операции:', {
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

      // Шаг 6: Списание средств с баланса пользователя
      logger.info('💳 Step 6: Processing payment...')
      await step.run('charge-user', async () => {
        logger.info('Initiating payment process:', {
          telegram_id: params.telegram_id,
          amount: costCalculation.cost.stars,
          operation_id: operationId
        })
        
        await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id: params.telegram_id,
            amount: costCalculation.cost.stars,
            type: 'money_expense',
            description: params.is_ru
              ? 'Создание видео из текста'
              : 'Text to video generation',
            bot_name: params.bot_name,
            service_type: ModeEnum.TextToVideo,
            operation_id: operationId,
          },
        })

        logger.info('✅ Payment processed successfully')
        return { charged: true }
      })

      // Шаг 7: Генерация видео
      logger.info('🎬 Step 7: Starting video generation...')
      await step.run('generate-video', async () => {
        // Тестовый случай для ошибки API
        if (params._test?.api_error) {
          logger.error('🧪 Test API error triggered')
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
          
          logger.info('Sending API request with data:', apiData)

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

          logger.info('📥 Received API response:', {
            status: response.status,
            hasVideoUrl: !!response.data?.videoUrl,
            hasPreviewUrl: !!response.data?.previewUrl
          })

          if (!response.data || !response.data.videoUrl) {
            logger.error('❌ Invalid API response:', response.data)
            throw new Error('Invalid API response')
          }

          videoUrl = response.data.videoUrl
          if (response.data.previewUrl) {
            previewUrl = response.data.previewUrl
          }

          logger.info('✅ Video generation successful:', {
            hasVideo: !!videoUrl,
            hasPreview: !!previewUrl
          })

          return {
            success: true,
            videoUrl,
            previewUrl,
          } as VideoResult
        } catch (error) {
          logger.error('❌ Error during video generation:', {
            error: String(error),
            operationId
          })
          throw error
        }
      })

      // Шаг 8: Отправка результата пользователю
      logger.info('📤 Step 8: Sending results to user...')
      await step.run('send-result', async () => {
        logger.info('Getting bot instance for:', params.bot_name)
        const botResult = getBotByName(params.bot_name)
        if (!botResult?.bot) {
          logger.error('❌ Bot not found:', params.bot_name)
          throw new Error(`Bot ${params.bot_name} not found`)
        }
        const { bot } = botResult

        // Отправляем превью, если есть
        if (previewUrl) {
          logger.info('Sending preview image to user')
          await bot.telegram.sendPhoto(params.telegram_id, previewUrl, {
            caption: params.is_ru
              ? '🎬 Превью сгенерированного видео'
              : '🎬 Preview of generated video',
          })
        }

        // Отправляем видео
        if (videoUrl) {
          logger.info('Sending video to user')
          await bot.telegram.sendVideo(params.telegram_id, videoUrl, {
            caption: params.is_ru
              ? '✨ Ваше видео готово!'
              : '✨ Your video is ready!',
          })
        }

        logger.info('✅ Results sent successfully to user')
        return { sent: true }
      })

      // Возвращаем успешный результат
      logger.info('🎉 Text-to-video generation completed successfully:', {
        operationId,
        telegram_id: params.telegram_id
      })
      
      return {
        success: true,
        videoUrl,
        previewUrl,
        operationId,
        telegram_id: params.telegram_id,
      }
    } catch (error) {
      // Обработка ошибок
      logger.error('❌ Error in text-to-video generation:', {
        error: error instanceof Error ? error.message : String(error),
        operationId,
        telegram_id: validatedParams?.telegram_id
      })
      
      const errorMsg = error instanceof Error ? error.message : String(error)

      // Отправляем сообщение об ошибке пользователю
      try {
        logger.info('Attempting to send error message to user')
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
          logger.info('Error messages sent to user and admin')
        }
      } catch (notifyError) {
        logger.error('❌ Error sending error notification:', notifyError)
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
