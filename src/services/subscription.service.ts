import { supabase } from '@/core/supabase/client'
import {
  Subscription,
  SubscriptionCreateParams,
  SubscriptionOperationResult,
  SubscriptionType,
  SubscriptionStatus,
  SubscriptionUpdateParams,
  SubscriptionValidationResult,
  SUBSCRIPTION_DEFAULTS,
  SUBSCRIPTION_ERROR_MESSAGES,
  SUBSCRIPTION_SUCCESS_MESSAGES,
} from '@/interfaces/subscription.interface'
import { logger } from '@/utils/logger'

/**
 * Сервис для работы с подписками
 */
export class SubscriptionService {
  private tableName = 'subscriptions'

  /**
   * Создать новую подписку
   */
  async createSubscription(params: SubscriptionCreateParams): Promise<SubscriptionOperationResult> {
    try {
      // Проверяем, нет ли у пользователя уже активной подписки
      const existingSubscription = await this.getActiveSubscription(params.userId)
      
      if (existingSubscription) {
        return {
          success: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.ALREADY_EXISTS,
          message: 'У пользователя уже есть активная подписка'
        }
      }

      const startDate = new Date()
      const duration = params.duration || SUBSCRIPTION_DEFAULTS.DURATION
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + duration)

      const currency = params.currency || SUBSCRIPTION_DEFAULTS.CURRENCY
      const autoRenew = params.autoRenew !== undefined ? params.autoRenew : SUBSCRIPTION_DEFAULTS.AUTO_RENEW

      // Определяем цену в зависимости от типа подписки и валюты
      let price = params.price
      if (!price) {
        if (currency === 'RUB') {
          switch (params.type) {
            case SubscriptionType.STANDARD:
              price = SUBSCRIPTION_DEFAULTS.STANDARD_PRICE_RUB
              break
            case SubscriptionType.PREMIUM:
              price = SUBSCRIPTION_DEFAULTS.PREMIUM_PRICE_RUB
              break
            case SubscriptionType.PRO:
              price = SUBSCRIPTION_DEFAULTS.PRO_PRICE_RUB
              break
            case SubscriptionType.ENTERPRISE:
              price = SUBSCRIPTION_DEFAULTS.ENTERPRISE_PRICE_RUB
              break
            default:
              price = SUBSCRIPTION_DEFAULTS.STANDARD_PRICE_RUB
          }
        } else {
          // USD или другая валюта
          switch (params.type) {
            case SubscriptionType.STANDARD:
              price = SUBSCRIPTION_DEFAULTS.STANDARD_PRICE_USD
              break
            case SubscriptionType.PREMIUM:
              price = SUBSCRIPTION_DEFAULTS.PREMIUM_PRICE_USD
              break
            case SubscriptionType.PRO:
              price = SUBSCRIPTION_DEFAULTS.PRO_PRICE_USD
              break
            case SubscriptionType.ENTERPRISE:
              price = SUBSCRIPTION_DEFAULTS.ENTERPRISE_PRICE_USD
              break
            default:
              price = SUBSCRIPTION_DEFAULTS.STANDARD_PRICE_USD
          }
        }
      }

      const subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: params.userId,
        type: params.type,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        status: SubscriptionStatus.ACTIVE,
        autoRenew,
        price,
        currency,
        metadata: params.metadata
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .insert(subscription)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при создании подписки:', error)
        return {
          success: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
          message: `Ошибка при создании подписки: ${error.message}`
        }
      }

      return {
        success: true,
        subscription: data as Subscription,
        message: SUBSCRIPTION_SUCCESS_MESSAGES.CREATED
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при создании подписки:', error)
      return {
        success: false,
        error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
        message: `Непредвиденная ошибка при создании подписки: ${(error as Error).message}`
      }
    }
  }

  /**
   * Получить подписку по ID
   */
  async getSubscriptionById(id: string): Promise<Subscription | null> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('Ошибка при получении подписки по ID:', error)
        return null
      }

      return data as Subscription
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении подписки по ID:', error)
      return null
    }
  }

  /**
   * Получить активную подписку пользователя
   */
  async getActiveSubscription(userId: string | number): Promise<Subscription | null> {
    try {
      const now = new Date().toISOString()
      
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('userId', userId)
        .eq('status', SubscriptionStatus.ACTIVE)
        .gte('endDate', now)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // Запись не найдена, это нормальная ситуация
          return null
        }
        logger.error('Ошибка при получении активной подписки:', error)
        return null
      }

      return data as Subscription
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении активной подписки:', error)
      return null
    }
  }

  /**
   * Обновить подписку
   */
  async updateSubscription(id: string, params: SubscriptionUpdateParams): Promise<SubscriptionOperationResult> {
    try {
      const subscription = await this.getSubscriptionById(id)
      
      if (!subscription) {
        return {
          success: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.NOT_FOUND,
          message: 'Подписка не найдена'
        }
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .update(params)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при обновлении подписки:', error)
        return {
          success: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
          message: `Ошибка при обновлении подписки: ${error.message}`
        }
      }

      return {
        success: true,
        subscription: data as Subscription,
        message: SUBSCRIPTION_SUCCESS_MESSAGES.UPDATED
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при обновлении подписки:', error)
      return {
        success: false,
        error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
        message: `Непредвиденная ошибка при обновлении подписки: ${(error as Error).message}`
      }
    }
  }

  /**
   * Проверить активность подписки пользователя
   */
  async validateSubscription(userId: string | number): Promise<SubscriptionValidationResult> {
    try {
      const subscription = await this.getActiveSubscription(userId)
      
      if (!subscription) {
        return {
          isValid: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.NOT_FOUND,
          message: 'У пользователя нет активной подписки'
        }
      }

      return {
        isValid: true,
        subscription,
        message: SUBSCRIPTION_SUCCESS_MESSAGES.VALIDATED
      }
    } catch (error) {
      logger.error('Ошибка при проверке подписки:', error)
      return {
        isValid: false,
        error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
        message: `Ошибка при проверке подписки: ${(error as Error).message}`
      }
    }
  }

  /**
   * Отменить подписку
   */
  async cancelSubscription(id: string): Promise<SubscriptionOperationResult> {
    try {
      const subscription = await this.getSubscriptionById(id)
      
      if (!subscription) {
        return {
          success: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.NOT_FOUND,
          message: 'Подписка не найдена'
        }
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .update({
          status: SubscriptionStatus.CANCELLED,
          autoRenew: false
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при отмене подписки:', error)
        return {
          success: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
          message: `Ошибка при отмене подписки: ${error.message}`
        }
      }

      return {
        success: true,
        subscription: data as Subscription,
        message: SUBSCRIPTION_SUCCESS_MESSAGES.CANCELLED
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при отмене подписки:', error)
      return {
        success: false,
        error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
        message: `Непредвиденная ошибка при отмене подписки: ${(error as Error).message}`
      }
    }
  }

  /**
   * Продлить подписку
   */
  async renewSubscription(id: string, duration?: number): Promise<SubscriptionOperationResult> {
    try {
      const subscription = await this.getSubscriptionById(id)
      
      if (!subscription) {
        return {
          success: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.NOT_FOUND,
          message: 'Подписка не найдена'
        }
      }

      // Вычисляем новую дату окончания подписки
      const newDuration = duration || SUBSCRIPTION_DEFAULTS.DURATION
      const currentEndDate = new Date(subscription.endDate)
      const now = new Date()
      
      // Если подписка истекла, начинаем с текущей даты
      const startPoint = currentEndDate < now ? now : currentEndDate
      const newEndDate = new Date(startPoint)
      newEndDate.setDate(newEndDate.getDate() + newDuration)

      const { data, error } = await supabase
        .from(this.tableName)
        .update({
          status: SubscriptionStatus.ACTIVE,
          endDate: newEndDate.toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при продлении подписки:', error)
        return {
          success: false,
          error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
          message: `Ошибка при продлении подписки: ${error.message}`
        }
      }

      return {
        success: true,
        subscription: data as Subscription,
        message: SUBSCRIPTION_SUCCESS_MESSAGES.RENEWED
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при продлении подписки:', error)
      return {
        success: false,
        error: SUBSCRIPTION_ERROR_MESSAGES.DATABASE_ERROR,
        message: `Непредвиденная ошибка при продлении подписки: ${(error as Error).message}`
      }
    }
  }

  /**
   * Получить все подписки пользователя
   */
  async getUserSubscriptions(userId: string | number): Promise<Subscription[]> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })

      if (error) {
        logger.error('Ошибка при получении подписок пользователя:', error)
        return []
      }

      return data as Subscription[]
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении подписок пользователя:', error)
      return []
    }
  }

  /**
   * Получает статистику по подпискам
   * @returns Статистика по подпискам или null в случае ошибки
   */
  static async getSubscriptionStats() {
    try {
      // Общее количество активных подписок
      const { count: totalActive, error: countError } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')

      if (countError) {
        logger.error('Ошибка при получении количества активных подписок:', countError)
        return null
      }

      // Распределение по типам подписок
      const { data: typesData, error: typesError } = await supabase
        .from('subscriptions')
        .select('type')
        .eq('status', 'active')

      if (typesError) {
        logger.error('Ошибка при получении распределения по типам подписок:', typesError)
        return null
      }

      // Подсчитываем количество каждого типа подписки
      const byType: Record<string, number> = {}
      typesData.forEach((sub) => {
        const type = sub.type
        byType[type] = (byType[type] || 0) + 1
      })

      // Общий доход
      const { data: revenueData, error: revenueError } = await supabase
        .from('subscriptions')
        .select('price, currency')

      if (revenueError) {
        logger.error('Ошибка при получении данных о доходе:', revenueError)
        return null
      }

      let totalRevenue = 0
      // Конвертируем все в рубли для простоты
      revenueData.forEach((sub) => {
        if (sub.currency === 'USD') {
          // Примерный курс конвертации
          totalRevenue += sub.price * 75
        } else {
          totalRevenue += sub.price
        }
      })

      return {
        totalActive: totalActive || 0,
        byType,
        totalRevenue,
        // Другие статистические данные можно добавить при необходимости
      }
    } catch (error) {
      logger.error('Необработанная ошибка при получении статистики подписок:', error)
      return null
    }
  }
}

// Экспортируем экземпляр сервиса для глобального использования
export const subscriptionService = new SubscriptionService() 