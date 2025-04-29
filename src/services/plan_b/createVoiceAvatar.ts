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
import logger from '@/utils/logger'

export async function createVoiceAvatar(
  fileUrl: string,
  telegram_id: string,
  username: string,
  isRu: boolean,
  bot: Telegraf<MyContext>
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
    await bot.telegram.sendMessage(
      telegram_id,
      isRu ? '⏳ Создаю голосовой аватар...' : '⏳ Creating voice avatar...'
    )

    const voiceId = await createVoiceElevenLabs({
      fileUrl,
      username,
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

    await bot.telegram.sendMessage(
      telegram_id,
      isRu
        ? '🎤 Голос для аватара успешно создан. \n Используйте 🎙️ Текст в голос в меню, чтобы проверить'
        : '🎤 Voice for avatar successfully created! \n Use the 🎙️ Text to speech in the menu to check'
    )

    return { voiceId }
  } catch (error) {
    console.error('Error in createVoiceAvatar:', error)
    // Передаем bot_name в хелперы
    const botName = bot.context.botName
    if (botName) {
      await sendServiceErrorToUser(botName, telegram_id, error as Error, isRu)
      await sendServiceErrorToAdmin(botName, telegram_id, error as Error)
    } else {
      logger.error(
        'Could not determine bot name in createVoiceAvatar error handler'
      )
    }
    throw error
  }
}
