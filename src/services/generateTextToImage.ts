import axios from 'axios'

import { ELESTIO_URL, isDev, SECRET_API_KEY, LOCAL_SERVER_URL } from '@/config'
import { MyContext } from '@/interfaces'

// Используем заглушку, если переменная не установлена
const API_URL = process.env.ELESTIO_URL || 'https://example.com'

export const generateTextToImage = async (
  prompt: string,
  model_type: string,
  num_images: number,
  telegram_id: string,
  isRu: boolean,
  ctx: MyContext,
  botName: string
) => {
  try {
    const url = `${isDev ? LOCAL_SERVER_URL : API_URL}/generate/text-to-image`
    console.log(url, 'url')

    // В случае отсутствия реального URL просто пропускаем вызов API
    if (API_URL === 'https://example.com') {
      console.log('⚠️ ELESTIO_URL not set, skipping text-to-image API call')
      try {
        if (ctx.reply) {
          await ctx.reply(
            isRu
              ? 'Функция генерации изображений временно недоступна.'
              : 'Image generation function is temporarily unavailable.'
          )
        }
      } catch (err) {
        console.error('Ошибка при отправке сообщения о недоступности:', err)
      }
      return
    }

    await axios.post(
      url,
      {
        prompt,
        model: model_type,
        num_images,
        telegram_id,
        username: ctx.from?.username,
        is_ru: isRu,
        bot_name: botName,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      }
    )
  } catch (error) {
    console.error('Ошибка при генерации изображения:', error)
    try {
      if (ctx.reply) {
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
            : 'An error occurred during image generation. Please try again later.'
        )
      }
    } catch (err) {
      console.error('Ошибка при отправке сообщения об ошибке:', err)
    }
    throw error
  }
}
