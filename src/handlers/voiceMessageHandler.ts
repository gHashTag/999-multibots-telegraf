import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { inngest } from '@/inngest-functions/clients'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { calculateModeCost } from '@/price/helpers/modelsCost'

export async function handleVoiceMessage(ctx: MyContext) {
  const isRu = isRussian(ctx)

  try {
    // Проверяем, что сообщение содержит голос
    if (!ctx.message || !('voice' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте голосовое сообщение'
          : '❌ Please send a voice message'
      )
      return
    }

    // Получаем файл голосового сообщения
    const file = await ctx.telegram.getFile(ctx.message.voice.file_id)
    if (!file.file_path) {
      throw new Error('File path not found')
    }

    // Формируем URL для скачивания файла
    const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

    // Отправляем уведомление о начале обработки
    await ctx.reply(
      isRu
        ? '🎙️ Обрабатываю ваше голосовое сообщение...'
        : '🎙️ Processing your voice message...'
    )

    // Отправляем событие в Inngest для обработки
    await inngest.send({
      id: `voice-to-text-${ctx.from?.id}-${Date.now()}-${uuidv4().substring(0, 8)}`,
      name: 'voice-to-text.requested',
      data: {
        fileUrl,
        telegram_id: ctx.from?.id.toString(),
        is_ru: isRu,
        bot_name: ctx.botInfo?.username,
        username: ctx.from?.username,
      },
    })

    // Отправляем событие для обработки платежа
    await inngest.send({
      id: `payment-${ctx.from?.id}-${Date.now()}-${ModeEnum.VoiceToText}-${uuidv4()}`,
      name: 'payment/process',
      data: {
        telegram_id: ctx.from?.id.toString(),
        amount: calculateModeCost({ mode: ModeEnum.VoiceToText }).stars,
        type: 'money_expense',
        description: 'Payment for voice to text conversion',
        bot_name: ctx.botInfo?.username,
        service_type: ModeEnum.VoiceToText,
      },
    })
  } catch (error) {
    logger.error('❌ Ошибка при обработке голосового сообщения:', {
      description: 'Error processing voice message',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: ctx.from?.id,
    })

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке голосового сообщения. Пожалуйста, попробуйте позже.'
        : '❌ An error occurred while processing your voice message. Please try again later.'
    )
  }
}
