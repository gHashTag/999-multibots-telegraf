/**
 * 🔔 СИСТЕМА УМНЫХ УВЕДОМЛЕНИЙ
 * Автоматические уведомления владельцам ботов о важных событиях
 */

import { supabase } from '@/core/supabase'
import { analyzeTrends, generateSmartRecommendations } from './trendAnalysis'
import { logger } from './logger'

export interface SmartAlert {
  type:
    | 'revenue_milestone'
    | 'user_milestone'
    | 'performance_alert'
    | 'opportunity'
    | 'weekly_summary'
  severity: 'info' | 'warning' | 'critical' | 'success'
  title: string
  message: string
  action_required: boolean
  recommendations: string[]
  data?: any
}

export interface NotificationSettings {
  revenue_alerts: boolean
  user_alerts: boolean
  performance_alerts: boolean
  weekly_summaries: boolean
  daily_summaries: boolean
  threshold_revenue_drop: number // %
  threshold_user_drop: number // %
}

/**
 * Проверяет все боты и генерирует уведомления
 */
export async function checkAllBotsForAlerts(): Promise<
  Map<string, SmartAlert[]>
> {
  const botAlerts = new Map<string, SmartAlert[]>()

  try {
    // Получаем список всех ботов из таблицы avatars
    const { data: bots } = await supabase
      .from('avatars')
      .select('bot_name')
      .not('bot_name', 'is', null)

    if (!bots) return botAlerts

    const uniqueBots = Array.from(new Set(bots.map(b => b.bot_name))).filter(
      bot => bot && bot.trim() !== ''
    )

    // Проверяем каждого бота
    for (const botName of uniqueBots) {
      try {
        const alerts = await generateAlertsForBot(botName)
        // Добавляем всех ботов, даже если у них нет алертов
        botAlerts.set(botName, alerts)
      } catch (error) {
        logger.error(`Ошибка генерации алертов для ${botName}:`, error)
        // Добавляем бота с пустым массивом алертов при ошибке
        botAlerts.set(botName, [])
      }
    }

    return botAlerts
  } catch (error) {
    logger.error('Ошибка проверки ботов для алертов:', error)
    return botAlerts
  }
}

/**
 * Генерирует алерты для конкретного бота
 */
export async function generateAlertsForBot(
  botName: string
): Promise<SmartAlert[]> {
  const alerts: SmartAlert[] = []

  try {
    // Получаем базовую статистику
    const { data: recentPayments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .gte(
        'payment_date',
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order('payment_date', { ascending: false })

    if (!recentPayments) return alerts

    // 1. Проверяем достижения по доходам
    const revenueAlerts = await checkRevenueAlerts(botName, recentPayments)
    alerts.push(...revenueAlerts)

    // 2. Проверяем пользовательские метрики
    const userAlerts = await checkUserAlerts(botName, recentPayments)
    alerts.push(...userAlerts)

    // 3. Проверяем производительность
    const performanceAlerts = await checkPerformanceAlerts(
      botName,
      recentPayments
    )
    alerts.push(...performanceAlerts)

    // 4. Ищем возможности
    const opportunityAlerts = await checkOpportunityAlerts(botName)
    alerts.push(...opportunityAlerts)

    return alerts
  } catch (error) {
    logger.error(`Ошибка генерации алертов для ${botName}:`, error)
    return alerts
  }
}

/**
 * Проверяет алерты по доходам
 */
async function checkRevenueAlerts(
  botName: string,
  recentPayments: any[]
): Promise<SmartAlert[]> {
  const alerts: SmartAlert[] = []

  try {
    // Доходы за последнюю неделю
    const weekRevenue = recentPayments
      .filter(p => p.type === 'MONEY_INCOME' && p.category === 'REAL')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    // Доходы за предыдущую неделю
    const { data: prevWeekPayments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .eq('type', 'MONEY_INCOME')
      .eq('category', 'REAL')
      .gte(
        'payment_date',
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      )
      .lt(
        'payment_date',
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      )

    const prevWeekRevenue = prevWeekPayments
      ? prevWeekPayments.reduce((sum, p) => sum + (p.stars || 0), 0)
      : 0

    // Проверяем рост доходов
    if (weekRevenue > 0 && prevWeekRevenue > 0) {
      const growthRate =
        ((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100

      if (growthRate > 50) {
        alerts.push({
          type: 'revenue_milestone',
          severity: 'success',
          title: '🚀 Отличный рост доходов!',
          message: `Доходы выросли на ${Math.round(growthRate)}% за неделю (${weekRevenue.toLocaleString()}⭐)`,
          action_required: false,
          recommendations: [
            'Проанализируйте, что привело к росту',
            'Масштабируйте успешные стратегии',
            'Подготовьтесь к увеличению нагрузки',
          ],
          data: {
            growth_rate: growthRate,
            current_revenue: weekRevenue,
            prev_revenue: prevWeekRevenue,
          },
        })
      } else if (growthRate < -30) {
        alerts.push({
          type: 'revenue_milestone',
          severity: 'warning',
          title: '📉 Снижение доходов',
          message: `Доходы упали на ${Math.round(Math.abs(growthRate))}% за неделю`,
          action_required: true,
          recommendations: [
            'Проанализируйте причины снижения',
            'Запустите акцию или промо-кампанию',
            'Проверьте работоспособность сервисов',
            'Свяжитесь с неактивными пользователями',
          ],
          data: {
            growth_rate: growthRate,
            current_revenue: weekRevenue,
            prev_revenue: prevWeekRevenue,
          },
        })
      }
    }

    // Проверяем достижение круглых сумм
    const totalRevenue = await getTotalRevenue(botName)
    const milestones = [
      1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000,
    ]

    for (const milestone of milestones) {
      if (totalRevenue >= milestone && totalRevenue - weekRevenue < milestone) {
        alerts.push({
          type: 'revenue_milestone',
          severity: 'success',
          title: '🎉 Достижение!',
          message: `Поздравляем! Общий доход достиг ${milestone.toLocaleString()}⭐`,
          action_required: false,
          recommendations: [
            'Отпразднуйте достижение с командой',
            'Поделитесь успехом с пользователями',
            'Поставьте новую цель',
          ],
          data: { milestone, total_revenue: totalRevenue },
        })
        break // Только одно достижение за раз
      }
    }

    return alerts
  } catch (error) {
    logger.error('Ошибка проверки алертов по доходам:', error)
    return alerts
  }
}

/**
 * Проверяет алерты по пользователям
 */
async function checkUserAlerts(
  botName: string,
  recentPayments: any[]
): Promise<SmartAlert[]> {
  const alerts: SmartAlert[] = []

  try {
    // Активные пользователи за неделю
    const activeUsers = new Set(recentPayments.map(p => p.telegram_id)).size

    // Новые пользователи за неделю
    const { data: allUsers } = await supabase
      .from('users')
      .select('telegram_id, created_at')
      .eq('bot_name', botName)

    if (!allUsers) return alerts

    const newUsers = allUsers.filter(u => {
      const createdAt = new Date(u.created_at)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      return createdAt >= weekAgo
    }).length

    // Проверяем рост пользователей
    if (newUsers > 10) {
      alerts.push({
        type: 'user_milestone',
        severity: 'success',
        title: '👥 Приток новых пользователей!',
        message: `За неделю присоединилось ${newUsers} новых пользователей`,
        action_required: false,
        recommendations: [
          'Подготовьте онбординг для новичков',
          'Создайте приветственные материалы',
          'Проанализируйте источники трафика',
        ],
        data: { new_users: newUsers, active_users: activeUsers },
      })
    }

    // Проверяем общее количество пользователей
    const totalUsers = allUsers.length
    const userMilestones = [
      100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
    ]

    for (const milestone of userMilestones) {
      if (totalUsers >= milestone && totalUsers - newUsers < milestone) {
        alerts.push({
          type: 'user_milestone',
          severity: 'success',
          title: '🎯 Пользовательская веха!',
          message: `У вас теперь ${totalUsers.toLocaleString()} пользователей!`,
          action_required: false,
          recommendations: [
            'Поблагодарите сообщество',
            'Запустите специальную акцию',
            'Расширьте команду поддержки',
          ],
          data: { milestone, total_users: totalUsers },
        })
        break
      }
    }

    return alerts
  } catch (error) {
    logger.error('Ошибка проверки пользовательских алертов:', error)
    return alerts
  }
}

/**
 * Проверяет алерты по производительности
 */
async function checkPerformanceAlerts(
  botName: string,
  recentPayments: any[]
): Promise<SmartAlert[]> {
  const alerts: SmartAlert[] = []

  try {
    // Анализируем ошибки и проблемы
    const outcomes = recentPayments.filter(p => p.type === 'MONEY_OUTCOME')
    const avgTransactionValue =
      outcomes.length > 0
        ? outcomes.reduce((sum, p) => sum + (p.stars || 0), 0) / outcomes.length
        : 0

    // Проверяем аномально низкие траты
    if (outcomes.length > 10 && avgTransactionValue < 5) {
      alerts.push({
        type: 'performance_alert',
        severity: 'warning',
        title: '⚠️ Низкий средний чек',
        message: `Средний чек составляет ${avgTransactionValue.toFixed(1)}⭐`,
        action_required: true,
        recommendations: [
          'Проверьте корректность ценообразования',
          'Рассмотрите повышение цен',
          'Добавьте премиум-функции',
          'Улучшите качество сервисов',
        ],
        data: {
          avg_transaction: avgTransactionValue,
          transaction_count: outcomes.length,
        },
      })
    }

    // Проверяем высокую активность
    if (outcomes.length > 100) {
      alerts.push({
        type: 'performance_alert',
        severity: 'info',
        title: '🔥 Высокая активность!',
        message: `${outcomes.length} транзакций за неделю`,
        action_required: false,
        recommendations: [
          'Мониторьте производительность серверов',
          'Подготовьтесь к масштабированию',
          'Проверьте качество обслуживания',
        ],
        data: { transaction_count: outcomes.length },
      })
    }

    return alerts
  } catch (error) {
    logger.error('Ошибка проверки алертов производительности:', error)
    return alerts
  }
}

/**
 * Проверяет возможности для роста
 */
async function checkOpportunityAlerts(botName: string): Promise<SmartAlert[]> {
  const alerts: SmartAlert[] = []

  try {
    const recommendations = await generateSmartRecommendations(botName)

    // Проверяем возможности оптимизации цен
    const pricingOpportunities = recommendations.pricing_optimization.filter(
      p =>
        p.suggested_action.includes('повышение') ||
        p.suggested_action.includes('снижение')
    )

    if (pricingOpportunities.length > 0) {
      alerts.push({
        type: 'opportunity',
        severity: 'info',
        title: '💰 Возможности оптимизации цен',
        message: `Найдено ${pricingOpportunities.length} возможностей для оптимизации ценообразования`,
        action_required: false,
        recommendations: pricingOpportunities.map(
          p => `${p.service}: ${p.suggested_action} (${p.expected_impact})`
        ),
        data: { opportunities: pricingOpportunities },
      })
    }

    // Проверяем пользователей под риском
    if (recommendations.user_retention.at_risk_users > 0) {
      alerts.push({
        type: 'opportunity',
        severity: 'warning',
        title: '👥 Пользователи под риском',
        message: `${recommendations.user_retention.at_risk_users} пользователей не активны более 2 недель`,
        action_required: true,
        recommendations: recommendations.user_retention.retention_strategies,
        data: { at_risk_users: recommendations.user_retention.at_risk_users },
      })
    }

    return alerts
  } catch (error) {
    logger.error('Ошибка проверки возможностей:', error)
    return alerts
  }
}

/**
 * Генерирует еженедельную сводку
 */
export async function generateWeeklySummary(
  botName: string
): Promise<SmartAlert> {
  try {
    const trends = await analyzeTrends(botName)
    const recommendations = await generateSmartRecommendations(botName)

    // Получаем статистику за неделю
    const { data: weekPayments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .gte(
        'payment_date',
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      )

    const weekRevenue =
      weekPayments
        ?.filter(p => p.type === 'MONEY_INCOME' && p.category === 'REAL')
        .reduce((sum, p) => sum + (p.stars || 0), 0) || 0

    const weekTransactions =
      weekPayments?.filter(p => p.type === 'MONEY_OUTCOME').length || 0
    const activeUsers = new Set(weekPayments?.map(p => p.telegram_id) || [])
      .size

    let summaryMessage = `📊 Еженедельная сводка:\n\n`
    summaryMessage += `💰 Доходы: ${weekRevenue.toLocaleString()}⭐\n`
    summaryMessage += `🔄 Транзакций: ${weekTransactions}\n`
    summaryMessage += `👥 Активных пользователей: ${activeUsers}\n\n`

    if (trends.revenue_forecast.growth_rate !== 0) {
      const trendEmoji = trends.revenue_forecast.growth_rate > 0 ? '📈' : '📉'
      summaryMessage += `${trendEmoji} Тренд: ${trends.revenue_forecast.growth_rate > 0 ? '+' : ''}${trends.revenue_forecast.growth_rate}%\n`
    }

    summaryMessage += `🔮 Прогноз на месяц: ${trends.revenue_forecast.predicted_amount.toLocaleString()}⭐\n`
    summaryMessage += `⏰ Пик активности: ${trends.seasonality.peak_activity_time}`

    const weeklyRecommendations = [
      'Проанализируйте результаты недели',
      'Подготовьте план на следующую неделю',
      'Проверьте обратную связь пользователей',
    ]

    if (recommendations.user_retention.at_risk_users > 0) {
      weeklyRecommendations.push(
        `Свяжитесь с ${recommendations.user_retention.at_risk_users} неактивными пользователями`
      )
    }

    return {
      type: 'weekly_summary',
      severity: 'info',
      title: '📅 Еженедельная сводка',
      message: summaryMessage,
      action_required: false,
      recommendations: weeklyRecommendations,
      data: {
        week_revenue: weekRevenue,
        week_transactions: weekTransactions,
        active_users: activeUsers,
        growth_rate: trends.revenue_forecast.growth_rate,
      },
    }
  } catch (error) {
    logger.error('Ошибка генерации еженедельной сводки:', error)
    return {
      type: 'weekly_summary',
      severity: 'warning',
      title: '📅 Еженедельная сводка',
      message: 'Не удалось сгенерировать сводку из-за ошибки',
      action_required: false,
      recommendations: ['Проверьте систему аналитики'],
      data: {},
    }
  }
}

/**
 * Форматирует алерт для отправки
 */
export function formatAlertMessage(alert: SmartAlert): string {
  const severityEmoji = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
    success: '✅',
  }[alert.severity]

  let message = `${severityEmoji} <b>${alert.title}</b>\n\n`
  message += `${alert.message}\n\n`

  if (alert.recommendations.length > 0) {
    message += `💡 <b>Рекомендации:</b>\n`
    alert.recommendations.forEach((rec, index) => {
      message += `${index + 1}. ${rec}\n`
    })
  }

  if (alert.action_required) {
    message += `\n🎯 <b>Требуется действие!</b>`
  }

  return message
}

// Вспомогательные функции

async function getTotalRevenue(botName: string): Promise<number> {
  const { data: payments } = await supabase
    .from('payments_v2')
    .select('stars')
    .eq('bot_name', botName)
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_INCOME')
    .eq('category', 'REAL')

  return payments?.reduce((sum, p) => sum + (p.stars || 0), 0) || 0
}
