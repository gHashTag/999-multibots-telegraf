import { testPaymentSystem } from './tests/payment.test'
import { logger } from '@/utils/logger'

const runTest = async () => {
  try {
    logger.info('🚀 Запуск тестирования платежной системы', {
      description: 'Starting payment system testing',
    })

    const result = await testPaymentSystem()

    if (result.success) {
      logger.info('✅ Тестирование успешно завершено', {
        description: 'Testing completed successfully',
        result,
      })
      process.exit(0)
    } else {
      logger.error('❌ Тестирование завершилось с ошибками', {
        description: 'Testing completed with errors',
        result,
      })
      process.exit(1)
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка при тестировании', {
      description: 'Critical error during testing',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

runTest()
