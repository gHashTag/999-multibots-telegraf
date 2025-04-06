import { MyContext } from '@/interfaces'
import { supabase } from '.'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'

/**
 * Получает пользователя по идентификатору Telegram
 * Функция поддерживает два формата аргумента:
 * 1. Объект MyContext (для использования в командах бота)
 * 2. Строковый telegram_id (для использования в функциях Inngest)
 */
export async function getUserByTelegramId(ctxOrId: MyContext | string) {
  try {
    // Определяем, что было передано: контекст или ID
    let telegramId: string
    let botName: string | null = null

    if (typeof ctxOrId === 'string') {
      telegramId = ctxOrId
      logger.info({
        message: '🔍 Получение пользователя по ID',
        description: 'Getting user by string ID',
        telegramId,
      })

      // Проверка на тестовый режим
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.IS_TESTING === 'true'
      ) {
        logger.info({
          message: '🧪 Тестовый режим обнаружен',
          description: 'Test mode detected, returning mock user',
          telegramId,
        })

        // Возвращаем мок-данные для тестирования
        return {
          id: 'test-user-id',
          telegram_id: telegramId,
          username: 'test_user',
          level: 2,
          balance: 1000,
          bot_name: 'neuro_blogger_bot',
          created_at: new Date().toISOString(),
          voice_id: 'test-voice-id',
          fine_tune_id: 'test-finetune-id',
          aspect_ratio: '1:1',
        }
      }
    } else {
      // Получаем данные из контекста
      telegramId = normalizeTelegramId(ctxOrId.from?.id || '')
      botName = ctxOrId.botInfo?.username || null
      logger.info({
        message: '🔍 Получение пользователя из контекста',
        description: 'Getting user from context',
        telegramId,
        botName,
      })
    }

    // Получаем пользователя из базы данных
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()

    if (error) {
      logger.error({
        message: '❌ Пользователь не зарегистрирован',
        description: 'User not registered',
        telegramId,
        error: error.message,
      })
      return null
    }

    // Обновляем имя бота, если оно изменилось и у нас есть информация о новом имени
    if (botName && data.bot_name !== botName) {
      logger.info({
        message: '🔄 Имя бота изменилось, обновляем...',
        description: 'Bot name changed, updating',
        oldBotName: data.bot_name,
        newBotName: botName,
        telegramId,
      })

      const { error: updateError } = await supabase
        .from('users')
        .update({ bot_name: botName })
        .eq('telegram_id', telegramId)

      if (updateError) {
        logger.error({
          message: '❌ Ошибка при обновлении имени бота',
          description: 'Error updating bot name',
          error: updateError.message,
          telegramId,
        })
      } else {
        logger.info({
          message: '✅ Имя бота успешно обновлено',
          description: 'Bot name updated successfully',
          telegramId,
          botName,
        })
        // Обновляем данные в памяти
        data.bot_name = botName
      }
    }

    logger.info({
      message: '✅ Пользователь найден',
      description: 'User found in database',
      userId: data.id,
      telegramId,
    })

    return data
  } catch (error) {
    logger.error({
      message: '❌ Непредвиденная ошибка при получении пользователя',
      description: 'Unexpected error fetching user by Telegram ID',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null,
    })
    return null
  }
}
