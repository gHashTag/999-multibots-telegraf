/**
 * Скрипт для обработки задач автономными агентами
 * Запускает процесс обработки задач из базы данных
 */

import { createAgentRouter } from '@/core/mcp/agent/router'
import { TaskType, TaskStatus, AgentState, Task } from '@/core/mcp/agent/state'
import { NetworkAgent } from '@/core/mcp/agent/router'
import { getNextTask } from '@/core/supabase/task/getNextTask'
import { updateTaskStatus } from '@/core/supabase/task/updateTaskStatus'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import 'dotenv/config'

// ID пользователя, которому будут отправляться уведомления
const TELEGRAM_ID = '144022504'
const BOT_NAME = 'neuro_blogger_bot'

// Создание состояния агента
const agentState: AgentState = {
  tasks: new Map<string, Task>(),
  currentTask: null,
  taskHistory: [],
  agentId: 'test-agent',
  agentName: 'Test Agent',
}

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
 * Создаем МСР клиент для общения с LLM
 */
const mcpClient = new Client({
  apiKey: process.env.MCP_API_KEY || '',
})

// Создание тестовых агентов
const codeGenerationAgent: NetworkAgent = {
  id: 'code-generation-agent',
  name: 'Агент генерации кода',
  description: 'Агент для генерации кода на различных языках программирования',
  capabilities: ['code-generation', 'typescript', 'javascript', 'python'],

  async canHandle(task: Task): Promise<boolean> {
    return task.type === TaskType.CODE_GENERATION
  },

  async handle(task: Task, _state: AgentState): Promise<any> {
    logger.info(`🚀 Агент '${this.name}' начинает обработку задачи: ${task.id}`)

    // Отправляем уведомление о начале обработки задачи
    await sendTelegramNotification(
      `🚀 <b>Агент "${this.name}" начал обработку задачи</b>\n\n` +
        `ID задачи: <code>${task.id}</code>\n` +
        `Тип: ${task.type}\n` +
        `Описание: ${task.description}`
    )

    try {
      // Обновляем статус задачи на IN_PROGRESS
      const taskId = (task.metadata?._originalId as string) || task.id
      await updateTaskStatus({
        task_id: taskId,
        status: TaskStatus.IN_PROGRESS,
      })

      logger.info(`⏳ Обработка задачи ${task.id}...`)

      // Получаем метаданные задачи
      const { language = 'typescript' } = task.metadata || {}

      // Формируем промпт для LLM
      const prompt = `
      Ты опытный программист. Напиши функцию на ${language} согласно описанию:
      
      ${task.description}
      
      Пожалуйста, напиши только код без объяснений.
      `

      // Простая имитация работы LLM (в реальной системе здесь был бы запрос к API)
      const code = `
function greet(name: string): string {
  return \`Привет, \${name}! Добро пожаловать в наше приложение.\`;
}
      `.trim()

      // Имитируем задержку обработки
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Формируем результат
      const result = {
        code,
        language,
        executionTime: new Date().toISOString(),
      }

      // Обновляем статус задачи на COMPLETED
      await updateTaskStatus({
        task_id: taskId,
        status: TaskStatus.COMPLETED,
        result,
      })

      logger.info(`✅ Задача ${task.id} успешно выполнена`, {
        result,
      })

      // Отправляем уведомление об успешном выполнении задачи
      await sendTelegramNotification(
        `✅ <b>Задача успешно выполнена!</b>\n\n` +
          `ID задачи: <code>${task.id}</code>\n` +
          `Тип: ${task.type}\n\n` +
          `<b>Результат:</b>\n` +
          `<pre><code>${language}\n${code}\n</code></pre>\n\n` +
          `Задача выполнена агентом "${this.name}".`
      )

      return result
    } catch (error) {
      logger.error(`❌ Ошибка при обработке задачи ${task.id}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        task_id: task.id,
      })

      // Обновляем статус задачи на FAILED
      const taskId = (task.metadata?._originalId as string) || task.id
      await updateTaskStatus({
        task_id: taskId,
        status: TaskStatus.FAILED,
        result: {
          error: error instanceof Error ? error.message : String(error),
        },
      })

      // Отправляем уведомление об ошибке
      await sendTelegramNotification(
        `❌ <b>Ошибка при выполнении задачи</b>\n\n` +
          `ID задачи: <code>${task.id}</code>\n` +
          `Тип: ${task.type}\n` +
          `Сообщение об ошибке: ${error instanceof Error ? error.message : String(error)}`
      )

      throw error
    }
  },
}

/**
 * Основная функция для обработки задач
 */
async function processAgentTasks() {
  try {
    logger.info('🚀 Запуск обработки задач автономными агентами')

    // Отправляем уведомление о запуске обработки
    await sendTelegramNotification(
      '🚀 <b>Система обработки задач автономными агентами запущена</b>'
    )

    // Создаем маршрутизатор агентов
    const router = createAgentRouter({
      mcpService: {
        // Пустая реализация для тестирования
      },
    })

    // Регистрируем агентов
    router.registerAgent(codeGenerationAgent)

    logger.info('✅ Агенты успешно зарегистрированы', {
      agents: router.getAgents().map(a => a.name),
    })

    // Отправляем уведомление о регистрации агентов
    await sendTelegramNotification(
      `✅ <b>Агенты успешно зарегистрированы:</b>\n\n` +
        router
          .getAgents()
          .map(a => `🤖 ${a.name}`)
          .join('\n')
    )

    // Получаем задачу из Supabase
    const nextTask = await getNextTask({
      telegram_id: TELEGRAM_ID,
      bot_name: BOT_NAME,
    })

    if (!nextTask) {
      logger.warn('⚠️ Нет доступных задач для обработки')
      await sendTelegramNotification(
        '⚠️ <b>Нет доступных задач для обработки</b>'
      )
      return
    }

    logger.info('✅ Получена задача для обработки', {
      task_id: nextTask.id,
      type: nextTask.type,
      priority: nextTask.priority,
    })

    // Сохраняем оригинальный ID задачи в метаданных для последующего обновления
    if (nextTask.metadata && nextTask._originalId) {
      nextTask.metadata._originalId = nextTask._originalId
    }

    // Добавляем задачу в состояние агента
    agentState.tasks.set(nextTask.id, nextTask)

    // Получаем следующую задачу для обработки
    const taskToProcess = await router.getNextTaskToProcess(agentState)

    if (!taskToProcess) {
      logger.warn('⚠️ Не удалось получить задачу для обработки')
      await sendTelegramNotification(
        '⚠️ <b>Не удалось получить задачу для обработки</b>'
      )
      return
    }

    // Находим подходящего агента
    const agent = await router.routeTask(taskToProcess, agentState)

    if (!agent) {
      logger.warn('⚠️ Не найден подходящий агент для задачи', {
        task_id: taskToProcess.id,
        type: taskToProcess.type,
      })

      await sendTelegramNotification(
        `⚠️ <b>Не найден подходящий агент для задачи</b>\n\n` +
          `ID задачи: <code>${taskToProcess.id}</code>\n` +
          `Тип: ${taskToProcess.type}\n` +
          `Описание: ${taskToProcess.description}`
      )
      return
    }

    logger.info('✅ Найден подходящий агент для задачи', {
      agent: agent.name,
      task_id: taskToProcess.id,
    })

    // Обрабатываем задачу
    await agent.handle(taskToProcess, agentState)

    logger.info('✅ Обработка задач успешно завершена')
    await sendTelegramNotification(
      '✅ <b>Обработка задач успешно завершена</b>'
    )
  } catch (error) {
    logger.error('❌ Ошибка при обработке задач', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    await sendTelegramNotification(
      `❌ <b>Ошибка при обработке задач</b>\n\n` +
        `Сообщение: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Запускаем обработку задач
processAgentTasks()
  .then(() => {
    logger.info('✅ Скрипт обработки задач завершен')
    process.exit(0)
  })
  .catch(error => {
    logger.error('❌ Скрипт обработки задач завершился с ошибкой', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
