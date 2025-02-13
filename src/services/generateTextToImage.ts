import axios from 'axios'

import { ELESTIO_URL, isDev, SECRET_API_KEY } from '@/config'
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
    const url = `${
      isDev ? 'http://localhost:3000' : ELESTIO_URL
    }/generate/text-to-image`
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
    throw error
  }
}
