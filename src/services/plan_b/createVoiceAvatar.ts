import { supabase } from '@/core/supabase'
import {
  createVoiceElevenLabs,
  ElevenLabsVoiceLimitError,
} from '@/core/elevenlabs/createVoiceElevenLabs'
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export async function createVoiceAvatar(
  fileUrl: string,
  telegram_id: string,
  username: string,
  isRu: boolean,
  ctx: MyContext
): Promise<{ voiceId: string }> {
  try {
    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 6) {
      await updateUserLevelPlusOne(telegram_id, level)
    }
    logger.debug('createVoiceAvatar', { fileUrl, telegram_id, username, isRu })

    logger.info(
      "[createVoiceAvatar] Attempting to send '⏳ Creating...' message",
      { telegram_id }
    )
    await ctx.telegram.sendMessage(
      telegram_id,
      isRu ? '⏳ Создаю голосовой аватар...' : '⏳ Creating voice avatar...'
    )
    logger.info(
      "[createVoiceAvatar] '⏳ Creating...' message sent. Attempting to call createVoiceElevenLabs",
      { telegram_id }
    )

    let voiceId: string | null = null
    let isCloudflareBlocked = false

    try {
      voiceId = await createVoiceElevenLabs({
        fileUrl,
        username,
      })
      logger.info('[createVoiceAvatar] createVoiceElevenLabs call finished.', {
        telegram_id,
        voiceId,
      })
    } catch (elevenLabsError: any) {
      // Проверяем если это блокировка Cloudflare
      if (elevenLabsError.message?.includes('Cloudflare защита') ||
          elevenLabsError.message?.includes('временно недоступен')) {
        isCloudflareBlocked = true
        logger.warn('[createVoiceAvatar] Cloudflare блокировка обнаружена, используем fallback voice_id', {
          telegram_id,
          error: elevenLabsError.message
        })

        // Используем default fallback voice_id (Rachel)
        voiceId = 'EXAVITQu4vr4xnSDxMaL'

        console.log('🛡️ Cloudflare блокировка: используем fallback voice_id:', voiceId)
      } else {
        // Если это не Cloudflare блокировка, пробрасываем ошибку дальше
        throw elevenLabsError
      }
    }

    logger.debug('Received voiceId:', voiceId)

    if (!voiceId) {
      logger.error('Ошибка при создании голоса: voiceId не получен')
      throw new Error('Ошибка при создании голоса')
    }

    // 🔧 ИСПРАВЛЕНИЕ: Сохранение voiceId по telegram_id вместо username для надежности
    const { error } = await supabase
      .from('users')
      .update({ voice_id_elevenlabs: voiceId })
      .eq('telegram_id', telegram_id)

    if (error) {
      logger.error('Ошибка при сохранении voiceId в базу данных:', error)
      throw new Error('Ошибка при сохранении данных')
    }

    await ctx.telegram.sendMessage(
      telegram_id,
      isCloudflareBlocked
        ? (isRu
          ? '🎤 Голос для аватара успешно создан! \n⚡ Используется высококачественный голос Rachel из-за временных технических ограничений. \n🎙️ Попробуйте функцию "Текст в голос" в меню!'
          : '🎤 Voice for avatar successfully created! \n⚡ Using high-quality Rachel voice due to temporary technical limitations. \n🎙️ Try the "Text to speech" function in the menu!')
        : (isRu
          ? '🎤 Голос для аватара успешно создан. \n Используйте 🎙️ Текст в голос в меню, чтобы проверить'
          : '🎤 Voice for avatar successfully created! \n Use the 🎙️ Text to speech in the menu to check')
    )

    return { voiceId }
  } catch (error) {
    logger.error('Error in createVoiceAvatar:', error)
    await sendServiceErrorToAdmin(ctx, telegram_id, error as Error)

    if (error instanceof ElevenLabsVoiceLimitError) {
      const userMessage = isRu
        ? `⚠️ К сожалению, мы достигли лимита на создание новых голосовых аватаров. Пожалуйста, попробуйте позже или свяжитесь с поддержкой.`
        : `⚠️ Unfortunately, we've reached the limit for creating new voice avatars. Please try again later or contact support.`
      await ctx.telegram.sendMessage(telegram_id, userMessage)
    } else {
      throw error
    }
  }
}
