import { MyContext } from '@/interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { createVoiceAvatar as createVoiceAvatarPlanB } from './plan_b/createVoiceAvatar'
import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'

interface VoiceAvatarResponse {
  success: boolean
  message: string
  voiceId?: string
}

export async function generateVoiceAvatar(
  fileUrl: string,
  prompt: string,
  telegram_id: string,
  ctx: MyContext,
  isRu: boolean,
  botName: string
): Promise<VoiceAvatarResponse | null> {
  logger.info('[generateVoiceAvatar] Starting refactored function', {
    fileUrl,
    telegram_id,
    botName,
  })
  try {
    const botData = getBotByName(botName)
    if (!botData || !botData.bot) {
      logger.error('[generateVoiceAvatar] Bot instance not found', {
        botName,
      })
      throw new Error(`Bot instance not found for name: ${botName}`)
    }
    const bot = botData.bot

    const username = ctx.from?.username
    if (!username) {
      logger.error('[generateVoiceAvatar] Username not found in context', {
        telegram_id,
      })
      throw new Error('Username not found')
    }

    const result = await createVoiceAvatarPlanB(
      fileUrl,
      telegram_id,
      username,
      isRu,
      bot
    )

    logger.info('[generateVoiceAvatar] Voice creation successful', {
      telegram_id,
      voiceId: result.voiceId,
    })
    return {
      success: true,
      message: isRu ? 'Голос успешно создан' : 'Voice created successfully',
      voiceId: result.voiceId,
    }
  } catch (error) {
    logger.error('[generateVoiceAvatar] Error generating voice avatar:', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : isRu
            ? 'Неизвестная ошибка создания голоса'
            : 'Unknown voice creation error',
    }
  }
}
