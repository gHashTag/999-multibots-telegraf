import { logger } from '@/utils/logger'
import { testBroadcastMessage } from './tests/broadcast.test'
import { testClientsMigration } from './tests/clients-migration.test'
import { testImageToPrompt } from './tests/imageToPrompt.test'
import { testPaymentSystem } from './tests/payment.test'
import { testVoiceCost } from './tests/voice-cost-test'
import { TestResult } from './types'
import dotenv from 'dotenv'
import path from 'path'

// Устанавливаем NODE_ENV в test
process.env.NODE_ENV = 'test'

// Загружаем переменные окружения из .env.test
const envPath = path.resolve(process.cwd(), '.env.test')
dotenv.config({ path: envPath })

// Проверяем наличие необходимых переменных окружения
logger.info('🔍 Проверка переменных окружения в run-all-tests.ts:', {
  description: 'Checking environment variables',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY?.slice(0, 10) + '...',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10) + '...',
  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY?.slice(0, 10) + '...',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY?.slice(0, 10) + '...',
  NODE_ENV: process.env.NODE_ENV,
  env_path: envPath,
})

// Проверяем наличие критически важных переменных
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'INNGEST_EVENT_KEY',
  'ELEVENLABS_API_KEY',
]

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName])

if (missingEnvVars.length > 0) {
  logger.error('❌ Отсутствуют необходимые переменные окружения:', {
    description: 'Missing required environment variables',
    missing_vars: missingEnvVars,
  })
  process.exit(1)
}

/**
 * Запускает все тесты
 */
export async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    logger.info('🚀 Запуск всех тестов...', {
      description: 'Starting all tests',
    })

    // Тесты платежной системы
    logger.info('💰 Запуск тестов платежной системы...', {
      description: 'Starting payment system tests',
    })
    const paymentResults = await testPaymentSystem()
    results.push(
      ...(Array.isArray(paymentResults) ? paymentResults : [paymentResults])
    )

    // Тесты рассылки сообщений
    logger.info('📨 Запуск тестов рассылки...', {
      description: 'Starting broadcast tests',
    })
    const broadcastResults = await testBroadcastMessage()
    results.push(
      ...(Array.isArray(broadcastResults)
        ? broadcastResults
        : [broadcastResults])
    )

    // Тесты стоимости голосового режима
    logger.info('💰 Запуск тестов стоимости голосового режима...', {
      description: 'Starting voice cost tests',
    })
    const voiceCostResults = await testVoiceCost()
    results.push(voiceCostResults)

    // Тесты миграции клиентов
    logger.info('🔄 Запуск тестов миграции клиентов...', {
      description: 'Starting client migration tests',
    })
    const migrationResults = await testClientsMigration()
    results.push(
      ...(Array.isArray(migrationResults)
        ? migrationResults
        : [migrationResults])
    )

    // Тесты преобразования изображений в промпты
    logger.info('🖼️ Запуск тестов преобразования изображений...', {
      description: 'Starting image to prompt tests',
    })
    const imageResults = await testImageToPrompt()
    results.push(imageResults)

    // Подсчет статистики
    const totalTests = results.length
    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const successRate = (passedTests / totalTests) * 100

    logger.info('📊 Результаты тестирования:', {
      description: 'Test results summary',
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
      success_rate: `${successRate.toFixed(2)}%`,
    })

    // Логируем информацию о неудачных тестах
    const failedTestResults = results.filter(r => !r.success)
    if (failedTestResults.length > 0) {
      logger.warn('⚠️ Неудачные тесты:', {
        description: 'Failed tests details',
        failed_tests: failedTestResults.map(r => ({
          name: r.name,
          message: r.message,
          error: r.error instanceof Error ? r.error.message : String(r.error),
        })),
      })
    }

    return results
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    logger.error('❌ Критическая ошибка при выполнении тестов:', {
      description: 'Critical error in test execution',
      error: err.message,
      stack: err.stack,
    })

    results.push({
      name: 'Критическая ошибка',
      success: false,
      message: 'Ошибка при выполнении тестов',
      error: err,
    })

    return results
  }
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  ;(async () => {
    try {
      const results = await runAllTests()
      const failedTests = results.filter(r => !r.success)

      if (failedTests.length > 0) {
        console.error('❌ Некоторые тесты не прошли:', failedTests)
        process.exit(1)
      } else {
        console.log('✅ Все тесты успешно пройдены!')
        process.exit(0)
      }
    } catch (error) {
      console.error('❌ Ошибка при запуске тестов:', error)
      process.exit(1)
    }
  })()
}
