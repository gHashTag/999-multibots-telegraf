import { MyContext } from '@/interfaces'
import { generateSpeech as generateSpeechPlanB } from './plan_b/generateSpeech'
import { logger } from '@/utils/logger'

interface TextToSpeechResponse {
  success: boolean
  audioUrl?: string
  message?: string
}

export async function generateTextToSpeech(
  text: string,
  voice_id: string,
  telegram_id: string,
  ctx: MyContext
): Promise<TextToSpeechResponse> {
  const botName = ctx.botInfo?.username
  if (!botName) {
    logger.error(
      'Не удалось определить botName из контекста в generateTextToSpeech'
    )
    return {
      success: false,
      message: 'Could not determine bot name from context',
    }
  }

  logger.info(
    'Перенаправление вызова generateTextToSpeech на реализацию Plan B',
    {
      text,
      voice_id,
      telegram_id,
      botName,
    }
  )

  try {
    const isRu = ctx.from?.language_code === 'ru'
    const telegram = ctx.telegram

    if (!telegram) {
      throw new Error('Telegram API instance not found in context')
    }
    if (!ctx) {
      throw new Error('Telegraf context (ctx) is missing')
    }

    const result = await generateSpeechPlanB({
      text,
      voice_id,
      telegram_id,
      is_ru: isRu,
      bot_name: botName,
      ctx,
    })

    logger.info('Успешная генерация речи (Plan B)', {
      audioUrl: result.audioUrl,
      telegram_id,
    })
    return {
      success: true,
      audioUrl: result.audioUrl,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Ошибка при вызове generateSpeechPlanB', {
      error: errorMessage,
      telegram_id,
      text,
      voice_id,
    })
    return {
      success: false,
      message: errorMessage,
    }
  }
}
