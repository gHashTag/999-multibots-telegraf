/**
 * Запуск теста платежного процессора
 */
import { Logger as logger } from '@/utils/logger'
import { testPaymentProcessor } from './tests/paymentProcessor.test'

async function runTest() {
  logger.info('🚀 Запуск теста платежного процессора', {
    description: 'Starting payment processor test',
  })

  try {
    const result = await testPaymentProcessor()

    if (result.success) {
      logger.info('✅ Тест успешно завершен', {
        description: 'Test completed successfully',
        name: result.name,
      })
      process.exit(0)
    } else {
      logger.error('❌ Тест завершился с ошибкой', {
        description: 'Test failed',
        name: result.name,
        message: result.message,
      })
      process.exit(1)
    }
  } catch (error) {
    logger.error('❌ Ошибка при выполнении теста', {
      description: 'Error running test',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

runTest()
