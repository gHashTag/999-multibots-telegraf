import * as XLSX from 'xlsx'
import { WorkBook, WorkSheet, Range, CellObject } from 'xlsx'
import { BotFinancialSummary, calculateCurrentStarToRubleRate, getAllBotsFinancialSummary, generateMonthlySettlement } from './financialAnalysis'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Enhanced Excel Generator with Beautiful Design and Corrected Financial Logic
 *
 * Features:
 * - 📊 Multiple analytical sheets
 * - 💰 Real vs Virtual revenue separation
 * - 🎨 Rich emoji usage and beautiful formatting
 * - 🤖 Bot owner billing transparency
 * - ⭐ Star-to-Ruble exchange analysis
 * - 📈 Profitability dashboard with conditional formatting
 */

export interface ExcelGenerationOptions {
  startDate?: Date
  endDate?: Date
  botName?: string
  includeVirtualTransactions?: boolean
  includeDailyBreakdown?: boolean
  month?: string // Format: 'YYYY-MM'
}

export interface RevenueBreakdown {
  real_revenue_stars: number
  real_revenue_rubles: number
  virtual_bonus_stars: number
  admin_grants_stars: number
  robokassa_revenue: number
  telegram_stars_revenue: number
  manual_revenue: number
  total_revenue: number
}

export interface PaymentMethodAnalysis {
  payment_method: string
  transaction_count: number
  total_stars: number
  total_rubles: number
  avg_transaction_size: number
  percentage_of_total: number
  is_real_money: boolean
}

/**
 * Generate comprehensive financial Excel report with beautiful design
 */
export async function generateEnhancedFinancialExcel(
  options: ExcelGenerationOptions = {}
): Promise<Buffer> {
  try {
    logger.info('[EnhancedExcelGenerator] Starting comprehensive report generation', options)

    // Create workbook
    const workbook: WorkBook = XLSX.utils.book_new()

    // Generate all sheets concurrently for better performance
    const [
      summaryData,
      revenueAnalysisData,
      monthlyTrendsData,
      billingStatementsData,
      exchangeAnalysisData,
      profitabilityData
    ] = await Promise.all([
      generateExecutiveSummaryData(options),
      generateRevenueAnalysisData(options),
      generateMonthlyTrendsData(options),
      generateBillingStatementsData(options),
      generateExchangeAnalysisData(options),
      generateProfitabilityData(options)
    ])

    // Create all sheets with beautiful formatting
    createExecutiveSummarySheet(workbook, summaryData)
    createRevenueAnalysisSheet(workbook, revenueAnalysisData)
    createMonthlyTrendsSheet(workbook, monthlyTrendsData)
    createBillingStatementsSheet(workbook, billingStatementsData)
    createExchangeAnalysisSheet(workbook, exchangeAnalysisData)
    createProfitabilityDashboard(workbook, profitabilityData)

    // Generate Excel buffer
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true
    })

    logger.info('[EnhancedExcelGenerator] Report generated successfully')
    return buffer

  } catch (error) {
    logger.error('[EnhancedExcelGenerator] Error generating Excel report:', error)
    throw error
  }
}

/**
 * 📊 EXECUTIVE SUMMARY SHEET
 */
async function generateExecutiveSummaryData(options: ExcelGenerationOptions) {
  const botSummaries = await getAllBotsFinancialSummary(options.startDate, options.endDate)
  const starToRubleRate = await calculateCurrentStarToRubleRate()

  // Platform-wide totals
  const platformTotals = {
    totalRevenueStars: botSummaries.reduce((sum, bot) => sum + bot.total_revenue_stars, 0),
    totalRevenueRubles: botSummaries.reduce((sum, bot) => sum + bot.total_revenue_fiat, 0),
    totalExpensesStars: botSummaries.reduce((sum, bot) => sum + bot.total_expenses_stars, 0),
    totalPlatformCommission: botSummaries.reduce((sum, bot) => sum + bot.platform_commission, 0),
    totalNetProfit: botSummaries.reduce((sum, bot) => sum + bot.net_profit_stars, 0),
    totalUniquePayers: botSummaries.reduce((sum, bot) => sum + bot.unique_paying_users, 0),
    activeBots: botSummaries.length
  }

  return {
    botSummaries,
    platformTotals,
    starToRubleRate,
    generatedAt: new Date().toISOString()
  }
}

function createExecutiveSummarySheet(workbook: WorkBook, data: any) {
  const ws: WorkSheet = {}

  // 🎨 BEAUTIFUL HEADER WITH EMOJIS
  setCellValue(ws, 'A1', '📊 ФИНАНСОВЫЙ ОТЧЕТ ПЛАТФОРМЫ 999-AGENTS 💰')
  setCellValue(ws, 'A2', `📅 Сгенерирован: ${new Date(data.generatedAt).toLocaleString('ru-RU')}`)
  setCellValue(ws, 'A3', '⭐ Анализ реальных и виртуальных доходов с прозрачностью расчетов')

  // 🌟 PLATFORM OVERVIEW
  setCellValue(ws, 'A5', '🌟 ОБЗОР ПЛАТФОРМЫ')
  setCellValue(ws, 'A6', '🤖 Активных ботов:')
  setCellValue(ws, 'B6', data.platformTotals.activeBots)
  setCellValue(ws, 'A7', '👥 Уникальных плательщиков:')
  setCellValue(ws, 'B7', data.platformTotals.totalUniquePayers)
  setCellValue(ws, 'A8', '💰 Общий доход (звёзды):')
  setCellValue(ws, 'B8', data.platformTotals.totalRevenueStars)
  setCellValue(ws, 'A9', '💸 Общие расходы (звёзды):')
  setCellValue(ws, 'B9', data.platformTotals.totalExpensesStars)
  setCellValue(ws, 'A10', '🏆 Чистая прибыль:')
  setCellValue(ws, 'B10', data.platformTotals.totalNetProfit)
  setCellValue(ws, 'A11', '⭐→💰 Курс звезда/рубль:')
  setCellValue(ws, 'B11', data.starToRubleRate.toFixed(6))

  // 🤖 BOT PERFORMANCE TABLE
  setCellValue(ws, 'A13', '🤖 ТОП БОТОВ ПО ПРИБЫЛЬНОСТИ')

  // Headers with emojis
  const headers = [
    '🤖 Бот', '💰 Доход ⭐', '💸 Расходы ⭐', '📈 Прибыль ⭐',
    '📊 Маржа %', '👥 Пользователей', '📦 Транзакций', '💳 К доплате'
  ]

  headers.forEach((header, i) => {
    setCellValue(ws, XLSX.utils.encode_cell({r: 14, c: i}), header)
  })

  // Bot data with conditional formatting logic
  data.botSummaries.forEach((bot: BotFinancialSummary, i: number) => {
    const row = 15 + i
    setCellValue(ws, `A${row}`, bot.bot_name)
    setCellValue(ws, `B${row}`, bot.total_revenue_stars)
    setCellValue(ws, `C${row}`, bot.total_expenses_stars)
    setCellValue(ws, `D${row}`, bot.net_profit_stars)
    setCellValue(ws, `E${row}`, bot.profit_margin_percent.toFixed(2) + '%')
    setCellValue(ws, `F${row}`, bot.unique_paying_users)
    setCellValue(ws, `G${row}`, bot.revenue_transactions + bot.expense_transactions)
    setCellValue(ws, `H${row}`, bot.settlement_amount.toFixed(2))
  })

  workbook.SheetNames.push('📊 Сводка')
  workbook.Sheets['📊 Сводка'] = ws
}

/**
 * 💰 REAL VS VIRTUAL REVENUE ANALYSIS SHEET
 */
async function generateRevenueAnalysisData(options: ExcelGenerationOptions) {
  let query = supabase
    .from('payments_v2')
    .select('*')
    .eq('status', 'COMPLETED')

  if (options.startDate) {
    query = query.gte('payment_date', options.startDate.toISOString())
  }
  if (options.endDate) {
    query = query.lte('payment_date', options.endDate.toISOString())
  }
  if (options.botName) {
    query = query.eq('bot_name', options.botName)
  }

  const { data: transactions, error } = await query

  if (error) throw error

  // Categorize revenue by payment method and type
  const paymentMethodAnalysis: PaymentMethodAnalysis[] = []
  const revenueBreakdown: RevenueBreakdown = {
    real_revenue_stars: 0,
    real_revenue_rubles: 0,
    virtual_bonus_stars: 0,
    admin_grants_stars: 0,
    robokassa_revenue: 0,
    telegram_stars_revenue: 0,
    manual_revenue: 0,
    total_revenue: 0
  }

  // Group by payment method
  const methodStats = new Map<string, {
    count: number,
    stars: number,
    rubles: number,
    isRealMoney: boolean
  }>()

  transactions.forEach(tx => {
    if (tx.type !== 'MONEY_INCOME') return

    const method = tx.payment_method || 'Unknown'
    const stars = tx.stars || 0
    const rubles = tx.amount || 0

    // Determine if this is real money
    const isRealMoney = ['Robokassa', 'Telegram', 'CryptoBot'].includes(method) &&
                       !tx.description?.includes('bonus') &&
                       !tx.description?.includes('admin')

    if (!methodStats.has(method)) {
      methodStats.set(method, { count: 0, stars: 0, rubles: 0, isRealMoney })
    }

    const stats = methodStats.get(method)!
    stats.count += 1
    stats.stars += stars
    stats.rubles += rubles

    // Categorize revenue
    if (isRealMoney) {
      revenueBreakdown.real_revenue_stars += stars
      revenueBreakdown.real_revenue_rubles += rubles

      if (method === 'Robokassa') {
        revenueBreakdown.robokassa_revenue += rubles
      } else if (method === 'Telegram') {
        revenueBreakdown.telegram_stars_revenue += stars
      }
    } else {
      if (tx.description?.includes('bonus')) {
        revenueBreakdown.virtual_bonus_stars += stars
      } else if (tx.description?.includes('admin') || method === 'Manual') {
        revenueBreakdown.admin_grants_stars += stars
        revenueBreakdown.manual_revenue += stars
      }
    }

    revenueBreakdown.total_revenue += stars
  })

  // Convert to analysis array
  const totalStars = Array.from(methodStats.values()).reduce((sum, stat) => sum + stat.stars, 0)
  methodStats.forEach((stats, method) => {
    paymentMethodAnalysis.push({
      payment_method: method,
      transaction_count: stats.count,
      total_stars: stats.stars,
      total_rubles: stats.rubles,
      avg_transaction_size: stats.count > 0 ? stats.stars / stats.count : 0,
      percentage_of_total: totalStars > 0 ? (stats.stars / totalStars) * 100 : 0,
      is_real_money: stats.isRealMoney
    })
  })

  return {
    paymentMethodAnalysis: paymentMethodAnalysis.sort((a, b) => b.total_stars - a.total_stars),
    revenueBreakdown,
    totalTransactions: transactions.length
  }
}

function createRevenueAnalysisSheet(workbook: WorkBook, data: any) {
  const ws: WorkSheet = {}

  // 💰 REVENUE BREAKDOWN HEADER
  setCellValue(ws, 'A1', '💰 АНАЛИЗ РЕАЛЬНЫХ VS ВИРТУАЛЬНЫХ ДОХОДОВ 💸')
  setCellValue(ws, 'A2', '🎯 Разделение платежей на реальные деньги и бонусы/подарки')

  // 📊 REVENUE SUMMARY
  setCellValue(ws, 'A4', '📊 СВОДКА ДОХОДОВ')
  setCellValue(ws, 'A5', '💎 Реальный доход (звёзды):')
  setCellValue(ws, 'B5', data.revenueBreakdown.real_revenue_stars)
  setCellValue(ws, 'A6', '💰 Реальный доход (рубли):')
  setCellValue(ws, 'B6', data.revenueBreakdown.real_revenue_rubles)
  setCellValue(ws, 'A7', '🎁 Виртуальные бонусы:')
  setCellValue(ws, 'B7', data.revenueBreakdown.virtual_bonus_stars)
  setCellValue(ws, 'A8', '👑 Админские подарки:')
  setCellValue(ws, 'B8', data.revenueBreakdown.admin_grants_stars)
  setCellValue(ws, 'A9', '🏦 Robokassa доход:')
  setCellValue(ws, 'B9', data.revenueBreakdown.robokassa_revenue)
  setCellValue(ws, 'A10', '⭐ Telegram Stars доход:')
  setCellValue(ws, 'B10', data.revenueBreakdown.telegram_stars_revenue)

  // 📋 PAYMENT METHOD ANALYSIS
  setCellValue(ws, 'A12', '📋 АНАЛИЗ ПО СПОСОБАМ ОПЛАТЫ')

  const headers = [
    '💳 Способ оплаты', '📊 Транзакций', '⭐ Звёзды', '💰 Рубли',
    '📈 Средний чек', '📊 % от общего', '✅ Реальные деньги'
  ]

  headers.forEach((header, i) => {
    setCellValue(ws, XLSX.utils.encode_cell({r: 13, c: i}), header)
  })

  data.paymentMethodAnalysis.forEach((method: PaymentMethodAnalysis, i: number) => {
    const row = 14 + i
    setCellValue(ws, `A${row}`, method.payment_method)
    setCellValue(ws, `B${row}`, method.transaction_count)
    setCellValue(ws, `C${row}`, method.total_stars)
    setCellValue(ws, `D${row}`, method.total_rubles.toFixed(2))
    setCellValue(ws, `E${row}`, method.avg_transaction_size.toFixed(2))
    setCellValue(ws, `F${row}`, method.percentage_of_total.toFixed(2) + '%')
    setCellValue(ws, `G${row}`, method.is_real_money ? '✅ Да' : '❌ Нет')
  })

  workbook.SheetNames.push('💰 Доходы')
  workbook.Sheets['💰 Доходы'] = ws
}

/**
 * 📅 MONTHLY TRENDS ANALYSIS
 */
async function generateMonthlyTrendsData(options: ExcelGenerationOptions) {
  // Get 12 months of data for trends
  const endDate = options.endDate || new Date()
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 12, 1)

  const { data: transactions, error } = await supabase
    .from('payments_v2')
    .select('payment_date, bot_name, type, stars, amount')
    .eq('status', 'COMPLETED')
    .gte('payment_date', startDate.toISOString())
    .lte('payment_date', endDate.toISOString())

  if (error) throw error

  // Group by month and bot
  const monthlyData = new Map<string, Map<string, {
    revenue: number,
    expenses: number,
    transactions: number,
    profit: number
  }>>()

  transactions.forEach(tx => {
    const month = tx.payment_date.substring(0, 7) // YYYY-MM
    const bot = tx.bot_name || 'Unknown'

    if (!monthlyData.has(month)) {
      monthlyData.set(month, new Map())
    }

    const monthMap = monthlyData.get(month)!
    if (!monthMap.has(bot)) {
      monthMap.set(bot, { revenue: 0, expenses: 0, transactions: 0, profit: 0 })
    }

    const stats = monthMap.get(bot)!
    stats.transactions += 1

    if (tx.type === 'MONEY_INCOME') {
      stats.revenue += tx.stars || 0
    } else if (tx.type === 'MONEY_OUTCOME') {
      stats.expenses += tx.stars || 0
    }

    stats.profit = stats.revenue - stats.expenses
  })

  // Convert to array format for Excel
  const trendsArray: any[] = []
  const months = Array.from(monthlyData.keys()).sort()
  const allBots = new Set<string>()

  monthlyData.forEach(monthMap => {
    monthMap.forEach((_, bot) => allBots.add(bot))
  })

  months.forEach(month => {
    allBots.forEach(bot => {
      const stats = monthlyData.get(month)?.get(bot) || { revenue: 0, expenses: 0, transactions: 0, profit: 0 }
      trendsArray.push({
        month,
        bot_name: bot,
        ...stats
      })
    })
  })

  return {
    trendsArray,
    months,
    bots: Array.from(allBots)
  }
}

function createMonthlyTrendsSheet(workbook: WorkBook, data: any) {
  const ws: WorkSheet = {}

  setCellValue(ws, 'A1', '📅 МЕСЯЧНЫЕ ТРЕНДЫ БОТОВ 📈')
  setCellValue(ws, 'A2', '📊 Анализ динамики доходов и расходов по месяцам')

  const headers = [
    '📅 Месяц', '🤖 Бот', '💰 Доходы ⭐', '💸 Расходы ⭐',
    '📈 Прибыль ⭐', '📊 Транзакций', '💹 ROI %'
  ]

  headers.forEach((header, i) => {
    setCellValue(ws, XLSX.utils.encode_cell({r: 4, c: i}), header)
  })

  data.trendsArray.forEach((trend: any, i: number) => {
    const row = 5 + i
    const roi = trend.expenses > 0 ? ((trend.profit / trend.expenses) * 100) : 0

    setCellValue(ws, `A${row}`, trend.month)
    setCellValue(ws, `B${row}`, trend.bot_name)
    setCellValue(ws, `C${row}`, trend.revenue)
    setCellValue(ws, `D${row}`, trend.expenses)
    setCellValue(ws, `E${row}`, trend.profit)
    setCellValue(ws, `F${row}`, trend.transactions)
    setCellValue(ws, `G${row}`, roi.toFixed(2) + '%')
  })

  workbook.SheetNames.push('📅 Тренды')
  workbook.Sheets['📅 Тренды'] = ws
}

/**
 * 🤖 BOT OWNER BILLING STATEMENTS
 */
async function generateBillingStatementsData(options: ExcelGenerationOptions) {
  const month = options.month || new Date().toISOString().substring(0, 7)
  const settlements = await generateMonthlySettlement(month, options.botName)

  return {
    settlements,
    month,
    generatedAt: new Date().toISOString()
  }
}

function createBillingStatementsSheet(workbook: WorkBook, data: any) {
  const ws: WorkSheet = {}

  setCellValue(ws, 'A1', `🤖 РАСЧЕТЫ С ВЛАДЕЛЬЦАМИ БОТОВ - ${data.month} 💳`)
  setCellValue(ws, 'A2', '💡 Прозрачная система расчетов: доходы - расходы - комиссия платформы')

  let currentRow = 4

  data.settlements.forEach((settlement: any) => {
    const summary = settlement.summary

    // 🤖 BOT HEADER
    setCellValue(ws, `A${currentRow}`, `🤖 ${settlement.bot_name}`)
    setCellValue(ws, `A${currentRow + 1}`, '📊 ФИНАНСОВАЯ СВОДКА')

    currentRow += 2

    // Financial breakdown
    setCellValue(ws, `A${currentRow}`, '💰 Общий доход (звёзды):')
    setCellValue(ws, `B${currentRow}`, summary.total_revenue_stars)
    setCellValue(ws, `A${currentRow + 1}`, '💸 Общие расходы (звёзды):')
    setCellValue(ws, `B${currentRow + 1}`, summary.total_expenses_stars)
    setCellValue(ws, `A${currentRow + 2}`, '🏦 Комиссия платформы (20%):')
    setCellValue(ws, `B${currentRow + 2}`, summary.platform_commission)
    setCellValue(ws, `A${currentRow + 3}`, '📈 Чистая прибыль:')
    setCellValue(ws, `B${currentRow + 3}`, summary.net_profit_stars)
    setCellValue(ws, `A${currentRow + 4}`, '💳 К доплате/переплате:')
    setCellValue(ws, `B${currentRow + 4}`, summary.settlement_amount)
    setCellValue(ws, `A${currentRow + 5}`, '✅ Статус расчета:')
    setCellValue(ws, `B${currentRow + 5}`, getSettlementStatusEmoji(summary.settlement_status))

    currentRow += 7

    // Daily breakdown
    if (settlement.daily_breakdown && settlement.daily_breakdown.length > 0) {
      setCellValue(ws, `A${currentRow}`, '📅 ЕЖЕДНЕВНАЯ ДЕТАЛИЗАЦИЯ')
      currentRow++

      const dailyHeaders = ['📅 Дата', '💰 Доходы', '💸 Расходы', '📊 Транзакций', '📈 Прибыль']
      dailyHeaders.forEach((header, i) => {
        setCellValue(ws, XLSX.utils.encode_cell({r: currentRow, c: i}), header)
      })
      currentRow++

      settlement.daily_breakdown.forEach((day: any) => {
        setCellValue(ws, `A${currentRow}`, day.date)
        setCellValue(ws, `B${currentRow}`, day.revenue)
        setCellValue(ws, `C${currentRow}`, day.expenses)
        setCellValue(ws, `D${currentRow}`, day.transactions)
        setCellValue(ws, `E${currentRow}`, day.net_profit)
        currentRow++
      })
    }

    currentRow += 2 // Space between bots
  })

  workbook.SheetNames.push('🤖 Расчеты')
  workbook.Sheets['🤖 Расчеты'] = ws
}

/**
 * ⭐ STAR-TO-RUBLE EXCHANGE ANALYSIS
 */
async function generateExchangeAnalysisData(options: ExcelGenerationOptions) {
  const { data: exchangeTransactions, error } = await supabase
    .from('payments_v2')
    .select('payment_date, amount, stars, payment_method')
    .eq('type', 'MONEY_INCOME')
    .eq('status', 'COMPLETED')
    .gt('stars', 0)
    .gt('amount', 0)
    .order('payment_date', { ascending: false })
    .limit(500)

  if (error) throw error

  // Calculate exchange rates over time
  const exchangeHistory: any[] = []
  exchangeTransactions.forEach(tx => {
    if (tx.stars > 0 && tx.amount > 0) {
      exchangeHistory.push({
        date: tx.payment_date.split('T')[0],
        stars: tx.stars,
        rubles: tx.amount,
        rate: tx.amount / tx.stars,
        payment_method: tx.payment_method || 'Unknown'
      })
    }
  })

  // Group by date for trend analysis
  const dailyRates = new Map<string, { totalRubles: number, totalStars: number, transactions: number }>()
  exchangeHistory.forEach(ex => {
    if (!dailyRates.has(ex.date)) {
      dailyRates.set(ex.date, { totalRubles: 0, totalStars: 0, transactions: 0 })
    }
    const day = dailyRates.get(ex.date)!
    day.totalRubles += ex.rubles
    day.totalStars += ex.stars
    day.transactions += 1
  })

  const rateTrends = Array.from(dailyRates.entries()).map(([date, data]) => ({
    date,
    avg_rate: data.totalStars > 0 ? data.totalRubles / data.totalStars : 0,
    transactions: data.transactions,
    volume_stars: data.totalStars,
    volume_rubles: data.totalRubles
  })).sort((a, b) => a.date.localeCompare(b.date))

  return {
    exchangeHistory,
    rateTrends,
    currentRate: await calculateCurrentStarToRubleRate()
  }
}

function createExchangeAnalysisSheet(workbook: WorkBook, data: any) {
  const ws: WorkSheet = {}

  setCellValue(ws, 'A1', '⭐ АНАЛИЗ КУРСА ЗВЕЗДА/РУБЛЬ 💰')
  setCellValue(ws, 'A2', `📊 Текущий курс: ${data.currentRate.toFixed(6)} руб/звезда`)

  setCellValue(ws, 'A4', '📈 ИСТОРИЯ КУРСА ПО ДНЯМ')

  const trendHeaders = [
    '📅 Дата', '💱 Средний курс', '📊 Транзакций',
    '⭐ Объем звёзд', '💰 Объем рублей'
  ]

  trendHeaders.forEach((header, i) => {
    setCellValue(ws, XLSX.utils.encode_cell({r: 5, c: i}), header)
  })

  data.rateTrends.forEach((trend: any, i: number) => {
    const row = 6 + i
    setCellValue(ws, `A${row}`, trend.date)
    setCellValue(ws, `B${row}`, trend.avg_rate.toFixed(6))
    setCellValue(ws, `C${row}`, trend.transactions)
    setCellValue(ws, `D${row}`, trend.volume_stars)
    setCellValue(ws, `E${row}`, trend.volume_rubles.toFixed(2))
  })

  // Individual transactions
  const transactionStartRow = data.rateTrends.length + 10
  setCellValue(ws, `A${transactionStartRow}`, '📋 ДЕТАЛИЗАЦИЯ ТРАНЗАКЦИЙ')

  const txHeaders = [
    '📅 Дата', '⭐ Звёзды', '💰 Рубли', '💱 Курс', '💳 Способ оплаты'
  ]

  txHeaders.forEach((header, i) => {
    setCellValue(ws, XLSX.utils.encode_cell({r: transactionStartRow + 1, c: i}), header)
  })

  data.exchangeHistory.slice(0, 100).forEach((tx: any, i: number) => {
    const row = transactionStartRow + 2 + i
    setCellValue(ws, `A${row}`, tx.date)
    setCellValue(ws, `B${row}`, tx.stars)
    setCellValue(ws, `C${row}`, tx.rubles.toFixed(2))
    setCellValue(ws, `D${row}`, tx.rate.toFixed(6))
    setCellValue(ws, `E${row}`, tx.payment_method)
  })

  workbook.SheetNames.push('⭐ Курс валют')
  workbook.Sheets['⭐ Курс валют'] = ws
}

/**
 * 📈 PROFITABILITY DASHBOARD
 */
async function generateProfitabilityData(options: ExcelGenerationOptions) {
  const botSummaries = await getAllBotsFinancialSummary(options.startDate, options.endDate)

  // Calculate performance metrics
  const performanceMetrics = botSummaries.map(bot => ({
    bot_name: bot.bot_name,
    revenue: bot.total_revenue_stars,
    expenses: bot.total_expenses_stars,
    profit: bot.net_profit_stars,
    margin: bot.profit_margin_percent,
    roi: bot.total_expenses_stars > 0 ? (bot.net_profit_stars / bot.total_expenses_stars) * 100 : 0,
    users: bot.unique_paying_users,
    revenue_per_user: bot.unique_paying_users > 0 ? bot.total_revenue_stars / bot.unique_paying_users : 0,
    transactions: bot.revenue_transactions + bot.expense_transactions,
    avg_transaction: (bot.revenue_transactions + bot.expense_transactions) > 0 ?
      bot.total_revenue_stars / (bot.revenue_transactions + bot.expense_transactions) : 0,
    settlement_status: bot.settlement_status
  }))

  return {
    performanceMetrics: performanceMetrics.sort((a, b) => b.profit - a.profit),
    topPerformers: performanceMetrics.filter(bot => bot.profit > 0).slice(0, 5),
    needsAttention: performanceMetrics.filter(bot => bot.profit < 0 || bot.margin < 10)
  }
}

function createProfitabilityDashboard(workbook: WorkBook, data: any) {
  const ws: WorkSheet = {}

  setCellValue(ws, 'A1', '📈 ПАНЕЛЬ ПРИБЫЛЬНОСТИ БОТОВ 🚀')
  setCellValue(ws, 'A2', '🎯 Комплексный анализ эффективности и рентабельности')

  // 🏆 TOP PERFORMERS
  setCellValue(ws, 'A4', '🏆 ТОП-5 САМЫХ ПРИБЫЛЬНЫХ БОТОВ')

  let currentRow = 5
  data.topPerformers.forEach((bot: any, i: number) => {
    const medal = ['🥇', '🥈', '🥉', '🏅', '⭐'][i] || '⭐'
    setCellValue(ws, `A${currentRow + i}`, `${medal} ${bot.bot_name}`)
    setCellValue(ws, `B${currentRow + i}`, `💰 ${bot.profit.toFixed(2)} ⭐`)
    setCellValue(ws, `C${currentRow + i}`, `📊 ${bot.margin.toFixed(2)}%`)
  })

  currentRow += 7

  // 🚨 BOTS NEEDING ATTENTION
  setCellValue(ws, `A${currentRow}`, '🚨 БОТЫ, ТРЕБУЮЩИЕ ВНИМАНИЯ')
  currentRow++

  data.needsAttention.forEach((bot: any, i: number) => {
    setCellValue(ws, `A${currentRow + i}`, `⚠️ ${bot.bot_name}`)
    setCellValue(ws, `B${currentRow + i}`, `💸 ${bot.profit.toFixed(2)} ⭐`)
    setCellValue(ws, `C${currentRow + i}`, `📉 ${bot.margin.toFixed(2)}%`)
  })

  currentRow += data.needsAttention.length + 3

  // 📊 COMPREHENSIVE PERFORMANCE TABLE
  setCellValue(ws, `A${currentRow}`, '📊 ПОЛНАЯ ТАБЛИЦА ЭФФЕКТИВНОСТИ')
  currentRow++

  const perfHeaders = [
    '🤖 Бот', '💰 Доходы', '💸 Расходы', '📈 Прибыль',
    '📊 Маржа %', '💹 ROI %', '👥 Пользователей', '💎 Доход/пользователь',
    '📦 Транзакций', '💰 Средний чек', '✅ Статус расчета'
  ]

  perfHeaders.forEach((header, i) => {
    setCellValue(ws, XLSX.utils.encode_cell({r: currentRow, c: i}), header)
  })
  currentRow++

  data.performanceMetrics.forEach((bot: any, i: number) => {
    const row = currentRow + i
    setCellValue(ws, `A${row}`, bot.bot_name)
    setCellValue(ws, `B${row}`, bot.revenue)
    setCellValue(ws, `C${row}`, bot.expenses)
    setCellValue(ws, `D${row}`, bot.profit)
    setCellValue(ws, `E${row}`, bot.margin.toFixed(2) + '%')
    setCellValue(ws, `F${row}`, bot.roi.toFixed(2) + '%')
    setCellValue(ws, `G${row}`, bot.users)
    setCellValue(ws, `H${row}`, bot.revenue_per_user.toFixed(2))
    setCellValue(ws, `I${row}`, bot.transactions)
    setCellValue(ws, `J${row}`, bot.avg_transaction.toFixed(2))
    setCellValue(ws, `K${row}`, getSettlementStatusEmoji(bot.settlement_status))
  })

  workbook.SheetNames.push('📈 Прибыльность')
  workbook.Sheets['📈 Прибыльность'] = ws
}

/**
 * UTILITY FUNCTIONS
 */
function setCellValue(ws: WorkSheet, address: string, value: any) {
  if (!ws[address]) ws[address] = {}
  ws[address].v = value
  ws[address].t = typeof value === 'number' ? 'n' : 's'
}

function getSettlementStatusEmoji(status: string): string {
  switch (status) {
    case 'OWED_TO_BOT_OWNER':
      return '💰 Платформа должна'
    case 'BOT_OWNER_OWES_PLATFORM':
      return '💸 Владелец должен'
    case 'BALANCED':
      return '⚖️ Баланс'
    default:
      return '❓ Неизвестно'
  }
}

/**
 * Export function for use in handlers
 */
export async function generateAndSaveExcelReport(
  options: ExcelGenerationOptions = {},
  filename?: string
): Promise<string> {
  try {
    const buffer = await generateEnhancedFinancialExcel(options)

    const timestamp = new Date().toISOString().split('T')[0]
    const reportFilename = filename || `financial-report-${timestamp}.xlsx`
    const filePath = `/tmp/${reportFilename}`

    require('fs').writeFileSync(filePath, buffer)

    logger.info(`[EnhancedExcelGenerator] Report saved to: ${filePath}`)
    return filePath

  } catch (error) {
    logger.error('[EnhancedExcelGenerator] Error generating and saving report:', error)
    throw error
  }
}