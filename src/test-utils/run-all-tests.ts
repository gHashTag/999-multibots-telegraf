import { logger } from '@/utils/logger'
import { TestResult } from './types'
import { runAllPaymentTests } from './tests/payment.test'
import { runBalanceTests } from './tests/balance.test'
import { testChatWithAvatar } from './tests/chatWithAvatar.test'
import { testVoiceToText } from './tests/voiceToText.test'
import { InngestTestEngine } from './inngest-test-engine'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'
import { voiceToTextProcessor } from '@/inngest-functions/voiceToText.inngest'

// Создаем экземпляр тестового движка
const inngestTestEngine = new InngestTestEngine()

// Регистрируем обработчики событий
inngestTestEngine.register('payment/process', paymentProcessor)
inngestTestEngine.register('voice-to-text.requested', voiceToTextProcessor)

/**
 * Запускает все тесты
 */
export const runAllTests = async () => {
  logger.info('🚀 Запуск всех тестов', {
    description: 'Starting all tests',
  })

  const results: TestResult[] = []

  try {
    // Запускаем тесты платежной системы
    const paymentResults = await runAllPaymentTests()
    results.push(...paymentResults)

    // Запускаем тесты баланса
    const balanceResults = await runBalanceTests()
    results.push(...balanceResults)

    // Запускаем тест чата с аватаром
    const chatWithAvatarResult = await testChatWithAvatar()
    results.push(chatWithAvatarResult)

    // Запускаем тест распознавания голоса
    const voiceToTextResult = await testVoiceToText()
    results.push(voiceToTextResult)

    // Выводим общие результаты
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    logger.info('📊 Результаты тестирования:', {
      description: 'Test results summary',
      total_tests: results.length,
      successful_tests: successCount,
      failed_tests: failCount,
    })

    // Выводим детали неудачных тестов
    const failedTests = results.filter(r => !r.success)
    if (failedTests.length > 0) {
      logger.error('❌ Неудачные тесты:', {
        description: 'Failed tests details',
        tests: failedTests.map(t => ({
          name: t.name,
          message: t.message,
          error: t.error,
        })),
      })
      process.exit(1)
    }

    logger.info('✅ Все тесты успешно пройдены!', {
      description: 'All tests passed successfully',
    })
    process.exit(0)
  } catch (error) {
    logger.error('❌ Критическая ошибка при запуске тестов:', {
      description: 'Critical error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Запускаем все тесты
runAllTests()
