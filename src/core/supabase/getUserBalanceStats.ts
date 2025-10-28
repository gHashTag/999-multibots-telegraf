import { logger } from '@/utils/enhancedLogger'
import { supabase } from './client'
import {
  TelegramId,
  normalizeTelegramId,
} from '../../interfaces/telegram.interface'
import {
  UserBalanceStats,
  RubPurchaseDetail,
  XtrPurchaseDetail,
  ServiceUsageDetail,
} from './getUserBalance'

// Добавляем определение интерфейса здесь
interface GetUserBalanceStatsParams {
  p_user_telegram_id: string
  p_bot_name?: string // Сделаем bot_name опциональным, как в SQL
}

// Новый интерфейс для статистики по боту с учетом себестоимости
export interface BotStatistics {
  bot_name: string
  neurovideo_income: number
  stars_topup_income: number
  total_income: number
  total_outcome: number
  total_cost: number // Себестоимость в звездах
  net_profit: number // Чистая прибыль (доход - расход - себестоимость)
}

// Новый интерфейс для результата SQL-функции
export interface UserBalanceStatsResult {
  stats: BotStatistics[]
}

// Обновленные интерфейсы согласно реальной структуре БД
export interface PaymentV2Record {
  id: number
  telegram_id: number
  payment_date: string
  amount: number
  description: string | null
  metadata: Record<string, any>
  stars: number
  currency: string
  inv_id: string | null
  invoice_url: string | null
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  type:
    | 'MONEY_INCOME'
    | 'MONEY_OUTCOME'
    | 'BONUS'
    | 'REFUND'
    | 'SUBSCRIPTION_PURCHASE'
    | 'SUBSCRIPTION_RENEWAL'
    | 'REFERRAL'
    | 'SYSTEM'
  service_type: string | null
  operation_id: string | null
  bot_name: string
  language: string
  payment_method: string | null
  subscription_type: string | null
  is_system_payment: boolean
  created_at: string
  cost: number | null // Себестоимость операции
  category: string
}

export interface UserRecord {
  id: string
  telegram_id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  created_at: string
  updated_at: string
  bot_name: string
}

export interface BotStatsWithCost {
  // Финансовые метрики (общие)
  total_income: number
  total_outcome: number
  total_cost: number
  net_profit: number
  profit_margin: number
  cost_percentage: number

  // Детализация по валютам - Рубли
  rub_income: number
  rub_outcome: number
  rub_net_result: number
  rub_income_transactions: number
  rub_outcome_transactions: number

  // Детализация по валютам - Звезды
  stars_income: number
  stars_outcome: number
  stars_cost: number
  stars_net_result: number
  stars_income_transactions: number
  stars_outcome_transactions: number

  // Пользовательские метрики
  total_users: number
  active_users_today: number
  active_users_week: number
  active_users_month: number
  new_users_today: number
  new_users_week: number
  new_users_month: number

  // Операционные метрики
  total_transactions: number
  transactions_today: number
  transactions_week: number
  transactions_month: number
  avg_transaction_value: number

  // Метрики роста и конверсии
  user_growth_rate: number
  revenue_growth_rate: number
  conversion_rate: number
  retention_rate: number

  // Анализ сервисов
  top_services: ServiceProfitabilityStats[]

  // Рекомендации
  recommendations: string[]
}

export interface ServiceProfitabilityStats {
  service_name: string
  service_display_name: string
  emoji: string
  transaction_count: number
  total_revenue: number
  total_cost: number
  profit: number
  profit_margin: number
  cost_percentage: number
  avg_transaction_value: number
  growth_trend: 'up' | 'down' | 'stable'
}

/**
 * Получает всю статистику баланса пользователя одним запросом для конкретного бота.
 * Временная реализация работает напрямую с таблицей payments_v2 до создания SQL функции.
 */
export const getUserBalanceStats = async (
  userTelegramId: string,
  botName?: string
): Promise<UserBalanceStatsResult | null> => {
  if (!userTelegramId) {
    logger.warn(
      '[getUserBalanceStats] Attempted to fetch stats without userTelegramId'
    )
    return null
  }

  try {
    logger.info('[getUserBalanceStats] Calculating stats from payments_v2:', {
      userTelegramId,
      botName,
    })

    // Получаем все платежи пользователя для указанного бота
    let query = supabase
      .from('payments_v2')
      .select('bot_name, stars, type, service_type, cost, status, category')
      .eq('telegram_id', parseInt(userTelegramId))
      .eq('status', 'COMPLETED')

    if (botName) {
      query = query.eq('bot_name', botName)
    }

    const { data: payments, error } = await query

    if (error) {
      logger.error('[getUserBalanceStats] Error fetching payments:', {
        error: error.message,
        userTelegramId,
        botName,
      })
      return null
    }

    if (!payments || payments.length === 0) {
      logger.warn('[getUserBalanceStats] No payments found:', {
        userTelegramId,
        botName,
      })
      return { stats: [] }
    }

    // Группируем платежи по ботам
    const botStatsMap = new Map<string, BotStatistics>()

    payments.forEach(payment => {
      const currentBotName = payment.bot_name || 'unknown'

      if (!botStatsMap.has(currentBotName)) {
        botStatsMap.set(currentBotName, {
          bot_name: currentBotName,
          neurovideo_income: 0,
          stars_topup_income: 0,
          total_income: 0,
          total_outcome: 0,
          total_cost: 0,
          net_profit: 0,
        })
      }

      const stats = botStatsMap.get(currentBotName)!
      const stars = payment.stars || 0
      const cost = payment.cost || 0

      if (payment.type === 'MONEY_INCOME' && payment.category === 'REAL') {
        stats.total_income += stars

        // Разделяем доходы по типам
        if (payment.service_type === 'neurovideo') {
          stats.neurovideo_income += stars
        } else if (payment.service_type === 'topup' || !payment.service_type) {
          stats.stars_topup_income += stars
        }
      } else if (
        payment.type === 'MONEY_OUTCOME' &&
        payment.category === 'REAL'
      ) {
        stats.total_outcome += stars
        stats.total_cost += cost
      }

      // Рассчитываем чистую прибыль
      stats.net_profit =
        stats.total_income - stats.total_outcome - stats.total_cost
    })

    const result: UserBalanceStatsResult = {
      stats: Array.from(botStatsMap.values()),
    }

    logger.info('[getUserBalanceStats] Stats calculated successfully:', {
      userTelegramId,
      botName,
      stats_count: result.stats.length,
      stats: result.stats,
    })

    return result
  } catch (e) {
    logger.error('[getUserBalanceStats] Unexpected error:', {
      userTelegramId,
      botName,
      error: e instanceof Error ? e.message : String(e),
      error_stack: e instanceof Error ? e.stack : undefined,
    })
    return null
  }
}

// Вспомогательная функция для безопасного форматирования даты, если она приходит из RPC
// Может быть такой же, как в statsCommand, или вынесена в utils
const formatDateSafe = (dateString: any): string => {
  if (dateString === null || typeof dateString === 'undefined') return 'N/A' // Более строгая проверка
  if (
    typeof dateString !== 'string' &&
    typeof dateString !== 'number' &&
    !(dateString instanceof Date)
  ) {
    // Разрешаем числа и объекты Date
    return 'Invalid Input Type'
  }
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid Date' // Проверка на валидность даты
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  } catch (e) {
    logger.warn(
      '[formatDateSafe] Ошибка при форматировании даты в getUserBalanceStats',
      { input: dateString, error: e }
    )
    return 'Formatting Error'
  }
}

/**
 * Получает статистику бота с учетом себестоимости
 */
export async function getBotStatsWithCost(
  botName: string,
  timeframe: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' = 'all'
): Promise<BotStatsWithCost> {
  try {
    const currentTime = new Date()

    // Получаем все платежи для бота
    // ИСПРАВЛЕНИЕ: Используем пагинацию для получения ВСЕХ записей
    let allPayments: PaymentV2Record[] = []
    let from = 0
    const batchSize = 1000
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', botName)
        .eq('status', 'COMPLETED')
        .range(from, from + batchSize - 1)
        .order('created_at', { ascending: false })

      // Применяем фильтр по времени если нужно
      if (timeframe !== 'all') {
        let startDate: string
        switch (timeframe) {
          case 'today': {
            startDate = currentTime.toISOString().split('T')[0]
            break
          }
          case 'week': {
            const weekAgo = new Date(
              currentTime.getTime() - 7 * 24 * 60 * 60 * 1000
            )
            startDate = weekAgo.toISOString()
            break
          }
          case 'month': {
            const monthAgo = new Date(
              currentTime.getTime() - 30 * 24 * 60 * 60 * 1000
            )
            startDate = monthAgo.toISOString()
            break
          }
          case 'quarter': {
            const quarterAgo = new Date(
              currentTime.getTime() - 90 * 24 * 60 * 60 * 1000
            )
            startDate = quarterAgo.toISOString()
            break
          }
          case 'year': {
            const yearAgo = new Date(
              currentTime.getTime() - 365 * 24 * 60 * 60 * 1000
            )
            startDate = yearAgo.toISOString()
            break
          }
          default:
            startDate = ''
        }
        if (startDate) {
          query = query.gte('payment_date', startDate)
        }
      }

      const { data: batchPayments, error } = await query

      if (error) throw error

      if (!batchPayments || batchPayments.length === 0) {
        hasMore = false
      } else {
        allPayments = allPayments.concat(batchPayments)
        from += batchSize

        // Если получили меньше чем размер батча, значит это последняя порция
        if (batchPayments.length < batchSize) {
          hasMore = false
        }
      }
    }

    const payments = allPayments

    // Общие финансовые метрики (в звездах)
    // ИСПРАВЛЕНИЕ: Для общих метрик учитываем ВСЕ операции
    const income = payments
      .filter(p => p.type === 'MONEY_INCOME' && p.category === 'REAL')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    const outcome = payments
      .filter(p => p.type === 'MONEY_OUTCOME' && p.category === 'REAL')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    const cost = payments
      .filter(p => p.type === 'MONEY_OUTCOME' && p.category === 'REAL')
      .reduce((sum, p) => sum + (p.cost || 0), 0)

    const netProfit = income - outcome - cost
    const profitMargin = income > 0 ? (netProfit / income) * 100 : 0
    const costPercentage = outcome > 0 ? (cost / outcome) * 100 : 0

    // Детализация по валютам - Рубли (RUB)
    const rubIncomePayments = payments.filter(
      p =>
        p.type === 'MONEY_INCOME' &&
        p.category === 'REAL' &&
        p.currency === 'RUB'
    )
    const rubOutcomePayments = payments.filter(
      p =>
        p.type === 'MONEY_OUTCOME' &&
        p.category === 'REAL' &&
        p.currency === 'RUB'
    )

    const rubIncome = rubIncomePayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    )
    const rubOutcome = rubOutcomePayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    )
    const rubNetResult = rubIncome - rubOutcome

    // Детализация по валютам - Звезды (XTR/STARS) - только РЕАЛЬНЫЕ операции
    const starsIncomePayments = payments.filter(
      p =>
        p.type === 'MONEY_INCOME' &&
        p.category === 'REAL' &&
        (p.currency === 'XTR' || p.currency === 'STARS')
    )
    const starsOutcomePayments = payments.filter(
      p => p.type === 'MONEY_OUTCOME' && p.category === 'REAL'
    )

    const starsIncome = starsIncomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const starsOutcome = starsOutcomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const starsCost = starsOutcomePayments.reduce(
      (sum, p) => sum + (p.cost || 0),
      0
    )
    const starsNetResult = starsIncome - starsOutcome - starsCost

    // Пользовательские метрики
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .eq('bot_name', botName)

    if (usersError) throw usersError

    const totalUsers = users.length
    const today = currentTime.toISOString().split('T')[0]
    const weekAgo = new Date(
      currentTime.getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString()
    const monthAgo = new Date(
      currentTime.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString()

    // Активные пользователи (у кого есть транзакции)
    const activeUsersToday = new Set(
      payments.filter(p => p.payment_date >= today).map(p => p.telegram_id)
    ).size

    const activeUsersWeek = new Set(
      payments.filter(p => p.payment_date >= weekAgo).map(p => p.telegram_id)
    ).size

    const activeUsersMonth = new Set(
      payments.filter(p => p.payment_date >= monthAgo).map(p => p.telegram_id)
    ).size

    // Новые пользователи - используем первую транзакцию как дату "активации"
    // Группируем платежи по пользователям и находим первую транзакцию
    const firstTransactionByUser = new Map<number, string>()
    payments.forEach(payment => {
      if (!firstTransactionByUser.has(payment.telegram_id)) {
        firstTransactionByUser.set(payment.telegram_id, payment.created_at)
      }
    })

    let newUsersToday = 0
    let newUsersWeek = 0
    let newUsersMonth = 0

    firstTransactionByUser.forEach(firstTransactionDate => {
      const transactionDate = new Date(firstTransactionDate)
      if (transactionDate >= new Date(today)) newUsersToday++
      if (transactionDate >= new Date(weekAgo)) newUsersWeek++
      if (transactionDate >= new Date(monthAgo)) newUsersMonth++
    })

    // Операционные метрики
    const totalTransactions = payments.length
    const transactionsToday = payments.filter(
      p => p.payment_date >= today
    ).length
    const transactionsWeek = payments.filter(
      p => p.payment_date >= weekAgo
    ).length
    const transactionsMonth = payments.filter(
      p => p.payment_date >= monthAgo
    ).length
    const avgTransactionValue =
      totalTransactions > 0 ? (income + outcome) / totalTransactions : 0

    // Анализ сервисов
    const topServices = await getTopServicesByProfitability(payments)

    // Рекомендации
    const recommendations = generateRecommendations({
      profitMargin,
      costPercentage,
      conversionRate:
        totalUsers > 0 ? (activeUsersMonth / totalUsers) * 100 : 0,
      topServices,
    })

    return {
      total_income: income,
      total_outcome: outcome,
      total_cost: cost,
      net_profit: netProfit,
      profit_margin: profitMargin,
      cost_percentage: costPercentage,

      // Детализация по валютам - Рубли
      rub_income: rubIncome,
      rub_outcome: rubOutcome,
      rub_net_result: rubNetResult,
      rub_income_transactions: rubIncomePayments.length,
      rub_outcome_transactions: rubOutcomePayments.length,

      // Детализация по валютам - Звезды
      stars_income: starsIncome,
      stars_outcome: starsOutcome,
      stars_cost: starsCost,
      stars_net_result: starsNetResult,
      stars_income_transactions: starsIncomePayments.length,
      stars_outcome_transactions: starsOutcomePayments.length,

      total_users: totalUsers,
      active_users_today: activeUsersToday,
      active_users_week: activeUsersWeek,
      active_users_month: activeUsersMonth,
      new_users_today: newUsersToday,
      new_users_week: newUsersWeek,
      new_users_month: newUsersMonth,

      total_transactions: totalTransactions,
      transactions_today: transactionsToday,
      transactions_week: transactionsWeek,
      transactions_month: transactionsMonth,
      avg_transaction_value: avgTransactionValue,

      user_growth_rate:
        totalUsers > newUsersMonth
          ? (newUsersMonth / (totalUsers - newUsersMonth)) * 100
          : 0,
      revenue_growth_rate: 0, // Требует исторических данных
      conversion_rate:
        totalUsers > 0 ? (activeUsersMonth / totalUsers) * 100 : 0,
      retention_rate:
        activeUsersMonth > 0 ? (activeUsersWeek / activeUsersMonth) * 100 : 0,

      top_services: topServices,
      recommendations: recommendations,
    }
  } catch (error) {
    logger.error('Error in getBotStatsWithCost:', error)
    return getDefaultStats()
  }
}

/**
 * Анализирует топ сервисы по прибыльности
 */
async function getTopServicesByProfitability(
  payments: PaymentV2Record[]
): Promise<ServiceProfitabilityStats[]> {
  // Фильтруем только реальные РАСХОДНЫЕ операции
  // Доходы (MONEY_INCOME) не должны попадать в анализ сервисов
  const realOutcomePayments = payments.filter(
    p => p.category === 'REAL' && p.type === 'MONEY_OUTCOME'
  )

  const serviceMap = new Map<string, any>()

  // Группируем по сервисам
  realOutcomePayments.forEach(payment => {
    const serviceName = getServiceDisplayNameFromMapping(
      payment.service_type,
      payment.description
    )
    const current = serviceMap.get(serviceName) || {
      revenue: 0,
      cost: 0,
      count: 0,
    }

    serviceMap.set(serviceName, {
      revenue: current.revenue + (payment.stars || 0),
      cost: current.cost + (payment.cost || 0),
      count: current.count + 1,
    })
  })

  // Преобразуем в массив и сортируем по прибыли
  return Array.from(serviceMap.entries())
    .map(([serviceName, stats]) => ({
      service_name: serviceName,
      service_display_name: getServiceDisplayTitle(serviceName as UserService),
      emoji: getServiceEmojiFromMapping(serviceName),
      transaction_count: stats.count,
      total_revenue: stats.revenue,
      total_cost: stats.cost,
      profit: stats.revenue - stats.cost,
      profit_margin:
        stats.revenue > 0
          ? ((stats.revenue - stats.cost) / stats.revenue) * 100
          : 0,
      cost_percentage:
        stats.revenue > 0 ? (stats.cost / stats.revenue) * 100 : 0,
      avg_transaction_value: stats.count > 0 ? stats.revenue / stats.count : 0,
      growth_trend: 'stable' as const, // Требует исторических данных для расчета
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)
}

import {
  getServiceDisplayName as getServiceDisplayNameFromMapping,
  getServiceEmoji as getServiceEmojiFromMapping,
  getServiceDisplayTitle,
  UserService,
} from '@/utils/serviceMapping'

/**
 * Генерирует рекомендации на основе метрик
 */
function generateRecommendations(metrics: {
  profitMargin: number
  costPercentage: number
  conversionRate: number
  topServices: ServiceProfitabilityStats[]
}): string[] {
  const recommendations: string[] = []

  if (metrics.profitMargin < 50) {
    recommendations.push(
      '💡 Низкая маржинальность. Рассмотрите оптимизацию себестоимости или повышение цен'
    )
  }

  if (metrics.costPercentage > 30) {
    recommendations.push(
      '⚠️ Высокая себестоимость. Ищите более эффективных поставщиков API'
    )
  }

  if (metrics.conversionRate < 10) {
    recommendations.push(
      '📈 Низкая конверсия. Улучшите onboarding и мотивацию к первой покупке'
    )
  }

  const topService = metrics.topServices[0]
  if (topService && topService.profit_margin > 80) {
    recommendations.push(
      `🚀 Сервис "${topService.service_name}" очень прибыльный. Продвигайте его активнее`
    )
  }

  const lowMarginServices = metrics.topServices.filter(
    s => s.profit_margin < 30
  )
  if (lowMarginServices.length > 0) {
    recommendations.push(
      `🔧 Сервисы с низкой маржой: ${lowMarginServices
        .map(s => s.service_name)
        .join(', ')}. Оптимизируйте их`
    )
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Отличные показатели! Продолжайте в том же духе')
  }

  return recommendations
}

/**
 * Возвращает статистику по умолчанию
 */
function getDefaultStats(): BotStatsWithCost {
  return {
    total_income: 0,
    total_outcome: 0,
    total_cost: 0,
    net_profit: 0,
    profit_margin: 0,
    cost_percentage: 0,

    // Детализация по валютам - Рубли
    rub_income: 0,
    rub_outcome: 0,
    rub_net_result: 0,
    rub_income_transactions: 0,
    rub_outcome_transactions: 0,

    // Детализация по валютам - Звезды
    stars_income: 0,
    stars_outcome: 0,
    stars_cost: 0,
    stars_net_result: 0,
    stars_income_transactions: 0,
    stars_outcome_transactions: 0,

    total_users: 0,
    active_users_today: 0,
    active_users_week: 0,
    active_users_month: 0,
    new_users_today: 0,
    new_users_week: 0,
    new_users_month: 0,
    total_transactions: 0,
    transactions_today: 0,
    transactions_week: 0,
    transactions_month: 0,
    avg_transaction_value: 0,
    user_growth_rate: 0,
    revenue_growth_rate: 0,
    conversion_rate: 0,
    retention_rate: 0,
    top_services: [],
    recommendations: ['📊 Недостаточно данных для анализа'],
  }
}
