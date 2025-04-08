import { testInngestPayment } from './inngest-payment-test'
import { Logger as logger } from '@/utils/logger'

const runTest = async () => {
  try {
    logger.info('🚀 Запуск тестирования платежной системы через Inngest', {
      description: 'Starting payment system testing via Inngest',
    })

    const result = await testInngestPayment()

    if (result) {
      logger.info('✅ Тестирование успешно завершено', {
        description: 'Testing completed successfully',
      })
      process.exit(0)
    } else {
      logger.error('❌ Тестирование завершилось с ошибками', {
        description: 'Testing completed with errors',
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
