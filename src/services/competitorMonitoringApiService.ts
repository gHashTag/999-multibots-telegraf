import axios from 'axios'
import { inngest } from '@/inngest_app/client'
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
 * Интегрируется с backend API и Inngest функциями
 */
export class CompetitorMonitoringApiService {
  private apiUrl: string

  constructor() {
    // Используем тот же паттерн определения URL, что и в других сервисах
    this.apiUrl = process.env.NODE_ENV === 'production' 
      ? 'https://ai-server-u14194.vm.elestio.app' 
      : 'http://localhost:2999'
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

      const response = await axios.get<SubscriptionsResponse>(
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

    const { competitorUsername, maxReels = 20, minViews = 1000, maxAgeDays = 7, deliveryFormat = 'digest' } = options

    try {
      logger.info('[Competitor Monitoring API] Creating subscription', {
        userTelegramId,
        competitorUsername,
        options,
        apiUrl: this.apiUrl
      })

      // Подготавливаем данные для создания подписки
      const subscriptionData: CreateSubscriptionRequest = {
        user_telegram_id: userTelegramId,
        bot_name: ctx.botInfo?.username || 'telegram_bot',
        competitor_username: competitorUsername.replace('@', ''),
        max_reels: maxReels,
        min_views: minViews,
        max_age_days: maxAgeDays,
        delivery_format: deliveryFormat
      }

      // Делаем POST запрос для создания подписки
      const response = await axios.post<SubscriptionResponse>(
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

        // Сразу после создания подписки запускаем первоначальный парсинг через Inngest
        await this.triggerInitialParsing(ctx, response.data.subscription)

        const successMessage = isRu
          ? `✅ Подписка на мониторинг @${competitorUsername} создана!

📊 **Параметры мониторинга:**
🎬 Максимум рилсов: ${maxReels}
👀 Минимум просмотров: ${minViews.toLocaleString()}
📅 Возраст контента: до ${maxAgeDays} дней
📦 Формат доставки: ${deliveryFormat === 'digest' ? 'Дайджест' : deliveryFormat === 'individual' ? 'Отдельные сообщения' : 'Архив'}

🚀 Запускаем первоначальный анализ...
📬 Результаты придут в течение 10-15 минут`
          : `✅ Monitoring subscription for @${competitorUsername} created!

📊 **Monitoring Settings:**
🎬 Max reels: ${maxReels}
👀 Min views: ${minViews.toLocaleString()}
📅 Content age: up to ${maxAgeDays} days
📦 Delivery format: ${deliveryFormat}

🚀 Starting initial analysis...
📬 Results will arrive within 10-15 minutes`

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
   * 🚀 Запуск первоначального парсинга через Inngest
   */
  private async triggerInitialParsing(
    ctx: MyContext,
    subscription: CompetitorSubscription
  ): Promise<void> {
    try {
      const userTelegramId = ctx.from?.id?.toString()
      
      if (!userTelegramId) return

      logger.info('[Competitor Monitoring API] Triggering initial parsing via Inngest', {
        subscriptionId: subscription.id,
        competitorUsername: subscription.competitor_username,
        userTelegramId
      })

      // Запускаем Inngest функцию competitorAutoParser для первоначального парсинга
      const inngestResult = await inngest.send({
        name: 'competitor/auto-parser',
        data: {
          subscription_id: subscription.id,
          competitor_username: subscription.competitor_username,
          user_telegram_id: subscription.user_telegram_id,
          bot_name: subscription.bot_name,
          max_reels: subscription.max_reels,
          min_views: subscription.min_views,
          max_age_days: subscription.max_age_days,
          delivery_format: subscription.delivery_format,
          
          // Метаданные для отладки
          trigger_type: 'initial_parsing',
          timestamp: new Date().toISOString(),
          debug_source: 'competitor-monitoring-api-service'
        },
        user: {
          external_id: userTelegramId
        },
        id: `competitor-parser-${subscription.id}-${Date.now()}`
      })

      logger.info('[Competitor Monitoring API] Initial parsing triggered successfully', {
        subscriptionId: subscription.id,
        inngestResult
      })

    } catch (error) {
      logger.error('[Competitor Monitoring API] Error triggering initial parsing', {
        error: error instanceof Error ? error.message : String(error),
        subscriptionId: subscription.id
      })
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

      const response = await axios.delete<SubscriptionResponse>(
        `${this.apiUrl}/api/competitor-subscriptions/${subscriptionId}`,
        {
          params: {
            user_telegram_id: userTelegramId,
            bot_name: ctx.botInfo?.username || 'telegram_bot'
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
          bot_name: ctx.botInfo?.username || 'telegram_bot'
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