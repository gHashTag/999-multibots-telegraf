import { logger } from '@/utils/logger'
import { testZepMemory } from './tests/zepMemory.test'
import { testCache } from './tests/cache.test'
import { runAllPaymentTests } from './tests/payment.test'
import { runChatWithAvatarTests } from './tests/chatWithAvatar.test'
import { runVoiceToTextTests } from './tests/voiceToText.test'
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

    // Запускаем тесты памяти
    const memoryResults = await testZepMemory()
    if (!memoryResults.success) {
      logger.error('❌ Тесты памяти не пройдены:', {
        description: 'Memory tests failed',
        error: memoryResults.error
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
    const chatResults = await runChatWithAvatarTests()
    if (!chatResults.success) {
      logger.error('❌ Тесты чата с аватаром не пройдены:', {
        description: 'Chat tests failed',
        error: chatResults.error
      })
      process.exit(1)
    }

    // Запускаем тесты распознавания голоса
    const voiceResults = await runVoiceToTextTests()
    if (!voiceResults.success) {
      logger.error('❌ Тесты распознавания голоса не пройдены:', {
        description: 'Voice recognition tests failed',
        error: voiceResults.error
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
        memory: memoryResults,
        payment: paymentResults,
        chat: chatResults,
        voice: voiceResults,
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