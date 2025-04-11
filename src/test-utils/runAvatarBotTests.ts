import { logger } from '@/utils/logger'
import { runTests } from './runTests'
import {
  testAvatarBotBasicInteraction,
  testAvatarBotImageSending,
} from './tests/bots/avatarBotTest'

/**
 * Запускает все тесты для аватар-ботов
 */
export async function runAvatarBotTests() {
  logger.info('🚀 Запуск тестов аватар-ботов', {
    description: 'Running avatar bot tests',
  })

  try {
    const results = await runTests([
      testAvatarBotBasicInteraction,
      testAvatarBotImageSending,
      // Здесь можно добавить дополнительные тесты для аватар-ботов
    ])

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты аватар-ботов пройдены успешно', {
        description: 'All avatar bot tests passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.warn('⚠️ Некоторые тесты аватар-ботов не пройдены', {
        description: 'Some avatar bot tests failed',
        passedTests,
        failedTests,
        totalTests,
      })
    }

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов аватар-ботов', {
      description: 'Error running avatar bot tests',
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

// Если файл запущен напрямую через Node.js
if (require.main === module) {
  ;(async () => {
    try {
      await runAvatarBotTests()
      process.exit(0)
    } catch (error) {
      console.error('Failed to run avatar bot tests:', error)
      process.exit(1)
    }
  })()
}
