import { supabase } from '.'
import { Logger as logger } from '../../utils/logger'

export async function isOwner(
  userId: number,
  botName: string
): Promise<boolean> {
  try {
    logger.info({
      message: '🔍 Проверка владельца бота',
      description: 'Checking bot owner',
      user_id: userId,
      bot_name: botName,
    })

    const { data, error } = await supabase
      .from('avatars')
      .select('telegram_id')
      .eq('bot_name', botName)
      .single()

    if (error) {
      logger.error({
        message: '❌ Ошибка при проверке владельца',
        description: 'Error checking owner',
        error: error.message,
        user_id: userId,
        bot_name: botName,
      })
      return false
    }

    if (!data) {
      logger.warn({
        message: '⚠️ Бот не найден',
        description: 'Bot not found',
        bot_name: botName,
      })
      return false
    }

    // Преобразуем telegram_id в число для сравнения
    const ownerTelegramId = parseInt(data.telegram_id)
    const isOwnerResult = !isNaN(ownerTelegramId) && ownerTelegramId === userId

    logger.info({
      message: isOwnerResult
        ? '✅ Пользователь является владельцем'
        : '❌ Пользователь не является владельцем',
      description: isOwnerResult ? 'User is owner' : 'User is not owner',
      user_id: userId,
      owner_id: ownerTelegramId,
      bot_name: botName,
    })

    return isOwnerResult
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при выполнении запроса',
      description: 'Query execution error',
      error: error instanceof Error ? error.message : String(error),
      user_id: userId,
      bot_name: botName,
    })
    return false
  }
}
