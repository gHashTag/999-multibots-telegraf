import axios from 'axios'

import { API_URL, SECRET_API_KEY } from '@/config'
import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'

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
    return await generateTextToImageDirect(
      prompt,
      model_type,
      num_images,
      telegram_id,
      ctx.from?.username || '',
      isRu,
      ctx
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
