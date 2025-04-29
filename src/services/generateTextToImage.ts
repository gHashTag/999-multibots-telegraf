import { MyContext, GenerationResult } from '@/interfaces'
import { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'

import { generateTextToImage as generateTextToImagePlanB } from '@/services/plan_b/generateTextToImage'

export const generateTextToImage = async (
  prompt: string,
  model_type: string,
  num_images: number,
  telegram_id: string,
  isRu: boolean,
  ctx: MyContext,
  bot: Telegraf<MyContext>
): Promise<GenerationResult[]> => {
  try {
    const username = ctx.from?.username ?? 'UnknownUser'

    const results = await generateTextToImagePlanB(
      prompt,
      model_type,
      num_images,
      telegram_id,
      username,
      isRu,
      bot,
      ctx
    )

    return results
  } catch (error) {
    logger.error('❌ Ошибка при вызове локальной generateTextToImage:', {
      error,
      prompt,
      model_type,
      telegram_id,
    })
    try {
      if (ctx.reply) {
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
            : 'An error occurred during image generation. Please try again later.'
        )
      }
    } catch (replyError) {
      logger.error('❌ Ошибка при отправке сообщения об ошибке пользователю:', {
        replyError,
      })
    }
    return []
  }
}
