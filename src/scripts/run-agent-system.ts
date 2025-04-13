/**
 * Скрипт для запуска полного цикла работы системы автономных агентов:
 * 1. Создание задачи
 * 2. Обработка задачи агентом
 */

import { execSync } from 'child_process'
import { logger } from '@/utils/logger'
import 'dotenv/config'

/**
 * Запускает полный цикл работы автономных агентов
 */
async function runAgentSystem() {
  try {
    logger.info('🚀 Запуск полного цикла работы автономных агентов')

    // Шаг 1: Создание задачи
    logger.info('1️⃣ Запуск скрипта создания задачи')
    execSync(
      'npx ts-node -r tsconfig-paths/register src/scripts/create-test-task.ts',
      {
        stdio: 'inherit',
      }
    )

    // Небольшая пауза между шагами
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Шаг 2: Запуск обработки задачи
    logger.info('2️⃣ Запуск скрипта обработки задачи')
    execSync(
      'npx ts-node -r tsconfig-paths/register src/scripts/process-agent-tasks.ts',
      {
        stdio: 'inherit',
      }
    )

    logger.info('✅ Полный цикл работы автономных агентов успешно завершен')
    return true
  } catch (error) {
    logger.error(
      '❌ Ошибка при запуске полного цикла работы автономных агентов',
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    )
    return false
  }
}

// Запускаем полный цикл
runAgentSystem()
  .then(success => {
    if (success) {
      logger.info('🎉 Система автономных агентов успешно запущена')
    } else {
      logger.error('💔 Ошибка при запуске системы автономных агентов')
    }
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    logger.error('💥 Критическая ошибка при запуске системы', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
