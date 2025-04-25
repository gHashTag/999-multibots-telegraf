import { supabase } from '@/core/supabase/client'
import { logger } from '@/utils/logger'

/**
 * Интерфейс данных пользователя
 */
export interface User {
  id: string
  telegramId: number
  username?: string
  firstName?: string
  lastName?: string
  language?: string
  isAdmin: boolean
  isActive: boolean
  credits: number
  createdAt: string
  updatedAt: string
  settings?: UserSettings
  metadata?: Record<string, any>
}

/**
 * Интерфейс настроек пользователя
 */
export interface UserSettings {
  language?: string
  theme?: string
  notifications?: boolean
  contentPreferences?: Record<string, any>
  aiSettings?: Record<string, any>
}

/**
 * Интерфейс для операции создания пользователя
 */
export interface CreateUserParams {
  telegramId: number
  username?: string
  firstName?: string
  lastName?: string
  language?: string
  isAdmin?: boolean
  settings?: UserSettings
  metadata?: Record<string, any>
}

/**
 * Интерфейс для операции обновления пользователя
 */
export interface UpdateUserParams {
  username?: string
  firstName?: string
  lastName?: string
  language?: string
  isAdmin?: boolean
  isActive?: boolean
  credits?: number
  settings?: UserSettings
  metadata?: Record<string, any>
}

/**
 * Интерфейс результата операции с пользователем
 */
export interface UserOperationResult {
  success: boolean
  user?: User
  error?: string
  message: string
}

/**
 * Сервис для работы с пользователями
 */
export class UserService {
  private tableName = 'users'

  /**
   * Создать нового пользователя
   */
  async createUser(params: CreateUserParams): Promise<UserOperationResult> {
    try {
      // Проверяем, существует ли пользователь с таким telegramId
      const existingUser = await this.getUserByTelegramId(params.telegramId)

      if (existingUser) {
        return {
          success: false,
          user: existingUser,
          message: 'Пользователь с таким Telegram ID уже существует'
        }
      }

      const user = {
        telegramId: params.telegramId,
        username: params.username || null,
        firstName: params.firstName || null,
        lastName: params.lastName || null,
        language: params.language || 'ru',
        isAdmin: params.isAdmin || false,
        isActive: true,
        credits: 0, // Начальное количество кредитов
        settings: params.settings || {},
        metadata: params.metadata || {}
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .insert(user)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при создании пользователя:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при создании пользователя: ${error.message}`
        }
      }

      return {
        success: true,
        user: data as User,
        message: 'Пользователь успешно создан'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при создании пользователя:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при создании пользователя: ${(error as Error).message}`
      }
    }
  }

  /**
   * Получить пользователя по ID
   */
  async getUserById(id: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('Ошибка при получении пользователя по ID:', error)
        return null
      }

      return data as User
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении пользователя по ID:', error)
      return null
    }
  }

  /**
   * Получить пользователя по Telegram ID
   */
  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('telegramId', telegramId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // Пользователь не найден (это нормальная ситуация)
          return null
        }
        logger.error('Ошибка при получении пользователя по Telegram ID:', error)
        return null
      }

      return data as User
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении пользователя по Telegram ID:', error)
      return null
    }
  }

  /**
   * Обновить пользователя по ID
   */
  async updateUser(id: string, params: UpdateUserParams): Promise<UserOperationResult> {
    try {
      const user = await this.getUserById(id)

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
          message: 'Пользователь с указанным ID не найден'
        }
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .update(params)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при обновлении пользователя:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при обновлении пользователя: ${error.message}`
        }
      }

      return {
        success: true,
        user: data as User,
        message: 'Пользователь успешно обновлен'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при обновлении пользователя:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при обновлении пользователя: ${(error as Error).message}`
      }
    }
  }

  /**
   * Обновить пользователя по Telegram ID
   */
  async updateUserByTelegramId(telegramId: number, params: UpdateUserParams): Promise<UserOperationResult> {
    try {
      const user = await this.getUserByTelegramId(telegramId)

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
          message: 'Пользователь с указанным Telegram ID не найден'
        }
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .update(params)
        .eq('telegramId', telegramId)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при обновлении пользователя по Telegram ID:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при обновлении пользователя: ${error.message}`
        }
      }

      return {
        success: true,
        user: data as User,
        message: 'Пользователь успешно обновлен'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при обновлении пользователя по Telegram ID:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при обновлении пользователя: ${(error as Error).message}`
      }
    }
  }

  /**
   * Деактивировать пользователя
   */
  async deactivateUser(id: string): Promise<UserOperationResult> {
    try {
      const user = await this.getUserById(id)

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
          message: 'Пользователь с указанным ID не найден'
        }
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .update({ isActive: false })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при деактивации пользователя:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при деактивации пользователя: ${error.message}`
        }
      }

      return {
        success: true,
        user: data as User,
        message: 'Пользователь успешно деактивирован'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при деактивации пользователя:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при деактивации пользователя: ${(error as Error).message}`
      }
    }
  }

  /**
   * Добавить кредиты пользователю
   */
  async addCredits(userId: string, amount: number): Promise<UserOperationResult> {
    try {
      const user = await this.getUserById(userId)

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
          message: 'Пользователь с указанным ID не найден'
        }
      }

      const newCredits = user.credits + amount

      const { data, error } = await supabase
        .from(this.tableName)
        .update({ credits: newCredits })
        .eq('id', userId)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при добавлении кредитов пользователю:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при добавлении кредитов: ${error.message}`
        }
      }

      return {
        success: true,
        user: data as User,
        message: `Успешно добавлено ${amount} кредитов. Новый баланс: ${newCredits}`
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при добавлении кредитов пользователю:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при добавлении кредитов: ${(error as Error).message}`
      }
    }
  }

  /**
   * Вычесть кредиты у пользователя
   */
  async subtractCredits(userId: string, amount: number): Promise<UserOperationResult> {
    try {
      const user = await this.getUserById(userId)

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
          message: 'Пользователь с указанным ID не найден'
        }
      }

      if (user.credits < amount) {
        return {
          success: false,
          error: 'Недостаточно кредитов',
          message: 'У пользователя недостаточно кредитов для выполнения операции'
        }
      }

      const newCredits = user.credits - amount

      const { data, error } = await supabase
        .from(this.tableName)
        .update({ credits: newCredits })
        .eq('id', userId)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при вычитании кредитов у пользователя:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при вычитании кредитов: ${error.message}`
        }
      }

      return {
        success: true,
        user: data as User,
        message: `Успешно списано ${amount} кредитов. Новый баланс: ${newCredits}`
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при вычитании кредитов у пользователя:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при вычитании кредитов: ${(error as Error).message}`
      }
    }
  }

  /**
   * Обновить настройки пользователя
   */
  async updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserOperationResult> {
    try {
      const user = await this.getUserById(userId)

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
          message: 'Пользователь с указанным ID не найден'
        }
      }

      // Объединяем существующие настройки с новыми
      const updatedSettings = {
        ...(user.settings || {}),
        ...settings
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .update({ settings: updatedSettings })
        .eq('id', userId)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при обновлении настроек пользователя:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при обновлении настроек: ${error.message}`
        }
      }

      return {
        success: true,
        user: data as User,
        message: 'Настройки пользователя успешно обновлены'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при обновлении настроек пользователя:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при обновлении настроек: ${(error as Error).message}`
      }
    }
  }

  /**
   * Получить или создать пользователя по данным из Telegram
   */
  async getOrCreateUser(telegramData: {
    id: number
    username?: string
    first_name?: string
    last_name?: string
    language_code?: string
  }): Promise<UserOperationResult> {
    try {
      // Проверяем, существует ли пользователь
      let user = await this.getUserByTelegramId(telegramData.id)

      // Если пользователь существует, возвращаем его
      if (user) {
        // Опционально обновляем данные пользователя, если они изменились
        if (
          (telegramData.username && telegramData.username !== user.username) ||
          (telegramData.first_name && telegramData.first_name !== user.firstName) ||
          (telegramData.last_name && telegramData.last_name !== user.lastName) ||
          (telegramData.language_code && telegramData.language_code !== user.language)
        ) {
          const updateResult = await this.updateUserByTelegramId(telegramData.id, {
            username: telegramData.username,
            firstName: telegramData.first_name,
            lastName: telegramData.last_name,
            language: telegramData.language_code
          })

          if (updateResult.success) {
            return {
              success: true,
              user: updateResult.user as User,
              message: 'Данные пользователя обновлены'
            }
          }
        }

        return {
          success: true,
          user,
          message: 'Пользователь найден'
        }
      }

      // Создаем нового пользователя
      const createResult = await this.createUser({
        telegramId: telegramData.id,
        username: telegramData.username,
        firstName: telegramData.first_name,
        lastName: telegramData.last_name,
        language: telegramData.language_code
      })

      return createResult
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении или создании пользователя:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка: ${(error as Error).message}`
      }
    }
  }

  /**
   * Получить список всех пользователей
   */
  async getAllUsers(limit = 100, offset = 0): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .range(offset, offset + limit - 1)
        .order('createdAt', { ascending: false })

      if (error) {
        logger.error('Ошибка при получении списка пользователей:', error)
        return []
      }

      return data as User[]
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении списка пользователей:', error)
      return []
    }
  }

  /**
   * Получить количество пользователей
   */
  async getUserCount(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })

      if (error) {
        logger.error('Ошибка при получении количества пользователей:', error)
        return 0
      }

      return data.length || 0
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении количества пользователей:', error)
      return 0
    }
  }
}

// Экспортируем экземпляр сервиса для глобального использования
export const userService = new UserService() 