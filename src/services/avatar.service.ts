import { TelegramId } from '@/interfaces/telegram.interface';
import { supabase } from '@/core/supabase'
import { logger } from '@utils/logger'

export interface Avatar {
  telegram_id: TelegramId
  avatar_url: string
  group: string
  created_at: string
  updated_at: string
  bot_name: string
}

export const avatarService = {
  /**
   * Проверяет, является ли пользователь владельцем бота
   */
  isAvatarOwner: async (
    telegram_id: TelegramId,
    bot_name?: string
  ): Promise<boolean> => {
    try {
      const query = supabase
        .from('avatars')
        .select('*')
        .eq('telegram_id', telegram_id)

      // Если указано имя бота, проверяем только для него
      if (bot_name) {
        query.eq('bot_name', bot_name)
      }

      const { data, error } = await query

      if (error) {
        logger.error('❌ Ошибка при проверке статуса владельца:', {
          description: 'Error checking avatar owner status',
          error,
          telegram_id,
          bot_name,
        })
        return false
      }

      return Array.isArray(data) && data.length > 0
    } catch (err) {
      logger.error('❌ Непредвиденная ошибка при проверке статуса владельца:', {
        description: 'Unexpected error checking avatar owner status',
        error: err,
        telegram_id,
        bot_name,
      })
      return false
    }
  },

  /**
   * Получает информацию о владельце бота
   */
  getAvatarByTelegramId: async (
    telegram_id: TelegramId
  ): Promise<Avatar | null> => {
    try {
      const { data, error } = await supabase
        .from('avatars')
        .select('*')
        .eq('telegram_id', telegram_id)
        .single()

      if (error) {
        logger.error('❌ Ошибка при получении данных владельца:', {
          description: 'Error fetching avatar data',
          error,
          telegram_id,
        })
        return null
      }

      return data as Avatar
    } catch (err) {
      logger.error('❌ Непредвиденная ошибка при получении данных владельца:', {
        description: 'Unexpected error fetching avatar data',
        error: err,
        telegram_id,
      })
      return null
    }
  },

  /**
   * Получает всех владельцев для указанного бота
   */
  getAvatarsByBotName: async (bot_name: string): Promise<Avatar[]> => {
    try {
      const { data, error } = await supabase
        .from('avatars')
        .select('*')
        .eq('bot_name', bot_name)

      if (error) {
        logger.error('❌ Ошибка при получении владельцев для бота:', {
          description: 'Error fetching avatars for bot',
          error,
          bot_name,
        })
        return []
      }

      return data as Avatar[]
    } catch (err) {
      logger.error(
        '❌ Непредвиденная ошибка при получении владельцев для бота:',
        {
          description: 'Unexpected error fetching avatars for bot',
          error: err,
          bot_name,
        }
      )
      return []
    }
  },

  /**
   * Добавляет пользователя как владельца бота
   */
  addAvatarOwner: async (
    telegram_id: TelegramId,
    bot_name: string,
    avatar_url = 'https://example.com/default_avatar.png',
    group = `${bot_name}_group`
  ) => {
    try {
      const { data, error } = await supabase.from('avatars').insert([
        {
          telegram_id: Number(telegram_id),
          bot_name,
          avatar_url,
          group,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      if (error) {
        logger.error('❌ Ошибка при добавлении владельца бота:', {
          description: 'Error adding bot owner',
          error,
          telegram_id,
          bot_name,
        })
        return { success: false, error }
      }

      logger.info('✅ Владелец бота успешно добавлен', {
        description: 'Bot owner added successfully',
        telegram_id,
        bot_name,
      })

      return { success: true, data }
    } catch (error) {
      logger.error('❌ Неожиданная ошибка при добавлении владельца бота:', {
        description: 'Unexpected error adding bot owner',
        error,
        telegram_id,
        bot_name,
      })
      return { success: false, error }
    }
  },
}
