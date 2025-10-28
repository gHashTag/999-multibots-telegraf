import axios, { isAxiosError } from 'axios'

import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL,
  LOCAL_SERVER_URL,
} from '@/config'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/enhancedLogger'

export async function generateNeuroImageV2(
  prompt: string,
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

  logger.debug('Starting generateNeuroImage with:', {
    prompt,
    numImages,
    telegram_id,
    botName,
  })

  try {
    const url = `${
      isDev ? LOCAL_SERVER_URL : API_SERVER_URL
    }/generate/neuro-photo-v2`

    const response = await axios.post(
      url,
      {
        prompt,
        num_images: numImages || 1,
        telegram_id,
        is_ru: isRussianFromState(ctx),
        bot_name: botName,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      }
    )
    logger.info('Neuro image generation response received', {
      hasData: !!response.data,
      dataType: typeof response.data,
      dataKeys:
        response.data && typeof response.data === 'object'
          ? Object.keys(response.data)
          : 'not an object',
    })
    return response.data
  } catch (error) {
    if (isAxiosError(error)) {
      logger.error('API Error:', error.response?.data || error.message)
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
      logger.error('Error generating image:', error)
    }
    return null
  }
}
