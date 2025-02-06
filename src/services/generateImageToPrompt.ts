import axios, { isAxiosError } from 'axios'

import { ELESTIO_URL, isDev, SECRET_API_KEY } from '@/config'
import { MyContext } from '@/interfaces'

if (!process.env.ELESTIO_URL) {
  throw new Error('ELESTIO_URL is not set')
}

export async function generateImageToPrompt(
  imageUrl: string,
  telegram_id: number,
  ctx: MyContext,
  isRu: boolean
): Promise<null> {
  console.log('Starting generateImageToPrompt with:', { imageUrl, telegram_id })

  try {
    const url = `${
      isDev ? 'http://localhost:3000' : ELESTIO_URL
    }/generate/image-to-prompt`
    console.log('url', url)
    await axios.post(
      url,
      {
        image: imageUrl,
        telegram_id,
        username: ctx.from?.username,
        is_ru: isRu,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      }
    )
    return null
  } catch (error) {
    if (isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message)
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при анализе изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred while analyzing the image. Please try again later.'
      )
    } else {
      console.error('Error analyzing image:', error)
    }
    return null
  }
}
