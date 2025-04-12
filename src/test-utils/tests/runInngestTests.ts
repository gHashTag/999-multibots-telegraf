#!/usr/bin/env node
/**
 * Запуск тестов Inngest
 *
 * Этот файл предоставляет простой интерфейс для запуска тестов Inngest
 *
 * Использование:
 *   npm run test:inngest - запуск всех тестов Inngest
 *   npm run test:inngest:direct - запуск только HTTP тестов
 *   npm run test:inngest:sdk - запуск только SDK тестов
 */

import { logger } from '@/utils/logger'
import { TestRunner } from '../core/TestRunner'
import { TestCategory } from '../core/categories'
import {
  runInngestDirectTest,
  runInngestSDKTest,
  runInngestFunctionRegistrationTest,
  runInngestFullTest,
} from './inngestTest'
import { configureTestLogging } from '../test-config'

/**
 * Запуск всех тестов Inngest
 */
async function startInngestTests() {
  logger.info('🚀 Запуск тестов Inngest')

  try {
    // Настраиваем логирование для тестов
    configureTestLogging()

    // Получаем аргумент командной строки
    const testType = process.argv[2] || 'full'

    // Выбираем тесты для запуска
    let testsToRun: Array<() => Promise<any>> = []

    switch (testType) {
      case 'direct':
        testsToRun = [runInngestDirectTest]
        logger.info('📋 Запуск только HTTP API тестов')
        break
      case 'sdk':
        testsToRun = [runInngestSDKTest]
        logger.info('📋 Запуск только SDK тестов')
        break
      case 'registration':
        testsToRun = [runInngestFunctionRegistrationTest]
        logger.info('📋 Запуск только тестов регистрации функций')
        break
      case 'full':
        testsToRun = [runInngestFullTest]
        logger.info('📋 Запуск комбинированного теста')
        break
      default:
        testsToRun = [
          runInngestDirectTest,
          runInngestSDKTest,
          runInngestFunctionRegistrationTest,
        ]
        logger.info('📋 Запуск всех тестов Inngest')
    }

    logger.info(`📋 Будет запущено ${testsToRun.length} тестов`)

    // Создаем экземпляр TestRunner
    const runner = new TestRunner({ verbose: true })

    // Добавляем тесты в TestRunner
    testsToRun.forEach((testFn, index) => {
      runner.addTests([
        {
          name: `Inngest Test ${index + 1}`,
          category: TestCategory.Inngest,
          description: 'Тест функциональности Inngest',
          run: testFn,
        },
      ])
    })

    // Запускаем тесты
    const results = await runner.runTests()

    // Анализируем результаты
    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount

    logger.info(`📊 Пройдено ${successCount} из ${results.length} тестов`)

    // Возвращаем код выхода: 0 если все тесты прошли, 1 если есть ошибки
    return failCount === 0 ? 0 : 1
  } catch (error: any) {
    logger.error(
      '🔥 Критическая ошибка при запуске тестов Inngest:',
      error.message
    )
    return 1
  }
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  startInngestTests()
    .then(exitCode => {
      process.exit(exitCode)
    })
    .catch(error => {
      logger.error('🔥 Непредвиденная ошибка при запуске тестов:', error)
      process.exit(1)
    })
}

// Экспортируем функцию для запуска из других файлов
export { startInngestTests }
