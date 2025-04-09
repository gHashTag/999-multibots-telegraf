import { inngest } from '@/inngest-functions/clients'
import { getBotByName } from '@/core/bot'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum, calculateModeCost } from '@/price/helpers/modelsCost'
import { sendBalanceMessage } from '@/price/helpers'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { getUserBalance } from '@/core/supabase/getUserBalance'

/**
 * Интерфейс события для генерации видео из изображения
 */
type ImageToVideoEventData = {
  telegram_id: string
  bot_name: string
  image_url: string
  model_id?: string
  duration?: number
  is_ru: boolean
  test?: {
    skip_balance_check?: boolean
    skip_payment?: boolean
    skip_generation?: boolean
    skip_sending?: boolean
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
    const validatedParams = event.data as ImageToVideoEventData

    if (!validatedParams) {
      throw new Error('🚫 Не переданы параметры')
    }

    // Получаем информацию о пользователе
    const userResult = await step.run('get-user', async () => {
      const user = await getUserByTelegramId(validatedParams.telegram_id)
      if (!user) {
        throw new Error('🚫 Пользователь не найден')
      }
      return user
    })

    // Получаем баланс пользователя
    const userBalance = await step.run('get-balance', async () => {
      return await getUserBalance(
        validatedParams.telegram_id,
        validatedParams.bot_name
      )
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
    if (!validatedParams.test?.skip_balance_check) {
      const cost = calculateModeCost({ mode: ModeEnum.ImageToVideo }).stars

      if (userBalance < cost) {
        const botResult = getBotByName(validatedParams.bot_name)
        if (!botResult.bot) {
          throw new Error('🚫 Бот не найден')
        }

        await sendBalanceMessage(
          validatedParams.telegram_id,
          userBalance,
          cost,
          validatedParams.is_ru,
          botResult.bot.telegram
        )
        return { insufficient_balance: true }
      }
    }

    // Списываем средства
    if (!validatedParams.test?.skip_payment) {
      await step.run('charge-user', async () => {
        await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id: validatedParams.telegram_id,
            amount: calculateModeCost({ mode: ModeEnum.ImageToVideo }).stars,
            type: 'money_expense',
            description: validatedParams.is_ru
              ? 'Генерация видео из изображения'
              : 'Image to video generation',
            bot_name: validatedParams.bot_name,
            service_type: ModeEnum.ImageToVideo,
          },
        })
      })
    }

    // Генерируем видео
    let videoResult: VideoResult = { success: false }

    if (!validatedParams.test?.skip_generation) {
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
    if (!validatedParams.test?.skip_sending && videoResult.videoUrl) {
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

        // Увеличиваем уровень пользователя
        await updateUserLevelPlusOne(
          validatedParams.telegram_id,
          userResult.level || 0
        )
      })
    }

    return videoResult
  }
)
