/**
 * 📈 МОДУЛЬ АНАЛИЗА ТРЕНДОВ И УМНЫХ РЕКОМЕНДАЦИЙ
 * Генерирует инсайты и прогнозы для владельцев ботов
 */

import { supabase } from '@/core/supabase'

export interface TrendAnalysis {
  revenue_forecast: {
    predicted_amount: number
    confidence_level: number
    trend_direction: 'growing' | 'declining' | 'stable'
    growth_rate: number
  }

  seasonality: {
    best_day_of_week: string
    best_hour_of_day: number
    peak_activity_time: string
  }

  alerts: Array<{
    type: 'revenue_drop' | 'user_churn' | 'cost_spike' | 'growth_opportunity'
    severity: 'low' | 'medium' | 'high'
    message: string
    recommendation: string
  }>
}

export interface SmartRecommendations {
  pricing_optimization: Array<{
    service: string
    current_avg_price: number
    suggested_action: string
    expected_impact: string
  }>

  user_retention: {
    at_risk_users: number
    retention_strategies: string[]
  }

  growth_opportunities: {
    underperforming_services: string[]
    trending_services: string[]
    expansion_suggestions: string[]
  }
}

export interface UserSegmentation {
  segments: Array<{
    name: 'VIP' | 'Regular' | 'Occasional' | 'At_Risk' | 'New'
    count: number
    avg_revenue: number
    characteristics: string[]
    retention_rate: number
    recommended_actions: string[]
  }>

  user_journey: {
    avg_time_to_first_purchase: number
    avg_lifetime_value: number
    churn_rate: number
    most_popular_first_service: string
  }
}

/**
 * Анализирует тренды для бота
 */
export async function analyzeTrends(botName: string): Promise<TrendAnalysis> {
  try {
    // Получаем данные за последние 3 месяца для анализа трендов
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const { data: payments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .gte('payment_date', threeMonthsAgo.toISOString())
      .order('payment_date', { ascending: true })

    if (!payments || payments.length === 0) {
      return getDefaultTrendAnalysis()
    }

    // Анализ доходов по месяцам
    const monthlyRevenue = getMonthlyRevenue(payments)
    const forecast = calculateRevenueForecast(monthlyRevenue)

    // Анализ сезонности
    const seasonality = analyzeSeasonality(payments)

    // Генерация алертов
    const alerts = generateAlerts(payments, monthlyRevenue)

    return {
      revenue_forecast: forecast,
      seasonality,
      alerts,
    }
  } catch (error) {
    console.error('❌ Ошибка анализа трендов:', error)
    return getDefaultTrendAnalysis()
  }
}

/**
 * Генерирует умные рекомендации
 */
export async function generateSmartRecommendations(
  botName: string
): Promise<SmartRecommendations> {
  try {
    const { data: payments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .order('payment_date', { ascending: false })
      .limit(1000)

    if (!payments || payments.length === 0) {
      return getDefaultRecommendations()
    }

    // Анализ ценообразования
    const pricingOptimization = analyzePricingOptimization(payments)

    // Анализ удержания пользователей
    const userRetention = analyzeUserRetention(payments)

    // Поиск возможностей роста
    const growthOpportunities = analyzeGrowthOpportunities(payments)

    return {
      pricing_optimization: pricingOptimization,
      user_retention: userRetention,
      growth_opportunities: growthOpportunities,
    }
  } catch (error) {
    console.error('❌ Ошибка генерации рекомендаций:', error)
    return getDefaultRecommendations()
  }
}

/**
 * Сегментирует пользователей
 */
export async function segmentUsers(botName: string): Promise<UserSegmentation> {
  try {
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

    const { data: payments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .order('payment_date', { ascending: false })

    if (!payments || payments.length === 0) {
      return getDefaultSegmentation()
    }

    // Группируем пользователей по активности
    const userStats = getUserStats(payments)
    const segments = createUserSegments(userStats, oneMonthAgo)
    const userJourney = analyzeUserJourney(payments)

    return {
      segments,
      user_journey: userJourney,
    }
  } catch (error) {
    console.error('❌ Ошибка сегментации пользователей:', error)
    return getDefaultSegmentation()
  }
}

// Вспомогательные функции

function getMonthlyRevenue(
  payments: any[]
): Array<{ month: string; revenue: number }> {
  const monthlyMap = new Map<string, number>()

  payments
    .filter(p => p.type === 'MONEY_INCOME' && p.category === 'REAL')
    .forEach(payment => {
      const date = new Date(payment.payment_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      const current = monthlyMap.get(monthKey) || 0
      monthlyMap.set(monthKey, current + (payment.stars || 0))
    })

  return Array.from(monthlyMap.entries())
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

function calculateRevenueForecast(
  monthlyRevenue: Array<{ month: string; revenue: number }>
) {
  if (monthlyRevenue.length < 2) {
    return {
      predicted_amount: 0,
      confidence_level: 0,
      trend_direction: 'stable' as const,
      growth_rate: 0,
    }
  }

  const revenues = monthlyRevenue.map(m => m.revenue)
  const lastMonth = revenues[revenues.length - 1]
  const prevMonth = revenues[revenues.length - 2]

  // Простой линейный тренд
  const growthRate =
    prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth) * 100 : 0
  const predictedAmount = Math.max(0, lastMonth * (1 + growthRate / 100))

  // Определяем направление тренда
  let trendDirection: 'growing' | 'declining' | 'stable' = 'stable'
  if (Math.abs(growthRate) > 5) {
    trendDirection = growthRate > 0 ? 'growing' : 'declining'
  }

  // Уровень уверенности зависит от количества данных
  const confidenceLevel = Math.min(90, monthlyRevenue.length * 20)

  return {
    predicted_amount: Math.round(predictedAmount),
    confidence_level: confidenceLevel,
    trend_direction: trendDirection,
    growth_rate: Math.round(growthRate * 10) / 10,
  }
}

function analyzeSeasonality(payments: any[]) {
  const dayStats = new Map<string, number>()
  const hourStats = new Map<number, number>()

  payments.forEach(payment => {
    const date = new Date(payment.payment_date)
    const dayOfWeek = date.toLocaleDateString('ru-RU', { weekday: 'long' })
    const hour = date.getHours()

    dayStats.set(dayOfWeek, (dayStats.get(dayOfWeek) || 0) + 1)
    hourStats.set(hour, (hourStats.get(hour) || 0) + 1)
  })

  // Находим лучший день недели
  const bestDay =
    Array.from(dayStats.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] ||
    'понедельник'

  // Находим лучший час
  const bestHour =
    Array.from(hourStats.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] || 12

  return {
    best_day_of_week: bestDay,
    best_hour_of_day: bestHour,
    peak_activity_time: `${bestHour}:00-${bestHour + 1}:00`,
  }
}

function generateAlerts(
  payments: any[],
  monthlyRevenue: Array<{ month: string; revenue: number }>
) {
  const alerts: TrendAnalysis['alerts'] = []

  // Проверяем падение доходов
  if (monthlyRevenue.length >= 2) {
    const lastMonth = monthlyRevenue[monthlyRevenue.length - 1].revenue
    const prevMonth = monthlyRevenue[monthlyRevenue.length - 2].revenue

    if (prevMonth > 0 && lastMonth / prevMonth < 0.8) {
      alerts.push({
        type: 'revenue_drop',
        severity: 'high',
        message: `Доходы упали на ${Math.round((1 - lastMonth / prevMonth) * 100)}% по сравнению с прошлым месяцем`,
        recommendation:
          'Проанализируйте причины снижения и рассмотрите проведение акции',
      })
    }
  }

  // Проверяем отток пользователей
  const recentUsers = new Set(
    payments
      .filter(p => {
        const date = new Date(p.payment_date)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        return date >= weekAgo
      })
      .map(p => p.telegram_id)
  )

  const prevWeekUsers = new Set(
    payments
      .filter(p => {
        const date = new Date(p.payment_date)
        const twoWeeksAgo = new Date()
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        return date >= twoWeeksAgo && date < weekAgo
      })
      .map(p => p.telegram_id)
  )

  if (prevWeekUsers.size > 0 && recentUsers.size < prevWeekUsers.size * 0.7) {
    alerts.push({
      type: 'user_churn',
      severity: 'medium',
      message: `Активность пользователей снизилась на ${Math.round((1 - recentUsers.size / prevWeekUsers.size) * 100)}%`,
      recommendation: 'Запустите кампанию по возвращению пользователей',
    })
  }

  // Ищем возможности роста
  const serviceStats = new Map<string, number>()
  payments
    .filter(p => p.type === 'MONEY_OUTCOME')
    .forEach(p => {
      const service = p.service_type || 'unknown'
      serviceStats.set(service, (serviceStats.get(service) || 0) + 1)
    })

  const topService = Array.from(serviceStats.entries()).sort(
    ([, a], [, b]) => b - a
  )[0]

  if (topService && topService[1] > 10) {
    alerts.push({
      type: 'growth_opportunity',
      severity: 'low',
      message: `Сервис "${topService[0]}" показывает высокую популярность`,
      recommendation:
        'Рассмотрите расширение функций этого сервиса или создание похожих',
    })
  }

  return alerts
}

function analyzePricingOptimization(payments: any[]) {
  const serviceStats = new Map<string, { total: number; count: number }>()

  payments
    .filter(p => p.type === 'MONEY_OUTCOME' && p.service_type)
    .forEach(payment => {
      const service = payment.service_type
      const current = serviceStats.get(service) || { total: 0, count: 0 }
      current.total += payment.stars || 0
      current.count += 1
      serviceStats.set(service, current)
    })

  return Array.from(serviceStats.entries())
    .filter(([, stats]) => stats.count >= 5) // Минимум 5 операций для анализа
    .map(([service, stats]) => {
      const avgPrice = stats.total / stats.count
      let suggestion = ''
      let impact = ''

      if (avgPrice < 10) {
        suggestion = 'Рассмотрите повышение цены'
        impact = 'Может увеличить доход на 15-25%'
      } else if (avgPrice > 100) {
        suggestion = 'Цена может быть завышена'
        impact = 'Снижение может увеличить объем на 20-30%'
      } else {
        suggestion = 'Цена оптимальна'
        impact = 'Мониторьте конкурентов'
      }

      return {
        service,
        current_avg_price: Math.round(avgPrice * 10) / 10,
        suggested_action: suggestion,
        expected_impact: impact,
      }
    })
    .slice(0, 5) // Топ-5 сервисов
}

function analyzeUserRetention(payments: any[]) {
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const inactiveUsers = new Set<string>()
  const allUsers = new Set<string>()

  payments.forEach(payment => {
    allUsers.add(payment.telegram_id)
    const paymentDate = new Date(payment.payment_date)
    if (paymentDate < twoWeeksAgo) {
      inactiveUsers.add(payment.telegram_id)
    }
  })

  // Пользователи, которые не активны последние 2 недели
  const recentActiveUsers = new Set<string>()
  payments
    .filter(p => new Date(p.payment_date) >= twoWeeksAgo)
    .forEach(p => recentActiveUsers.add(p.telegram_id))

  const atRiskUsers = Array.from(inactiveUsers).filter(
    user => !recentActiveUsers.has(user)
  ).length

  const strategies = [
    'Отправьте персонализированные предложения неактивным пользователям',
    'Создайте программу лояльности для постоянных клиентов',
    'Проведите опрос среди ушедших пользователей',
    'Запустите реферальную программу',
  ]

  return {
    at_risk_users: atRiskUsers,
    retention_strategies: strategies,
  }
}

function analyzeGrowthOpportunities(payments: any[]) {
  const serviceStats = new Map<string, number>()
  const recentServiceStats = new Map<string, number>()

  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  payments
    .filter(p => p.type === 'MONEY_OUTCOME' && p.service_type)
    .forEach(payment => {
      const service = payment.service_type
      serviceStats.set(service, (serviceStats.get(service) || 0) + 1)

      if (new Date(payment.payment_date) >= oneMonthAgo) {
        recentServiceStats.set(
          service,
          (recentServiceStats.get(service) || 0) + 1
        )
      }
    })

  // Находим недоиспользуемые сервисы
  const underperforming = Array.from(serviceStats.entries())
    .filter(([, count]) => count < 5)
    .map(([service]) => service)
    .slice(0, 3)

  // Находим растущие сервисы
  const trending = Array.from(recentServiceStats.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([service]) => service)

  const expansionSuggestions = [
    'Добавьте новые модели для популярных сервисов',
    'Создайте пакетные предложения для часто используемых комбинаций',
    'Рассмотрите интеграцию с популярными платформами',
    'Добавьте функции совместной работы',
  ]

  return {
    underperforming_services: underperforming,
    trending_services: trending,
    expansion_suggestions: expansionSuggestions,
  }
}

function getUserStats(payments: any[]) {
  const userStats = new Map<
    string,
    {
      totalSpent: number
      transactionCount: number
      lastActivity: Date
      firstActivity: Date
    }
  >()

  payments.forEach(payment => {
    const userId = payment.telegram_id
    const paymentDate = new Date(payment.payment_date)
    const amount = payment.stars || 0

    const current = userStats.get(userId) || {
      totalSpent: 0,
      transactionCount: 0,
      lastActivity: paymentDate,
      firstActivity: paymentDate,
    }

    if (payment.type === 'MONEY_OUTCOME') {
      current.totalSpent += amount
      current.transactionCount += 1
    }

    if (paymentDate > current.lastActivity) {
      current.lastActivity = paymentDate
    }
    if (paymentDate < current.firstActivity) {
      current.firstActivity = paymentDate
    }

    userStats.set(userId, current)
  })

  return userStats
}

function createUserSegments(userStats: Map<string, any>, oneMonthAgo: Date) {
  const segments = {
    VIP: {
      users: [],
      avg_revenue: 0,
      characteristics: [
        'Тратят >1000⭐/месяц',
        'Высокая активность',
        'Лояльные клиенты',
      ],
    },
    Regular: {
      users: [],
      avg_revenue: 0,
      characteristics: [
        'Тратят 100-1000⭐/месяц',
        'Регулярная активность',
        'Стабильные клиенты',
      ],
    },
    Occasional: {
      users: [],
      avg_revenue: 0,
      characteristics: [
        'Тратят <100⭐/месяц',
        'Нерегулярная активность',
        'Потенциал роста',
      ],
    },
    At_Risk: {
      users: [],
      avg_revenue: 0,
      characteristics: [
        'Не активны >14 дней',
        'Снижение активности',
        'Нужна реактивация',
      ],
    },
    New: {
      users: [],
      avg_revenue: 0,
      characteristics: [
        'Первая покупка <30 дней',
        'Изучают сервис',
        'Высокий потенциал',
      ],
    },
  }

  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  Array.from(userStats.entries()).forEach(([userId, stats]) => {
    const monthlySpending = stats.totalSpent // Упрощение: считаем все траты как месячные
    const daysSinceLastActivity =
      (new Date().getTime() - stats.lastActivity.getTime()) /
      (1000 * 60 * 60 * 24)
    const daysSinceFirstActivity =
      (new Date().getTime() - stats.firstActivity.getTime()) /
      (1000 * 60 * 60 * 24)

    if (daysSinceLastActivity > 14) {
      segments.At_Risk.users.push(userId)
      segments.At_Risk.avg_revenue += monthlySpending
    } else if (daysSinceFirstActivity < 30) {
      segments.New.users.push(userId)
      segments.New.avg_revenue += monthlySpending
    } else if (monthlySpending > 1000) {
      segments.VIP.users.push(userId)
      segments.VIP.avg_revenue += monthlySpending
    } else if (monthlySpending > 100) {
      segments.Regular.users.push(userId)
      segments.Regular.avg_revenue += monthlySpending
    } else {
      segments.Occasional.users.push(userId)
      segments.Occasional.avg_revenue += monthlySpending
    }
  })

  // Вычисляем средние значения и создаем рекомендации
  return Object.entries(segments).map(([name, data]) => {
    const count = data.users.length
    const avgRevenue = count > 0 ? data.avg_revenue / count : 0

    let recommendedActions: string[] = []
    switch (name) {
      case 'VIP':
        recommendedActions = [
          'Персональный менеджер',
          'Эксклюзивные функции',
          'Программа лояльности',
        ]
        break
      case 'Regular':
        recommendedActions = [
          'Предложения апгрейда',
          'Бонусы за активность',
          'Реферальная программа',
        ]
        break
      case 'Occasional':
        recommendedActions = [
          'Обучающие материалы',
          'Специальные предложения',
          'Напоминания об использовании',
        ]
        break
      case 'At_Risk':
        recommendedActions = [
          'Персональные скидки',
          'Опрос об удовлетворенности',
          'Возвратные кампании',
        ]
        break
      case 'New':
        recommendedActions = [
          'Онбординг',
          'Приветственные бонусы',
          'Обучающий контент',
        ]
        break
    }

    return {
      name: name as 'VIP' | 'Regular' | 'Occasional' | 'At_Risk' | 'New',
      count,
      avg_revenue: Math.round(avgRevenue),
      characteristics: data.characteristics,
      retention_rate: 85, // Упрощение: фиксированное значение
      recommended_actions: recommendedActions,
    }
  })
}

function analyzeUserJourney(payments: any[]) {
  const userFirstPurchase = new Map<string, Date>()
  const userServices = new Map<string, string>()

  payments
    .filter(p => p.type === 'MONEY_OUTCOME')
    .forEach(payment => {
      const userId = payment.telegram_id
      const paymentDate = new Date(payment.payment_date)

      if (
        !userFirstPurchase.has(userId) ||
        paymentDate < userFirstPurchase.get(userId)!
      ) {
        userFirstPurchase.set(userId, paymentDate)
        userServices.set(userId, payment.service_type || 'unknown')
      }
    })

  // Среднее время до первой покупки (упрощение)
  const avgTimeToFirstPurchase = 3 // дней

  // Средняя ценность клиента
  const userStats = getUserStats(payments)
  const totalValue = Array.from(userStats.values()).reduce(
    (sum, stats) => sum + stats.totalSpent,
    0
  )
  const avgLifetimeValue = userStats.size > 0 ? totalValue / userStats.size : 0

  // Самый популярный первый сервис
  const serviceCount = new Map<string, number>()
  Array.from(userServices.values()).forEach(service => {
    serviceCount.set(service, (serviceCount.get(service) || 0) + 1)
  })

  const mostPopularFirstService =
    Array.from(serviceCount.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] ||
    'unknown'

  return {
    avg_time_to_first_purchase: avgTimeToFirstPurchase,
    avg_lifetime_value: Math.round(avgLifetimeValue),
    churn_rate: 15, // Упрощение: фиксированное значение
    most_popular_first_service: mostPopularFirstService,
  }
}

// Функции по умолчанию для случаев с недостатком данных

function getDefaultTrendAnalysis(): TrendAnalysis {
  return {
    revenue_forecast: {
      predicted_amount: 0,
      confidence_level: 0,
      trend_direction: 'stable',
      growth_rate: 0,
    },
    seasonality: {
      best_day_of_week: 'понедельник',
      best_hour_of_day: 12,
      peak_activity_time: '12:00-13:00',
    },
    alerts: [
      {
        type: 'growth_opportunity',
        severity: 'low',
        message: 'Недостаточно данных для анализа трендов',
        recommendation: 'Накопите больше данных для получения точных прогнозов',
      },
    ],
  }
}

function getDefaultRecommendations(): SmartRecommendations {
  return {
    pricing_optimization: [],
    user_retention: {
      at_risk_users: 0,
      retention_strategies: [
        'Создайте программу лояльности',
        'Улучшите пользовательский опыт',
        'Добавьте новые функции',
      ],
    },
    growth_opportunities: {
      underperforming_services: [],
      trending_services: [],
      expansion_suggestions: [
        'Изучите потребности пользователей',
        'Добавьте популярные сервисы',
        'Улучшите маркетинг',
      ],
    },
  }
}

function getDefaultSegmentation(): UserSegmentation {
  return {
    segments: [
      {
        name: 'New',
        count: 0,
        avg_revenue: 0,
        characteristics: ['Новые пользователи'],
        retention_rate: 0,
        recommended_actions: ['Привлеките первых пользователей'],
      },
    ],
    user_journey: {
      avg_time_to_first_purchase: 0,
      avg_lifetime_value: 0,
      churn_rate: 0,
      most_popular_first_service: 'unknown',
    },
  }
}
