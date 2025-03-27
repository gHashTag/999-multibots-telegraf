import { supabase } from '.'
import { logger } from '@/utils/logger'

/**
 * Получает информацию о пользователе по ID задачи нейрофото
 * @param taskId ID задачи нейрофото
 * @returns Данные пользователя или null, если не найден
 */
export async function getUserByTaskId(taskId: string) {
  try {
    logger.info({
      message: '🔍 Поиск пользователя по ID задачи',
      description: 'Looking up user by task ID',
      taskId,
    })

    // Сначала ищем запись в таблице промптов
    const { data: promptData, error: promptError } = await supabase
      .from('prompts')
      .select('telegram_id')
      .eq('task_id', taskId)
      .single()

    if (promptError || !promptData) {
      logger.warn({
        message: '⚠️ Запись промпта не найдена для ID задачи',
        description: 'Prompt record not found for task ID',
        taskId,
        error: promptError?.message,
      })
      return null
    }

    const telegramId = promptData.telegram_id

    // Теперь получаем полные данные пользователя
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()

    if (userError || !userData) {
      logger.warn({
        message: '⚠️ Пользователь не найден по Telegram ID',
        description: 'User not found by Telegram ID',
        telegramId,
        taskId,
        error: userError?.message,
      })
      return null
    }

    logger.info({
      message: '✅ Пользователь найден по ID задачи',
      description: 'User found by task ID',
      taskId,
      telegramId,
      userId: userData.id,
    })

    return userData
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при поиске пользователя по ID задачи',
      description: 'Error looking up user by task ID',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null,
      taskId,
    })
    return null
  }
}
