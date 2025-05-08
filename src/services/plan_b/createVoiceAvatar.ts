import { supabase } from '@/core/supabase'
import { createVoiceElevenLabs } from '@/core/elevenlabs/createVoiceElevenLabs'
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
    console.log('createVoiceAvatar', { fileUrl, telegram_id, username, isRu })

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

    const voiceId = await createVoiceElevenLabs({
      fileUrl,
      username,
    })
    logger.info('[createVoiceAvatar] createVoiceElevenLabs call finished.', {
      telegram_id,
      voiceId,
    })

    console.log('Received voiceId:', voiceId)

    if (!voiceId) {
      console.error('Ошибка при создании голоса: voiceId не получен')
      throw new Error('Ошибка при создании голоса')
    }

    // Сохранение voiceId в таблицу users
    const { error } = await supabase
      .from('users')
      .update({ voice_id_elevenlabs: voiceId })
      .eq('username', username)

    if (error) {
      console.error('Ошибка при сохранении voiceId в базу данных:', error)
      throw new Error('Ошибка при сохранении данных')
    }

    await ctx.telegram.sendMessage(
      telegram_id,
      isRu
        ? '🎤 Голос для аватара успешно создан. \n Используйте 🎙️ Текст в голос в меню, чтобы проверить'
        : '🎤 Voice for avatar successfully created! \n Use the 🎙️ Text to speech in the menu to check'
    )

    return { voiceId }
  } catch (error) {
    console.error('Error in createVoiceAvatar:', error)
    await sendServiceErrorToUser(ctx, telegram_id, error as Error, isRu)
    await sendServiceErrorToAdmin(ctx, telegram_id, error as Error)
    throw error
  }
}
