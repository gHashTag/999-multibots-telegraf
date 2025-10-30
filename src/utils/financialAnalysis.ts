import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Financial Analysis Module for Bot Owner Billing
 *
 * This module calculates:
 * 1. Revenue earned by each bot owner
 * 2. Expenses (service costs) incurred by each bot
 * 3. Net profit/loss calculations
 * 4. Settlement amounts (who owes what to whom)
 */

export interface BotFinancialSummary {
  bot_name: string
  // Revenue metrics
  total_revenue_stars: number
  total_revenue_fiat: number
  revenue_transactions: number
  unique_paying_users: number

  // Expense metrics
  total_expenses_stars: number
  total_service_costs: number
  expense_transactions: number

  // Profit metrics
  gross_profit_stars: number
  net_profit_stars: number
  profit_margin_percent: number

  // Settlement calculation
  platform_commission: number
  settlement_amount: number
  settlement_status: 'OWED_TO_BOT_OWNER' | 'BOT_OWNER_OWES_PLATFORM' | 'BALANCED'

  // Service breakdown
  service_breakdown: ServiceUsage[]
}

export interface ServiceUsage {
  service_type: string
  transaction_count: number
  total_cost: number
  avg_cost_per_transaction: number
  percentage_of_total: number
}

export interface MonthlySettlement {
  bot_name: string
  month: string
  summary: BotFinancialSummary
  daily_breakdown: DailyFinancial[]
}

export interface DailyFinancial {
  date: string
  revenue: number
  expenses: number
  transactions: number
  net_profit: number
}

/**
 * Calculate comprehensive financial summary for a specific bot
 */
export async function calculateBotFinancialSummary(
  botName: string,
  startDate?: Date,
  endDate?: Date
): Promise<BotFinancialSummary> {
  try {
    logger.info(`[FinancialAnalysis] Calculating summary for bot: ${botName}`)

    // Build date filter
    let dateFilter = ''
    if (startDate) {
      dateFilter += ` AND payment_date >= '${startDate.toISOString()}'`
    }
    if (endDate) {
      dateFilter += ` AND payment_date <= '${endDate.toISOString()}'`
    }

    // Get comprehensive financial data in a single query
    const { data: financialData, error } = await supabase.rpc(
      'calculate_bot_financial_summary',
      {
        p_bot_name: botName,
        p_start_date: startDate?.toISOString() || null,
        p_end_date: endDate?.toISOString() || null
      }
    )

    if (error) {
      logger.error(`[FinancialAnalysis] Database error for ${botName}:`, error)
      throw error
    }

    // If RPC doesn't exist, fallback to manual calculation
    if (!financialData) {
      return await calculateBotFinancialSummaryFallback(botName, startDate, endDate)
    }

    const summary = financialData[0]

    // Calculate settlement based on revenue-share model (platform takes 20%)
    const platformCommissionRate = 0.20
    const platformCommission = summary.total_revenue_stars * platformCommissionRate
    const netRevenueAfterCommission = summary.total_revenue_stars - platformCommission
    const settlementAmount = netRevenueAfterCommission - summary.total_expenses_stars

    return {
      bot_name: botName,
      total_revenue_stars: summary.total_revenue_stars || 0,
      total_revenue_fiat: summary.total_revenue_fiat || 0,
      revenue_transactions: summary.revenue_transactions || 0,
      unique_paying_users: summary.unique_paying_users || 0,
      total_expenses_stars: summary.total_expenses_stars || 0,
      total_service_costs: summary.total_service_costs || 0,
      expense_transactions: summary.expense_transactions || 0,
      gross_profit_stars: (summary.total_revenue_stars || 0) - (summary.total_expenses_stars || 0),
      net_profit_stars: settlementAmount,
      profit_margin_percent: summary.total_revenue_stars > 0
        ? ((settlementAmount / summary.total_revenue_stars) * 100)
        : 0,
      platform_commission: platformCommission,
      settlement_amount: settlementAmount,
      settlement_status: settlementAmount > 0
        ? 'OWED_TO_BOT_OWNER'
        : settlementAmount < 0
          ? 'BOT_OWNER_OWES_PLATFORM'
          : 'BALANCED',
      service_breakdown: summary.service_breakdown || []
    }
  } catch (error) {
    logger.error(`[FinancialAnalysis] Error calculating summary for ${botName}:`, error)
    throw error
  }
}

/**
 * Fallback calculation using direct queries when RPC is not available
 */
export async function calculateBotFinancialSummaryFallback(
  botName: string,
  startDate?: Date,
  endDate?: Date
): Promise<BotFinancialSummary> {
  try {
    let query = supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')

    if (startDate) {
      query = query.gte('payment_date', startDate.toISOString())
    }
    if (endDate) {
      query = query.lte('payment_date', endDate.toISOString())
    }

    const { data: transactions, error } = await query

    if (error) {
      throw error
    }

    // Calculate metrics from raw data
    const incomeTransactions = transactions.filter(t => t.type === 'MONEY_INCOME')
    const expenseTransactions = transactions.filter(t => t.type === 'MONEY_OUTCOME')

    const totalRevenueStars = incomeTransactions.reduce((sum, t) => sum + (t.stars || 0), 0)
    const totalRevenueFiat = incomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)
    const totalExpensesStars = expenseTransactions.reduce((sum, t) => sum + (t.cost || t.stars || 0), 0)
    const uniquePayingUsers = new Set(incomeTransactions.map(t => t.telegram_id)).size

    // Service breakdown
    const serviceBreakdown = calculateServiceBreakdown(expenseTransactions, totalExpensesStars)

    // Settlement calculation
    const platformCommissionRate = 0.20
    const platformCommission = totalRevenueStars * platformCommissionRate
    const netRevenueAfterCommission = totalRevenueStars - platformCommission
    const settlementAmount = netRevenueAfterCommission - totalExpensesStars

    return {
      bot_name: botName,
      total_revenue_stars: totalRevenueStars,
      total_revenue_fiat: totalRevenueFiat,
      revenue_transactions: incomeTransactions.length,
      unique_paying_users: uniquePayingUsers,
      total_expenses_stars: totalExpensesStars,
      total_service_costs: totalExpensesStars,
      expense_transactions: expenseTransactions.length,
      gross_profit_stars: totalRevenueStars - totalExpensesStars,
      net_profit_stars: settlementAmount,
      profit_margin_percent: totalRevenueStars > 0
        ? ((settlementAmount / totalRevenueStars) * 100)
        : 0,
      platform_commission: platformCommission,
      settlement_amount: settlementAmount,
      settlement_status: settlementAmount > 0
        ? 'OWED_TO_BOT_OWNER'
        : settlementAmount < 0
          ? 'BOT_OWNER_OWES_PLATFORM'
          : 'BALANCED',
      service_breakdown: serviceBreakdown
    }
  } catch (error) {
    logger.error(`[FinancialAnalysis] Fallback calculation error for ${botName}:`, error)
    throw error
  }
}

/**
 * Calculate service usage breakdown from expense transactions
 */
function calculateServiceBreakdown(expenseTransactions: any[], totalExpenses: number): ServiceUsage[] {
  const serviceStats = new Map<string, { count: number, totalCost: number }>()

  expenseTransactions.forEach(transaction => {
    const serviceType = transaction.service_type || 'unknown'
    const cost = transaction.cost || transaction.stars || 0

    if (!serviceStats.has(serviceType)) {
      serviceStats.set(serviceType, { count: 0, totalCost: 0 })
    }

    const stats = serviceStats.get(serviceType)!
    stats.count += 1
    stats.totalCost += cost
  })

  return Array.from(serviceStats.entries()).map(([serviceType, stats]) => ({
    service_type: serviceType,
    transaction_count: stats.count,
    total_cost: stats.totalCost,
    avg_cost_per_transaction: stats.count > 0 ? stats.totalCost / stats.count : 0,
    percentage_of_total: totalExpenses > 0 ? (stats.totalCost / totalExpenses) * 100 : 0
  })).sort((a, b) => b.total_cost - a.total_cost)
}

/**
 * Get financial summary for all bots
 */
export async function getAllBotsFinancialSummary(
  startDate?: Date,
  endDate?: Date
): Promise<BotFinancialSummary[]> {
  try {
    logger.info('[FinancialAnalysis] Calculating summary for all bots')

    // Get list of all unique bot names
    let query = supabase
      .from('payments_v2')
      .select('bot_name')
      .eq('status', 'COMPLETED')

    if (startDate) {
      query = query.gte('payment_date', startDate.toISOString())
    }
    if (endDate) {
      query = query.lte('payment_date', endDate.toISOString())
    }

    const { data: botNames, error } = await query

    if (error) {
      throw error
    }

    const uniqueBotNames = [...new Set(botNames.map(b => b.bot_name).filter(Boolean))]

    // Calculate summary for each bot
    const summaries = await Promise.all(
      uniqueBotNames.map(botName =>
        calculateBotFinancialSummary(botName, startDate, endDate)
      )
    )

    return summaries.sort((a, b) => b.net_profit_stars - a.net_profit_stars)
  } catch (error) {
    logger.error('[FinancialAnalysis] Error calculating all bots summary:', error)
    throw error
  }
}

/**
 * Generate monthly settlement report
 */
export async function generateMonthlySettlement(
  month: string, // Format: 'YYYY-MM'
  botName?: string
): Promise<MonthlySettlement[]> {
  try {
    const [year, monthNum] = month.split('-')
    const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1)
    const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59)

    logger.info(`[FinancialAnalysis] Generating settlement for ${month}${botName ? ` for bot ${botName}` : ''}`)

    let botNames: string[]
    if (botName) {
      botNames = [botName]
    } else {
      // Get all bots that had activity in this month
      const { data: activeBots, error } = await supabase
        .from('payments_v2')
        .select('bot_name')
        .eq('status', 'COMPLETED')
        .gte('payment_date', startDate.toISOString())
        .lte('payment_date', endDate.toISOString())

      if (error) throw error

      botNames = [...new Set(activeBots.map(b => b.bot_name).filter(Boolean))]
    }

    const settlements = await Promise.all(
      botNames.map(async (name) => {
        const summary = await calculateBotFinancialSummary(name, startDate, endDate)
        const dailyBreakdown = await calculateDailyBreakdown(name, startDate, endDate)

        return {
          bot_name: name,
          month,
          summary,
          daily_breakdown: dailyBreakdown
        }
      })
    )

    return settlements.sort((a, b) => b.summary.settlement_amount - a.summary.settlement_amount)
  } catch (error) {
    logger.error(`[FinancialAnalysis] Error generating monthly settlement for ${month}:`, error)
    throw error
  }
}

/**
 * Calculate daily financial breakdown for a bot
 */
async function calculateDailyBreakdown(
  botName: string,
  startDate: Date,
  endDate: Date
): Promise<DailyFinancial[]> {
  try {
    const { data: transactions, error } = await supabase
      .from('payments_v2')
      .select('payment_date, type, stars, cost')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .gte('payment_date', startDate.toISOString())
      .lte('payment_date', endDate.toISOString())

    if (error) throw error

    // Group by date
    const dailyStats = new Map<string, { revenue: number, expenses: number, transactions: number }>()

    transactions.forEach(transaction => {
      const date = transaction.payment_date.split('T')[0] // Get YYYY-MM-DD

      if (!dailyStats.has(date)) {
        dailyStats.set(date, { revenue: 0, expenses: 0, transactions: 0 })
      }

      const stats = dailyStats.get(date)!
      stats.transactions += 1

      if (transaction.type === 'MONEY_INCOME') {
        stats.revenue += transaction.stars || 0
      } else if (transaction.type === 'MONEY_OUTCOME') {
        stats.expenses += transaction.cost || transaction.stars || 0
      }
    })

    // Convert to array and sort by date
    return Array.from(dailyStats.entries())
      .map(([date, stats]) => ({
        date,
        revenue: stats.revenue,
        expenses: stats.expenses,
        transactions: stats.transactions,
        net_profit: stats.revenue - stats.expenses
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch (error) {
    logger.error(`[FinancialAnalysis] Error calculating daily breakdown for ${botName}:`, error)
    return []
  }
}

/**
 * Calculate star-to-ruble exchange rate from recent transactions
 */
export async function calculateCurrentStarToRubleRate(): Promise<number> {
  try {
    const { data: transactions, error } = await supabase
      .from('payments_v2')
      .select('amount, stars')
      .eq('type', 'MONEY_INCOME')
      .eq('status', 'COMPLETED')
      .eq('currency', 'RUB')
      .gt('stars', 0)
      .gt('amount', 0)
      .gte('payment_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
      .order('payment_date', { ascending: false })
      .limit(100)

    if (error) throw error

    if (!transactions || transactions.length === 0) {
      // Default rate if no recent transactions
      return 0.005 // 0.005 RUB per star
    }

    // Calculate average rate
    const totalRubles = transactions.reduce((sum, t) => sum + t.amount, 0)
    const totalStars = transactions.reduce((sum, t) => sum + t.stars, 0)

    return totalStars > 0 ? totalRubles / totalStars : 0.005
  } catch (error) {
    logger.error('[FinancialAnalysis] Error calculating star-to-ruble rate:', error)
    return 0.005 // Fallback rate
  }
}

/**
 * Export billing data to CSV format
 */
export async function exportBillingDataToCSV(
  botName?: string,
  startDate?: Date,
  endDate?: Date
): Promise<string> {
  try {
    const summaries = botName
      ? [await calculateBotFinancialSummary(botName, startDate, endDate)]
      : await getAllBotsFinancialSummary(startDate, endDate)

    const headers = [
      'Bot Name',
      'Revenue (Stars)',
      'Revenue (Fiat)',
      'Expenses (Stars)',
      'Gross Profit',
      'Platform Commission',
      'Net Profit',
      'Profit Margin %',
      'Settlement Amount',
      'Settlement Status',
      'Revenue Transactions',
      'Expense Transactions',
      'Unique Users'
    ]

    const rows = summaries.map(summary => [
      summary.bot_name,
      summary.total_revenue_stars.toFixed(2),
      summary.total_revenue_fiat.toFixed(2),
      summary.total_expenses_stars.toFixed(2),
      summary.gross_profit_stars.toFixed(2),
      summary.platform_commission.toFixed(2),
      summary.net_profit_stars.toFixed(2),
      summary.profit_margin_percent.toFixed(2),
      summary.settlement_amount.toFixed(2),
      summary.settlement_status,
      summary.revenue_transactions.toString(),
      summary.expense_transactions.toString(),
      summary.unique_paying_users.toString()
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n')

    return csvContent
  } catch (error) {
    logger.error('[FinancialAnalysis] Error exporting to CSV:', error)
    throw error
  }
}