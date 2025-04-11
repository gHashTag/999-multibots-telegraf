import { logger } from '@/utils/logger'
import { runTests } from '../runTests'
import { testSimpleReceiptGeneration } from '../tests/payment/simpleReceiptTest'

/**
 * Запускает только тест простой генерации платежного чека
 */
export async function runSimpleReceiptTest() {
  logger.info('🚀 Запуск теста простой генерации платежного чека', {
    description: 'Running simple payment receipt test',
  })

  try {
    const results = await runTests([testSimpleReceiptGeneration])

    if (results[0].success) {
      logger.info('✅ Тест простой генерации платежного чека пройден успешно', {
        description: 'Simple payment receipt test passed successfully',
      })
    } else {
      logger.error('❌ Тест простой генерации платежного чека не пройден', {
        description: 'Simple payment receipt test failed',
        error: results[0].message,
      })
      process.exit(1)
    }

    return results
  } catch (error: any) {
    logger.error(
      '❌ Ошибка при запуске теста простой генерации платежного чека',
      {
        description: 'Error running simple payment receipt test',
        error: error.message,
        stack: error.stack,
      }
    )
    throw error
  }
}

// Если файл запускается напрямую, выполняем тест
if (require.main === module) {
  runSimpleReceiptTest()
    .then(() => {
      logger.info(
        '🏁 Выполнение теста простой генерации платежного чека завершено',
        {
          description: 'Simple payment receipt test execution completed',
        }
      )
      process.exit(0)
    })
    .catch(error => {
      logger.error(
        '❌ Критическая ошибка при выполнении теста простой генерации платежного чека',
        {
          description:
            'Critical error during simple payment receipt test execution',
          error: error.message,
          stack: error.stack,
        }
      )
      process.exit(1)
    })
}
