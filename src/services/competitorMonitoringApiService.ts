import axios from 'axios'
import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { API_URL } from '@/config'
import { 
  CompetitorSubscription, 
  CreateSubscriptionRequest,
  SubscriptionResponse,
  SubscriptionsResponse 
} from '@/interfaces/instagram.interface'

interface CompetitorMonitoringOptions {
  competitorUsername: string
  maxReels?: number
  minViews?: number
  maxAgeDays?: number
  deliveryFormat?: 'digest' | 'individual' | 'archive'
}

/**
 * 🚀 API Service для мониторинга конкурентов Instagram
 * Использует готовый backend API
 */
export class CompetitorMonitoringApiService {
  private apiUrl: string

  constructor() {
    // Используем API_URL из конфига (уже настроен правильно)
    this.apiUrl = API_URL
  }

  /**
   * 📋 Получить все подписки пользователя
   */
  async getSubscriptions(
    userTelegramId: string, 
    botName: string
  ): Promise<CompetitorSubscription[]> {
    try {
      logger.info('[Competitor Monitoring API] Getting user subscriptions', {
        userTelegramId,
        botName,
        apiUrl: this.apiUrl
      })

      const response = await axios.get(
        `${this.apiUrl}/api/competitor-subscriptions`,
        {
          params: {
            user_telegram_id: userTelegramId,
            bot_name: botName
          },
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data.success) {
        logger.info('[Competitor Monitoring API] Successfully fetched subscriptions', {
          userTelegramId,
          count: response.data.subscriptions.length
        })
        return response.data.subscriptions
      } else {
        logger.warn('[Competitor Monitoring API] API returned non-success response', {
          userTelegramId,
          response: response.data
        })
        return []
      }

    } catch (error) {
      logger.error('[Competitor Monitoring API] Error fetching subscriptions', {
        error: error instanceof Error ? error.message : String(error),
        userTelegramId,
        botName
      })
      return []
    }
  }

  /**
   * ➕ Создать новую подписку на конкурента
   */
  async createSubscription(
    ctx: MyContext,
    options: CompetitorMonitoringOptions
  ): Promise<{ success: boolean; message: string; subscription?: CompetitorSubscription }> {
    const userTelegramId = ctx.from?.id?.toString()
    const isRu = isRussianFromState(ctx)

    if (!userTelegramId) {
      return {
        success: false,
        message: isRu 
          ? '❌ Ошибка: не удалось определить ваш Telegram ID'
          : '❌ Error: unable to determine your Telegram ID'
      }
    }

    const { competitorUsername, maxReels = 15, minViews = 5000, maxAgeDays = 1, deliveryFormat = 'individual' } = options

    try {
      logger.info('[Competitor Monitoring API] Creating subscription', {
        userTelegramId,
        competitorUsername,
        options,
        apiUrl: this.apiUrl
      })

      // Подготавливаем данные для создания подписки согласно backend схеме
      const subscriptionData = {
        user_telegram_id: userTelegramId,
        bot_name: 'telegram_bot',
        competitor_username: competitorUsername.replace('@', ''),
        max_reels: maxReels,
        min_views: minViews,
        max_age_days: maxAgeDays,
        delivery_format: deliveryFormat
      }

      // Используем готовый backend API endpoint
      const response = await axios.post(
        `${this.apiUrl}/api/competitor-subscriptions`,
        subscriptionData,
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data.success && response.data.subscription) {
        logger.info('[Competitor Monitoring API] Subscription created successfully', {
          userTelegramId,
          competitorUsername,
          subscriptionId: response.data.subscription.id
        })

        // Backend автоматически запустит парсинг через Inngest cron
        const successMessage = isRu
          ? `✅ Подписка на мониторинг @${competitorUsername} создана!

📊 **Параметры мониторинга:**
🎬 Максимум рилсов: ${maxReels}
👀 Минимум просмотров: ${minViews.toLocaleString()}
📅 Возраст контента: до ${maxAgeDays} дней
📦 Формат доставки: ${deliveryFormat === 'digest' ? 'Дайджест' : deliveryFormat === 'individual' ? 'Отдельные сообщения' : 'Архив'}

🚀 Парсинг запустится автоматически каждые 24 часа в 08:00 UTC
📬 Первые результаты придут в течение 24 часов`
          : `✅ Monitoring subscription for @${competitorUsername} created!

📊 **Monitoring Settings:**
🎬 Max reels: ${maxReels}
👀 Min views: ${minViews.toLocaleString()}
📅 Content age: up to ${maxAgeDays} days
📦 Delivery format: ${deliveryFormat}

🚀 Parsing will start automatically every 24 hours at 08:00 UTC
📬 First results will arrive within 24 hours`

        return {
          success: true,
          message: successMessage,
          subscription: response.data.subscription
        }
      } else {
        const errorMessage = response.data.error || response.data.message || 'Unknown error'
        
        logger.error('[Competitor Monitoring API] Failed to create subscription', {
          userTelegramId,
          competitorUsername,
          error: errorMessage,
          response: response.data
        })

        return {
          success: false,
          message: isRu
            ? `❌ Не удалось создать подписку: ${errorMessage}`
            : `❌ Failed to create subscription: ${errorMessage}`
        }
      }

    } catch (error) {
      logger.error('[Competitor Monitoring API] Error creating subscription', {
        error: error instanceof Error ? error.message : String(error),
        userTelegramId,
        competitorUsername,
        options
      })

      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || error.message
        
        return {
          success: false,
          message: isRu
            ? `❌ Ошибка соединения с API: ${errorMessage}`
            : `❌ API connection error: ${errorMessage}`
        }
      } else {
        return {
          success: false,
          message: isRu
            ? '❌ Произошла неожиданная ошибка при создании подписки'
            : '❌ An unexpected error occurred while creating subscription'
        }
      }
    }
  }

  /**
   * 🗑️ Удалить подписку
   */
  async deleteSubscription(
    ctx: MyContext,
    subscriptionId: string
  ): Promise<{ success: boolean; message: string }> {
    const userTelegramId = ctx.from?.id?.toString()
    const isRu = isRussianFromState(ctx)

    if (!userTelegramId) {
      return {
        success: false,
        message: isRu 
          ? '❌ Ошибка: не удалось определить ваш Telegram ID'
          : '❌ Error: unable to determine your Telegram ID'
      }
    }

    try {
      logger.info('[Competitor Monitoring API] Deleting subscription', {
        userTelegramId,
        subscriptionId,
        apiUrl: this.apiUrl
      })

      // Используем готовый backend API endpoint
      const response = await axios.delete(
        `${this.apiUrl}/api/competitor-subscriptions/${subscriptionId}`,
        {
          params: {
            user_telegram_id: userTelegramId,
            bot_name: 'telegram_bot'
          },
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data.success) {
        logger.info('[Competitor Monitoring API] Subscription deleted successfully', {
          userTelegramId,
          subscriptionId
        })

        return {
          success: true,
          message: isRu
            ? '✅ Подписка успешно удалена'
            : '✅ Subscription deleted successfully'
        }
      } else {
        const errorMessage = response.data.error || response.data.message || 'Unknown error'
        
        return {
          success: false,
          message: isRu
            ? `❌ Не удалось удалить подписку: ${errorMessage}`
            : `❌ Failed to delete subscription: ${errorMessage}`
        }
      }

    } catch (error) {
      logger.error('[Competitor Monitoring API] Error deleting subscription', {
        error: error instanceof Error ? error.message : String(error),
        userTelegramId,
        subscriptionId
      })

      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || error.message
        
        return {
          success: false,
          message: isRu
            ? `❌ Ошибка соединения с API: ${errorMessage}`
            : `❌ API connection error: ${errorMessage}`
        }
      } else {
        return {
          success: false,
          message: isRu
            ? '❌ Произошла неожиданная ошибка при удалении подписки'
            : '❌ An unexpected error occurred while deleting subscription'
        }
      }
    }
  }

  /**
   * 🔄 Обновить подписку
   */
  async updateSubscription(
    ctx: MyContext,
    subscriptionId: string,
    updates: Partial<CompetitorMonitoringOptions>
  ): Promise<{ success: boolean; message: string; subscription?: CompetitorSubscription }> {
    const userTelegramId = ctx.from?.id?.toString()
    const isRu = isRussianFromState(ctx)

    if (!userTelegramId) {
      return {
        success: false,
        message: isRu 
          ? '❌ Ошибка: не удалось определить ваш Telegram ID'
          : '❌ Error: unable to determine your Telegram ID'
      }
    }

    try {
      logger.info('[Competitor Monitoring API] Updating subscription', {
        userTelegramId,
        subscriptionId,
        updates,
        apiUrl: this.apiUrl
      })

      const response = await axios.put<SubscriptionResponse>(
        `${this.apiUrl}/api/competitor-subscriptions/${subscriptionId}`,
        {
          ...updates,
          user_telegram_id: userTelegramId,
          bot_name: 'telegram_bot' // Фиксированное имя для консистентности
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data.success && response.data.subscription) {
        logger.info('[Competitor Monitoring API] Subscription updated successfully', {
          userTelegramId,
          subscriptionId
        })

        return {
          success: true,
          message: isRu
            ? '✅ Подписка успешно обновлена'
            : '✅ Subscription updated successfully',
          subscription: response.data.subscription
        }
      } else {
        const errorMessage = response.data.error || response.data.message || 'Unknown error'
        
        return {
          success: false,
          message: isRu
            ? `❌ Не удалось обновить подписку: ${errorMessage}`
            : `❌ Failed to update subscription: ${errorMessage}`
        }
      }

    } catch (error) {
      logger.error('[Competitor Monitoring API] Error updating subscription', {
        error: error instanceof Error ? error.message : String(error),
        userTelegramId,
        subscriptionId,
        updates
      })

      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || error.message
        
        return {
          success: false,
          message: isRu
            ? `❌ Ошибка соединения с API: ${errorMessage}`
            : `❌ API connection error: ${errorMessage}`
        }
      } else {
        return {
          success: false,
          message: isRu
            ? '❌ Произошла неожиданная ошибка при обновлении подписки'
            : '❌ An unexpected error occurred while updating subscription'
        }
      }
    }
  }
}

// Экспортируем экземпляр сервиса для использования в других модулях
export const competitorMonitoringApi = new CompetitorMonitoringApiService()