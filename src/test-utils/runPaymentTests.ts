import { logger } from '@/utils/logger'
import { TestResult } from './types'
import { runBalanceTests } from './tests/payment/balance.test'
import { runTransactionTests } from './tests/payment/transaction.test'
import { runPaymentFormTests } from './tests/payment/paymentForm.test'

async function runAllPaymentTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов платёжной системы')
  
  const results: TestResult[] = []
  
  try {
    // Запускаем тесты баланса
    const balanceResults = await runBalanceTests()
    results.push(...balanceResults)
    
    // Запускаем тесты транзакций
    const transactionResults = await runTransactionTests()
    results.push(...transactionResults)
    
    // Запускаем тесты платёжной формы
    const formResults = await runPaymentFormTests()
    results.push(...formResults)
    
    // Подсчитываем результаты
    const totalTests = results.length
    const passedTests = results.filter(r => r.success).length
    const failedTests = totalTests - passedTests
    
    logger.info(`
      ✨ Тестирование завершено:
      ✅ Успешно: ${passedTests}
      ❌ Неудачно: ${failedTests}
      📊 Всего тестов: ${totalTests}
    `)
    
    return results
    
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов', {
      error: error instanceof Error ? error.message : String(error)
    })
    return [{
      success: false,
      name: 'Payment System Tests',
      message: 'Failed to run payment tests'
    }]
  }
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  runAllPaymentTests()
}
