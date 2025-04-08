// Устанавливаем NODE_ENV в test и загружаем переменные окружения
process.env.NODE_ENV = 'test'

import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Загружаем переменные окружения из .env.test
const envPath = path.resolve(process.cwd(), '.env.test')

console.log('🔍 Путь к файлу .env.test:', envPath)
console.log('📂 Текущая директория:', process.cwd())

// Проверяем существование файла
if (!fs.existsSync(envPath)) {
  console.error('❌ Файл .env.test не найден:', envPath)
  process.exit(1)
}

console.log('✅ Файл .env.test найден')

// Загружаем переменные окружения
const result = dotenv.config({ path: envPath })

if (result.error) {
  console.error('❌ Ошибка при загрузке .env.test:', result.error)
  process.exit(1)
}

console.log('✅ Переменные окружения загружены')
console.log('🔑 INNGEST_EVENT_KEY:', process.env.INNGEST_EVENT_KEY)

import { logger } from '../utils/logger'
import { TestResult } from './types'
import { runPaymentTests } from './run-payment-test'
import { runBalanceTests } from './tests/balance.test'

async function runAllTests(): Promise<void> {
  try {
    logger.info('🚀 Запуск всех тестов', {
      description: 'Starting all tests',
    })

    const results: TestResult[] = []

    // Запускаем тесты платежей
    const paymentResults = await runPaymentTests('payment-tests')
    results.push(...paymentResults)

    // Запускаем тесты баланса
    const balanceResults = await runBalanceTests()
    results.push(...balanceResults)

    // Выводим общие результаты
    const totalTests = results.length
    const passedTests = results.filter(r => r.success).length
    const failedTests = totalTests - passedTests

    logger.info('📊 Результаты тестов:', {
      description: 'Test results summary',
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      success_rate: `${((passedTests / totalTests) * 100).toFixed(2)}%`,
    })

    // Выводим детали проваленных тестов
    const failedTestDetails = results
      .filter(r => !r.success)
      .map(r => ({
        name: r.name,
        message: r.message,
        error: r.error instanceof Error ? r.error.message : String(r.error),
      }))

    if (failedTestDetails.length > 0) {
      logger.error('❌ Проваленные тесты:', {
        description: 'Failed tests details',
        failed_tests: failedTestDetails,
      })
      process.exit(1)
    }

    logger.info('✅ Все тесты пройдены успешно')
    process.exit(0)
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов:', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

runAllTests()
