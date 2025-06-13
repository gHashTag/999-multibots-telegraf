import { supabase } from '../src/core/supabase'
import { logger } from '../src/utils/logger'
import { SubscriptionType } from '../src/interfaces/subscription.interface'
import { PaymentStatus } from '../src/interfaces/payments.interface'

interface SubscriptionInfo {
  telegram_id: string
  subscription_type: string
  payment_date: string
  status: string
  days_remaining: number
}

async function analyzeSubscriptions() {
  try {
    // Получаем все записи с подписками
    const { data: subscriptions, error } = await supabase
      .from('payments_v2')
      .select('telegram_id, subscription_type, payment_date, status')
      .not('subscription_type', 'is', null)
      .eq('status', PaymentStatus.COMPLETED)
      .order('payment_date', { ascending: false })

    if (error) {
      logger.error('❌ [AnalyzeSubscriptions] Error fetching subscriptions', {
        error,
      })
      return
    }

    if (!subscriptions || subscriptions.length === 0) {
      logger.info('ℹ️ [AnalyzeSubscriptions] No subscriptions found')
      return
    }

    // Анализируем подписки
    const now = new Date()
    const subscriptionInfo: SubscriptionInfo[] = []
    const subscriptionStats = {
      total: subscriptions.length,
      byType: {} as Record<string, number>,
      active: 0,
      expired: 0,
    }

    for (const sub of subscriptions) {
      const paymentDate = new Date(sub.payment_date)
      const daysSincePayment = Math.floor(
        (now.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const daysRemaining = 30 - daysSincePayment // Стандартный срок подписки - 30 дней

      // Исключаем NEUROTESTER из подсчета дней
      const isActive =
        sub.subscription_type === SubscriptionType.NEUROTESTER ||
        daysRemaining > 0

      // Собираем статистику
      subscriptionStats.byType[sub.subscription_type] =
        (subscriptionStats.byType[sub.subscription_type] || 0) + 1
      if (isActive) {
        subscriptionStats.active++
      } else {
        subscriptionStats.expired++
      }

      subscriptionInfo.push({
        telegram_id: sub.telegram_id,
        subscription_type: sub.subscription_type,
        payment_date: sub.payment_date,
        status: isActive ? 'active' : 'expired',
        days_remaining: daysRemaining,
      })
    }

    // Выводим статистику
    logger.info('📊 [AnalyzeSubscriptions] Subscription Statistics', {
      total: subscriptionStats.total,
      active: subscriptionStats.active,
      expired: subscriptionStats.expired,
      byType: subscriptionStats.byType,
    })

    // Выводим детальную информацию по активным подпискам
    const activeSubscriptions = subscriptionInfo.filter(
      sub => sub.status === 'active'
    )
    logger.info('✅ [AnalyzeSubscriptions] Active Subscriptions', {
      count: activeSubscriptions.length,
      subscriptions: activeSubscriptions,
    })

    // Выводим информацию по истекшим подпискам
    const expiredSubscriptions = subscriptionInfo.filter(
      sub => sub.status === 'expired'
    )
    logger.info('❌ [AnalyzeSubscriptions] Expired Subscriptions', {
      count: expiredSubscriptions.length,
      subscriptions: expiredSubscriptions,
    })

    // Сохраняем результаты в файл для дальнейшего анализа
    const fs = require('fs')
    const path = require('path')
    const outputDir = path.join(__dirname, '../artifacts')

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputPath = path.join(outputDir, 'subscription-analysis.json')
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          stats: subscriptionStats,
          activeSubscriptions,
          expiredSubscriptions,
        },
        null,
        2
      )
    )

    logger.info('💾 [AnalyzeSubscriptions] Analysis saved to', {
      path: outputPath,
    })
  } catch (error) {
    logger.error('❌ [AnalyzeSubscriptions] Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// Запускаем анализ
analyzeSubscriptions()
