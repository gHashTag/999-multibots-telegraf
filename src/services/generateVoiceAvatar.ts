import { MyContext } from '@/interfaces'
import { inngest } from '@/core/inngest/clients'
import { sendGenericErrorMessage } from '@/menu'

interface VoiceAvatarResponse {
  success: boolean
  message: string
}

export async function generateVoiceAvatar(
  fileUrl: string,
  telegram_id: string,
  ctx: MyContext,
  isRu: boolean,
  botName: string
): Promise<VoiceAvatarResponse> {
  try {
    console.log('📣 Запуск создания голосового аватара:', {
      description: 'Starting voice avatar creation',
      telegram_id,
      username: ctx.from?.username,
    })

    // Отправляем событие в Inngest вместо API-запроса
    await inngest.send({
      name: 'voice-avatar.requested',
      data: {
        fileUrl,
        telegram_id,
        username: ctx.from?.username || telegram_id,
        is_ru: isRu,
        bot_name: botName,
      },
    })

    console.log(
      '📤 Событие для создания голосового аватара отправлено в Inngest',
      {
        description: 'Voice avatar creation event sent to Inngest',
        telegram_id,
      }
    )

    return {
      success: true,
      message: isRu
        ? 'Запрос на создание голосового аватара принят в обработку'
        : 'Voice avatar creation request has been accepted for processing',
    }
  } catch (error) {
    console.error('🔥 Ошибка при отправке события в Inngest:', {
      description: 'Error sending event to Inngest',
      error,
    })

    await sendGenericErrorMessage(ctx, isRu, error)

    throw error
  }
}
