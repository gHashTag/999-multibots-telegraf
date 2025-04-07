import { TelegramId } from '@/interfaces/telegram.interface'
import {
  getUserByTelegramIdString,
  supabase,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { createVoiceElevenLabs } from '@/core/elevenlabs/createVoiceElevenLabs'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

export async function createVoiceAvatar(
  fileUrl: string,
  telegram_id: TelegramId,
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
    console.log('📣 createVoiceAvatar:', {
      description: 'Creating voice avatar',
      fileUrl,
      telegram_id,
      username,
      isRu,
    })

    await bot.telegram.sendMessage(
      telegram_id,
      isRu ? '⏳ Создаю голосовой аватар...' : '⏳ Creating voice avatar...'
    )

    const voiceId = await createVoiceElevenLabs({
      fileUrl,
      username,
    })

    console.log('📣 Получен voiceId:', {
      description: 'Received voice ID',
      voiceId,
    })

    if (!voiceId) {
      console.error('🔥 Ошибка при создании голоса: voiceId не получен', {
        description: 'Error: voice ID not received',
      })
      throw new Error('Ошибка при создании голоса')
    }

    // Сохранение voiceId в таблицу users
    const { error } = await supabase
      .from('users')
      .update({ voice_id_elevenlabs: voiceId })
      .eq('telegram_id', telegram_id)

    if (error) {
      console.error('🔥 Ошибка при сохранении voiceId в базу данных:', {
        description: 'Error saving voice ID to database',
        error,
      })
      throw new Error('Ошибка при сохранении данных')
    }

    await bot.telegram.sendMessage(
      telegram_id,
      isRu
        ? '🎤 Голос для аватара успешно создан. \nИспользуйте 🎙️ Текст в голос в меню, чтобы проверить'
        : '🎤 Voice for avatar successfully created! \nUse the 🎙️ Text to speech in the menu to check'
    )

    return { voiceId }
  } catch (error) {
    console.error('🔥 Ошибка в createVoiceAvatar:', {
      description: 'Error in createVoiceAvatar',
      error,
    })
    errorMessage(error as Error, telegram_id.toString(), isRu)
    errorMessageAdmin(error as Error)
    throw error
  }
}
