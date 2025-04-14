/**
 * Скрипт для запуска автономной системы агентов
 * Создает тестовую задачу и запускает обработку
 */

import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { execSync } from 'child_process'
import { TaskType, TaskStatus } from '@/core/mcp/agent/state'
import 'dotenv/config'

// ID пользователя для уведомлений
const TELEGRAM_ID = '144022504'
const BOT_NAME = 'neuro_blogger_bot'

/**
 * Отправляет уведомление в Telegram
 */
async function sendTelegramNotification(message: string) {
  try {
    const { bot, error } = getBotByName(BOT_NAME)

    if (error || !bot) {
      throw new Error(`Не удалось получить экземпляр бота: ${error}`)
    }

    await bot.telegram.sendMessage(TELEGRAM_ID, message, {
      parse_mode: 'HTML',
    })

    logger.info('✅ Уведомление отправлено в Telegram', {
      telegram_id: TELEGRAM_ID,
      bot_name: BOT_NAME,
    })

    return true
  } catch (error) {
    logger.error('❌ Ошибка при отправке уведомления в Telegram', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: TELEGRAM_ID,
      bot_name: BOT_NAME,
    })
    return false
  }
}

/**
 * Создает тестовую задачу для автономного агента
 */
async function createTestTask() {
  try {
    logger.info('🚀 Создание тестовой задачи для автономного агента')

    // Преобразуем telegram_id в число
    const tgId = parseInt(TELEGRAM_ID, 10)

    // Создаем задачу в базе данных
    const { data, error } = await supabase.rpc('create_agent_task', {
      p_telegram_id: tgId,
      p_bot_name: BOT_NAME,
      p_type: TaskType.CODE_GENERATION,
      p_description: 'Создать функцию приветствия на TypeScript',
      p_priority: 10,
      p_dependencies: [],
      p_metadata: {
        language: 'typescript',
        comments: true,
        test: true,
      },
    })

    if (error) {
      logger.error('❌ Ошибка при создании тестовой задачи', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      return null
    }

    if (!data || !data.id) {
      logger.error('❌ Не удалось создать тестовую задачу: нет данных')
      return null
    }

    logger.info('✅ Тестовая задача успешно создана', {
      task_id: data.id,
      type: TaskType.CODE_GENERATION,
      telegram_id: TELEGRAM_ID,
    })

    // Отправляем уведомление о создании задачи
    await sendTelegramNotification(
      `🚀 <b>Создана новая задача для автономного агента</b>\n\n` +
        `ID задачи: <code>${data.id}</code>\n` +
        `Тип: ${TaskType.CODE_GENERATION}\n` +
        `Описание: Создать функцию приветствия на TypeScript\n` +
        `Приоритет: 10\n\n` +
        `⏳ Ожидает обработки...`
    )

    return data.id
  } catch (error) {
    logger.error('❌ Необработанная ошибка при создании тестовой задачи', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return null
  }
}

/**
 * Запускает полный цикл работы автономных агентов
 */
async function runAgentSystem() {
  try {
    logger.info('🚀 Запуск автономной системы агентов')

    // Отправляем уведомление о запуске системы
    await sendTelegramNotification(
      '🚀 <b>Запуск автономной системы агентов</b>'
    )

    // Создаем тестовую задачу
    const taskId = await createTestTask()

    if (!taskId) {
      logger.error(
        '❌ Не удалось создать тестовую задачу, останавливаем работу'
      )
      await sendTelegramNotification(
        '❌ <b>Не удалось создать тестовую задачу</b>'
      )
      return
    }

    logger.info('✅ Тестовая задача создана успешно, запускаем обработку', {
      task_id: taskId,
    })

    // Выполняем обработку задач с помощью process-agent-tasks.ts
    try {
      logger.info('🚀 Запуск скрипта обработки задач автономными агентами')

      // Выполняем команду запуска скрипта обработки задач
      const result = execSync(
        'npx ts-node -r tsconfig-paths/register src/scripts/process-agent-tasks.ts',
        { stdio: 'inherit' }
      )

      logger.info('✅ Скрипт обработки задач успешно выполнен')
    } catch (error) {
      logger.error('❌ Ошибка при выполнении скрипта обработки задач', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      await sendTelegramNotification(
        `❌ <b>Ошибка при выполнении скрипта обработки задач</b>\n\n` +
          `Сообщение: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }

    logger.info('✅ Полный цикл автономных агентов успешно выполнен')
    await sendTelegramNotification(
      '✅ <b>Полный цикл автономных агентов успешно выполнен</b>'
    )
  } catch (error) {
    logger.error('❌ Ошибка при выполнении полного цикла автономных агентов', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    await sendTelegramNotification(
      `❌ <b>Ошибка при выполнении полного цикла автономных агентов</b>\n\n` +
        `Сообщение: ${error instanceof Error ? error.message : String(error)}`
    )

    process.exit(1)
  }
}

// Запускаем систему автономных агентов
runAgentSystem()
  .then(() => {
    logger.info('✅ Запуск автономной системы агентов завершен')
    process.exit(0)
  })
  .catch(error => {
    logger.error('❌ Запуск автономной системы агентов завершился с ошибкой', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
