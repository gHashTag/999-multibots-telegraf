/**
 * ГЕНЕРАТОР КРАСИВЫХ EXCEL-ОТЧЕТОВ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ
 * Создает детальную аналитику по транзакциям с красивым оформлением
 */

import * as XLSX from '@/utils/excelCompat'
import { supabase } from '@/core/supabase'
import {
  getServiceDisplayTitle,
  getServiceEmoji,
  UserService,
} from './serviceMapping'

interface UserReportData {
  userId: string
  username?: string
  totalBalance: number
  realIncomes: any[]
  bonusIncomes: any[]
  outcomes: any[]
  serviceStats: Map<string, { count: number; stars: number }>
}

export async function generateUserExcelReport(userId: string): Promise<Buffer> {
  // Получаем все данные пользователя
  const reportData = await getUserReportData(userId)

  // Создаем новую книгу Excel
  const workbook = XLSX.utils.book_new()

  // Лист 1: Общая сводка
  const summarySheet = createSummarySheet(reportData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, '📊 Общая сводка')

  // Лист 2: Пополнения
  const incomesSheet = createIncomesSheet(reportData)
  XLSX.utils.book_append_sheet(workbook, incomesSheet, '📈 Пополнения')

  // Лист 3: Траты
  const expensesSheet = createExpensesSheet(reportData)
  XLSX.utils.book_append_sheet(workbook, expensesSheet, '📉 Траты')

  // Лист 4: Аналитика по сервисам
  const servicesSheet = createServicesSheet(reportData)
  XLSX.utils.book_append_sheet(workbook, servicesSheet, '🛠️ Сервисы')

  // Лист 5: Детальная история
  const historySheet = createHistorySheet(reportData)
  XLSX.utils.book_append_sheet(workbook, historySheet, '📋 История операций')

  // Конвертируем в Buffer
  const buffer = await XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return buffer
}

async function getUserReportData(userId: string): Promise<UserReportData> {
  // Получаем информацию о пользователе
  const { data: userInfo } = await supabase
    .from('users')
    .select('username')
    .eq('telegram_id', userId)
    .single()

  // Получаем все транзакции
  const { data: payments } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', userId)
    .eq('status', 'COMPLETED')
    .order('payment_date', { ascending: false })

  if (!payments) throw new Error('Не удалось получить данные о транзакциях')

  // Разделяем транзакции
  const incomes = payments.filter(p => p.type === 'MONEY_INCOME')
  const outcomes = payments.filter(p => p.type === 'MONEY_OUTCOME')
  const realIncomes = incomes.filter(p => p.category === 'REAL')
  const bonusIncomes = incomes.filter(p => p.category === 'BONUS')

  // Подсчитываем баланс
  const totalRealStars = realIncomes.reduce((sum, p) => sum + (p.stars || 0), 0)
  const totalBonusStars = bonusIncomes.reduce(
    (sum, p) => sum + (p.stars || 0),
    0
  )
  const totalOutcomeStars = outcomes.reduce((sum, p) => sum + (p.stars || 0), 0)
  const totalBalance = totalRealStars + totalBonusStars - totalOutcomeStars

  // Анализ по сервисам
  const serviceStats = new Map<string, { count: number; stars: number }>()
  outcomes.forEach(payment => {
    const service = payment.service_type || 'unknown'
    const current = serviceStats.get(service) || { count: 0, stars: 0 }
    current.count += 1
    current.stars += payment.stars || 0
    serviceStats.set(service, current)
  })

  return {
    userId,
    username: userInfo?.username,
    totalBalance,
    realIncomes,
    bonusIncomes,
    outcomes,
    serviceStats,
  }
}

function createSummarySheet(data: UserReportData) {
  const totalRealStars = data.realIncomes.reduce(
    (sum, p) => sum + (p.stars || 0),
    0
  )
  const totalBonusStars = data.bonusIncomes.reduce(
    (sum, p) => sum + (p.stars || 0),
    0
  )
  const totalOutcomeStars = data.outcomes.reduce(
    (sum, p) => sum + (p.stars || 0),
    0
  )

  // Разделяем по способам оплаты
  const rublesIncomes = data.realIncomes.filter(
    p =>
      p.currency === 'RUB' &&
      (p.payment_method === 'Robokassa' || p.payment_method === 'Manual')
  )
  const starsIncomes = data.realIncomes.filter(
    p =>
      (p.currency === 'XTR' || p.currency === 'STARS') &&
      p.payment_method === 'Telegram'
  )

  const rublesStars = rublesIncomes.reduce((sum, p) => sum + (p.stars || 0), 0)
  const rublesAmount = rublesIncomes.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  )
  const telegramStars = starsIncomes.reduce((sum, p) => sum + (p.stars || 0), 0)

  const summaryData = [
    ['💰 ПЕРСОНАЛЬНЫЙ ФИНАНСОВЫЙ ОТЧЕТ', '', '', ''],
    ['', '', '', ''],
    ['👤 Пользователь:', data.username || `ID: ${data.userId}`, '', ''],
    ['📅 Дата отчета:', new Date().toLocaleDateString('ru-RU'), '', ''],
    ['', '', '', ''],
    [
      '💎 ТЕКУЩИЙ БАЛАНС',
      `${Math.round(data.totalBalance * 100) / 100} ⭐`,
      '',
      '',
    ],
    ['', '', '', ''],
    ['📊 ОБЩАЯ СТАТИСТИКА', '', '', ''],
    ['', '', '', ''],
    ['📈 ПОПОЛНЕНИЯ:', '', '', ''],
    ...(rublesIncomes.length > 0
      ? [
          [
            '💳 Через Robokassa:',
            `${Math.round(rublesStars * 100) / 100} ⭐`,
            `(${Math.round(rublesAmount * 100) / 100} руб.)`,
            '',
          ],
        ]
      : []),
    ...(starsIncomes.length > 0
      ? [
          [
            '⭐ Через Telegram Stars:',
            `${Math.round(telegramStars * 100) / 100} ⭐`,
            '',
            '',
          ],
        ]
      : []),
    [
      '📈 Итого пополнений:',
      `${Math.round(totalRealStars * 100) / 100} ⭐`,
      '',
      '',
    ],
    ...(totalBonusStars > 0
      ? [
          [
            '🎁 Бонусы получено:',
            `${Math.round(totalBonusStars * 100) / 100} ⭐`,
            '',
            '',
          ],
        ]
      : []),
    [
      '📉 Всего потрачено:',
      `${Math.round(totalOutcomeStars * 100) / 100} ⭐`,
      '',
      '',
    ],
    ['', '', '', ''],
    ['🔢 КОЛИЧЕСТВО ОПЕРАЦИЙ:', '', '', ''],
    ['💳 Пополнений:', data.realIncomes.length.toString(), '', ''],
    ['🎁 Бонусов:', data.bonusIncomes.length.toString(), '', ''],
    ['📉 Трат:', data.outcomes.length.toString(), '', ''],
    [
      '📊 Всего операций:',
      (
        data.realIncomes.length +
        data.bonusIncomes.length +
        data.outcomes.length
      ).toString(),
      '',
      '',
    ],
  ]

  return XLSX.utils.aoa_to_sheet(summaryData)
}

function createIncomesSheet(data: UserReportData) {
  const headers = [
    '📅 Дата',
    '💰 Сумма (⭐)',
    '💳 Способ оплаты',
    '💵 Сумма (руб.)',
    '📝 Описание',
    '🏷️ Категория',
  ]

  const incomesData = [
    headers,
    ['', '', '', '', '', ''],
    ...data.realIncomes.map(payment => [
      new Date(payment.payment_date).toLocaleDateString('ru-RU'),
      Math.round((payment.stars || 0) * 100) / 100,
      getPaymentMethodDisplay(payment),
      payment.currency === 'RUB'
        ? Math.round((payment.amount || 0) * 100) / 100
        : '',
      payment.description || '',
      '💎 Реальные',
    ]),
    ...(data.bonusIncomes.length > 0
      ? [
          ['', '', '', '', '', ''],
          ['🎁 БОНУСНЫЕ ОПЕРАЦИИ', '', '', '', '', ''],
          ['', '', '', '', '', ''],
          ...data.bonusIncomes.map(payment => [
            new Date(payment.payment_date).toLocaleDateString('ru-RU'),
            Math.round((payment.stars || 0) * 100) / 100,
            getPaymentMethodDisplay(payment),
            payment.currency === 'RUB'
              ? Math.round((payment.amount || 0) * 100) / 100
              : '',
            payment.description || '',
            '🎁 Бонусы',
          ]),
        ]
      : []),
  ]

  return XLSX.utils.aoa_to_sheet(incomesData)
}

function createExpensesSheet(data: UserReportData) {
  const headers = ['📅 Дата', '💰 Сумма (⭐)', '🛠️ Сервис', '📝 Описание']

  const expensesData = [
    headers,
    ['', '', '', ''],
    ...data.outcomes.map(payment => [
      new Date(payment.payment_date).toLocaleDateString('ru-RU'),
      Math.round((payment.stars || 0) * 100) / 100,
      `${getServiceEmoji(
        payment.service_type || 'unknown'
      )} ${getServiceDisplayTitle(
        (payment.service_type || 'unknown') as UserService
      )}`,
      payment.description || '',
    ]),
  ]

  return XLSX.utils.aoa_to_sheet(expensesData)
}

function createServicesSheet(data: UserReportData) {
  const headers = [
    '🛠️ Сервис',
    '💰 Потрачено (⭐)',
    '🔢 Операций',
    '📊 % от трат',
    '💵 Средняя цена',
  ]

  const totalSpent = data.outcomes.reduce((sum, p) => sum + (p.stars || 0), 0)
  const sortedServices = Array.from(data.serviceStats.entries()).sort(
    ([, a], [, b]) => b.stars - a.stars
  )

  const servicesData = [
    headers,
    ['', '', '', '', ''],
    ...sortedServices.map(([service, stats]) => {
      const percentage =
        totalSpent > 0 ? Math.round((stats.stars / totalSpent) * 1000) / 10 : 0
      const avgPrice =
        stats.count > 0
          ? Math.round((stats.stars / stats.count) * 100) / 100
          : 0

      return [
        `${getServiceEmoji(service)} ${getServiceDisplayTitle(
          service as UserService
        )}`,
        Math.round(stats.stars * 100) / 100,
        stats.count,
        `${percentage}%`,
        avgPrice,
      ]
    }),
  ]

  return XLSX.utils.aoa_to_sheet(servicesData)
}

function createHistorySheet(data: UserReportData) {
  const headers = [
    '📅 Дата',
    '📊 Тип',
    '💰 Сумма (⭐)',
    '🛠️ Сервис/Способ',
    '📝 Описание',
    '🏷️ Категория',
  ]

  // Объединяем все операции и сортируем по дате
  const allOperations = [
    ...data.realIncomes.map(p => ({
      ...p,
      operationType: 'income',
      category: 'real',
    })),
    ...data.bonusIncomes.map(p => ({
      ...p,
      operationType: 'income',
      category: 'bonus',
    })),
    ...data.outcomes.map(p => ({
      ...p,
      operationType: 'outcome',
      category: 'expense',
    })),
  ].sort(
    (a, b) =>
      new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
  )

  const historyData = [
    headers,
    ['', '', '', '', '', ''],
    ...allOperations.map(payment => [
      new Date(payment.payment_date).toLocaleDateString('ru-RU'),
      payment.operationType === 'income' ? '📈 Доход' : '📉 Расход',
      Math.round((payment.stars || 0) * 100) / 100,
      payment.operationType === 'income'
        ? getPaymentMethodDisplay(payment)
        : `${getServiceEmoji(
            payment.service_type || 'unknown'
          )} ${getServiceDisplayTitle(
            (payment.service_type || 'unknown') as UserService
          )}`,
      payment.description || '',
      payment.category === 'real'
        ? '💎 Реальные'
        : payment.category === 'bonus'
          ? '🎁 Бонусы'
          : '💸 Траты',
    ]),
  ]

  return XLSX.utils.aoa_to_sheet(historyData)
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
