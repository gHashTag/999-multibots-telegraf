import { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Интерфейс для аватара
 */
export interface Avatar {
  id?: number
  telegram_id: string
  avatar_url: string
  bot_name: string
  group?: string
  created_at?: string
  updated_at?: string
}

/**
 * Параметры для создания аватара
 */
export interface CreateAvatarParams {
  telegram_id: string
  avatar_url: string
  bot_name: string
  group?: string
}

/**
 * Параметры для поиска аватара
 */
export interface FindAvatarParams {
  telegram_id?: string
  bot_name?: string
}

/**
 * Менеджер для работы с аватарами
 */
export class AvatarManager {
  private client: SupabaseClient
  private tableName: string = 'avatars'

  /**
   * Создает экземпляр менеджера аватаров
   * @param client клиент Supabase
   */
  constructor(client?: SupabaseClient) {
    this.client = client || supabase
  }

  /**
   * Создает новый аватар
   * @param params параметры для создания аватара
   * @returns созданный аватар или null в случае ошибки
   */
  async createAvatar(params: CreateAvatarParams): Promise<Avatar | null> {
    try {
      logger.debug(
        `🔍 Проверка существования аватара для пользователя ${params.telegram_id} и бота ${params.bot_name}`
      )

      // Проверяем, существует ли уже аватар с такими telegram_id и bot_name
      const existingAvatar = await this.findAvatar({
        telegram_id: params.telegram_id,
        bot_name: params.bot_name,
      })

      if (existingAvatar) {
        logger.debug(
          `✅ Аватар для пользователя ${params.telegram_id} и бота ${params.bot_name} уже существует, возвращаем существующий`
        )
        return existingAvatar
      }

      logger.debug(
        `🚀 Создание нового аватара для пользователя ${params.telegram_id} и бота ${params.bot_name}`
      )

      const { data, error } = await this.client
        .from(this.tableName)
        .insert({
          telegram_id: params.telegram_id,
          avatar_url: params.avatar_url,
          bot_name: params.bot_name,
          group: params.group,
        })
        .select()
        .single()

      if (error) {
        logger.error(`❌ Ошибка при создании аватара: ${error.message}`)
        return null
      }

      logger.debug(
        `✅ Аватар для пользователя ${params.telegram_id} и бота ${params.bot_name} успешно создан`
      )
      return data as Avatar
    } catch (error: any) {
      logger.error(`❌ Ошибка при создании аватара: ${error.message}`)
      return null
    }
  }

  /**
   * Находит аватар по заданным параметрам
   * @param params параметры для поиска аватара
   * @returns найденный аватар или null, если аватар не найден
   */
  async findAvatar(params: FindAvatarParams): Promise<Avatar | null> {
    try {
      logger.debug(`🔍 Поиск аватара по параметрам: ${JSON.stringify(params)}`)

      let query = this.client.from(this.tableName).select('*')

      if (params.telegram_id) {
        query = query.eq('telegram_id', params.telegram_id)
      }

      if (params.bot_name) {
        query = query.eq('bot_name', params.bot_name)
      }

      const { data, error } = await query.maybeSingle()

      if (error) {
        logger.error(`❌ Ошибка при поиске аватара: ${error.message}`)
        return null
      }

      if (!data) {
        logger.debug(
          `ℹ️ Аватар не найден по параметрам: ${JSON.stringify(params)}`
        )
        return null
      }

      logger.debug(`✅ Аватар найден: ${JSON.stringify(data)}`)
      return data as Avatar
    } catch (error: any) {
      logger.error(`❌ Ошибка при поиске аватара: ${error.message}`)
      return null
    }
  }

  /**
   * Обновляет аватар
   * @param avatar аватар для обновления
   * @returns обновленный аватар или null в случае ошибки
   */
  async updateAvatar(avatar: Avatar): Promise<Avatar | null> {
    try {
      if (!avatar.id) {
        logger.error('❌ Невозможно обновить аватар без id')
        return null
      }

      logger.debug(`🔄 Обновление аватара с id ${avatar.id}`)

      const { data, error } = await this.client
        .from(this.tableName)
        .update({
          telegram_id: avatar.telegram_id,
          avatar_url: avatar.avatar_url,
          bot_name: avatar.bot_name,
          group: avatar.group,
        })
        .eq('id', avatar.id)
        .select()
        .single()

      if (error) {
        logger.error(`❌ Ошибка при обновлении аватара: ${error.message}`)
        return null
      }

      logger.debug(`✅ Аватар с id ${avatar.id} успешно обновлен`)
      return data as Avatar
    } catch (error: any) {
      logger.error(`❌ Ошибка при обновлении аватара: ${error.message}`)
      return null
    }
  }

  /**
   * Удаляет аватар
   * @param avatarId id аватара для удаления
   * @returns true в случае успеха, false в случае ошибки
   */
  async deleteAvatar(avatarId: number): Promise<boolean> {
    try {
      logger.debug(`🗑️ Удаление аватара с id ${avatarId}`)

      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .eq('id', avatarId)

      if (error) {
        logger.error(`❌ Ошибка при удалении аватара: ${error.message}`)
        return false
      }

      logger.debug(`✅ Аватар с id ${avatarId} успешно удален`)
      return true
    } catch (error: any) {
      logger.error(`❌ Ошибка при удалении аватара: ${error.message}`)
      return false
    }
  }

  /**
   * Получает аватар пользователя для конкретного бота
   * @param telegram_id id пользователя
   * @param bot_name имя бота
   * @returns аватар пользователя или null, если аватар не найден
   */
  async getUserAvatar(
    telegram_id: string,
    bot_name: string
  ): Promise<Avatar | null> {
    return this.findAvatar({ telegram_id, bot_name })
  }

  /**
   * Получает все аватары пользователя
   * @param telegram_id id пользователя
   * @returns массив аватаров пользователя
   */
  async getUserAvatars(telegram_id: string): Promise<Avatar[]> {
    try {
      logger.debug(`🔍 Получение всех аватаров для пользователя ${telegram_id}`)

      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('telegram_id', telegram_id)

      if (error) {
        logger.error(
          `❌ Ошибка при получении аватаров пользователя: ${error.message}`
        )
        return []
      }

      logger.debug(
        `✅ Получено ${data.length} аватаров для пользователя ${telegram_id}`
      )
      return data as Avatar[]
    } catch (error: any) {
      logger.error(
        `❌ Ошибка при получении аватаров пользователя: ${error.message}`
      )
      return []
    }
  }

  /**
   * Получает все аватары для конкретного бота
   * @param bot_name имя бота
   * @returns массив аватаров бота
   */
  async getBotAvatars(bot_name: string): Promise<Avatar[]> {
    try {
      logger.debug(`🔍 Получение всех аватаров для бота ${bot_name}`)

      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('bot_name', bot_name)

      if (error) {
        logger.error(`❌ Ошибка при получении аватаров бота: ${error.message}`)
        return []
      }

      logger.debug(`✅ Получено ${data.length} аватаров для бота ${bot_name}`)
      return data as Avatar[]
    } catch (error: any) {
      logger.error(`❌ Ошибка при получении аватаров бота: ${error.message}`)
      return []
    }
  }
}
