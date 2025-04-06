import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '@/core/supabase' // Предполагаем, что supabase уже настроен

/**
 * Получает данные по task_id, включая bot_name, language_code, username и telegram_id.
 * @param task_id - Идентификатор задачи.
 * @returns Объект с данными или null, если данные не найдены.
 */
export async function getTaskData(task_id: string): Promise<{
  telegram_id: TelegramId
  bot_name: string
  language_code: string
  username: string
} | null> {
  try {
    console.log('🔍 Fetching task data for task_id:', task_id)

    // Запрашиваем данные из таблицы prompts_history
    const { data: existingData, error: selectError } = await supabase
      .from('prompts_history')
      .select('telegram_id, users(bot_name, language_code, username)')
      .eq('task_id', task_id)
      .single()

    // Если ошибка и это не "нет данных", выбрасываем исключение
    if (selectError && selectError.code !== 'PGRST116') {
      console.error('Error fetching task data:', selectError)
      throw selectError
    }

    // Если данные не найдены
    if (!existingData) {
      console.warn('⚠️ No data found for task_id:', task_id)
      return null
    }

    // Извлекаем данные из результата
    const { telegram_id, users } = existingData
    if (!users) {
      console.warn('⚠️ No user data found for task_id:', task_id)
      return null
    }
    // @ts-ignore
    const { bot_name, language_code, username } = users

    console.log('✅ Task data fetched successfully:', {
      telegram_id,
      bot_name,
      language_code,
      username,
    })

    return {
      telegram_id,
      bot_name,
      language_code,
      username,
    }
  } catch (error) {
    console.error('❌ Error in getTaskData:', error)
    throw error
  }
}
