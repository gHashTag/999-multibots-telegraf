import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import {
  getUserBalanceStats,
  UserBalanceStatsResult,
  getBotStatsWithCost,
  type BotStatsWithCost,
  type ServiceProfitabilityStats,
} from '@/core/supabase/getUserBalanceStats'
import {
  RubPurchaseDetail,
  XtrPurchaseDetail,
  ServiceUsageDetail,
} from '@/core/supabase/getUserBalance'
import { ADMIN_IDS_ARRAY } from '@/config'
import { getOwnedBots } from '@/core/supabase/getOwnedBots'
import { supabase } from '@/core/supabase'
import { Context } from 'telegraf'
import {
  getServiceEmoji,
  getServiceDisplayTitle,
  UserService,
} from '@/utils/serviceMapping'

// Создаем локальные интерфейсы для избежания конфликтов
interface LocalUserBalanceStats {
  user_telegram_id: string
  user_first_name?: string
  user_last_name?: string
  user_username?: string
  balance_rub?: number
  balance_xtr?: number
  total_spent: number
  total_earned: number
  total_cost: number
  net_contribution: number
  transaction_count: number
  last_activity?: string
  registration_date?: string
  favorite_services: string[]
}

interface DetailedBotStats {
  bot_name: string

  // Финансовые метрики (из BotStatsWithCost)
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

  // Пользовательские метрики (из BotStatsWithCost)
  total_users: number
  active_users_today: number
  active_users_week: number
  active_users_month: number
  new_users_today: number
  new_users_week: number
  new_users_month: number

  // Операционные метрики (из BotStatsWithCost)
  total_transactions: number
  transactions_today: number
  transactions_week: number
  transactions_month: number
  avg_transaction_value: number

  // Метрики роста и конверсии (из BotStatsWithCost)
  user_growth_rate: number
  revenue_growth_rate: number
  conversion_rate: number
  retention_rate: number

  // Анализ сервисов (из BotStatsWithCost)
  top_services: ServiceProfitabilityStats[]

  // Рекомендации (из BotStatsWithCost)
  recommendations: string[]

  // Детальная разбивка по периодам
  daily_stats: PeriodStats[]
  weekly_stats: PeriodStats[]
  monthly_stats: PeriodStats[]

  // Анализ по сервисам
  service_analysis: ServiceAnalysis[]

  // Пользовательская сегментация
  user_segments: UserSegment[]

  // Финансовые тренды
  financial_trends: FinancialTrend[]

  // Дополнительные поля для совместимости
  neurovideo_income: number
  stars_topup_income: number
}

interface PeriodStats {
  period: string // ISO date
  income: number
  outcome: number
  cost: number
  profit: number
  profit_margin: number
  users: number
  transactions: number
  new_users: number
}

interface ServiceAnalysis {
  service_type: string
  service_name: string
  emoji: string

  // Финансовые показатели
  revenue: number
  cost: number
  profit: number
  profit_margin: number
  cost_percentage: number

  // Операционные показатели
  transaction_count: number
  unique_users: number
  avg_transaction_value: number

  // Тренды
  growth_rate: number
  trend: 'growing' | 'declining' | 'stable'

  // Рекомендации
  optimization_potential: string
}

interface UserSegment {
  segment_name: string
  user_count: number
  avg_revenue_per_user: number
  avg_cost_per_user: number
  avg_profit_per_user: number
  characteristics: string[]
}

interface FinancialTrend {
  metric: string
  current_value: number
  previous_value: number
  change_percent: number
  trend: 'up' | 'down' | 'stable'
  interpretation: string
}

export interface StatsTimeframe {
  period: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all'
  start_date?: string
  end_date?: string
}

export interface StatsRecommendations {
  revenue_optimization: string[]
  user_engagement: string[]
  cost_reduction: string[]
  growth_opportunities: string[]
}

/**
 * Форматирует число с округлением до 2 знаков после запятой
 * Убирает лишние нули в конце
 */
const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00'
  }

  // Округляем до 2 знаков после запятой
  const rounded = Math.round(value * 100) / 100

  // Форматируем с 2 знаками после запятой
  const formatted = rounded.toFixed(2)

  // Убираем лишние нули в конце (например, 10.00 -> 10, 10.50 -> 10.5)
  return formatted.replace(/\.?0+$/, '')
}

/**
 * Форматирует процент с округлением до 1 знака после запятой
 */
const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.0'
  }

  const rounded = Math.round(value * 10) / 10
  const formatted = rounded.toFixed(1)

  // Убираем лишний ноль в конце (например, 10.0 -> 10)
  return formatted.replace(/\.0$/, '')
}

// Заменяем существующую formatDate на более надежную formatDateSafe
const formatDateSafe = (dateString: any): string => {
  if (!dateString) return 'N/A'
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      logger.warn(`[formatDateSafe] Невалидная дата: ${dateString}`)
      return 'Invalid Date'
    }
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  } catch (e) {
    logger.error(`[formatDateSafe] Ошибка форматирования даты: ${dateString}`, {
      error: e,
    })
    return 'Error Formatting'
  }
}

/**
 * Настройка команды статистики для бота
 */
export function setupStatsCommand(bot: Telegraf<MyContext>): void {
  bot.command('stats', statsCommand)
  bot.command('debug_stats', debugStatsCommand) // Команда для отладки данных
  bot.command('user_spending', userSpendingCommand) // Команда для просмотра трат пользователей (только для админов)
  bot.command('find_user', findUserCommand) // Команда для поиска пользователей (только для админов)
  bot.command('admin_help', adminHelpCommand) // Справка по админским командам
}

/**
 * Основная команда статистики с поддержкой себестоимости
 */
export async function statsCommand(ctx: MyContext): Promise<void> {
  try {
    const userId = ctx.from?.id?.toString()
    if (!userId) {
      await ctx.reply('❌ Не удалось определить пользователя')
      return
    }

    // Проверяем, является ли пользователь админом
    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))

    // Получаем список ботов пользователя
    const ownedBots = await getOwnedBots(userId)

    // Для админов не требуем наличие собственных ботов
    if (!isAdmin && (!ownedBots || ownedBots.length === 0)) {
      await ctx.reply('❌ У вас нет ботов для просмотра статистики')
      return
    }

    // Парсим аргументы команды
    const args =
      ctx.message && 'text' in ctx.message
        ? ctx.message.text.split(' ').slice(1)
        : []

    const timeframe = parseTimeframe(args[0])
    const isExport = args.includes('--export')
    const isDetailed = args.includes('--detailed')
    const botName =
      args.find(arg => !arg.startsWith('--') && arg !== timeframe) ||
      (ownedBots && ownedBots.length > 0 ? ownedBots[0] : '')

    // Если бот не указан и у пользователя нет ботов
    if (!botName) {
      await ctx.reply(
        '❌ Укажите имя бота для просмотра статистики. Пример: /stats bot_name'
      )
      return
    }

    // Проверяем права доступа к боту (админы имеют доступ ко всем ботам)
    if (!isAdmin && ownedBots && !ownedBots.includes(botName)) {
      await ctx.reply(`❌ У вас нет доступа к боту @${botName}`)
      return
    }

    // Добавляем индикатор SuperAdmin доступа
    const accessType = isAdmin ? '👑 SuperAdmin доступ' : '👤 Владелец бота'
    const analysisType = isDetailed
      ? 'детальную финансовую разбивку'
      : 'статистику с анализом себестоимости'
    await ctx.reply(`📊 Получаю ${analysisType}...\n${accessType}`)

    if (isDetailed) {
      // Показываем детальную разбивку
      const breakdown = await getDetailedFinancialBreakdown(botName)
      const message = formatDetailedFinancialMessage(breakdown, botName)

      // Разбиваем длинное сообщение на части
      const maxLength = 4000
      if (message.length > maxLength) {
        const parts = splitMessage(message, maxLength)
        for (const part of parts) {
          await ctx.reply(part, { parse_mode: 'HTML' })
        }
      } else {
        await ctx.reply(message, { parse_mode: 'HTML' })
      }
      return
    }

    // Получаем статистику с учетом себестоимости
    const stats = await getAdditionalBotMetrics(botName)

    if (isExport) {
      // Экспорт в CSV
      await sendStatsExport(ctx, stats as DetailedBotStats, botName)
    } else {
      // Отправляем форматированную статистику
      const message = formatDetailedStatsMessage(stats as DetailedBotStats)

      // Разбиваем длинное сообщение на части
      const maxLength = 4000
      if (message.length > maxLength) {
        const parts = splitMessage(message, maxLength)
        for (const part of parts) {
          await ctx.reply(part, { parse_mode: 'HTML' })
        }
      } else {
        await ctx.reply(message, { parse_mode: 'HTML' })
      }
    }
  } catch (error) {
    console.error('Error in statsCommand:', error)
    await ctx.reply('❌ Произошла ошибка при получении статистики')
  }
}

/**
 * Парсит временной период из аргументов
 */
function parseTimeframe(
  arg?: string
): 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' {
  switch (arg?.toLowerCase()) {
    case 'today':
    case 'сегодня':
      return 'today'
    case 'week':
    case 'неделя':
      return 'week'
    case 'month':
    case 'месяц':
      return 'month'
    case 'quarter':
    case 'квартал':
      return 'quarter'
    case 'year':
    case 'год':
      return 'year'
    default:
      return 'all'
  }
}

/**
 * Разбивает длинное сообщение на части
 */
function splitMessage(message: string, maxLength: number): string[] {
  const parts: string[] = []
  let currentPart = ''

  const lines = message.split('\n')

  for (const line of lines) {
    if (currentPart.length + line.length + 1 > maxLength) {
      if (currentPart) {
        parts.push(currentPart.trim())
        currentPart = ''
      }
    }
    currentPart += line + '\n'
  }

  if (currentPart.trim()) {
    parts.push(currentPart.trim())
  }

  return parts
}

// Функция получения детальной статистики бота
async function getDetailedBotStats(
  botName: string,
  ownerId: string,
  timeframe: StatsTimeframe
): Promise<DetailedBotStats | null> {
  try {
    // Получаем базовую статистику
    const statsResult = await getUserBalanceStats(ownerId, botName)
    if (!statsResult || statsResult.stats.length === 0) {
      return null
    }

    const baseStats = statsResult.stats[0]

    // Получаем дополнительные метрики
    const additionalMetrics = await getAdditionalBotMetrics(botName)

    // Создаем объект с гарантированными значениями для всех полей
    const detailedStats: DetailedBotStats = {
      // Базовые финансовые метрики из BotStatsWithCost
      total_income: additionalMetrics.total_income || 0,
      total_outcome: additionalMetrics.total_outcome || 0,
      total_cost: additionalMetrics.total_cost || 0,
      net_profit: additionalMetrics.net_profit || 0,
      profit_margin: additionalMetrics.profit_margin || 0,
      cost_percentage: additionalMetrics.cost_percentage || 0,

      // Детализация по валютам - Рубли
      rub_income: additionalMetrics.rub_income || 0,
      rub_outcome: additionalMetrics.rub_outcome || 0,
      rub_net_result: additionalMetrics.rub_net_result || 0,
      rub_income_transactions: additionalMetrics.rub_income_transactions || 0,
      rub_outcome_transactions: additionalMetrics.rub_outcome_transactions || 0,

      // Детализация по валютам - Звезды
      stars_income: additionalMetrics.stars_income || 0,
      stars_outcome: additionalMetrics.stars_outcome || 0,
      stars_cost: additionalMetrics.stars_cost || 0,
      stars_net_result: additionalMetrics.stars_net_result || 0,
      stars_income_transactions:
        additionalMetrics.stars_income_transactions || 0,
      stars_outcome_transactions:
        additionalMetrics.stars_outcome_transactions || 0,

      // Пользовательские метрики
      total_users: additionalMetrics.total_users || 0,
      active_users_today: additionalMetrics.active_users_today || 0,
      active_users_week: additionalMetrics.active_users_week || 0,
      active_users_month: additionalMetrics.active_users_month || 0,
      new_users_today: additionalMetrics.new_users_today || 0,
      new_users_week: additionalMetrics.new_users_week || 0,
      new_users_month: additionalMetrics.new_users_month || 0,

      // Операционные метрики
      total_transactions: additionalMetrics.total_transactions || 0,
      transactions_today: additionalMetrics.transactions_today || 0,
      transactions_week: additionalMetrics.transactions_week || 0,
      transactions_month: additionalMetrics.transactions_month || 0,
      avg_transaction_value: additionalMetrics.avg_transaction_value || 0,

      // Метрики роста и конверсии
      user_growth_rate: additionalMetrics.user_growth_rate || 0,
      revenue_growth_rate: additionalMetrics.revenue_growth_rate || 0,
      conversion_rate: additionalMetrics.conversion_rate || 0,
      retention_rate: additionalMetrics.retention_rate || 0,

      // Анализ сервисов
      top_services: additionalMetrics.top_services || [],
      recommendations: additionalMetrics.recommendations || [],

      // Дополнительные поля
      bot_name: botName,
      neurovideo_income: additionalMetrics.neurovideo_income || 0,
      stars_topup_income: additionalMetrics.stars_topup_income || 0,
      daily_stats: [],
      weekly_stats: [],
      monthly_stats: [],
      service_analysis: [],
      user_segments: [],
      financial_trends: [],
    }

    return detailedStats
  } catch (error) {
    logger.error('[getDetailedBotStats] Error:', { error, botName, ownerId })
    return null
  }
}

/**
 * Получает дополнительные метрики бота
 */
async function getAdditionalBotMetrics(
  botName: string
): Promise<Partial<DetailedBotStats>> {
  try {
    // Используем новую функцию с поддержкой себестоимости
    const stats = await getBotStatsWithCost(botName, 'all')

    // Получаем дополнительные данные для совместимости
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*, category')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')

    if (paymentsError) {
      console.error(
        'Error fetching payments for additional metrics:',
        paymentsError
      )
      return stats
    }

    // Рассчитываем специфичные доходы для совместимости
    const neurovideoIncome = payments
      .filter(
        p =>
          p.type === 'MONEY_INCOME' &&
          (p.description?.includes('NEUROVIDEO') ||
            p.service_type?.includes('video'))
      )
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    const starsTopupIncome = payments
      .filter(
        p =>
          p.type === 'MONEY_INCOME' &&
          (p.description?.includes('пополнен') ||
            p.description?.includes('topup') ||
            p.description?.includes('Пополнение'))
      )
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    return {
      ...stats,
      bot_name: botName,
      neurovideo_income: neurovideoIncome,
      stars_topup_income: starsTopupIncome,
      daily_stats: [],
      weekly_stats: [],
      monthly_stats: [],
      service_analysis: [],
      user_segments: [],
      financial_trends: [],
    }
  } catch (error) {
    console.error('Error in getAdditionalBotMetrics:', error)
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
      recommendations: [],
      bot_name: botName,
      neurovideo_income: 0,
      stars_topup_income: 0,
      daily_stats: [],
      weekly_stats: [],
      monthly_stats: [],
      service_analysis: [],
      user_segments: [],
      financial_trends: [],
    }
  }
}

// Вспомогательные функции
function getTimeCondition(timeframe: StatsTimeframe) {
  const now = new Date()
  let startDate = new Date()

  switch (timeframe.period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0)
      break
    case 'week':
      startDate.setDate(now.getDate() - 7)
      break
    case 'month':
      startDate.setMonth(now.getMonth() - 1)
      break
    case 'quarter':
      startDate.setMonth(now.getMonth() - 3)
      break
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1)
      break
    default:
      startDate = new Date('2020-01-01') // Все время
  }

  return {
    start_date: startDate.toISOString(),
    end_date: now.toISOString(),
  }
}

function getActiveUsersCount(activityData: any[], days: number): number {
  if (!activityData) return 0

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const activeUsers = new Set()
  activityData.forEach(activity => {
    if (new Date(activity.created_at) >= cutoffDate) {
      activeUsers.add(activity.telegram_id)
    }
  })

  return activeUsers.size
}

function aggregateServiceStats(
  serviceData: any[]
): Array<{ service_name: string; usage_count: number; revenue: number }> {
  if (!serviceData) return []

  const serviceMap = new Map()

  serviceData.forEach(service => {
    const name = service.service_type || 'unknown'
    const existing = serviceMap.get(name) || {
      service_name: name,
      usage_count: 0,
      revenue: 0,
    }
    existing.usage_count += 1
    existing.revenue += service.stars || 0
    serviceMap.set(name, existing)
  })

  return Array.from(serviceMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5) // Топ 5 сервисов
}

// Новая функция для агрегации сервисов с учетом себестоимости
function aggregateServiceStatsWithCost(serviceData: any[]): Array<{
  service_name: string
  usage_count: number
  revenue: number
  cost: number
  profit: number
  margin: number
}> {
  if (!serviceData) return []

  const serviceMap = new Map()

  serviceData.forEach(service => {
    const name = service.service_type || 'unknown'
    const existing = serviceMap.get(name) || {
      service_name: name,
      usage_count: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
    }
    existing.usage_count += 1
    existing.revenue += service.stars || 0
    existing.cost += service.cost || 0
    serviceMap.set(name, existing)
  })

  // Рассчитываем прибыль и маржу для каждого сервиса
  const services = Array.from(serviceMap.values()).map(service => {
    service.profit = service.revenue - service.cost
    service.margin =
      service.revenue > 0
        ? Math.round((service.profit / service.revenue) * 100)
        : 0
    return service
  })

  return services
    .sort((a, b) => b.profit - a.profit) // Сортируем по прибыли
    .slice(0, 5) // Топ 5 сервисов
}

function calculateGrowthRate(
  userData: any[],
  timeframe: StatsTimeframe
): number {
  if (!userData || userData.length === 0) return 0

  const now = new Date()
  const periodDays =
    timeframe.period === 'week' ? 7 : timeframe.period === 'month' ? 30 : 365
  const currentPeriodStart = new Date(
    now.getTime() - periodDays * 24 * 60 * 60 * 1000
  )
  const previousPeriodStart = new Date(
    currentPeriodStart.getTime() - periodDays * 24 * 60 * 60 * 1000
  )

  const currentPeriodUsers = userData.filter(
    user => new Date(user.created_at) >= currentPeriodStart
  ).length

  const previousPeriodUsers = userData.filter(
    user =>
      new Date(user.created_at) >= previousPeriodStart &&
      new Date(user.created_at) < currentPeriodStart
  ).length

  if (previousPeriodUsers === 0) return currentPeriodUsers > 0 ? 100 : 0

  return Math.round(
    ((currentPeriodUsers - previousPeriodUsers) / previousPeriodUsers) * 100
  )
}

function calculateRetentionRate(activityData: any[]): number {
  // Упрощенный расчет retention rate
  if (!activityData || activityData.length === 0) return 0

  const uniqueUsers = new Set(activityData.map(a => a.telegram_id))
  const activeLastWeek = getActiveUsersCount(activityData, 7)

  return uniqueUsers.size > 0
    ? Math.round((activeLastWeek / uniqueUsers.size) * 100)
    : 0
}

function calculateConversionRate(userData: any[], activityData: any[]): number {
  if (!userData || !activityData) return 0

  const totalUsers = userData.length
  const payingUsers = new Set(
    activityData.filter(a => a.type === 'MONEY_INCOME').map(a => a.telegram_id)
  ).size

  return totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 100) : 0
}

/**
 * Форматирует детальную статистику в читаемый вид
 */
function formatDetailedStatsMessage(stats: DetailedBotStats): string {
  let message = ''

  // Заголовок
  message += `📊 <b>Детальная статистика @${stats.bot_name}</b>\n\n`

  // Детализация по валютам - Рубли
  message += `💰 <b>Реальные рублевые операции</b>\n`
  message += `   📈 Доходы: ${formatNumber(stats.rub_income)} ₽ (${stats.rub_income_transactions} операций)\n`
  message += `   📉 Расходы: ${formatNumber(stats.rub_outcome)} ₽ (${stats.rub_outcome_transactions} операций)\n`
  message += `   💎 Чистый результат: ${formatNumber(stats.rub_net_result)} ₽\n\n`

  // Детализация по валютам - Звезды
  message += `⭐ <b>Реальные операции в звездах</b>\n`
  message += `   📈 Доходы: ${formatNumber(stats.stars_income)} ⭐ (${stats.stars_income_transactions} операций)\n`
  message += `   📉 Расходы: ${formatNumber(stats.stars_outcome)} ⭐ (${stats.stars_outcome_transactions} операций)\n`
  message += `   🏭 Себестоимость: ${formatNumber(stats.stars_cost)} ⭐\n`
  message += `   💎 Чистый результат: ${formatNumber(stats.stars_net_result)} ⭐\n\n`

  // Общие финансовые показатели
  message += `💰 <b>Финансовые показатели</b>\n`
  message += `   💵 Общий доход: ${formatNumber(stats.total_income)} ⭐️\n`
  message += `   💸 Общий расход: ${formatNumber(stats.total_outcome)} ⭐️\n`
  message += `   🏭 Себестоимость: ${formatNumber(stats.total_cost)} ⭐️\n`
  message += `   💎 Чистая прибыль: ${formatNumber(stats.net_profit)} ⭐️\n`
  message += `   📊 Маржинальность: ${formatPercent(stats.profit_margin)}%\n`
  message += `   📈 Себестоимость от оборота: ${formatPercent(stats.cost_percentage)}%\n\n`

  // Пользовательские метрики
  message += `👥 <b>Пользователи</b>\n`
  message += `   👤 Всего пользователей: ${stats.total_users}\n`
  message += `   🟢 Активных сегодня: ${stats.active_users_today}\n`
  message += `   📅 Активных за неделю: ${stats.active_users_week}\n`
  message += `   📆 Активных за месяц: ${stats.active_users_month}\n`
  message += `   ✨ Новых за месяц: ${stats.new_users_month}\n`
  message += `   📊 Рост пользователей: ${formatPercent(stats.user_growth_rate)}%\n`
  message += `   🎯 Конверсия: ${formatPercent(stats.conversion_rate)}%\n`
  message += `   🔄 Удержание: ${formatPercent(stats.retention_rate)}%\n\n`

  // Операционные метрики
  message += `⚡ <b>Операции</b>\n`
  message += `   🔢 Всего транзакций: ${stats.total_transactions}\n`
  message += `   📈 Средняя сумма: ${formatNumber(stats.avg_transaction_value)} ⭐️\n`
  message += `   📅 За сегодня: ${stats.transactions_today}\n`
  message += `   📊 За неделю: ${stats.transactions_week}\n`
  message += `   📆 За месяц: ${stats.transactions_month}\n\n`

  // Топ сервисы по прибыльности
  if (stats.top_services && stats.top_services.length > 0) {
    message += `🏆 <b>Топ сервисы по прибыльности</b>\n`
    stats.top_services.slice(0, 5).forEach((service, index) => {
      message += `   ${index + 1}. ${service.emoji} ${service.service_display_name}\n`
      message += `      💰 Выручка: ${formatNumber(service.total_revenue)} ⭐️ | 💸 Себестоимость: ${formatNumber(service.total_cost)} ⭐️\n`
      message += `      📈 Прибыль: ${formatNumber(service.profit)} ⭐️ | 📊 Маржа: ${formatPercent(service.profit_margin)}%\n`
      message += `      🔢 Использований: ${service.transaction_count}\n`
    })
    message += '\n'
  }

  // Рекомендации
  if (stats.recommendations && stats.recommendations.length > 0) {
    message += `💡 <b>Рекомендации</b>\n`
    stats.recommendations.forEach(rec => {
      message += `   ${rec}\n`
    })
    message += '\n'
  }

  return message
}

/**
 * Генерирует рекомендации на основе статистики
 */
function generateRecommendations(stats: DetailedBotStats): string[] {
  const recommendations: string[] = []

  // Анализ маржинальности
  if (stats.profit_margin < 50) {
    recommendations.push(
      '💡 Низкая маржинальность. Рассмотрите оптимизацию себестоимости или повышение цен'
    )
  }

  // Анализ себестоимости
  if (stats.cost_percentage > 30) {
    recommendations.push(
      '⚠️ Высокая себестоимость. Ищите более эффективных поставщиков API'
    )
  }

  // Анализ конверсии
  if (stats.conversion_rate < 10) {
    recommendations.push(
      '📈 Низкая конверсия. Улучшите onboarding и мотивацию к первой покупке'
    )
  }

  // Анализ активности
  if (
    stats.total_users > 0 &&
    stats.active_users_today / stats.total_users < 0.1
  ) {
    recommendations.push(
      '📱 Низкая дневная активность. Добавьте push-уведомления и ежедневные задания'
    )
  }

  // Анализ роста
  if (stats.user_growth_rate > 20) {
    recommendations.push('🚀 Отличный рост! Масштабируйте маркетинговые каналы')
  } else if (stats.user_growth_rate < 5) {
    recommendations.push(
      '📢 Медленный рост. Усильте маркетинг и реферальную программу'
    )
  }

  // Анализ топ сервисов
  if (stats.top_services && stats.top_services.length > 0) {
    const topService = stats.top_services[0]
    if (topService.total_revenue / stats.total_income > 0.5) {
      recommendations.push(
        `⚠️ Зависимость от одного сервиса "${topService.service_display_name}". Диверсифицируйте предложение`
      )
    }

    if (topService.profit_margin > 80) {
      recommendations.push(
        `🚀 Сервис "${topService.service_display_name}" очень прибыльный. Продвигайте его активнее`
      )
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Отличные показатели! Продолжайте в том же духе')
  }

  return recommendations
}

/**
 * Экспортирует статистику в CSV формат
 */
function exportStatsToCSV(stats: DetailedBotStats): string {
  const lines = [
    'Метрика,Значение',
    `Название бота,${stats.bot_name}`,
    `Общий доход,${formatNumber(stats.total_income)}`,
    `Общий расход,${formatNumber(stats.total_outcome)}`,
    `Себестоимость,${formatNumber(stats.total_cost)}`,
    `Чистая прибыль,${formatNumber(stats.net_profit)}`,
    `Маржинальность %,${formatPercent(stats.profit_margin)}`,
    `Себестоимость %,${formatPercent(stats.cost_percentage)}`,
    `Всего пользователей,${stats.total_users}`,
    `Активных сегодня,${stats.active_users_today}`,
    `Активных за неделю,${stats.active_users_week}`,
    `Активных за месяц,${stats.active_users_month}`,
    `Новых за месяц,${stats.new_users_month}`,
    `Рост пользователей %,${formatPercent(stats.user_growth_rate)}`,
    `Конверсия %,${formatPercent(stats.conversion_rate)}`,
    `Удержание %,${formatPercent(stats.retention_rate)}`,
    `Всего транзакций,${stats.total_transactions}`,
    `Средняя сумма,${formatNumber(stats.avg_transaction_value)}`,
    '',
    'Топ сервисы по прибыльности',
    'Сервис,Транзакций,Выручка,Себестоимость,Прибыль,Маржа %',
    ...stats.top_services.map(
      service =>
        `${service.service_name},${service.transaction_count},${formatNumber(service.total_revenue)},${formatNumber(service.total_cost)},${formatNumber(service.profit)},${formatPercent(service.profit_margin)}`
    ),
  ]

  return lines.join('\n')
}

// Старая функция formatStatsMessage - можно оставить для совместимости
function formatStatsMessage(
  stats: LocalUserBalanceStats,
  botName: string,
  includeMainHeader = true
): string {
  let message = ''
  if (includeMainHeader) {
    message += `📊 <b>Статистика для бота @${botName}</b>\n\n`
  }

  message += `👤 <b>Пользователь:</b> ${stats.user_telegram_id}\n`
  if (stats.user_first_name || stats.user_last_name) {
    message += `   Имя: ${stats.user_first_name || ''} ${stats.user_last_name || ''}`
    message += `\n`
  }
  if (stats.user_username) {
    message += `   Username: @${stats.user_username}`
    message += `\n`
  }
  message += `\n`

  message += `💰 <b>Баланс</b>\n`
  message += `   RUB: ${formatNumber(stats.balance_rub)} ₽\n`
  message += `   XTR: ${stats.balance_xtr ?? 0} ⭐️\n\n`

  message += `📊 <b>Активность</b>\n`
  message += `   💸 Потрачено: ${formatNumber(stats.total_spent)} ⭐️\n`
  message += `   💰 Заработано: ${formatNumber(stats.total_earned)} ⭐️\n`
  message += `   🏭 Себестоимость: ${formatNumber(stats.total_cost)} ⭐️\n`
  message += `   💎 Вклад в прибыль: ${formatNumber(stats.net_contribution)} ⭐️\n`
  message += `   🔢 Транзакций: ${stats.transaction_count}\n`

  if (stats.last_activity) {
    message += `   🕐 Последняя активность: ${new Date(stats.last_activity).toLocaleDateString('ru-RU')}\n`
  }

  if (stats.registration_date) {
    message += `   📅 Регистрация: ${new Date(stats.registration_date).toLocaleDateString('ru-RU')}\n`
  }

  if (stats.favorite_services && stats.favorite_services.length > 0) {
    message += `   ⭐ Любимые сервисы: ${stats.favorite_services.join(', ')}\n`
  }

  return message
}

// Функция экспорта статистики в CSV
async function sendStatsExport(
  ctx: MyContext,
  stats: DetailedBotStats,
  botName: string
): Promise<void> {
  try {
    const csvData = exportStatsToCSV(stats)
    const fileName = `stats_${botName}_${new Date().toISOString().split('T')[0]}.csv`

    // Создаем временный файл
    const fs = require('fs')
    const path = require('path')
    const tempDir = path.join(process.cwd(), 'tmp')

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const filePath = path.join(tempDir, fileName)
    fs.writeFileSync(filePath, csvData, 'utf8')

    await ctx.replyWithDocument(
      { source: filePath, filename: fileName },
      {
        caption: `📊 Экспорт статистики для @${botName}\n📅 ${formatDateSafe(new Date())}`,
        parse_mode: 'HTML',
      }
    )

    // Удаляем временный файл
    fs.unlinkSync(filePath)
  } catch (error) {
    logger.error('[sendStatsExport] Error:', { error, botName })
    await ctx.reply('❌ Ошибка при создании экспорта. Попробуйте позже.')
  }
}

// Функция getServiceEmoji теперь импортируется из @/utils/serviceMapping

// Новая функция для форматирования статистики по боту
function formatBotStatsMessage(
  stats: DetailedBotStats,
  includeMainHeader = true
): string {
  let message = ''
  if (includeMainHeader) {
    message += `📊 <b>Статистика для бота @${stats.bot_name}</b>\n\n`
  }

  // Доходы
  message += `💰 <b>Доходы</b>\n`
  message += `   Всего дохода: ${formatNumber(stats.total_income)} ⭐️\n`
  message += `   - NEUROVIDEO: ${formatNumber(stats.neurovideo_income)} ⭐️\n`
  message += `   - Пополнения: ${formatNumber(stats.stars_topup_income)} ⭐️\n\n`

  // Расходы
  message += `💸 <b>Расходы пользователей</b>\n`
  message += `   Всего потрачено: ${formatNumber(stats.total_outcome)} ⭐️\n\n`

  // Себестоимость (новое)
  message += `💲 <b>Себестоимость</b>\n`
  message += `   Всего себестоимость: ${formatNumber(stats.total_cost)} ⭐️\n\n`

  // Чистая прибыль (новое)
  message += `📈 <b>Чистая прибыль</b>\n`
  message += `   Прибыль: ${formatNumber(stats.net_profit)} ⭐️\n`
  message += `   (Доход - Расходы - Себестоимость)\n\n`

  return message
}

/**
 * Получает детальную статистику с разбивкой по валютам и типам платежей
 */
async function getDetailedFinancialBreakdown(botName: string): Promise<{
  summary: any
  rub_breakdown: any
  stars_breakdown: any
  bonus_breakdown: any
  verification: any
}> {
  try {
    // Получаем все платежи для бота
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select('*, category')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .order('payment_date', { ascending: false })

    if (error) throw error

    // Функция для определения типа транзакции (исправленная версия)
    const getTransactionCategory = (payment: any) => {
      // MONEY_INCOME всегда должны быть реальными платежами
      if (payment.type === 'MONEY_INCOME') {
        return 'real'
      }
      // Для остальных используем поле category из базы данных
      return payment.category === 'REAL' ? 'real' : 'bonus'
    }

    // Разделяем платежи по категориям
    const realPayments = payments.filter(
      p => getTransactionCategory(p) === 'real'
    )
    const bonusPayments = payments.filter(
      p => getTransactionCategory(p) === 'bonus'
    )

    // Анализ реальных платежей (ВСЕ валюты)
    const realIncomePayments = realPayments.filter(
      p => p.type === 'MONEY_INCOME'
    )
    const realOutcomePayments = realPayments.filter(
      p => p.type === 'MONEY_OUTCOME'
    )

    // Разбивка по валютам для реальных платежей
    const realRubPayments = realPayments.filter(p => p.currency === 'RUB')
    const realStarsPayments = realPayments.filter(
      p => p.currency === 'STARS' || p.currency === 'XTR'
    )

    // Анализ реальных RUB платежей
    const realRubIncome = realRubPayments
      .filter(p => p.type === 'MONEY_INCOME')
      .reduce((sum, p) => sum + (p.amount || 0), 0)

    const realRubOutcome = realRubPayments
      .filter(p => p.type === 'MONEY_OUTCOME')
      .reduce((sum, p) => sum + (p.amount || 0), 0)

    // Анализ реальных STARS платежей
    const realStarsIncome = realStarsPayments
      .filter(p => p.type === 'MONEY_INCOME')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    const realStarsOutcome = realStarsPayments
      .filter(p => p.type === 'MONEY_OUTCOME')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    const realStarsCost = realStarsPayments
      .filter(p => p.type === 'MONEY_OUTCOME')
      .reduce((sum, p) => sum + (p.cost || 0), 0)

    // Анализ бонусных платежей (ВСЕ валюты)
    const bonusIncomePayments = bonusPayments.filter(
      p => p.type === 'MONEY_INCOME'
    )
    const bonusOutcomePayments = bonusPayments.filter(
      p => p.type === 'MONEY_OUTCOME'
    )

    // Разбивка по валютам для бонусных платежей
    const bonusStarsPayments = bonusPayments.filter(
      p => p.currency === 'STARS' || p.currency === 'XTR'
    )

    const bonusStarsIncome = bonusStarsPayments
      .filter(p => p.type === 'MONEY_INCOME')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    const bonusStarsOutcome = bonusStarsPayments
      .filter(p => p.type === 'MONEY_OUTCOME')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    const bonusStarsCost = bonusStarsPayments
      .filter(p => p.type === 'MONEY_OUTCOME')
      .reduce((sum, p) => sum + (p.cost || 0), 0)

    // ОБЩИЕ СУММЫ (как в тесте)
    const totalRealIncomeStars = realIncomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const totalRealIncomeRub = realIncomePayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    )
    const totalRealOutcomeStars = realOutcomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )

    const totalBonusIncomeStars = bonusIncomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const totalBonusOutcomeStars = bonusOutcomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )

    // Топ транзакции для проверки (только реальные)
    const topRealIncomeTransactions = realPayments
      .filter(p => p.type === 'MONEY_INCOME')
      .sort((a, b) => (b.stars || b.amount || 0) - (a.stars || a.amount || 0))
      .slice(0, 5)
      .map(p => ({
        date: p.payment_date,
        amount: p.amount,
        stars: p.stars,
        currency: p.currency,
        description: p.description,
        service_type: p.service_type,
        category: 'real',
      }))

    const topRealOutcomeTransactions = realPayments
      .filter(p => p.type === 'MONEY_OUTCOME')
      .sort((a, b) => (b.stars || b.amount || 0) - (a.stars || a.amount || 0))
      .slice(0, 5)
      .map(p => ({
        date: p.payment_date,
        amount: p.amount,
        stars: p.stars,
        cost: p.cost,
        currency: p.currency,
        description: p.description,
        service_type: p.service_type,
        category: 'real',
      }))

    // Топ бонусных транзакций
    const topBonusTransactions = bonusPayments
      .sort((a, b) => (b.stars || b.amount || 0) - (a.stars || a.amount || 0))
      .slice(0, 5)
      .map(p => ({
        date: p.payment_date,
        amount: p.amount,
        stars: p.stars,
        currency: p.currency,
        description: p.description,
        service_type: p.service_type,
        type: p.type,
        category: 'bonus',
      }))

    // Анализ по периодам
    const now = new Date()
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const recentRealPayments = realPayments.filter(
      p => new Date(p.payment_date) >= lastMonth
    )
    const recentBonusPayments = bonusPayments.filter(
      p => new Date(p.payment_date) >= lastMonth
    )

    return {
      summary: {
        total_payments: payments.length,
        real_payments: realPayments.length,
        bonus_payments: bonusPayments.length,
        date_range: {
          first: payments[payments.length - 1]?.payment_date,
          last: payments[0]?.payment_date,
        },
        currencies_used: Array.from(new Set(payments.map(p => p.currency))),
        payment_types: Array.from(new Set(payments.map(p => p.type))),
        services_used: Array.from(
          new Set(payments.map(p => p.service_type).filter(Boolean))
        ),
      },
      rub_breakdown: {
        total_transactions: realRubPayments.length,
        income: {
          amount: realRubIncome,
          count: realRubPayments.filter(p => p.type === 'MONEY_INCOME').length,
        },
        outcome: {
          amount: realRubOutcome,
          count: realRubPayments.filter(p => p.type === 'MONEY_OUTCOME').length,
        },
        net: realRubIncome - realRubOutcome,
      },
      stars_breakdown: {
        total_transactions:
          realIncomePayments.length + realOutcomePayments.length,
        income: {
          amount: totalRealIncomeStars,
          count: realIncomePayments.length,
        },
        outcome: {
          amount: totalRealOutcomeStars,
          count: realOutcomePayments.length,
          cost: realOutcomePayments.reduce((sum, p) => sum + (p.cost || 0), 0),
        },
        net_revenue: totalRealIncomeStars - totalRealOutcomeStars,
        net_profit:
          totalRealIncomeStars -
          totalRealOutcomeStars -
          realOutcomePayments.reduce((sum, p) => sum + (p.cost || 0), 0),
        margin:
          totalRealIncomeStars > 0
            ? ((totalRealIncomeStars -
                totalRealOutcomeStars -
                realOutcomePayments.reduce(
                  (sum, p) => sum + (p.cost || 0),
                  0
                )) /
                totalRealIncomeStars) *
              100
            : 0,
      },
      bonus_breakdown: {
        total_transactions:
          bonusIncomePayments.length + bonusOutcomePayments.length,
        income: {
          amount: totalBonusIncomeStars,
          count: bonusIncomePayments.length,
        },
        outcome: {
          amount: totalBonusOutcomeStars,
          count: bonusOutcomePayments.length,
          cost: bonusOutcomePayments.reduce((sum, p) => sum + (p.cost || 0), 0),
        },
        net_usage: totalBonusIncomeStars - totalBonusOutcomeStars,
        top_transactions: topBonusTransactions,
      },
      verification: {
        top_real_income_transactions: topRealIncomeTransactions,
        top_real_outcome_transactions: topRealOutcomeTransactions,
        top_bonus_transactions: topBonusTransactions,
        recent_activity: {
          real_last_month: recentRealPayments.length,
          bonus_last_month: recentBonusPayments.length,
        },
        data_quality: {
          payments_with_null_stars: payments.filter(
            p => p.stars === null || p.stars === undefined
          ).length,
          payments_with_null_cost: payments.filter(
            p => p.cost === null || p.cost === undefined
          ).length,
          payments_with_description: payments.filter(p => p.description).length,
          system_payments: bonusPayments.length,
        },
        // Добавляем данные для сравнения с тестом
        test_comparison: {
          total_real_income_stars: totalRealIncomeStars,
          total_real_income_rub: totalRealIncomeRub,
          total_real_outcome_stars: totalRealOutcomeStars,
          total_bonus_income_stars: totalBonusIncomeStars,
          total_bonus_outcome_stars: totalBonusOutcomeStars,
          calculated_balance:
            totalRealIncomeStars +
            totalBonusIncomeStars -
            (totalRealOutcomeStars + totalBonusOutcomeStars),
        },
      },
    }
  } catch (error) {
    console.error('Error in getDetailedFinancialBreakdown:', error)
    throw error
  }
}

/**
 * Форматирует детальную финансовую разбивку
 */
function formatDetailedFinancialMessage(
  breakdown: any,
  botName: string
): string {
  let message = `📊 <b>Детальная финансовая разбивка @${botName}</b>\n\n`

  // Общая информация
  message += `📋 <b>Общая информация</b>\n`
  message += `   📊 Всего транзакций: ${breakdown.summary.total_payments}\n`
  message += `   💰 Реальные платежи: ${breakdown.summary.real_payments}\n`
  message += `   🎁 Бонусные/тестовые: ${breakdown.summary.bonus_payments}\n`
  message += `   📅 Период: ${breakdown.summary.date_range.first?.split('T')[0]} - ${breakdown.summary.date_range.last?.split('T')[0]}\n`
  message += `   💱 Валюты: ${breakdown.summary.currencies_used.join(', ')}\n`
  message += `   🔧 Сервисы: ${breakdown.summary.services_used.slice(0, 3).join(', ')}${breakdown.summary.services_used.length > 3 ? '...' : ''}\n\n`

  // Разбивка по рублям (только реальные)
  if (breakdown.rub_breakdown.total_transactions > 0) {
    message += `💰 <b>Реальные рублевые операции</b>\n`
    message += `   📈 Доходы: ${formatNumber(breakdown.rub_breakdown.income.amount)} ₽ (${breakdown.rub_breakdown.income.count} операций)\n`
    message += `   📉 Расходы: ${formatNumber(breakdown.rub_breakdown.outcome.amount)} ₽ (${breakdown.rub_breakdown.outcome.count} операций)\n`
    message += `   💎 Чистый результат: ${formatNumber(breakdown.rub_breakdown.net)} ₽\n\n`
  }

  // Разбивка по звездам (только реальные)
  message += `⭐ <b>Реальные операции в звездах</b>\n`
  message += `   📈 Доходы: ${formatNumber(breakdown.stars_breakdown.income.amount)} ⭐ (${breakdown.stars_breakdown.income.count} операций)\n`
  message += `   📉 Расходы: ${formatNumber(breakdown.stars_breakdown.outcome.amount)} ⭐ (${breakdown.stars_breakdown.outcome.count} операций)\n`
  message += `   🏭 Себестоимость: ${formatNumber(breakdown.stars_breakdown.outcome.cost)} ⭐\n`
  message += `   💰 Чистая выручка: ${formatNumber(breakdown.stars_breakdown.net_revenue)} ⭐\n`
  message += `   💎 Чистая прибыль: ${formatNumber(breakdown.stars_breakdown.net_profit)} ⭐\n`
  message += `   📊 Маржинальность: ${formatPercent(breakdown.stars_breakdown.margin)}%\n\n`

  // Бонусные операции
  if (breakdown.bonus_breakdown.total_transactions > 0) {
    message += `🎁 <b>Бонусные/тестовые операции</b>\n`
    message += `   📈 Начислено: ${formatNumber(breakdown.bonus_breakdown.income.amount)} ⭐ (${breakdown.bonus_breakdown.income.count} операций)\n`
    message += `   📉 Потрачено: ${formatNumber(breakdown.bonus_breakdown.outcome.amount)} ⭐ (${breakdown.bonus_breakdown.outcome.count} операций)\n`
    message += `   🏭 Себестоимость: ${formatNumber(breakdown.bonus_breakdown.outcome.cost)} ⭐\n`
    message += `   💫 Остаток бонусов: ${formatNumber(breakdown.bonus_breakdown.net_usage)} ⭐\n`

    // Топ бонусных транзакций
    if (breakdown.bonus_breakdown.top_transactions.length > 0) {
      message += `   🔝 Крупнейшие бонусы:\n`
      breakdown.bonus_breakdown.top_transactions
        .slice(0, 3)
        .forEach((t: any, i: number) => {
          const typeIcon = t.type === 'MONEY_INCOME' ? '📈' : '📉'
          const amount = formatNumber(t.stars || t.amount)
          message += `      ${i + 1}. ${typeIcon} ${amount} ${t.currency === 'RUB' ? '₽' : '⭐'} - ${t.description?.substring(0, 30) || 'Без описания'}...\n`
        })
    }
    message += '\n'
  }

  // Проверка реальных данных
  message += `🔍 <b>Проверка реальных данных</b>\n`
  if (breakdown.verification.top_real_income_transactions.length > 0) {
    message += `   📈 Крупнейшие реальные доходы:\n`
    breakdown.verification.top_real_income_transactions
      .slice(0, 3)
      .forEach((t: any, i: number) => {
        const amount = formatNumber(t.stars || t.amount)
        message += `      ${i + 1}. ${amount} ${t.currency === 'RUB' ? '₽' : '⭐'} - ${t.description?.substring(0, 30) || 'Без описания'}...\n`
      })
  } else {
    message += `   ⚠️ Нет реальных доходов\n`
  }

  if (breakdown.verification.top_real_outcome_transactions.length > 0) {
    message += `   📉 Крупнейшие реальные расходы:\n`
    breakdown.verification.top_real_outcome_transactions
      .slice(0, 3)
      .forEach((t: any, i: number) => {
        const amount = formatNumber(t.stars || t.amount)
        const cost = formatNumber(t.cost || 0)
        message += `      ${i + 1}. ${amount} ${t.currency === 'RUB' ? '₽' : '⭐'} (себестоимость: ${cost} ⭐) - ${t.service_type || 'Неизвестно'}\n`
      })
  } else {
    message += `   ⚠️ Нет реальных расходов\n`
  }

  // Качество данных
  message += `\n📊 <b>Качество данных</b>\n`
  message += `   ⚠️ Без звезд: ${breakdown.verification.data_quality.payments_with_null_stars}\n`
  message += `   ⚠️ Без себестоимости: ${breakdown.verification.data_quality.payments_with_null_cost}\n`
  message += `   ✅ С описанием: ${breakdown.verification.data_quality.payments_with_description}\n`
  message += `   🎁 Системных платежей: ${breakdown.verification.data_quality.system_payments}\n`
  message += `   📊 Активность за месяц: реальных ${breakdown.verification.recent_activity.real_last_month}, бонусных ${breakdown.verification.recent_activity.bonus_last_month}\n`

  return message
}

/**
 * Функция для детального анализа данных (отладка)
 */
async function debugPaymentData(botName: string): Promise<any> {
  try {
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select('*, category')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .order('payment_date', { ascending: false })

    if (error) throw error

    // Функция для определения типа транзакции (упрощенная версия)
    const getTransactionCategory = (payment: any) => {
      // MONEY_INCOME всегда должны быть реальными платежами
      if (payment.type === 'MONEY_INCOME') {
        return 'real'
      }
      // Для остальных используем поле category из базы данных
      return payment.category === 'REAL' ? 'real' : 'bonus'
    }

    // Анализ всех MONEY_INCOME транзакций
    const allIncomeTransactions = payments.filter(
      p => p.type === 'MONEY_INCOME'
    )
    const realIncomeTransactions = allIncomeTransactions.filter(
      p => getTransactionCategory(p) === 'real'
    )
    const bonusIncomeTransactions = allIncomeTransactions.filter(
      p => getTransactionCategory(p) === 'bonus'
    )

    // Разбивка по валютам для MONEY_INCOME
    const incomeByCurrency = {
      all: {
        rub: allIncomeTransactions.filter(p => p.currency === 'RUB'),
        stars: allIncomeTransactions.filter(
          p => p.currency === 'STARS' || p.currency === 'XTR'
        ),
      },
      real: {
        rub: realIncomeTransactions.filter(p => p.currency === 'RUB'),
        stars: realIncomeTransactions.filter(
          p => p.currency === 'STARS' || p.currency === 'XTR'
        ),
      },
      bonus: {
        rub: bonusIncomeTransactions.filter(p => p.currency === 'RUB'),
        stars: bonusIncomeTransactions.filter(
          p => p.currency === 'STARS' || p.currency === 'XTR'
        ),
      },
    }

    // Детальный анализ каждой категории
    const analysis = {
      total_payments: payments.length,
      total_income_transactions: allIncomeTransactions.length,

      all_income: {
        rub_count: incomeByCurrency.all.rub.length,
        rub_sum: incomeByCurrency.all.rub.reduce(
          (sum, p) => sum + (p.amount || 0),
          0
        ),
        stars_count: incomeByCurrency.all.stars.length,
        stars_sum: incomeByCurrency.all.stars.reduce(
          (sum, p) => sum + (p.stars || 0),
          0
        ),
      },

      real_income: {
        rub_count: incomeByCurrency.real.rub.length,
        rub_sum: incomeByCurrency.real.rub.reduce(
          (sum, p) => sum + (p.amount || 0),
          0
        ),
        stars_count: incomeByCurrency.real.stars.length,
        stars_sum: incomeByCurrency.real.stars.reduce(
          (sum, p) => sum + (p.stars || 0),
          0
        ),
        sample_transactions: incomeByCurrency.real.stars
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            date: p.payment_date,
            stars: p.stars,
            amount: p.amount,
            currency: p.currency,
            description: p.description,
            service_type: p.service_type,
            category: getTransactionCategory(p),
          })),
      },

      bonus_income: {
        rub_count: incomeByCurrency.bonus.rub.length,
        rub_sum: incomeByCurrency.bonus.rub.reduce(
          (sum, p) => sum + (p.amount || 0),
          0
        ),
        stars_count: incomeByCurrency.bonus.stars.length,
        stars_sum: incomeByCurrency.bonus.stars.reduce(
          (sum, p) => sum + (p.stars || 0),
          0
        ),
        sample_transactions: incomeByCurrency.bonus.stars
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            date: p.payment_date,
            stars: p.stars,
            amount: p.amount,
            currency: p.currency,
            description: p.description,
            service_type: p.service_type,
            category: getTransactionCategory(p),
          })),
      },

      // Проверка уникальных значений
      unique_currencies: Array.from(new Set(payments.map(p => p.currency))),
      unique_types: Array.from(new Set(payments.map(p => p.type))),
      unique_statuses: Array.from(new Set(payments.map(p => p.status))),

      // Проблемные записи
      problematic_records: {
        null_currency: payments.filter(p => !p.currency).length,
        null_type: payments.filter(p => !p.type).length,
        null_stars_and_amount: payments.filter(p => !p.stars && !p.amount)
          .length,
      },
    }

    return analysis
  } catch (error) {
    console.error('Error in debugPaymentData:', error)
    throw error
  }
}

/**
 * Команда для отладки данных платежей
 */
export async function debugStatsCommand(ctx: MyContext): Promise<void> {
  try {
    const userId = ctx.from?.id?.toString()
    if (!userId) {
      await ctx.reply('❌ Не удалось определить пользователя')
      return
    }

    // Проверяем, является ли пользователь админом
    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))
    if (!isAdmin) {
      await ctx.reply('❌ Эта команда доступна только администраторам')
      return
    }

    const args =
      ctx.message && 'text' in ctx.message
        ? ctx.message.text.split(' ').slice(1)
        : []

    const botName = args[0]
    if (!botName) {
      await ctx.reply('❌ Укажите имя бота. Пример: /debug_stats bot_name')
      return
    }

    await ctx.reply('🔍 Анализирую данные платежей...')

    const analysis = await debugPaymentData(botName)

    let message = `🔍 <b>Отладка данных @${botName}</b>\n\n`

    message += `📊 <b>Общая статистика</b>\n`
    message += `   Всего платежей: ${analysis.total_payments}\n`
    message += `   Всего MONEY_INCOME: ${analysis.total_income_transactions}\n\n`

    message += `💰 <b>Все доходы</b>\n`
    message += `   RUB: ${analysis.all_income.rub_count} транзакций, ${analysis.all_income.rub_sum} ₽\n`
    message += `   STARS: ${analysis.all_income.stars_count} транзакций, ${analysis.all_income.stars_sum} ⭐\n\n`

    message += `✅ <b>Реальные доходы</b>\n`
    message += `   RUB: ${analysis.real_income.rub_count} транзакций, ${analysis.real_income.rub_sum} ₽\n`
    message += `   STARS: ${analysis.real_income.stars_count} транзакций, ${analysis.real_income.stars_sum} ⭐\n\n`

    message += `🎁 <b>Бонусные доходы</b>\n`
    message += `   RUB: ${analysis.bonus_income.rub_count} транзакций, ${analysis.bonus_income.rub_sum} ₽\n`
    message += `   STARS: ${analysis.bonus_income.stars_count} транзакций, ${analysis.bonus_income.stars_sum} ⭐\n\n`

    message += `🔧 <b>Технические данные</b>\n`
    message += `   Валюты: ${analysis.unique_currencies.join(', ')}\n`
    message += `   Типы: ${analysis.unique_types.join(', ')}\n`
    message += `   Статусы: ${analysis.unique_statuses.join(', ')}\n\n`

    message += `⚠️ <b>Проблемы</b>\n`
    message += `   Без валюты: ${analysis.problematic_records.null_currency}\n`
    message += `   Без типа: ${analysis.problematic_records.null_type}\n`
    message += `   Без суммы: ${analysis.problematic_records.null_stars_and_amount}\n`

    await ctx.reply(message, { parse_mode: 'HTML' })

    // Показываем примеры реальных транзакций
    if (analysis.real_income.sample_transactions.length > 0) {
      let sampleMessage = `📋 <b>Примеры реальных STARS доходов:</b>\n\n`
      analysis.real_income.sample_transactions.forEach((t: any, i: number) => {
        sampleMessage += `${i + 1}. ID: ${t.id}\n`
        sampleMessage += `   💰 ${t.stars} ⭐ (${t.currency})\n`
        sampleMessage += `   📅 ${t.date.split('T')[0]}\n`
        sampleMessage += `   📝 "${t.description?.substring(0, 50) || 'Без описания'}...\n`
        sampleMessage += `   🏷️ ${t.service_type || 'Без типа'}\n\n`
      })
      await ctx.reply(sampleMessage, { parse_mode: 'HTML' })
    }
  } catch (error) {
    console.error('Error in debugStatsCommand:', error)
    await ctx.reply('❌ Произошла ошибка при анализе данных')
  }
}

/**
 * Команда для просмотра примеров транзакций с категоризацией
 */

/**
 * Команда для просмотра трат конкретного пользователя (только для админов)
 */
export async function userSpendingCommand(ctx: MyContext): Promise<void> {
  try {
    const userId = ctx.from?.id?.toString()
    if (!userId) {
      await ctx.reply('❌ Не удалось определить пользователя')
      return
    }

    // Проверяем, является ли пользователь админом
    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))
    if (!isAdmin) {
      await ctx.reply('❌ Эта команда доступна только администраторам')
      return
    }

    const args =
      ctx.message && 'text' in ctx.message
        ? ctx.message.text.split(' ').slice(1)
        : []

    const targetUserId = args[0]
    if (!targetUserId) {
      await ctx.reply(
        '❌ Укажите ID пользователя. Пример: /user_spending 352374518'
      )
      return
    }

    // Проверяем что ID не пустой
    if (!targetUserId.trim()) {
      await ctx.reply('❌ ID пользователя не может быть пустым')
      return
    }

    await ctx.reply(`🔍 Анализирую траты пользователя ${targetUserId}...`)

    // Получаем информацию о пользователе
    const { data: userInfo, error: userError } = await supabase
      .from('users')
      .select('username, first_name, last_name, bot_name')
      .eq('telegram_id', targetUserId)
      .single()

    if (userError || !userInfo) {
      await ctx.reply(`❌ Пользователь ${targetUserId} не найден в базе данных`)
      return
    }

    // Получаем статистику трат пользователя
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', targetUserId)
      .eq('status', 'COMPLETED')
      .order('payment_date', { ascending: false })

    if (paymentsError) {
      await ctx.reply(`❌ Ошибка получения данных: ${paymentsError.message}`)
      return
    }

    if (!payments || payments.length === 0) {
      await ctx.reply(
        `📊 У пользователя ${targetUserId} нет завершенных транзакций`
      )
      return
    }

    // Анализируем транзакции
    const realIncomes = payments.filter(
      p => p.type === 'MONEY_INCOME' && p.category === 'REAL'
    )
    const bonusIncomes = payments.filter(
      p => p.type === 'MONEY_INCOME' && p.category === 'BONUS'
    )
    const outcomes = payments.filter(p => p.type === 'MONEY_OUTCOME')
    const refunds = payments.filter(p => p.type === 'REFUND')

    // Подсчитываем суммы
    const totalRealIncomeStars = realIncomes.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const totalRealIncomeRub = realIncomes.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    )
    const totalBonusStars = bonusIncomes.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const totalOutcomeStars = outcomes.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const totalRefundStars = refunds.reduce((sum, p) => sum + (p.stars || 0), 0)

    // Анализ по сервисам
    const serviceStats = new Map<string, { count: number; stars: number }>()
    outcomes.forEach(payment => {
      const service = payment.service_type || 'unknown'
      const current = serviceStats.get(service) || { count: 0, stars: 0 }
      current.count += 1
      current.stars += payment.stars || 0
      serviceStats.set(service, current)
    })

    // Анализ по месяцам (последние 6 месяцев)
    const monthlyStats = new Map<
      string,
      { income: number; outcome: number; transactions: number }
    >()
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    payments
      .filter(p => new Date(p.payment_date) >= sixMonthsAgo)
      .forEach(payment => {
        const date = new Date(payment.payment_date)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

        const current = monthlyStats.get(monthKey) || {
          income: 0,
          outcome: 0,
          transactions: 0,
        }
        current.transactions += 1

        if (payment.type === 'MONEY_INCOME' && payment.category === 'REAL') {
          current.income += payment.stars || 0
        } else if (payment.type === 'MONEY_OUTCOME') {
          current.outcome += payment.stars || 0
        }

        monthlyStats.set(monthKey, current)
      })

    // Формируем сообщение
    let message = `👤 <b>Анализ трат пользователя ${targetUserId}</b>\n\n`

    // Информация о пользователе
    message += `📋 <b>Информация о пользователе:</b>\n`
    message += `   👤 Имя: ${userInfo.first_name || 'Не указано'} ${userInfo.last_name || ''}\n`
    message += `   📱 Username: ${userInfo.username ? '@' + userInfo.username : 'Не указан'}\n`
    message += `   🤖 Бот: @${userInfo.bot_name}\n\n`

    // Общая статистика
    message += `📊 <b>Общая статистика:</b>\n`
    message += `   📈 Всего транзакций: ${payments.length}\n`
    message += `   💰 Реальные доходы: ${realIncomes.length} (${totalRealIncomeStars}⭐, ${totalRealIncomeRub.toFixed(2)}₽)\n`
    message += `   🎁 Бонусы: ${bonusIncomes.length} (${totalBonusStars}⭐)\n`
    message += `   📉 Расходы: ${outcomes.length} (${totalOutcomeStars}⭐)\n`
    message += `   🔄 Возвраты: ${refunds.length} (${totalRefundStars}⭐)\n`
    message += `   💎 Текущий баланс: ${totalRealIncomeStars + totalBonusStars - totalOutcomeStars + totalRefundStars}⭐\n\n`

    // Топ сервисов
    message += `🛠️ <b>Топ сервисов по тратам:</b>\n`
    const sortedServices = Array.from(serviceStats.entries())
      .sort(([, a], [, b]) => b.stars - a.stars)
      .slice(0, 5)

    sortedServices.forEach(([service, stats], index) => {
      const percentage =
        totalOutcomeStars > 0
          ? ((stats.stars / totalOutcomeStars) * 100).toFixed(1)
          : '0.0'
      message += `   ${index + 1}. ${service}: ${stats.stars}⭐ (${stats.count} транзакций, ${percentage}%)\n`
    })

    // Активность по месяцам
    if (monthlyStats.size > 0) {
      message += `\n📅 <b>Активность за последние месяцы:</b>\n`
      const sortedMonths = Array.from(monthlyStats.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 6)

      sortedMonths.forEach(([month, stats]) => {
        const [year, monthNum] = month.split('-')
        const monthName = new Date(
          parseInt(year),
          parseInt(monthNum) - 1
        ).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
        message += `   ${monthName}: ${stats.transactions} транзакций (${stats.income}⭐ доходы, ${stats.outcome}⭐ расходы)\n`
      })
    }

    // Последние транзакции
    message += `\n📋 <b>Последние 5 транзакций:</b>\n`
    payments.slice(0, 5).forEach((payment, index) => {
      const date = new Date(payment.payment_date).toLocaleDateString('ru-RU')
      const typeEmoji =
        payment.type === 'MONEY_INCOME'
          ? '📈'
          : payment.type === 'MONEY_OUTCOME'
            ? '📉'
            : '🔄'
      const categoryInfo = payment.category ? ` (${payment.category})` : ''
      message += `   ${index + 1}. ${typeEmoji} ${date}: ${payment.stars || 0}⭐ - ${payment.service_type || 'unknown'}${categoryInfo}\n`
    })

    // Разбиваем длинное сообщение на части
    const maxLength = 4000
    if (message.length > maxLength) {
      const parts = splitMessage(message, maxLength)
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: 'HTML' })
      }
    } else {
      await ctx.reply(message, { parse_mode: 'HTML' })
    }
  } catch (error) {
    console.error('❌ Ошибка в userSpendingCommand:', error)
    await ctx.reply('❌ Произошла ошибка при анализе трат пользователя')
  }
}

/**
 * Команда для поиска пользователей по имени/username (только для админов)
 */
export async function findUserCommand(ctx: MyContext): Promise<void> {
  try {
    const userId = ctx.from?.id?.toString()
    if (!userId) {
      await ctx.reply('❌ Не удалось определить пользователя')
      return
    }

    // Проверяем, является ли пользователь админом
    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))
    if (!isAdmin) {
      await ctx.reply('❌ Эта команда доступна только администраторам')
      return
    }

    const args =
      ctx.message && 'text' in ctx.message
        ? ctx.message.text.split(' ').slice(1)
        : []

    const searchQuery = args.join(' ')
    if (!searchQuery) {
      await ctx.reply(
        '❌ Укажите имя или username для поиска. Пример: /find_user Иван или /find_user @username'
      )
      return
    }

    await ctx.reply(`🔍 Ищу пользователей по запросу "${searchQuery}"...`)

    // Убираем @ если есть
    const cleanQuery = searchQuery.replace('@', '')

    // Поиск по разным полям
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id, username, first_name, last_name, bot_name')
      .or(
        `username.ilike.%${cleanQuery}%,first_name.ilike.%${cleanQuery}%,last_name.ilike.%${cleanQuery}%,telegram_id.eq.${cleanQuery}`
      )
      .order('telegram_id', { ascending: false })
      .limit(20)

    if (error) {
      await ctx.reply(`❌ Ошибка поиска: ${error.message}`)
      return
    }

    if (!users || users.length === 0) {
      await ctx.reply(`📭 Пользователи по запросу "${searchQuery}" не найдены`)
      return
    }

    // Получаем статистику по найденным пользователям
    const userIds = users.map(u => u.telegram_id)
    const { data: userStats, error: statsError } = await supabase
      .from('payments_v2')
      .select('telegram_id, type, stars, amount, category')
      .in('telegram_id', userIds)
      .eq('status', 'COMPLETED')

    // Подсчитываем статистику для каждого пользователя
    const statsMap = new Map<
      string,
      { transactions: number; realIncome: number; totalSpent: number }
    >()

    if (!statsError && userStats) {
      userStats.forEach(payment => {
        const userId = payment.telegram_id
        const current = statsMap.get(userId) || {
          transactions: 0,
          realIncome: 0,
          totalSpent: 0,
        }

        current.transactions += 1

        if (payment.type === 'MONEY_INCOME' && payment.category === 'REAL') {
          current.realIncome += payment.stars || payment.amount || 0
        } else if (payment.type === 'MONEY_OUTCOME') {
          current.totalSpent += payment.stars || 0
        }

        statsMap.set(userId, current)
      })
    }

    // Формируем сообщение
    let message = `🔍 <b>Результаты поиска "${searchQuery}"</b>\n\n`
    message += `📊 Найдено пользователей: ${users.length}\n\n`

    users.forEach((user, index) => {
      const stats = statsMap.get(user.telegram_id) || {
        transactions: 0,
        realIncome: 0,
        totalSpent: 0,
      }

      message += `${index + 1}. <b>ID: ${user.telegram_id}</b>\n`
      message += `   👤 ${user.first_name || 'Не указано'} ${user.last_name || ''}\n`
      message += `   📱 ${user.username ? '@' + user.username : 'Username не указан'}\n`
      message += `   🤖 Бот: @${user.bot_name}\n`
      message += `   📊 Транзакций: ${stats.transactions}, Доходы: ${stats.realIncome}⭐, Траты: ${stats.totalSpent}⭐\n`
      message += `   💡 Команда: <code>/user_spending ${user.telegram_id}</code>\n\n`
    })

    if (users.length === 20) {
      message += `⚠️ Показаны первые 20 результатов. Уточните запрос для более точного поиска.`
    }

    // Разбиваем длинное сообщение на части
    const maxLength = 4000
    if (message.length > maxLength) {
      const parts = splitMessage(message, maxLength)
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: 'HTML' })
      }
    } else {
      await ctx.reply(message, { parse_mode: 'HTML' })
    }
  } catch (error) {
    console.error('❌ Ошибка в findUserCommand:', error)
    await ctx.reply('❌ Произошла ошибка при поиске пользователей')
  }
}

/**
 * Справка по админским командам
 */
export async function adminHelpCommand(ctx: MyContext): Promise<void> {
  try {
    const userId = ctx.from?.id?.toString()
    if (!userId) {
      await ctx.reply('❌ Не удалось определить пользователя')
      return
    }

    // Проверяем, является ли пользователь админом
    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))
    if (!isAdmin) {
      await ctx.reply('❌ Эта команда доступна только администраторам')
      return
    }

    const helpMessage = `👑 <b>Справка по админским командам</b>

🔍 <b>Поиск и анализ пользователей:</b>
<code>/find_user Иван</code> - поиск по имени
<code>/find_user @username</code> - поиск по username  
<code>/find_user 352374518</code> - поиск по ID
<code>/user_spending 352374518</code> - детальный анализ трат

📊 <b>Анализ ботов:</b>
<code>/stats bot_name</code> - основная статистика
<code>/stats bot_name --detailed</code> - детальная разбивка
<code>/stats bot_name month</code> - за месяц
<code>/debug_stats bot_name</code> - отладка данных и примеры транзакций

⏰ <b>Временные периоды:</b>
• <code>today/сегодня</code> - за сегодня
• <code>week/неделя</code> - за неделю  
• <code>month/месяц</code> - за месяц
• <code>all</code> - за все время (по умолчанию)

🛠️ <b>Дополнительные параметры:</b>
• <code>--detailed</code> - детальная разбивка
• <code>--export</code> - экспорт в CSV

💡 <b>Примеры рабочих процессов:</b>

<b>Поиск проблемного пользователя:</b>
1. <code>/find_user Иван</code>
2. <code>/user_spending 352374518</code>

<b>Анализ бота:</b>
1. <code>/stats MetaMuse_Manifest_bot --detailed</code>
2. <code>/debug_stats MetaMuse_Manifest_bot</code>

👑 У вас SuperAdmin доступ ко всем ботам и командам.`

    await ctx.reply(helpMessage, { parse_mode: 'HTML' })
  } catch (error) {
    console.error('❌ Ошибка в adminHelpCommand:', error)
    await ctx.reply('❌ Произошла ошибка при показе справки')
  }
}
