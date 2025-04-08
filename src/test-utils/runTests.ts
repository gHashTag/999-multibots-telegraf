import { logger } from '@/utils/logger'
import { testCache } from './tests/cache.test'
import { runAllPaymentTests } from './tests/payment.test'
import { testChatWithAvatar } from './tests/chatWithAvatar.test'
import { runClientsMigrationTests } from './tests/clients-migration.test'

async function runTests() {
  logger.info('🚀 Запуск всех тестов:', {
    description: 'Starting all tests'
  })

  try {
    // Запускаем тесты кэширования
    const cacheResults = await testCache()
    if (!cacheResults.success) {
      logger.error('❌ Тесты кэширования не пройдены:', {
        description: 'Cache tests failed',
        error: cacheResults.error
      })
      process.exit(1)
    }

    // Запускаем тесты платежей
    const paymentResults = await runAllPaymentTests()
    if (paymentResults.some(result => !result.success)) {
      logger.error('❌ Тесты платежей не пройдены:', {
        description: 'Payment tests failed',
        results: paymentResults
      })
      process.exit(1)
    }

    // Запускаем тесты чата с аватаром
    const chatResults = await testChatWithAvatar()
    if (!chatResults.success) {
      logger.error('❌ Тесты чата с аватаром не пройдены:', {
        description: 'Chat tests failed',
        error: chatResults.error
      })
      process.exit(1)
    }

    // Запускаем тесты миграции клиентов
    const migrationResults = await runClientsMigrationTests()
    if (migrationResults.some(result => !result.success)) {
      logger.error('❌ Тесты миграции клиентов не пройдены:', {
        description: 'Client migration tests failed',
        results: migrationResults
      })
      process.exit(1)
    }

    logger.info('✅ Все тесты успешно пройдены:', {
      description: 'All tests passed successfully',
      results: {
        cache: cacheResults,
        payment: paymentResults,
        chat: chatResults,
        migration: migrationResults
      }
    })

  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов:', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error)
    })
    process.exit(1)
  }
}

runTests() 