import axios, { isAxiosError } from 'axios'

import { isDev, SECRET_API_KEY } from '@/config'
import { isRussian } from '@/helpers/language'
import { MyContext, ModelUrl } from '@/interfaces'

export async function generateNeuroImageV2(
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
    const url = `${
      isDev ? 'http://localhost:3000' : process.env.ELESTIO_URL
    }/generate/neuro-photo-v2`

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
    if (isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message)
      if (error.response?.data?.error?.includes('NSFW')) {
        await ctx.reply(
          'Извините, генерация изображения не удалась из-за обнаружения неподходящего контента.'
        )
      } else {
        await ctx.reply(
          'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
        )
      }
    } else {
      console.error('Error generating image:', error)
    }
    return null
  }
}
