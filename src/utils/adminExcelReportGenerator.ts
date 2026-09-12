/**
 * ГЕНЕРАТОР EXCEL-ОТЧЕТОВ ДЛЯ ВЛАДЕЛЬЦЕВ БОТОВ И СУПЕР-АДМИНОВ
 * Создает детальную аналитику по ботам с красивым оформлением
 */

import * as XLSX from '@/utils/excelCompat'
import { z } from 'zod'
import { supabase } from '@/core/supabase'
import {
  getServiceDisplayTitle,
  getServiceEmoji,
  UserService,
} from './serviceMapping'

// Zod схемы для валидации данных (исправленные для реальных типов БД)
const PaymentSchema = z.object({
  id: z.number(),
  telegram_id: z.union([z.string(), z.number()]).transform(val => String(val)),
  bot_name: z.string(),
  type: z.enum(['MONEY_INCOME', 'MONEY_OUTCOME', 'REFUND']),
  category: z.enum(['REAL', 'BONUS', 'ADMIN']).nullable().optional(),
  currency: z.enum(['RUB', 'XTR', 'STARS']).nullable().optional(),
  payment_method: z.string().nullable().optional(),
  service_type: z.string().nullable().optional(),
  stars: z.number().nullable().optional(),
  amount: z.number().nullable().optional(),
  cost: z.number().nullable().optional(),
  payment_date: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(),
})

const UserSchema = z.object({
  telegram_id: z.union([z.string(), z.number()]).transform(val => String(val)),
  username: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  bot_name: z.string(),
})

const ServiceStatsSchema = z.object({
  count: z.number(),
  revenue: z.number(),
  cost: z.number(),
})

const TopUserSchema = z.object({
  telegram_id: z.string(),
  username: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  total_spending: z.number(),
  transactions_count: z.number(),
})

const MonthlyStatsSchema = z.object({
  period: z.string(),
  income: z.number(),
  income_rub: z.number(),
  outcome: z.number(),
  cost: z.number(),
  profit: z.number(),
  margin: z.number(),
  transactions: z.number(),
  active_users: z.number(),
})

const DailyStatsSchema = z.object({
  date: z.string(),
  income: z.number(),
  outcome: z.number(),
  cost: z.number(),
  profit: z.number(),
  transactions: z.number(),
})

// Упрощенная схема без валидации Map (так как Zod плохо работает с Map)
interface BotReportData {
  botName: string
  totalIncome: number
  totalOutcome: number
  totalCost: number
  netProfit: number
  profitMargin: number
  totalUsers: number
  activeUsersMonth: number
  totalTransactions: number

  // Детализация по валютам
  rubIncome: number
  rubOutcome: number
  starsIncome: number
  starsOutcome: number
  starsCost: number

  // Детализация по способам оплаты
  robokassaPayments: z.infer<typeof PaymentSchema>[]
  telegramStarsPayments: z.infer<typeof PaymentSchema>[]
  bonusPayments: z.infer<typeof PaymentSchema>[]
  adminPayments: z.infer<typeof PaymentSchema>[]

  // Операции по сервисам
  serviceStats: Map<string, { count: number; revenue: number; cost: number }>

  // Пользователи
  topUsers: z.infer<typeof TopUserSchema>[]
  userSegments: any[]

  // Временная аналитика
  monthlyStats: z.infer<typeof MonthlyStatsSchema>[]
  dailyStats: z.infer<typeof DailyStatsSchema>[]

  // Все транзакции
  allTransactions: z.infer<typeof PaymentSchema>[]
}

export async function generateAdminExcelReport(
  botName: string
): Promise<Buffer> {
  // 🔥 QA FIX: Excel functionality restored - xlsx package is available
  return generateAdminExcelReport_RESTORED(botName)
}

/**
 * Автоматически вычисляет оптимальную ширину колонок на основе содержимого
 */
function autoFitColumns(sheet: XLSX.WorkSheet, data: any[][]): void {
  if (!data || data.length === 0) return

  const colWidths: number[] = []

  // Проходим по всем строкам и находим максимальную ширину для каждой колонки
  data.forEach(row => {
    row.forEach((cell, colIndex) => {
      const cellValue = cell !== null && cell !== undefined ? String(cell) : ''
      // Учитываем длину строки (эмодзи обрабатываются автоматически)
      const cellLength = cellValue.length

      if (!colWidths[colIndex] || cellLength > colWidths[colIndex]) {
        colWidths[colIndex] = cellLength
      }
    })
  })

  // Устанавливаем ширину колонок (минимум 10, максимум 50 символов)
  sheet['!cols'] = colWidths.map(width => ({
    wch: Math.min(Math.max(width + 2, 10), 50), // +2 для отступов
  }))
}

export async function generateAdminExcelReport_RESTORED(
  botName: string
): Promise<Buffer> {
  try {
    // Валидируем входные данные
    const validatedBotName = z.string().min(1).parse(botName)

    // Получаем все данные бота
    const reportData = await getBotReportData(validatedBotName)

    // Создаем новую книгу Excel
    const workbook = XLSX.utils.book_new()

    // Лист 1: Общая сводка
    const { sheet: summarySheet, data: summaryData } =
      createBotSummarySheet(reportData)
    autoFitColumns(summarySheet, summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, '📊 Общая сводка')

    // Лист 2: Финансовая аналитика
    const { sheet: financialSheet, data: financialData } =
      createFinancialAnalyticsSheet(reportData)
    autoFitColumns(financialSheet, financialData)
    XLSX.utils.book_append_sheet(workbook, financialSheet, '💰 Финансы')

    // Лист 3: Аналитика по сервисам
    const { sheet: servicesSheet, data: servicesData } =
      createServicesAnalyticsSheet(reportData)
    autoFitColumns(servicesSheet, servicesData)
    XLSX.utils.book_append_sheet(workbook, servicesSheet, '🛠️ Сервисы')

    // Лист 4: Пользователи
    const { sheet: usersSheet, data: usersData } =
      createUsersAnalyticsSheet(reportData)
    autoFitColumns(usersSheet, usersData)
    XLSX.utils.book_append_sheet(workbook, usersSheet, '👥 Пользователи')

    // Лист 5: Временная аналитика
    const { sheet: timeSheet, data: timeData } =
      createTimeAnalyticsSheet(reportData)
    autoFitColumns(timeSheet, timeData)
    XLSX.utils.book_append_sheet(workbook, timeSheet, '📅 Динамика')

    // Лист 6: Все транзакции
    const { sheet: transactionsSheet, data: transactionsData } =
      createTransactionsSheet(reportData)
    autoFitColumns(transactionsSheet, transactionsData)
    XLSX.utils.book_append_sheet(workbook, transactionsSheet, '📋 Транзакции')

    // Конвертируем в Buffer
    const buffer = await XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    return buffer
  } catch (error) {
    console.error('❌ Ошибка генерации Excel отчета:', error)
    throw new Error(
      `Не удалось создать Excel отчет: ${
        error instanceof Error ? error.message : 'Неизвестная ошибка'
      }`
    )
  }
}

async function getBotReportData(botName: string): Promise<BotReportData> {
  // Получаем все транзакции бота
  // ИСПРАВЛЕНИЕ: Используем пагинацию для получения ВСЕХ записей
  let allPayments: any[] = []
  let from = 0
  const batchSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data: batchPayments, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')
      .range(from, from + batchSize - 1)
      .order('payment_date', { ascending: false })

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

  if (!payments) throw new Error('Не удалось получить данные о транзакциях')

  // Получаем пользователей бота
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('bot_name', botName)

  // Валидируем и преобразуем данные
  const validatedPayments = payments.map(p => PaymentSchema.parse(p))
  const validatedUsers = users ? users.map(u => UserSchema.parse(u)) : []

  // Разделяем транзакции
  const incomes = validatedPayments.filter(p => p.type === 'MONEY_INCOME')
  const outcomes = validatedPayments.filter(p => p.type === 'MONEY_OUTCOME')
  const realIncomes = incomes.filter(p => p.category === 'REAL')
  const bonusIncomes = incomes.filter(p => p.category === 'BONUS')

  // Определяем админские операции по payment_method или описанию
  const adminIncomes = incomes.filter(
    p =>
      p.payment_method === 'Admin' ||
      (p.description && p.description.includes('Admin balance')) ||
      (p.description && p.description.includes('admin'))
  )
  const adminOutcomes = outcomes.filter(
    p =>
      p.payment_method === 'Admin' ||
      (p.description && p.description.includes('Admin balance')) ||
      (p.description && p.description.includes('admin'))
  )
  const adminPayments = [...adminIncomes, ...adminOutcomes] // Все админские операции

  // Разделяем по способам оплаты
  const robokassaPayments = realIncomes.filter(
    p =>
      p.currency === 'RUB' &&
      (p.payment_method === 'Robokassa' || p.payment_method === 'Manual')
  )
  const telegramStarsPayments = realIncomes.filter(
    p =>
      (p.currency === 'XTR' || p.currency === 'STARS') &&
      p.payment_method === 'Telegram'
  )

  // Подсчитываем основные метрики
  const totalIncome = realIncomes.reduce((sum, p) => sum + (p.stars || 0), 0)
  const totalOutcome = outcomes.reduce((sum, p) => sum + (p.stars || 0), 0)
  const totalCost = outcomes.reduce((sum, p) => sum + (p.cost || 0), 0)
  const netProfit = totalIncome - totalOutcome - totalCost
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0

  // Разделяем по валютам
  const rubIncome = robokassaPayments.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  )
  const rubOutcome = outcomes
    .filter(p => p.currency === 'RUB')
    .reduce((sum, p) => sum + (p.amount || 0), 0)
  const starsIncome = telegramStarsPayments.reduce(
    (sum, p) => sum + (p.stars || 0),
    0
  )
  const starsOutcome = outcomes
    .filter(p => p.currency !== 'RUB')
    .reduce((sum, p) => sum + (p.stars || 0), 0)
  const starsCost = outcomes.reduce((sum, p) => sum + (p.cost || 0), 0)

  // Анализ по сервисам
  const serviceStats = new Map<
    string,
    { count: number; revenue: number; cost: number }
  >()
  outcomes.forEach(payment => {
    const service = payment.service_type || 'unknown'
    const current = serviceStats.get(service) || {
      count: 0,
      revenue: 0,
      cost: 0,
    }
    current.count += 1
    current.revenue += payment.stars || 0
    current.cost += payment.cost || 0
    serviceStats.set(service, current)
  })

  // Топ пользователи по тратам
  const userSpending = new Map<string, number>()
  outcomes.forEach(payment => {
    const userId = payment.telegram_id
    const current = userSpending.get(userId) || 0
    userSpending.set(userId, current + (payment.stars || 0))
  })

  const topUsers = Array.from(userSpending.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([userId, spending]) => {
      const user = validatedUsers.find(u => u.telegram_id === userId)
      return TopUserSchema.parse({
        telegram_id: userId,
        username: user?.username,
        first_name: user?.first_name,
        last_name: user?.last_name,
        total_spending: spending,
        transactions_count: outcomes.filter(p => p.telegram_id === userId)
          .length,
      })
    })

  // Месячная статистика
  const monthlyStats = getMonthlyStats(validatedPayments).map(stat =>
    MonthlyStatsSchema.parse(stat)
  )
  const dailyStats = getDailyStats(
    validatedPayments.filter(p => {
      const date = new Date(p.payment_date)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return date >= thirtyDaysAgo
    })
  ).map(stat => DailyStatsSchema.parse(stat))

  // Активные пользователи за месяц
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const activeUsersMonth = new Set(
    validatedPayments
      .filter(p => new Date(p.payment_date) >= oneMonthAgo)
      .map(p => p.telegram_id)
  ).size

  return {
    botName,
    totalIncome,
    totalOutcome,
    totalCost,
    netProfit,
    profitMargin,
    totalUsers: validatedUsers.length,
    activeUsersMonth,
    totalTransactions: validatedPayments.length,
    rubIncome,
    rubOutcome,
    starsIncome,
    starsOutcome,
    starsCost,
    robokassaPayments,
    telegramStarsPayments,
    bonusPayments: bonusIncomes,
    adminPayments,
    serviceStats,
    topUsers,
    userSegments: [], // TODO: implement user segmentation
    monthlyStats,
    dailyStats,
    allTransactions: validatedPayments,
  }
}

function createBotSummarySheet(data: BotReportData): {
  sheet: XLSX.WorkSheet
  data: any[][]
} {
  const summaryData: any[][] = [
    ['🤖 ОТЧЕТ ПО БОТУ - ОБЩАЯ СВОДКА', '', '', ''],
    ['', '', '', ''],
    ['🤖 Название бота:', `@${data.botName}`, '', ''],
    ['📅 Дата отчета:', new Date().toLocaleDateString('ru-RU'), '', ''],
    ['', '', '', ''],
  ]

  // Добавляем рублевые операции только если есть данные
  if (data.rubIncome > 0 || data.robokassaPayments.length > 0) {
    summaryData.push(
      ['💰 РУБЛЕВЫЕ ОПЕРАЦИИ', '', '', ''],
      ['', '', '', ''],
      [
        '📈 Доходы:',
        `${Math.round(data.rubIncome * 100) / 100} руб.`,
        `(${data.robokassaPayments.length} операций)`,
        '',
      ],
      [
        '📉 Расходы:',
        `${Math.round(data.rubOutcome * 100) / 100} руб.`,
        '',
        '',
      ],
      [
        '💎 Результат:',
        `${Math.round((data.rubIncome - data.rubOutcome) * 100) / 100} руб.`,
        '',
        '',
      ],
      ['', '', '', '']
    )
  }

  // Добавляем звездные операции только если есть данные
  if (data.starsIncome > 0 || data.telegramStarsPayments.length > 0) {
    summaryData.push(
      ['⭐ ЗВЕЗДНЫЕ ОПЕРАЦИИ', '', '', ''],
      ['', '', '', ''],
      [
        '📈 Доходы:',
        `${Math.round(data.starsIncome * 100) / 100} ⭐`,
        `(${data.telegramStarsPayments.length} операций)`,
        '',
      ],
      [
        '📉 Расходы:',
        `${Math.round(data.starsOutcome * 100) / 100} ⭐`,
        '',
        '',
      ],
      [
        '🏭 Себестоимость:',
        `${Math.round(data.starsCost * 100) / 100} ⭐`,
        '',
        '',
      ],
      [
        '💎 Результат:',
        `${
          Math.round(
            (data.starsIncome - data.starsOutcome - data.starsCost) * 100
          ) / 100
        } ⭐`,
        '',
        '',
      ],
      ['', '', '', '']
    )
  }

  // Общие финансовые показатели - только если есть хоть какие-то данные
  if (data.totalIncome > 0 || data.totalOutcome > 0) {
    summaryData.push(
      ['💰 ОБЩИЕ ФИНАНСОВЫЕ ПОКАЗАТЕЛИ', '', '', ''],
      ['', '', '', ''],
      [
        '📈 Общий доход:',
        `${Math.round(data.totalIncome * 100) / 100} ⭐`,
        '',
        '',
      ],
      [
        '📉 Общий расход:',
        `${Math.round(data.totalOutcome * 100) / 100} ⭐`,
        '',
        '',
      ],
      [
        '🏭 Себестоимость:',
        `${Math.round(data.totalCost * 100) / 100} ⭐`,
        '',
        '',
      ],
      [
        '💎 Чистая прибыль:',
        `${Math.round(data.netProfit * 100) / 100} ⭐`,
        '',
        '',
      ],
      [
        '📊 Маржинальность:',
        `${Math.round(data.profitMargin * 100) / 100}%`,
        '',
        '',
      ],
      ['', '', '', '']
    )
  }

  // Остальные разделы
  summaryData.push(
    ['', '', '', ''],
    ['👥 ПОЛЬЗОВАТЕЛИ', '', '', ''],
    ['', '', '', ''],
    ['👤 Всего пользователей:', data.totalUsers.toString(), '', ''],
    ['🟢 Активных за месяц:', data.activeUsersMonth.toString(), '', ''],
    [
      '📊 Конверсия:',
      `${
        data.totalUsers > 0
          ? Math.round((data.activeUsersMonth / data.totalUsers) * 10000) / 100
          : 0
      }%`,
      '',
      '',
    ],
    ['', '', '', ''],
    ['⚡ ОПЕРАЦИИ', '', '', ''],
    ['', '', '', ''],
    ['🔢 Всего транзакций:', data.totalTransactions.toString(), '', ''],
    [
      '💳 Robokassa платежей:',
      data.robokassaPayments.length.toString(),
      '',
      '',
    ],
    [
      '⭐ Telegram Stars платежей:',
      data.telegramStarsPayments.length.toString(),
      '',
      '',
    ],
    ['🎁 Бонусных операций:', data.bonusPayments.length.toString(), '', ''],
    ['', '', '', ''],
    ['🏆 ТОП СЕРВИСЫ', '', '', ''],
    ['', '', '', ''],
    ...Array.from(data.serviceStats.entries())
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(([service, stats], index) => [
        `${index + 1}. ${getServiceEmoji(service)} ${getServiceDisplayTitle(
          service as UserService
        )}:`,
        `${Math.round(stats.revenue * 100) / 100} ⭐`,
        `(${stats.count} операций)`,
        '',
      ])
  )

  return { sheet: XLSX.utils.aoa_to_sheet(summaryData), data: summaryData }
}

function createFinancialAnalyticsSheet(data: BotReportData): {
  sheet: XLSX.WorkSheet
  data: any[][]
} {
  const headers = [
    '📅 Период',
    '�� Доходы (⭐)',
    '💰 Доходы (руб.)',
    '📉 Расходы (⭐)',
    '🏭 Себестоимость (⭐)',
    '💎 Прибыль (⭐)',
    '📊 Маржа (%)',
    '🔢 Транзакций',
  ]

  const financialData = [
    ['💰 ФИНАНСОВАЯ АНАЛИТИКА ПО МЕСЯЦАМ', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    headers,
    ['', '', '', '', '', '', '', ''],
    ...data.monthlyStats.map(stat => [
      stat.period,
      Math.round(stat.income * 100) / 100,
      Math.round(stat.income_rub * 100) / 100,
      Math.round(stat.outcome * 100) / 100,
      Math.round(stat.cost * 100) / 100,
      Math.round(stat.profit * 100) / 100,
      Math.round(stat.margin * 100) / 100,
      stat.transactions,
    ]),
    ['', '', '', '', '', '', '', ''],
    ['💳 ДЕТАЛИЗАЦИЯ ПО СПОСОБАМ ОПЛАТЫ', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    [
      'Способ оплаты',
      'Количество',
      'Сумма (⭐)',
      'Сумма (руб.)',
      'Средний чек',
      '',
      '',
      '',
    ],
    ['', '', '', '', '', '', '', ''],
    [
      '💳 Robokassa',
      data.robokassaPayments.length,
      data.robokassaPayments.reduce((sum, p) => sum + (p.stars || 0), 0),
      data.robokassaPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
      data.robokassaPayments.length > 0
        ? Math.round(
            (data.robokassaPayments.reduce(
              (sum, p) => sum + (p.stars || 0),
              0
            ) /
              data.robokassaPayments.length) *
              100
          ) / 100
        : 0,
      '',
      '',
      '',
    ],
    [
      '⭐ Telegram Stars',
      data.telegramStarsPayments.length,
      data.telegramStarsPayments.reduce((sum, p) => sum + (p.stars || 0), 0),
      0,
      data.telegramStarsPayments.length > 0
        ? Math.round(
            (data.telegramStarsPayments.reduce(
              (sum, p) => sum + (p.stars || 0),
              0
            ) /
              data.telegramStarsPayments.length) *
              100
          ) / 100
        : 0,
      '',
      '',
      '',
    ],
    [
      '🎁 Бонусы',
      data.bonusPayments.length,
      data.bonusPayments.reduce((sum, p) => sum + (p.stars || 0), 0),
      0,
      data.bonusPayments.length > 0
        ? Math.round(
            (data.bonusPayments.reduce((sum, p) => sum + (p.stars || 0), 0) /
              data.bonusPayments.length) *
              100
          ) / 100
        : 0,
      '',
      '',
      '',
    ],
    [
      '👨‍💼 Админские',
      data.adminPayments.length,
      data.adminPayments.reduce((sum, p) => sum + (p.stars || 0), 0),
      0,
      data.adminPayments.length > 0
        ? Math.round(
            (data.adminPayments.reduce((sum, p) => sum + (p.stars || 0), 0) /
              data.adminPayments.length) *
              100
          ) / 100
        : 0,
      '',
      '',
      '',
    ],
  ]

  return { sheet: XLSX.utils.aoa_to_sheet(financialData), data: financialData }
}

function createServicesAnalyticsSheet(data: BotReportData): {
  sheet: XLSX.WorkSheet
  data: any[][]
} {
  const headers = [
    '🛠️ Сервис',
    '🔢 Операций',
    '💰 Выручка (⭐)',
    '🏭 Себестоимость (⭐)',
    '💎 Прибыль (⭐)',
    '📊 Маржа (%)',
    '📈 % от оборота',
  ]

  const totalRevenue = Array.from(data.serviceStats.values()).reduce(
    (sum, s) => sum + s.revenue,
    0
  )

  const servicesData = [
    ['🛠️ АНАЛИТИКА ПО СЕРВИСАМ', '', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    headers,
    ['', '', '', '', '', '', ''],
    ...Array.from(data.serviceStats.entries())
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([service, stats]) => {
        const profit = stats.revenue - stats.cost
        const margin = stats.revenue > 0 ? (profit / stats.revenue) * 100 : 0
        const revenueShare =
          totalRevenue > 0 ? (stats.revenue / totalRevenue) * 100 : 0

        return [
          `${getServiceEmoji(service)} ${getServiceDisplayTitle(
            service as UserService
          )}`,
          stats.count,
          Math.round(stats.revenue * 100) / 100,
          Math.round(stats.cost * 100) / 100,
          Math.round(profit * 100) / 100,
          Math.round(margin * 100) / 100,
          Math.round(revenueShare * 100) / 100,
        ]
      }),
  ]

  return { sheet: XLSX.utils.aoa_to_sheet(servicesData), data: servicesData }
}

function createUsersAnalyticsSheet(data: BotReportData): {
  sheet: XLSX.WorkSheet
  data: any[][]
} {
  const headers = [
    '👤 ID пользователя',
    '📱 Username',
    '👤 Имя',
    '💰 Потрачено (⭐)',
    '🔢 Транзакций',
    '💵 Средний чек',
    '📊 % от оборота',
  ]

  const totalSpending = data.topUsers.reduce(
    (sum, u) => sum + u.total_spending,
    0
  )

  const usersData = [
    ['👥 АНАЛИТИКА ПО ПОЛЬЗОВАТЕЛЯМ', '', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['📊 ТОП-20 ПОЛЬЗОВАТЕЛЕЙ ПО ТРАТАМ', '', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    headers,
    ['', '', '', '', '', '', ''],
    ...data.topUsers.map(user => {
      const avgCheck =
        user.transactions_count > 0
          ? user.total_spending / user.transactions_count
          : 0
      const spendingShare =
        totalSpending > 0 ? (user.total_spending / totalSpending) * 100 : 0

      return [
        user.telegram_id,
        user.username ? `@${user.username}` : 'Не указан',
        `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
          'Не указано',
        Math.round(user.total_spending * 100) / 100,
        user.transactions_count,
        Math.round(avgCheck * 100) / 100,
        Math.round(spendingShare * 100) / 100,
      ]
    }),
  ]

  return { sheet: XLSX.utils.aoa_to_sheet(usersData), data: usersData }
}

function createTimeAnalyticsSheet(data: BotReportData): {
  sheet: XLSX.WorkSheet
  data: any[][]
} {
  const monthlyHeaders = [
    '📅 Месяц',
    '💰 Доходы (⭐)',
    '📉 Расходы (⭐)',
    '💎 Прибыль (⭐)',
    '🔢 Транзакций',
    '👥 Активных пользователей',
  ]

  const dailyHeaders = [
    '📅 Дата',
    '💰 Доходы (⭐)',
    '📉 Расходы (⭐)',
    '💎 Прибыль (⭐)',
    '🔢 Транзакций',
  ]

  const timeData = [
    ['📅 ВРЕМЕННАЯ АНАЛИТИКА', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['📊 СТАТИСТИКА ПО МЕСЯЦАМ', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    monthlyHeaders,
    ['', '', '', '', '', ''],
    ...data.monthlyStats.map(stat => [
      stat.period,
      Math.round(stat.income * 100) / 100,
      Math.round(stat.outcome * 100) / 100,
      Math.round(stat.profit * 100) / 100,
      stat.transactions,
      stat.active_users || 0,
    ]),
    ['', '', '', '', '', ''],
    ['📊 СТАТИСТИКА ПО ДНЯМ (ПОСЛЕДНИЕ 30 ДНЕЙ)', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    dailyHeaders,
    ['', '', '', '', '', ''],
    ...data.dailyStats.map(stat => [
      stat.date,
      Math.round(stat.income * 100) / 100,
      Math.round(stat.outcome * 100) / 100,
      Math.round(stat.profit * 100) / 100,
      stat.transactions,
    ]),
  ]

  return { sheet: XLSX.utils.aoa_to_sheet(timeData), data: timeData }
}

function createTransactionsSheet(data: BotReportData): {
  sheet: XLSX.WorkSheet
  data: any[][]
} {
  const headers = [
    '📅 Дата',
    '📊 Тип',
    '💰 Сумма (⭐)',
    '💵 Сумма (руб.)',
    '💳 Способ оплаты',
    '🛠️ Сервис',
    '👤 Пользователь',
    '📝 Описание',
    '🏷️ Категория',
  ]

  const transactionsData = [
    ['📋 ВСЕ ТРАНЗАКЦИИ', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    headers,
    ['', '', '', '', '', '', '', '', ''],
    ...data.allTransactions.map(payment => [
      new Date(payment.payment_date).toLocaleDateString('ru-RU'),
      payment.type === 'MONEY_INCOME' ? '📈 Доход' : '📉 Расход',
      Math.round((payment.stars || 0) * 100) / 100,
      payment.currency === 'RUB'
        ? Math.round((payment.amount || 0) * 100) / 100
        : '',
      getPaymentMethodDisplay(payment),
      payment.service_type
        ? `${getServiceEmoji(payment.service_type)} ${getServiceDisplayTitle(
            payment.service_type as UserService
          )}`
        : '',
      payment.telegram_id,
      payment.description || '',
      payment.category === 'REAL'
        ? '💎 Реальные'
        : payment.category === 'BONUS'
          ? '🎁 Бонусы'
          : payment.payment_method === 'Admin' ||
              (payment.description &&
                payment.description.includes('Admin balance'))
            ? '👨‍💼 Админские'
            : '❓ Неизвестно',
    ]),
  ]

  return {
    sheet: XLSX.utils.aoa_to_sheet(transactionsData),
    data: transactionsData,
  }
}

function getPaymentMethodDisplay(payment: any): string {
  if (
    payment.currency === 'RUB' &&
    (payment.payment_method === 'Robokassa' ||
      payment.payment_method === 'Manual')
  ) {
    return '💳 Robokassa'
  } else if (
    (payment.currency === 'XTR' || payment.currency === 'STARS') &&
    payment.payment_method === 'Telegram'
  ) {
    return '⭐ Telegram Stars'
  } else if (payment.payment_method === 'System') {
    return '🤖 Система'
  } else if (payment.payment_method === 'Bonus') {
    return '🎁 Бонус'
  } else if (payment.payment_method === 'Manual') {
    return '✋ Ручное'
  }
  return payment.payment_method || '❓ Неизвестно'
}

function getMonthlyStats(payments: any[]) {
  const monthlyMap = new Map<string, any>()

  payments.forEach(payment => {
    const date = new Date(payment.payment_date)
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, '0')}`

    const current = monthlyMap.get(monthKey) || {
      period: monthKey,
      income: 0,
      income_rub: 0,
      outcome: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      transactions: 0,
      active_users: new Set(),
    }

    current.transactions += 1
    current.active_users.add(payment.telegram_id)

    if (payment.type === 'MONEY_INCOME' && payment.category === 'REAL') {
      current.income += payment.stars || 0
      if (payment.currency === 'RUB') {
        current.income_rub += payment.amount || 0
      }
    } else if (payment.type === 'MONEY_OUTCOME') {
      current.outcome += payment.stars || 0
      current.cost += payment.cost || 0
    }

    current.profit = current.income - current.outcome - current.cost
    current.margin =
      current.income > 0 ? (current.profit / current.income) * 100 : 0

    monthlyMap.set(monthKey, current)
  })

  return Array.from(monthlyMap.values())
    .map(stat => ({
      ...stat,
      active_users: stat.active_users.size,
    }))
    .sort((a, b) => b.period.localeCompare(a.period))
}

function getDailyStats(payments: any[]) {
  const dailyMap = new Map<string, any>()

  payments.forEach(payment => {
    const date = new Date(payment.payment_date).toISOString().split('T')[0]

    const current = dailyMap.get(date) || {
      date,
      income: 0,
      outcome: 0,
      cost: 0,
      profit: 0,
      transactions: 0,
    }

    current.transactions += 1

    if (payment.type === 'MONEY_INCOME' && payment.category === 'REAL') {
      current.income += payment.stars || 0
    } else if (payment.type === 'MONEY_OUTCOME') {
      current.outcome += payment.stars || 0
      current.cost += payment.cost || 0
    }

    current.profit = current.income - current.outcome - current.cost

    dailyMap.set(date, current)
  })

  return Array.from(dailyMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  )
}
