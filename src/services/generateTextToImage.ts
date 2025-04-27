import axios from 'axios'

import { API_URL, SECRET_API_KEY } from '@/config'
import { MyContext } from '@/interfaces'

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
    const url = `${API_URL}/generate/text-to-image`
    console.log(url, 'url')

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
