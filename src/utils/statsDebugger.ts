import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

export interface StatsDebugInfo {
  botName: string
  userId: string
  databaseChecks: {
    paymentsCount: number
    usersCount: number
    botsCount: number
    samplePayments: any[]
    sampleUsers: any[]
  }
  sqlFunctionChecks: {
    getUserBalanceWorks: boolean
    getUserBalanceStatsWorks: boolean
    rawResults: any
  }
  dataConsistency: {
    totalIncome: number
    totalOutcome: number
    calculatedBalance: number
    actualBalance: number
    discrepancy: number
  }
  recommendations: string[]
}

/**
 * Комплексная диагностика статистики для конкретного бота и пользователя
 */
export async function debugBotStats(
  botName: string,
  userId: string
): Promise<StatsDebugInfo> {
  logger.info('🔍 Starting stats debugging for:', { botName, userId })

  const debugInfo: StatsDebugInfo = {
    botName,
    userId,
    databaseChecks: {
      paymentsCount: 0,
      usersCount: 0,
      botsCount: 0,
      samplePayments: [],
      sampleUsers: [],
    },
    sqlFunctionChecks: {
      getUserBalanceWorks: false,
      getUserBalanceStatsWorks: false,
      rawResults: null,
    },
    dataConsistency: {
      totalIncome: 0,
      totalOutcome: 0,
      calculatedBalance: 0,
      actualBalance: 0,
      discrepancy: 0,
    },
    recommendations: [],
  }

  try {
    // 1. Проверяем базовые данные в таблицах
    await checkDatabaseTables(debugInfo)

    // 2. Проверяем SQL функции
    await checkSqlFunctions(debugInfo)

    // 3. Проверяем консистентность данных
    await checkDataConsistency(debugInfo)

    // 4. Генерируем рекомендации
    generateRecommendations(debugInfo)

    logger.info('✅ Stats debugging completed:', debugInfo)
    return debugInfo
  } catch (error) {
    logger.error('❌ Stats debugging failed:', error)
    debugInfo.recommendations.push(
      `Критическая ошибка при диагностике: ${error instanceof Error ? error.message : String(error)}`
    )
    return debugInfo
  }
}

async function checkDatabaseTables(debugInfo: StatsDebugInfo): Promise<void> {
  const { botName, userId } = debugInfo

  // Проверяем payments_v2
  const { data: payments, error: paymentsError } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('bot_name', botName)
    .eq('telegram_id', parseInt(userId))
    .order('created_at', { ascending: false })
    .limit(10)

  if (paymentsError) {
    logger.error('Payments query error:', paymentsError)
    debugInfo.recommendations.push(
      `Ошибка запроса payments_v2: ${paymentsError.message}`
    )
  } else {
    debugInfo.databaseChecks.paymentsCount = payments?.length || 0
    debugInfo.databaseChecks.samplePayments = payments?.slice(0, 3) || []
  }

  // Проверяем users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', parseInt(userId))
    .limit(5)

  if (usersError) {
    logger.error('Users query error:', usersError)
    debugInfo.recommendations.push(
      `Ошибка запроса users: ${usersError.message}`
    )
  } else {
    debugInfo.databaseChecks.usersCount = users?.length || 0
    debugInfo.databaseChecks.sampleUsers = users || []
  }

  // Проверяем bots
  const { data: bots, error: botsError } = await supabase
    .from('bots')
    .select('*')
    .eq('bot_name', botName)

  if (botsError) {
    logger.error('Bots query error:', botsError)
  } else {
    debugInfo.databaseChecks.botsCount = bots?.length || 0
  }

  logger.info('📊 Database checks completed:', debugInfo.databaseChecks)
}

async function checkSqlFunctions(debugInfo: StatsDebugInfo): Promise<void> {
  const { userId, botName } = debugInfo

  // Проверяем get_user_balance
  try {
    const { data: balanceData, error: balanceError } = await supabase.rpc(
      'get_user_balance',
      {
        user_telegram_id: userId,
      }
    )

    if (balanceError) {
      logger.error('get_user_balance error:', balanceError)
      debugInfo.recommendations.push(
        `SQL функция get_user_balance не работает: ${balanceError.message}`
      )
    } else {
      debugInfo.sqlFunctionChecks.getUserBalanceWorks = true
      debugInfo.dataConsistency.actualBalance = balanceData || 0
    }
  } catch (error) {
    logger.error('get_user_balance exception:', error)
    debugInfo.recommendations.push(
      `Исключение в get_user_balance: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  // Проверяем get_user_balance_stats
  try {
    const { data: statsData, error: statsError } = await supabase.rpc(
      'get_user_balance_stats',
      {
        user_telegram_id: userId,
      }
    )

    if (statsError) {
      logger.error('get_user_balance_stats error:', statsError)
      debugInfo.recommendations.push(
        `SQL функция get_user_balance_stats не работает: ${statsError.message}`
      )
    } else {
      debugInfo.sqlFunctionChecks.getUserBalanceStatsWorks = true
      debugInfo.sqlFunctionChecks.rawResults = statsData
    }
  } catch (error) {
    logger.error('get_user_balance_stats exception:', error)
    debugInfo.recommendations.push(
      `Исключение в get_user_balance_stats: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  logger.info('🔧 SQL functions checks completed:', debugInfo.sqlFunctionChecks)
}

async function checkDataConsistency(debugInfo: StatsDebugInfo): Promise<void> {
  const { botName, userId } = debugInfo

  // Вычисляем баланс вручную из payments_v2
  const { data: allPayments } = await supabase
    .from('payments_v2')
    .select('stars, type')
    .eq('bot_name', botName)
    .eq('telegram_id', parseInt(userId))
    .eq('status', 'COMPLETED')

  if (allPayments) {
    let totalIncome = 0
    let totalOutcome = 0

    allPayments.forEach(payment => {
      const stars = payment.stars || 0
      if (payment.type === 'MONEY_INCOME') {
        totalIncome += stars
      } else if (payment.type === 'MONEY_OUTCOME') {
        totalOutcome += stars
      }
    })

    debugInfo.dataConsistency.totalIncome = totalIncome
    debugInfo.dataConsistency.totalOutcome = totalOutcome
    debugInfo.dataConsistency.calculatedBalance = totalIncome - totalOutcome
    debugInfo.dataConsistency.discrepancy =
      debugInfo.dataConsistency.actualBalance -
      debugInfo.dataConsistency.calculatedBalance
  }

  logger.info(
    '📈 Data consistency checks completed:',
    debugInfo.dataConsistency
  )
}

function generateRecommendations(debugInfo: StatsDebugInfo): void {
  const { databaseChecks, sqlFunctionChecks, dataConsistency } = debugInfo

  // Проверяем наличие данных
  if (databaseChecks.paymentsCount === 0) {
    debugInfo.recommendations.push(
      '⚠️ Нет платежей для этого бота и пользователя. Проверьте правильность bot_name и telegram_id.'
    )
  }

  if (databaseChecks.usersCount === 0) {
    debugInfo.recommendations.push(
      '⚠️ Пользователь не найден в таблице users. Возможно, нужно создать запись пользователя.'
    )
  }

  if (databaseChecks.botsCount === 0) {
    debugInfo.recommendations.push(
      '⚠️ Бот не найден в таблице bots. Проверьте правильность имени бота.'
    )
  }

  // Проверяем SQL функции
  if (!sqlFunctionChecks.getUserBalanceWorks) {
    debugInfo.recommendations.push(
      '🔧 SQL функция get_user_balance не работает. Проверьте её существование в базе данных.'
    )
  }

  if (!sqlFunctionChecks.getUserBalanceStatsWorks) {
    debugInfo.recommendations.push(
      '🔧 SQL функция get_user_balance_stats не работает. Проверьте её существование в базе данных.'
    )
  }

  // Проверяем консистентность данных
  if (Math.abs(dataConsistency.discrepancy) > 0.01) {
    debugInfo.recommendations.push(
      `💰 Расхождение в балансе: расчетный ${dataConsistency.calculatedBalance}, фактический ${dataConsistency.actualBalance}. Разница: ${dataConsistency.discrepancy}`
    )
  }

  // Общие рекомендации
  if (debugInfo.recommendations.length === 0) {
    debugInfo.recommendations.push(
      '✅ Все проверки пройдены успешно. Данные выглядят корректно.'
    )
  }

  // Добавляем рекомендации по улучшению
  if (databaseChecks.paymentsCount > 0 && databaseChecks.paymentsCount < 10) {
    debugInfo.recommendations.push(
      '📊 Мало данных для полноценной статистики. Рекомендуется больше транзакций для точного анализа.'
    )
  }
}

/**
 * Быстрая проверка работоспособности статистики
 */
export async function quickStatsHealthCheck(): Promise<{
  healthy: boolean
  issues: string[]
  summary: string
}> {
  const issues: string[] = []

  try {
    // Проверяем доступность таблиц
    const { error: paymentsError } = await supabase
      .from('payments_v2')
      .select('id')
      .limit(1)

    if (paymentsError) {
      issues.push(`Таблица payments_v2 недоступна: ${paymentsError.message}`)
    }

    const { error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    if (usersError) {
      issues.push(`Таблица users недоступна: ${usersError.message}`)
    }

    // Проверяем SQL функции
    const { error: balanceError } = await supabase.rpc('get_user_balance', {
      user_telegram_id: '1',
    })

    if (balanceError && !balanceError.message.includes('not found')) {
      issues.push(
        `Функция get_user_balance недоступна: ${balanceError.message}`
      )
    }

    const { error: statsError } = await supabase.rpc('get_user_balance_stats', {
      user_telegram_id: '1',
    })

    if (statsError && !statsError.message.includes('not found')) {
      issues.push(
        `Функция get_user_balance_stats недоступна: ${statsError.message}`
      )
    }

    const healthy = issues.length === 0
    const summary = healthy
      ? '✅ Система статистики работает корректно'
      : `❌ Обнаружено ${issues.length} проблем в системе статистики`

    return { healthy, issues, summary }
  } catch (error) {
    issues.push(
      `Критическая ошибка проверки: ${error instanceof Error ? error.message : String(error)}`
    )
    return {
      healthy: false,
      issues,
      summary: '❌ Критическая ошибка системы статистики',
    }
  }
}

/**
 * Создает отчет о состоянии статистики для всех активных ботов
 */
export async function generateStatsReport(): Promise<{
  totalBots: number
  botsWithData: number
  botsWithoutData: number
  totalUsers: number
  totalPayments: number
  issues: string[]
}> {
  const report = {
    totalBots: 0,
    botsWithData: 0,
    botsWithoutData: 0,
    totalUsers: 0,
    totalPayments: 0,
    issues: [] as string[],
  }

  try {
    // Получаем все активные боты
    const { data: bots, error: botsError } = await supabase
      .from('bots')
      .select('bot_name')
      .eq('is_active', true)

    if (botsError) {
      report.issues.push(`Ошибка получения ботов: ${botsError.message}`)
      return report
    }

    report.totalBots = bots?.length || 0

    // Проверяем каждого бота
    for (const bot of bots || []) {
      const { data: payments } = await supabase
        .from('payments_v2')
        .select('id')
        .eq('bot_name', bot.bot_name)

      if (payments && payments.length > 0) {
        report.botsWithData++
      } else {
        report.botsWithoutData++
      }
    }

    // Общая статистика
    const { count: usersCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

    const { count: paymentsCount } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true })

    report.totalUsers = usersCount || 0
    report.totalPayments = paymentsCount || 0

    logger.info('📊 Stats report generated:', report)
    return report
  } catch (error) {
    report.issues.push(
      `Ошибка генерации отчета: ${error instanceof Error ? error.message : String(error)}`
    )
    return report
  }
}
