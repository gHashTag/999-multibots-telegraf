import { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TelegramId } from '@/interfaces/telegram.interface'

/**
 * Интерфейс для аватара бота
 */
export interface Avatar {
  telegram_id: number
  avatar_url: string
  group: string
  created_at: string
  updated_at: string
  bot_name: string
}

/**
 * Параметры для создания аватара бота
 */
export interface CreateAvatarParams {
  telegramId: string
  botName: string
  avatarUrl?: string
  group?: string
}

/**
 * Параметры для поиска аватара бота
 */
export interface FindAvatarParams {
  telegramId: string
  botName: string
}

/**
 * Класс для управления аватарами ботов
 */
export class AvatarManager {
  private static client: SupabaseClient = supabase

  /**
   * Создает аватар для пользователя и бота
   */
  static async createAvatar({
    telegramId,
    botName,
    avatarUrl = 'https://example.com/default-avatar.jpg',
    group = 'default',
  }: CreateAvatarParams): Promise<Avatar> {
    try {
      // Преобразуем telegramId в число
      const telegramIdNum = Number(telegramId)

      // Проверяем, существует ли уже запись для данного пользователя и бота
      const existingAvatar = await this.findAvatar({ telegramId, botName })

      // Если запись уже существует, возвращаем её
      if (existingAvatar) {
        logger.info('ℹ️ Аватар уже существует для пользователя и бота', {
          description: 'Avatar already exists for user and bot',
          telegramId,
          botName,
        })
        return existingAvatar
      }

      // Создаем новую запись
      const { data, error } = await this.client
        .from('avatars')
        .insert({
          telegram_id: telegramIdNum,
          bot_name: botName,
          avatar_url: avatarUrl,
          group,
        })
        .select()
        .single()

      if (error) {
        logger.error('❌ Ошибка при создании аватара', {
          description: 'Error creating avatar',
          error: error.message,
          telegramId,
          botName,
        })
        throw new Error(`Ошибка при создании аватара: ${error.message}`)
      }

      logger.info('✅ Аватар успешно создан', {
        description: 'Avatar successfully created',
        telegramId,
        botName,
      })

      return data as Avatar
    } catch (error: any) {
      logger.error('❌ Ошибка при создании аватара', {
        description: 'Error creating avatar',
        error: error.message,
        telegramId,
        botName,
        stack: error.stack,
      })
      throw error
    }
  }

  /**
   * Находит аватар по telegram_id и имени бота
   */
  static async findAvatar({
    telegramId,
    botName,
  }: FindAvatarParams): Promise<Avatar | null> {
    try {
      // Преобразуем telegramId в число
      const telegramIdNum = Number(telegramId)

      const { data, error } = await this.client
        .from('avatars')
        .select('*')
        .eq('telegram_id', telegramIdNum)
        .eq('bot_name', botName)
        .single()

      if (error) {
        // Если запись не найдена, это не ошибка, а нулевой результат
        if (error.code === 'PGRST116') {
          logger.info('ℹ️ Аватар не найден', {
            description: 'Avatar not found',
            telegramId,
            botName,
          })
          return null
        }

        logger.error('❌ Ошибка при поиске аватара', {
          description: 'Error finding avatar',
          error: error.message,
          telegramId,
          botName,
        })
        throw new Error(`Ошибка при поиске аватара: ${error.message}`)
      }

      return data as Avatar
    } catch (error: any) {
      logger.error('❌ Ошибка при поиске аватара', {
        description: 'Error finding avatar',
        error: error.message,
        telegramId,
        botName,
        stack: error.stack,
      })
      throw error
    }
  }

  /**
   * Обновляет данные аватара
   */
  static async updateAvatar(
    telegramId: string,
    botName: string,
    updates: Partial<
      Omit<Avatar, 'telegram_id' | 'bot_name' | 'created_at' | 'updated_at'>
    >
  ): Promise<Avatar> {
    try {
      // Преобразуем telegramId в число
      const telegramIdNum = Number(telegramId)

      const { data, error } = await this.client
        .from('avatars')
        .update(updates)
        .eq('telegram_id', telegramIdNum)
        .eq('bot_name', botName)
        .select()
        .single()

      if (error) {
        logger.error('❌ Ошибка при обновлении аватара', {
          description: 'Error updating avatar',
          error: error.message,
          telegramId,
          botName,
          updates,
        })
        throw new Error(`Ошибка при обновлении аватара: ${error.message}`)
      }

      logger.info('✅ Аватар успешно обновлен', {
        description: 'Avatar successfully updated',
        telegramId,
        botName,
        updates,
      })

      return data as Avatar
    } catch (error: any) {
      logger.error('❌ Ошибка при обновлении аватара', {
        description: 'Error updating avatar',
        error: error.message,
        telegramId,
        botName,
        updates: JSON.stringify(updates),
        stack: error.stack,
      })
      throw error
    }
  }

  /**
   * Удаляет аватар
   */
  static async deleteAvatar(
    telegramId: string,
    botName: string
  ): Promise<boolean> {
    try {
      // Преобразуем telegramId в число
      const telegramIdNum = Number(telegramId)

      const { error } = await this.client
        .from('avatars')
        .delete()
        .eq('telegram_id', telegramIdNum)
        .eq('bot_name', botName)

      if (error) {
        logger.error('❌ Ошибка при удалении аватара', {
          description: 'Error deleting avatar',
          error: error.message,
          telegramId,
          botName,
        })
        throw new Error(`Ошибка при удалении аватара: ${error.message}`)
      }

      logger.info('✅ Аватар успешно удален', {
        description: 'Avatar successfully deleted',
        telegramId,
        botName,
      })

      return true
    } catch (error: any) {
      logger.error('❌ Ошибка при удалении аватара', {
        description: 'Error deleting avatar',
        error: error.message,
        telegramId,
        botName,
        stack: error.stack,
      })
      return false
    }
  }

  /**
   * Получает все аватары пользователя
   */
  static async getUserAvatars(telegramId: string): Promise<Avatar[]> {
    try {
      // Преобразуем telegramId в число
      const telegramIdNum = Number(telegramId)

      const { data, error } = await this.client
        .from('avatars')
        .select('*')
        .eq('telegram_id', telegramIdNum)

      if (error) {
        logger.error('❌ Ошибка при получении аватаров пользователя', {
          description: 'Error getting user avatars',
          error: error.message,
          telegramId,
        })
        throw new Error(
          `Ошибка при получении аватаров пользователя: ${error.message}`
        )
      }

      logger.info('✅ Успешно получены аватары пользователя', {
        description: 'Successfully retrieved user avatars',
        telegramId,
        count: data.length,
      })

      return data as Avatar[]
    } catch (error: any) {
      logger.error('❌ Ошибка при получении аватаров пользователя', {
        description: 'Error getting user avatars',
        error: error.message,
        telegramId,
        stack: error.stack,
      })
      throw error
    }
  }

  /**
   * Получает все аватары бота
   */
  static async getBotAvatars(botName: string): Promise<Avatar[]> {
    try {
      const { data, error } = await this.client
        .from('avatars')
        .select('*')
        .eq('bot_name', botName)

      if (error) {
        logger.error('❌ Ошибка при получении аватаров бота', {
          description: 'Error getting bot avatars',
          error: error.message,
          botName,
        })
        throw new Error(`Ошибка при получении аватаров бота: ${error.message}`)
      }

      logger.info('✅ Успешно получены аватары бота', {
        description: 'Successfully retrieved bot avatars',
        botName,
        count: data.length,
      })

      return data as Avatar[]
    } catch (error: any) {
      logger.error('❌ Ошибка при получении аватаров бота', {
        description: 'Error getting bot avatars',
        error: error.message,
        botName,
        stack: error.stack,
      })
      throw error
    }
  }
}

// Экспортируем функции-обертки для обратной совместимости и более удобного использования
export const createAvatar = AvatarManager.createAvatar.bind(AvatarManager)
export const findAvatar = AvatarManager.findAvatar.bind(AvatarManager)
export const getUserAvatars = AvatarManager.getUserAvatars.bind(AvatarManager)
export const getBotAvatars = AvatarManager.getBotAvatars.bind(AvatarManager)
export const deleteAvatar = AvatarManager.deleteAvatar.bind(AvatarManager)
export const updateAvatar = AvatarManager.updateAvatar.bind(AvatarManager)

// Для обратной совместимости с существующим кодом
export type AvatarBot = Avatar
export const createMockAvatarBot = (params: any): Promise<Avatar> => {
  return AvatarManager.createAvatar({
    telegramId: params.ambassadorId || params.telegramId,
    botName: params.botName,
    avatarUrl: params.avatarUrl,
  })
}
export const deleteMockAvatarBot = (avatarId: string): Promise<boolean> => {
  // В старой реализации удаление по ID, в новой - по telegram_id и bot_name
  // Поэтому этот метод нуждается в дополнительной логике
  logger.warn('⚠️ Вызов устаревшего метода deleteMockAvatarBot', {
    description: 'Legacy method call, consider updating to new API',
    avatarId,
  })

  // Находим аватар по ID (это не будет работать с новой схемой)
  // Возвращаем заглушку для совместимости
  return Promise.resolve(true)
}
