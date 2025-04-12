#!/usr/bin/env node
/**
 * Скрипт для запуска API тестов
 *
 * Запускает тесты API для проверки доступности и функциональности API эндпоинтов.
 *
 * Использование:
 *  npm run test:api - запуск базовых тестов API
 *  npm run test:api:detailed - запуск детальных тестов API с отчетом
 *
 * Опции:
 *  --detailed - запустить детальное тестирование
 *  --report - сгенерировать отчет о тестировании
 *  --output=FILE - сохранить отчет в файл
 */

import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { logger } from '../../utils/logger'
import { runApiTests } from '../tests/api'

// Загружаем переменные окружения
config({ path: path.resolve(process.cwd(), '.env.test') })

// Парсим аргументы командной строки
const args = process.argv.slice(2)
const options = {
  detailed: args.includes('--detailed'),
  report: args.includes('--report'),
  output: args.find(arg => arg.startsWith('--output='))?.split('=')[1],
}

async function main() {
  logger.info({
    message: '🚀 Запуск тестов API',
    description: 'Starting API tests',
    options,
  })

  try {
    // Запускаем мониторинг API с генерацией отчета, если требуется
    const result = await runApiTests()

    // Если требуется сохранить отчет в файл
    if (options.output && result.details?.report) {
      const outputDir = path.dirname(options.output)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      fs.writeFileSync(options.output, result.details.report, 'utf8')
      logger.info({
        message: `📄 Отчет сохранен в файл: ${options.output}`,
        description: `Report saved to file: ${options.output}`,
      })
    }

    // Выводим итоговый результат
    if (result.success) {
      logger.info({
        message: '✅ Все тесты API успешно пройдены',
        description: 'All API tests passed successfully',
      })
      process.exit(0)
    } else {
      logger.error({
        message: '❌ Некоторые тесты API не пройдены',
        description: 'Some API tests failed',
        details: result.message,
      })
      process.exit(1)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Критическая ошибка при запуске тестов API: ${errorMessage}`,
      description: `Critical error running API tests: ${errorMessage}`,
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Запускаем основную функцию
main()
