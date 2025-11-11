import axios from 'axios'

import { isDev, SECRET_API_KEY, LOCAL_SERVER_URL } from '@/config'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'

// Используем заглушку, если переменная не установлена
const API_URL =
  process.env.SERVER_API_URL ||
  'https://three-head-dragon.shop'

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
    // ✅ ИСПРАВЛЕНО: Используем локальный AI сервис напрямую
    // Не обращаемся к внешнему API

    // Используем локальные AI сервисы для генерации
    const { generateNeuroPhotoHybrid } = await import('./generateNeuroPhotoHybrid')

    logger.info('Using local AI service for neuro image generation')

    const response = await generateNeuroPhotoHybrid(
      prompt,
      model_url,
      numImages,
      telegram_id,
      ctx,
      botName,
      null // explicitAspectRatio is optional
    )
    logger.info('Neuro image generation response received', {
      hasData: !!response?.data,
      dataType: typeof response?.data,
      success: !!response?.success,
      hasUrls: !!response?.urls,
    })
    return response
  } catch (error) {
    console.error('Ошибка при генерации нейроизображения:', error)

    if (ctx.reply) {
      await ctx.reply(
        isRussianFromState(ctx)
          ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred during image generation. Please try again later.'
      )
    }

    return null
  }
}
