import axios from 'axios'

import { isDev, SECRET_API_KEY, LOCAL_SERVER_URL } from '@/config'
import { isRussian } from '@/helpers/language'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'

// Используем заглушку, если переменная не установлена
const API_URL =
  process.env.ELESTIO_URL || 'https://ai-server-u14194.vm.elestio.app'

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
  await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

  try {
    const url = `${isDev ? LOCAL_SERVER_URL : API_URL}/generate/neuro-photo`
    console.log(url, 'url')

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
