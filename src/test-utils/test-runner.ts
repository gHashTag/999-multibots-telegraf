#!/usr/bin/env node
/**
 * Основной файл для запуска тестов
 * Использование:
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип теста]
 *
 * Примеры:
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts webhook
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts database
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts all
 */

import { logger } from '@/utils/logger'
import { TEST_CONFIG } from './test-config'
import { DatabaseTester } from './database-tests'
import { BFLWebhookTester, NeuroPhotoWebhookTester } from './webhook-tests'
import { InngestTester } from './inngest-tests'
import { VoiceTester } from './test-voices'
import { TestResult, LogData } from './interfaces'

/**
 * Форматирует результаты тестов для вывода
 */
function formatResults(results: TestResult[], suiteName: string): void {
  const totalTests = results.length
  const passedTests = results.filter(r => r.success).length
  const failedTests = totalTests - passedTests

  logger.info(`\n🧪 Результаты тестов ${suiteName}:`)
  logger.info(`✅ Успешно: ${passedTests}`)
  logger.info(`❌ Неудачно: ${failedTests}`)
  logger.info(`📊 Всего тестов: ${totalTests}\n`)

  results.forEach(result => {
    const duration = result.duration ? `(${result.duration}мс)` : ''
    const status = result.success ? '✅' : '❌'
    logger.info(`${status} ${result.name} ${duration}`)

    if (!result.success && result.error) {
      logger.error(`   Ошибка: ${result.error}`)
    }

    if (result.details) {
      logger.info(`   Детали: ${JSON.stringify(result.details, null, 2)}`)
    }
  })
}

/**
 * Запускает все тесты
 */
export async function runAllTests(): Promise<void> {
  try {
    logger.info('🚀 Запуск всех тестов...\n')

    // Тесты базы данных
    const dbTester = new DatabaseTester()
    const dbResults = await dbTester.runAllTests()
    formatResults(dbResults, 'базы данных')

    // Тесты вебхуков
    const webhookTester = new BFLWebhookTester()
    const webhookResults = await webhookTester.runAllTests()
    formatResults(webhookResults, 'вебхуков')

    // Тесты Inngest функций
    const inngestTester = new InngestTester()
    const inngestResults = await inngestTester.runAllTests()
    formatResults(inngestResults, 'Inngest функций')

    // Тесты нейрофото
    const neuroPhotoTester = new NeuroPhotoWebhookTester()
    const allNeuroResults = await neuroPhotoTester.runAllTests()
    formatResults(allNeuroResults, 'генерации изображений')

    // Тесты нейрофото V2
    const neuroPhotoV2Results = await neuroPhotoTester.runAllTests()
    formatResults(neuroPhotoV2Results, 'генерации нейрофото V2')

    // Тесты голосовых функций
    const voiceTester = new VoiceTester()
    const voiceResults = await voiceTester.runAllTests()
    formatResults(voiceResults, 'голосовых функций')

    logger.info('\n✅ Все тесты завершены!')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const logData: LogData = {
      message: '❌ Ошибка при выполнении теста',
      description: 'Error running test',
      error: errorMessage,
      context: {
        test: 'TestRunner',
        tester: 'TestRunner',
      },
    }
    logger.error(logData)
    logger.error('❌ Ошибка при запуске тестов:', { error: errorMessage })
  }
}

/**
 * Базовый класс для запуска тестов
 */
export class TestRunner {
  protected testResults: TestResult[] = []

  /**
   * Запускает тест и добавляет результат в массив
   */
  protected async runTest(
    name: string,
    testFn: () => Promise<void>
  ): Promise<void> {
    try {
      logger.info({
        message: `🚀 Запуск теста: ${name}`,
        description: `Starting test: ${name}`,
      })

      await testFn()

      this.testResults.push({
        name,
        success: true,
        message: 'Тест успешно пройден',
      })

      logger.info({
        message: `✅ Тест успешно завершен: ${name}`,
        description: `Test completed successfully: ${name}`,
      })
    } catch (error) {
      this.testResults.push({
        name,
        success: false,
        message: `Тест провален: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error: error instanceof Error ? error.message : String(error),
      })

      logger.error({
        message: `❌ Тест провален: ${name}`,
        description: `Test failed: ${name}`,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Возвращает результаты всех тестов
   */
  getResults(): TestResult[] {
    return this.testResults
  }

  /**
   * Очищает результаты тестов
   */
  clearResults(): void {
    this.testResults = []
  }

  /**
   * Выводит сводку по результатам тестов
   */
  printSummary(): void {
    const totalTests = this.testResults.length
    const passedTests = this.testResults.filter(r => r.success).length
    const failedTests = totalTests - passedTests

    logger.info({
      message: '📊 Сводка по тестам',
      description: 'Test summary',
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
    })

    if (failedTests > 0) {
      const failedResults = this.testResults.filter(r => !r.success)
      logger.error({
        message: '❌ Провалившиеся тесты',
        description: 'Failed tests',
        tests: failedResults.map(r => ({
          name: r.name,
          message: r.message,
          error: r.error,
        })),
      })
    }
  }
}
