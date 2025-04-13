/**
 * Скрипт для создания тестовой задачи для автономного агента
 * и настройки отправки уведомлений в Telegram
 */

import { createTask } from '@/core/supabase/task/createTask'
import { logger } from '@/utils/logger'
import { TaskType } from '@/core/mcp/agent/state'
import { getBotByName } from '@/core/bot'
import 'dotenv/config'

// ID пользователя, которому будут отправляться уведомления
// В данном случае используется ID из ссылки https://t.me/neuro_blogger_bot?start=144022504
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

    // Отправляем уведомление о начале создания задачи
    await sendTelegramNotification(
      '🔄 <b>Создание тестовой задачи начато</b>\n\nПожалуйста, подождите...'
    )

    // Создаем задачу в Supabase
    const taskId = await createTask({
      telegram_id: TELEGRAM_ID,
      bot_name: BOT_NAME,
      type: TaskType.CODE_GENERATION,
      description:
        'Написать функцию приветствия на TypeScript, которая принимает имя пользователя и возвращает приветственное сообщение',
      priority: 10, // Высокий приоритет
      metadata: {
        language: 'typescript',
        complexity: 'simple',
        test_task: true,
        created_by: 'system',
      },
    })

    if (!taskId) {
      throw new Error('Не удалось создать задачу')
    }

    logger.info('✅ Тестовая задача успешно создана', {
      task_id: taskId,
      telegram_id: TELEGRAM_ID,
      bot_name: BOT_NAME,
    })

    // Отправляем уведомление об успешном создании задачи
    await sendTelegramNotification(
      `✅ <b>Тестовая задача успешно создана!</b>\n\n` +
        `ID задачи: <code>${taskId}</code>\n` +
        `Тип: Генерация кода\n` +
        `Описание: Написать функцию приветствия на TypeScript\n` +
        `Приоритет: 10 (Высокий)\n\n` +
        `🤖 Автономный агент приступит к выполнению задачи в ближайшее время. ` +
        `Вы получите уведомление, когда задача будет выполнена.`
    )

    return taskId
  } catch (error) {
    logger.error('❌ Ошибка при создании тестовой задачи', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: TELEGRAM_ID,
      bot_name: BOT_NAME,
    })

    // Отправляем уведомление об ошибке
    await sendTelegramNotification(
      `❌ <b>Ошибка при создании тестовой задачи</b>\n\n` +
        `Сообщение: ${error instanceof Error ? error.message : String(error)}`
    )

    return null
  }
}

// Запускаем создание тестовой задачи
createTestTask()
  .then(() => {
    logger.info('✅ Скрипт создания тестовой задачи завершен')
    process.exit(0)
  })
  .catch(error => {
    logger.error('❌ Скрипт создания тестовой задачи завершился с ошибкой', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
