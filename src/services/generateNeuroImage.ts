import axios, { isAxiosError } from 'axios'

import { isDev, SECRET_API_KEY, ELESTIO_URL, LOCAL_SERVER_URL } from '@/config'
import { isRussian } from '@/helpers/language'
import { MyContext, ModelUrl } from '@/interfaces'

// Используем заглушку, если переменная не установлена
const API_URL = process.env.ELESTIO_URL || 'https://example.com'

export async function generateNeuroImage(
  prompt: string,
  model_url: ModelUrl,
  numImages: number,
  telegram_id: string,
  ctx: MyContext,
  botName: string
): Promise<{ data: string } | null> {
  if (!ctx.session.prompt) {
    throw new Error('Prompt not found')
  }

  if (!ctx.session.userModel) {
    throw new Error('User model not found')
  }

  if (!numImages) {
    throw new Error('Num images not found')
  }

  console.log('Starting generateNeuroImage with:', {
    prompt,
    model_url,
    numImages,
    telegram_id,
    botName,
  })

  try {
    const url = `${isDev ? LOCAL_SERVER_URL : API_URL}/generate/neuro-photo`

    // В случае отсутствия реального URL просто пропускаем вызов API
    if (API_URL === 'https://example.com') {
      console.log('⚠️ ELESTIO_URL not set, skipping neuro-photo API call')
      if (ctx.reply) {
        await ctx.reply(
          isRussian(ctx)
            ? 'Функция генерации нейроизображений временно недоступна.'
            : 'Neural image generation function is temporarily unavailable.'
        )
      }
      return null
    }

    const response = await axios.post(
      url,
      {
        prompt,
        model_url,
        num_images: numImages || 1,
        telegram_id,
        username: ctx.from?.username,
        is_ru: isRussian(ctx),
        bot_name: botName,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      }
    )
    console.log(response.data, 'response.data')
    return response.data
  } catch (error) {
    console.error('Ошибка при генерации нейроизображения:', error)

    if (ctx.reply) {
      await ctx.reply(
        isRussian(ctx)
          ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred during image generation. Please try again later.'
      )
    }

    return null
  }
}
