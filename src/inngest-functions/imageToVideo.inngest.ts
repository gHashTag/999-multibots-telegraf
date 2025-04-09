import { inngest } from '@/inngest-functions/clients'
import { getBotByName } from '@/core/bot'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum, calculateModeCost } from '@/price/helpers/modelsCost'
import { sendBalanceMessage } from '@/price/helpers'
import axios from 'axios'
import { getUserBalance } from '@/core/supabase/getUserBalance'

/**
 * Интерфейс события для генерации видео из изображения
 */
interface ImageToVideoEventData {
  telegram_id: string
  image_url: string
  is_ru?: boolean
  bot_name: string
  model_id?: string
  aspect_ratio?: string
  duration?: number
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
type VideoResult = {
  url: string
  duration: number
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
      const costResult = calculateModeCost({ mode: ModeEnum.ImageToVideo })
      const cost = costResult.stars

      if (userBalance < cost) {
        const { bot } = getBotByName(validatedParams.bot_name)
        if (!bot) {
          throw new Error(`Bot ${validatedParams.bot_name} not found`)
        }
        await sendBalanceMessage(
          validatedParams.telegram_id,
          userBalance,
          cost,
          validatedParams.is_ru || false,
          bot.telegram
        )
        return
      }
    }

    // Обрабатываем платеж
    if (!validatedParams.test?.skip_payment) {
      const costResult = calculateModeCost({ mode: ModeEnum.ImageToVideo })
      await inngest.send({
        name: 'payment/process',
        data: {
          telegram_id: validatedParams.telegram_id,
          amount: costResult.stars,
          type: 'money_expense',
          description: validatedParams.is_ru
            ? 'Генерация видео из изображения'
            : 'Image to video generation',
          bot_name: validatedParams.bot_name,
          service_type: ModeEnum.ImageToVideo,
        },
      })
    }

    // Генерируем видео
    let videoResult: VideoResult | null = null

    if (!validatedParams.test?.skip_generation) {
      try {
        const response = await axios.post(
          process.env.VIDEO_API_URL + '/image-to-video',
          {
            image_url: validatedParams.image_url,
            model_id: validatedParams.model_id,
            aspect_ratio: validatedParams.aspect_ratio,
            duration: validatedParams.duration,
          }
        )

        videoResult = {
          url: response.data.url,
          duration: response.data.duration,
        }
      } catch (error) {
        console.error('Error generating video:', error)
        throw error
      }
    }

    // Отправляем результат
    if (!validatedParams.test?.skip_sending && videoResult) {
      await step.run('send-result', async () => {
        const botResult = getBotByName(validatedParams.bot_name)
        if (!botResult.bot) {
          throw new Error('🚫 Бот не найден')
        }

        await botResult.bot.telegram.sendVideo(
          validatedParams.telegram_id,
          videoResult.url,
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
