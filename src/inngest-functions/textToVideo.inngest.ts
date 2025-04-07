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
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Интерфейс события для генерации видео из текста
 */
interface TextToVideoEvent {
  data: {
    prompt: string
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
  | { success: false; error: Error }

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

        const validData: TextToVideoEvent['data'] = {
          prompt: event.data.prompt,
          telegram_id: event.data.telegram_id,
          is_ru: event.data.is_ru,
          bot_name: event.data.bot_name,
          model_id: event.data.model_id || 'wan-text-to-video', // значение по умолчанию
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

      const params = validatedParams // Создаем константу для использования в блоке try

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
        const selectedModel = VIDEO_MODELS_CONFIG[params.model_id || 'wan-text-to-video']
        
        if (!selectedModel) {
          throw new Error(`Model ${params.model_id} not found in configuration`)
        }
        
        // Рассчитываем стоимость операции
        const cost = calculateModeCost({
          mode: ModeEnum.TextToVideo,
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
          operationId
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
          
          // Отправляем сообщение о недостаточном балансе и способе пополнения
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
      await step.run('charge-user', async () => {
        // Отправляем событие для обработки платежа
        await inngest.send({
          name: 'payment/process',
          data: {
            amount: -costCalculation.cost.stars,
            telegram_id: params.telegram_id,
            type: 'money_expense' as TransactionType,
            description: `🎬 Создание видео из текста (${costCalculation.model.title})`,
            bot_name: params.bot_name,
            service_type: ModeEnum.TextToVideo,
            operation_id: operationId,
          },
        })

        return { charged: true }
      })

      // Шаг 7: Генерация видео через API
      const videoResult = await step.run('generate-video', async () => {
        // Симуляция ошибки API для тестирования
        if (params._test?.api_error) {
          throw new Error('API error (test)')
        }

        try {
          console.log('🎬 Запуск генерации видео:', {
            description: 'Starting video generation',
            model: costCalculation.model.id,
            prompt: params.prompt,
            telegram_id: params.telegram_id,
            operation_id: operationId,
          })

          // Получаем настройки API из конфигурации модели
          const apiModel = costCalculation.model.api.model
          
          // Подготавливаем данные для запроса в зависимости от модели
          const apiInput = typeof costCalculation.model.api.input === 'function'
            ? costCalculation.model.api.input(params.aspect_ratio)
            : costCalculation.model.api.input

          // Здесь должен быть реальный вызов API для генерации видео
          // Сейчас используем заглушку для тестирования
          if (!process.env.REPLICATE_API_TOKEN) {
            throw new Error('REPLICATE_API_TOKEN missing')
          }
          
          // Используем Replicate API для генерации видео
          const response = await axios.post(
            'https://api.replicate.com/v1/predictions',
            {
              version: apiModel,
              input: {
                prompt: params.prompt,
                ...apiInput,
              },
            },
            {
              headers: {
                'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
              },
            }
          )
          
          console.log('✅ Запрос на генерацию видео отправлен:', {
            description: 'Video generation request sent',
            prediction_id: response.data.id,
            status: response.data.status,
            operation_id: operationId,
          })
          
          // Получаем ID предсказания для проверки статуса
          const predictionId = response.data.id
          
          // Функция для проверки статуса генерации
          const checkStatus = async (): Promise<VideoResult> => {
            const statusResponse = await axios.get(
              `https://api.replicate.com/v1/predictions/${predictionId}`,
              {
                headers: {
                  'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
                  'Content-Type': 'application/json',
                },
              }
            )
            
            console.log('🔍 Проверка статуса генерации видео:', {
              description: 'Checking video generation status',
              status: statusResponse.data.status,
              operation_id: operationId,
            })
            
            if (['succeeded', 'completed'].includes(statusResponse.data.status)) {
              // Успешная генерация
              const outputUrl = statusResponse.data.output
              
              return {
                success: true,
                videoUrl: typeof outputUrl === 'string' ? outputUrl : outputUrl[0],
                previewUrl: statusResponse.data.urls?.get || null,
              }
            } else if (['failed', 'canceled'].includes(statusResponse.data.status)) {
              // Ошибка генерации
              throw new Error(`Video generation failed: ${statusResponse.data.error || 'Unknown error'}`)
            } else {
              // Продолжаем проверку статуса
              await new Promise(resolve => setTimeout(resolve, 3000))
              return checkStatus()
            }
          }
          
          // Запускаем проверку статуса до завершения операции
          return await checkStatus()
        } catch (error) {
          console.error('❌ Ошибка при генерации видео:', {
            description: 'Error generating video',
            error: error instanceof Error ? error.message : 'Unknown error',
            telegram_id: params.telegram_id,
            operation_id: operationId,
          })
          
          return {
            success: false,
            error: error instanceof Error ? error : new Error('Unknown video generation error'),
          }
        }
      })

      // Шаг 8: Обработка результата и отправка видео пользователю
      if (videoResult.success) {
        videoUrl = videoResult.videoUrl
        previewUrl = videoResult.previewUrl || null
        
        console.log('✅ Видео успешно создано:', {
          description: 'Video successfully generated',
          videoUrl,
          previewUrl,
          telegram_id: params.telegram_id,
          operation_id: operationId,
        })
        
        const botResult = getBotByName(params.bot_name)
        if (!botResult?.bot) {
          throw new Error(`Bot ${params.bot_name} not found`)
        }
        const { bot } = botResult
        
        // Отправляем предупреждение о загрузке видео
        await bot.telegram.sendMessage(
          params.telegram_id,
          params.is_ru
            ? '⏳ Видео создано, загружаем...'
            : '⏳ Video created, uploading...'
        )
        
        // Проверяем что URL не null перед отправкой
        if (!videoUrl) {
          throw new Error('Video URL is null')
        }
        
        // Отправляем видео пользователю
        await bot.telegram.sendVideo(
          params.telegram_id,
          videoUrl,
          {
            caption: params.is_ru
              ? `🎬 Ваше видео по запросу: "${params.prompt}"\n\nМодель: ${costCalculation.model.title}`
              : `🎬 Your video for the prompt: "${params.prompt}"\n\nModel: ${costCalculation.model.title}`,
          }
        )
        
        return {
          success: true,
          videoUrl,
          prompt: params.prompt,
          model: costCalculation.model.id,
          operationId,
        }
      } else {
        // Обработка ошибки генерации видео
        throw videoResult.error
      }
    } catch (error) {
      console.error('❌ Ошибка при обработке запроса на создание видео:', {
        description: 'Error processing video creation request',
        error: error instanceof Error ? error.message : 'Unknown error',
        telegram_id: validatedParams?.telegram_id,
        operation_id: operationId,
      })
      
      // Возвращаем баланс пользователю в случае ошибки
      if (validatedParams && operationId) {
        try {
          await inngest.send({
            name: 'payment/process',
            data: {
              amount: calculateModeCost({ mode: ModeEnum.TextToVideo }).stars,
              telegram_id: validatedParams.telegram_id,
              type: 'refund' as TransactionType,
              description: '↩️ Возврат средств за неудачную генерацию видео',
              bot_name: validatedParams.bot_name,
              service_type: ModeEnum.TextToVideo,
              operation_id: `refund-${operationId}`,
            },
          })
          
          console.log('✅ Возврат средств за неудачную генерацию:', {
            description: 'Refund for failed generation',
            telegram_id: validatedParams.telegram_id,
            operation_id: operationId,
          })
        } catch (refundError) {
          console.error('❌ Ошибка при возврате средств:', {
            description: 'Error during refund',
            error: refundError instanceof Error ? refundError.message : 'Unknown error',
            telegram_id: validatedParams.telegram_id,
            operation_id: operationId,
          })
        }
      }
      
      // Отправляем сообщение об ошибке пользователю
      if (validatedParams) {
        try {
          const botResult = getBotByName(validatedParams.bot_name)
          if (botResult?.bot) {
            await errorMessage(
              error instanceof Error ? error : new Error('Unknown error'),
              validatedParams.telegram_id,
              validatedParams.is_ru
            )
          }
        } catch (notifyError) {
          console.error('❌ Не удалось отправить уведомление об ошибке пользователю:', {
            description: 'Failed to send error notification to user',
            error: notifyError instanceof Error ? notifyError.message : 'Unknown error',
            telegram_id: validatedParams.telegram_id,
          })
        }
      }
      
      // Отправляем уведомление администратору
      try {
        await errorMessageAdmin(
          error instanceof Error ? error : new Error(`TextToVideo Error: ${String(error)}`)
        )
      } catch (adminNotifyError) {
        console.error('❌ Не удалось отправить уведомление администратору:', {
          description: 'Failed to notify admin',
          error: adminNotifyError instanceof Error ? adminNotifyError.message : 'Unknown error',
        })
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        telegram_id: validatedParams?.telegram_id,
        operation_id: operationId,
      }
    }
  }
) 