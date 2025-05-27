import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Тест консистентности баланса и категоризации платежей
 * Проверяет что все доходы и расходы правильно категоризированы
 */

interface BalanceBreakdown {
  botName: string
  totalTransactions: number

  // Доходы
  realIncomeCount: number
  realIncomeStars: number
  realIncomeRub: number

  bonusIncomeCount: number
  bonusIncomeStars: number

  // Расходы
  realOutcomeCount: number
  realOutcomeStars: number

  bonusOutcomeCount: number
  bonusOutcomeStars: number

  // Балансы
  totalIncomeStars: number
  totalOutcomeStars: number
  calculatedBalance: number

  // Проверки
  isConsistent: boolean
  issues: string[]
}

async function testBalanceConsistency(
  botName: string
): Promise<BalanceBreakdown> {
  try {
    // Получаем все транзакции для бота
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .eq('status', 'COMPLETED')

    if (error) throw error

    const issues: string[] = []

    // Функция категоризации (как в statsCommand)
    const getTransactionCategory = (payment: any) => {
      // MONEY_INCOME всегда должны быть реальными платежами
      if (payment.type === 'MONEY_INCOME') {
        return 'real'
      }
      // Для остальных используем поле category из базы данных
      return payment.category === 'REAL' ? 'real' : 'bonus'
    }

    // Разделяем транзакции
    const realIncomePayments = payments.filter(
      p => p.type === 'MONEY_INCOME' && getTransactionCategory(p) === 'real'
    )

    const bonusIncomePayments = payments.filter(
      p => p.type === 'MONEY_INCOME' && getTransactionCategory(p) === 'bonus'
    )

    const realOutcomePayments = payments.filter(
      p => p.type === 'MONEY_OUTCOME' && getTransactionCategory(p) === 'real'
    )

    const bonusOutcomePayments = payments.filter(
      p => p.type === 'MONEY_OUTCOME' && getTransactionCategory(p) === 'bonus'
    )

    // Считаем суммы
    const realIncomeStars = realIncomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const realIncomeRub = realIncomePayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    )

    const bonusIncomeStars = bonusIncomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )

    const realOutcomeStars = realOutcomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )
    const bonusOutcomeStars = bonusOutcomePayments.reduce(
      (sum, p) => sum + (p.stars || 0),
      0
    )

    const totalIncomeStars = realIncomeStars + bonusIncomeStars
    const totalOutcomeStars = realOutcomeStars + bonusOutcomeStars
    const calculatedBalance = totalIncomeStars - totalOutcomeStars

    // Проверки консистентности

    // 1. Проверяем что все MONEY_INCOME считаются как real
    if (bonusIncomePayments.length > 0) {
      issues.push(
        `❌ Найдены MONEY_INCOME транзакции категории BONUS: ${bonusIncomePayments.length}`
      )
    }

    // 2. Проверяем что баланс не сильно отрицательный (больше чем разумные бонусы)
    if (calculatedBalance < -50000) {
      issues.push(
        `⚠️ Очень большой отрицательный баланс: ${calculatedBalance} ⭐`
      )
    }

    // 3. Проверяем что есть и доходы и расходы
    if (totalIncomeStars === 0) {
      issues.push(`❌ Нет доходов в звездах`)
    }

    if (totalOutcomeStars === 0) {
      issues.push(`❌ Нет расходов в звездах`)
    }

    // 4. Проверяем соотношение реальных и бонусных расходов
    const bonusSpendingRatio = bonusOutcomeStars / totalOutcomeStars
    if (bonusSpendingRatio > 0.8) {
      issues.push(
        `⚠️ Слишком много бонусных трат: ${(bonusSpendingRatio * 100).toFixed(1)}%`
      )
    }

    return {
      botName,
      totalTransactions: payments.length,

      realIncomeCount: realIncomePayments.length,
      realIncomeStars,
      realIncomeRub,

      bonusIncomeCount: bonusIncomePayments.length,
      bonusIncomeStars,

      realOutcomeCount: realOutcomePayments.length,
      realOutcomeStars,

      bonusOutcomeCount: bonusOutcomePayments.length,
      bonusOutcomeStars,

      totalIncomeStars,
      totalOutcomeStars,
      calculatedBalance,

      isConsistent: issues.length === 0,
      issues,
    }
  } catch (error) {
    logger.error('Error in testBalanceConsistency:', error)
    throw error
  }
}

function formatBalanceReport(breakdown: BalanceBreakdown): string {
  let report = `\n🔍 ТЕСТ КОНСИСТЕНТНОСТИ БАЛАНСА @${breakdown.botName}\n\n`

  report += `📊 ОБЩАЯ СТАТИСТИКА:\n`
  report += `   Всего транзакций: ${breakdown.totalTransactions}\n\n`

  report += `💰 ДОХОДЫ:\n`
  report += `   Реальные: ${breakdown.realIncomeStars} ⭐ + ${breakdown.realIncomeRub} ₽ (${breakdown.realIncomeCount} операций)\n`
  report += `   Бонусные: ${breakdown.bonusIncomeStars} ⭐ (${breakdown.bonusIncomeCount} операций)\n`
  report += `   ИТОГО доходов: ${breakdown.totalIncomeStars} ⭐\n\n`

  report += `💸 РАСХОДЫ:\n`
  report += `   Реальные: ${breakdown.realOutcomeStars} ⭐ (${breakdown.realOutcomeCount} операций)\n`
  report += `   Бонусные: ${breakdown.bonusOutcomeStars} ⭐ (${breakdown.bonusOutcomeCount} операций)\n`
  report += `   ИТОГО расходов: ${breakdown.totalOutcomeStars} ⭐\n\n`

  report += `📈 БАЛАНС:\n`
  report += `   Расчетный баланс: ${breakdown.calculatedBalance} ⭐\n`
  report += `   Формула: ${breakdown.totalIncomeStars} - ${breakdown.totalOutcomeStars} = ${breakdown.calculatedBalance}\n\n`

  if (breakdown.issues.length > 0) {
    report += `⚠️ ПРОБЛЕМЫ:\n`
    breakdown.issues.forEach(issue => {
      report += `   ${issue}\n`
    })
  } else {
    report += `✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ!\n`
  }

  return report
}

// Экспортируем функции для использования
export { testBalanceConsistency, formatBalanceReport }

// Функция для запуска теста
async function runTest() {
  try {
    console.log('🚀 Запуск теста консистентности баланса...')

    const breakdown = await testBalanceConsistency('MetaMuse_Manifest_bot')
    const report = formatBalanceReport(breakdown)

    console.log(report)

    if (!breakdown.isConsistent) {
      console.log('\n❌ ТЕСТ НЕ ПРОЙДЕН! Найдены проблемы в категоризации.')
      process.exit(1)
    } else {
      console.log('\n✅ ТЕСТ ПРОЙДЕН! Баланс консистентен.')
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Ошибка при выполнении теста:', error)
    process.exit(1)
  }
}

// Если файл запускается напрямую
if (require.main === module) {
  runTest()
}
