import { v4 as uuidv4 } from 'uuid'
import { inngest } from '@/inngest-functions/clients'
import { TelegramId } from '@/interfaces/telegram.interface'
import { isRussian } from '@/helpers/language'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { generateNeuroImageV2 as PlanBGenerateNeuroImageV2 } from './plan_b/generateNeuroImageV2'

// TODO: добавить тесты (unit/integration) после ручной проверки
export async function generateNeuroImageV2(
  prompt: string,
  numImages: number,
  telegram_id: TelegramId,
  ctx: MyContext,
  botName: string
): Promise<any> { // временно any для ручной проверки
  if (!ctx.session.prompt) {
    logger.warn('generateNeuroImageV2: prompt not found в ctx.session', { telegram_id, ctxSession: ctx.session })
    throw new Error('Prompt not found')
  }

  if (!ctx.session.userModel) {
    logger.warn('generateNeuroImageV2: userModel not found в ctx.session', { telegram_id, ctxSession: ctx.session })
    throw new Error('User model not found')
  }

  if (!numImages) {
    logger.warn('generateNeuroImageV2: numImages not found', { telegram_id, numImages })
    throw new Error('Num images not found')
  }

  logger.info({
    message: '🚀 Начало генерации NeurophotoV2',
    description: 'Starting NeurophotoV2 generation',
    prompt: prompt.substring(0, 50) + '...',
    numImages,
    telegram_id,
    botName,
  })

  try {
    logger.info('Перед вызовом Plan B generateNeuroImageV2', { prompt, numImages, telegram_id, is_ru: ctx.session.is_ru, botName })
    return await PlanBGenerateNeuroImageV2(
      prompt,
      numImages,
      telegram_id.toString(),
      ctx.session.is_ru,
      botName
    )
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке события в Inngest',
      description: 'Error sending event to Inngest',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Отправляем пользователю сообщение об ошибке
    await ctx.reply(
      isRussian(ctx)
        ? '😔 Произошла ошибка при отправке запроса. Пожалуйста, попробуйте позже.'
        : '😔 An error occurred while sending the request. Please try again later.'
    )

    return null
  }
}
