import { Scenes } from 'telegraf'
import { MyContext } from '@/types'
import { inngest } from '@/inngest-functions/clients'
import { v4 as uuidv4 } from 'uuid'
import { getUserByTelegramIdString } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/types/modes'

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 секунда

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendEventWithRetry(eventData: any, telegramId: number) {
  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info('🔄 Попытка отправки события в Inngest:', {
        attempt,
        description: 'Attempting to send event to Inngest',
        telegram_id: telegramId,
        mode: ModeEnum.TextToSpeech,
      })

      await inngest.send({
        id: `tts-${telegramId}-${Date.now()}-${uuidv4().substring(0, 8)}`,
        name: 'text-to-speech.requested',
        data: eventData,
      })

      logger.info('✅ Событие успешно отправлено в Inngest:', {
        attempt,
        description: 'Event successfully sent to Inngest',
        telegram_id: telegramId,
        mode: ModeEnum.TextToSpeech,
      })

      return true
    } catch (error) {
      lastError = error
      logger.error('❌ Ошибка при отправке события в Inngest:', {
        attempt,
        description: 'Error sending event to Inngest',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegram_id: telegramId,
        mode: ModeEnum.TextToSpeech,
      })

      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1)
        logger.info('⏳ Ожидание перед повторной попыткой:', {
          delay_ms: delay,
          next_attempt: attempt + 1,
          telegram_id: telegramId,
          mode: ModeEnum.TextToSpeech,
        })
        await sleep(delay)
      }
    }
  }

  throw lastError
}

export const textToSpeechWizard = new Scenes.WizardScene<MyContext>(
  'text_to_speech',
  async ctx => {
    const message = ctx.message
    if (!message || !('text' in message)) {
      await ctx.reply(
        (ctx.session.is_ru ?? false)
          ? 'Пожалуйста, отправьте текст для преобразования в речь'
          : 'Please send text to convert to speech'
      )
      return
    }

    const telegramId = ctx.from?.id
    const isRu = ctx.session.is_ru ?? false

    if (!telegramId) {
      logger.error('❌ Отсутствует telegram_id:', {
        description: 'Missing telegram_id in context',
        message,
        mode: ModeEnum.TextToSpeech,
      })
      await ctx.reply(
        isRu
          ? 'Произошла ошибка: не удалось определить пользователя'
          : 'Error: could not identify user'
      )
      ctx.scene.leave()
      return
    }

    try {
      const user = await getUserByTelegramIdString(telegramId.toString())
      if (!user) {
        logger.error('❌ Пользователь не найден:', {
          description: 'User not found',
          telegram_id: telegramId,
          mode: ModeEnum.TextToSpeech,
        })
        await ctx.reply(
          isRu
            ? 'Произошла ошибка: пользователь не найден'
            : 'Error: user not found'
        )
        ctx.scene.leave()
        return
      }

      const voice_id = user.voice_id_elevenlabs
      if (!voice_id) {
        logger.error('❌ Отсутствует voice_id:', {
          description: 'Missing voice_id for user',
          telegram_id: telegramId,
          mode: ModeEnum.TextToSpeech,
        })
        await ctx.reply(
          isRu
            ? 'Сначала создайте голосовой аватар, отправив голосовое сообщение'
            : 'Please create a voice avatar first by sending a voice message'
        )
        ctx.scene.leave()
        return
      }

      logger.info('🎙️ Отправка запроса на генерацию речи:', {
        description: 'Sending text-to-speech request',
        telegram_id: telegramId,
        text_length: message.text.length,
        voice_id,
        mode: ModeEnum.TextToSpeech,
      })

      const eventData = {
        text: message.text,
        voice_id,
        telegram_id: telegramId,
        is_ru: isRu,
        bot_name: ctx.botInfo?.username,
        mode: ModeEnum.TextToSpeech,
      }

      await sendEventWithRetry(eventData, telegramId)

      await ctx.reply(
        isRu
          ? '⏳ Начинаю генерацию речи...'
          : '⏳ Starting speech generation...'
      )
    } catch (error) {
      logger.error('❌ Ошибка в TextToSpeech:', {
        description: 'Error in TextToSpeech scene',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegram_id: telegramId,
        mode: ModeEnum.TextToSpeech,
      })

      await ctx.reply(
        isRu
          ? 'Произошла ошибка при генерации речи. Пожалуйста, попробуйте позже.'
          : 'Error occurred during speech generation. Please try again later.'
      )
    }

    ctx.scene.leave()
    return
  }
)

export default textToSpeechWizard
