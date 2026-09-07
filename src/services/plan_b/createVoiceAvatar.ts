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
import { logger } from '@/utils/logger'

export async function createVoiceAvatar(
  fileUrl: string,
  telegram_id: string,
  username: string,
  isRu: boolean,
  ctx: MyContext
): Promise<{ voiceId: string; isFallback?: boolean }> {
  try {
    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    // Do NOT log fileUrl: it is https://api.telegram.org/file/bot<BOT_TOKEN>/...  telegram-api-root-ok
    // so it embeds the full bot token (a full-control credential) plus an
    // unauthenticated link to the user's voice recording (biometric PII).
    // console.log bypasses the winston redactBotToken redaction (which only runs
    // inside the winston printf), so the token would hit stdout/Railway verbatim
    // -- same gap emailWizard documents. Log only the non-sensitive fields.
    console.log('createVoiceAvatar', { telegram_id, username, isRu })

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
      if (
        elevenLabsError.message?.includes('Cloudflare защита') ||
        elevenLabsError.message?.includes('временно недоступен')
      ) {
        isCloudflareBlocked = true
        logger.warn(
          '[createVoiceAvatar] Cloudflare блокировка обнаружена, используем fallback voice_id',
          {
            telegram_id,
            error: elevenLabsError.message,
          }
        )

        // Используем default fallback voice_id (Rachel)
        voiceId = 'EXAVITQu4vr4xnSDxMaL'

        console.log(
          '🛡️ Cloudflare блокировка: используем fallback voice_id:',
          voiceId
        )
      } else {
        // Если это не Cloudflare блокировка, пробрасываем ошибку дальше
        throw elevenLabsError
      }
    }

    console.log('Received voiceId:', voiceId)

    if (!voiceId) {
      console.error('Ошибка при создании голоса: voiceId не получен')
      throw new Error('Ошибка при создании голоса')
    }

    // Persist the voice id and advance the quest ONLY for a REAL clone. On the
    // Cloudflare-block fallback, voiceId is the STOCK Rachel id, not the user's
    // clone: persisting it would OVERWRITE a previously created real clone (a
    // paid artifact), and advancing the level would mark the quest step done on
    // a voice the user never made. getVoiceId already returns the Rachel
    // fallback when voice_id_elevenlabs is null, so downstream TTS still works.
    // Mirrors the caller, which charges only when !isFallback.
    if (!isCloudflareBlocked) {
      // Save voiceId keyed by telegram_id (not username) for reliability.
      const { error } = await supabase
        .from('users')
        .update({ voice_id_elevenlabs: voiceId })
        .eq('telegram_id', telegram_id)

      if (error) {
        console.error('Ошибка при сохранении voiceId в базу данных:', error)
        throw new Error('Ошибка при сохранении данных')
      }

      // Advance the quest level ONLY after the voice was created AND persisted.
      // Previously this bump ran at the top of the function -- before
      // createVoiceElevenLabs and before the voice_id_elevenlabs save -- so a
      // non-Cloudflare ElevenLabs failure, a missing voiceId, or a failed save
      // unwound the function (outer catch) with level advanced 6 -> 7 but
      // voice_id_elevenlabs still null: the quest marked the voice-avatar step
      // done while the artifact was missing, and downstream TTS/lipsync then read
      // a null voice_id. Running it here couples the level to a real, saved voice.
      // Still idempotent across retries -- it only fires at level === 6.
      if (level === 6) {
        await updateUserLevelPlusOne(telegram_id, level)
      }
    }

    await ctx.telegram.sendMessage(
      telegram_id,
      isCloudflareBlocked
        ? isRu
          ? '🎤 Голос для аватара успешно создан! \n⚡ Используется высококачественный голос Rachel из-за временных технических ограничений. \n🎙️ Попробуйте функцию "Текст в голос" в меню!'
          : '🎤 Voice for avatar successfully created! \n⚡ Using high-quality Rachel voice due to temporary technical limitations. \n🎙️ Try the "Text to speech" function in the menu!'
        : isRu
          ? '🎤 Голос для аватара успешно создан. \n Используйте 🎙️ Текст в голос в меню, чтобы проверить'
          : '🎤 Voice for avatar successfully created! \n Use the 🎙️ Text to speech in the menu to check'
    )

    // isFallback flags the Cloudflare-block substitution: voiceId is the STOCK
    // Rachel voice, NOT the user's clone. The caller must not charge for a clone
    // that was never made (the wizard bills "only when a voice was actually
    // created" -- a stock substitute is not that).
    return { voiceId, isFallback: isCloudflareBlocked }
  } catch (error) {
    console.error('Error in createVoiceAvatar:', error)
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
