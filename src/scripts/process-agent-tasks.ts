/**
 * Скрипт для обработки задач автономными агентами
 * Запускает процесс обработки задач из базы данных
 */

import { createAgentRouter } from '@/core/mcp/agent/router'
import { TaskType, TaskStatus, Task } from '@/core/mcp/agent/state'
import { NetworkAgent } from '@/core/mcp/agent/router'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { Router } from '@/core/mcp/agent/router'
import { AgentState } from '@/core/mcp/agent/state'
import 'dotenv/config'

// ID пользователя, которому будут отправляться уведомления
const TELEGRAM_ID = '144022504'
const BOT_NAME = 'neuro_blogger_bot'

// Интерфейс для представления задачи из базы данных
interface AgentTask {
  id: string
  external_id?: string
  type: string
  description: string
  status: string
  priority: number
  created_at: string
  updated_at: string
  dependencies: any[]
  metadata: Record<string, any>
  is_subtask: boolean
}

/**
 * Преобразует AgentTask в Task для совместимости с системой маршрутизации
 */
function adaptAgentTaskToTask(agentTask: AgentTask): Task {
  return {
    id: agentTask.id,
    type: agentTask.type as TaskType,
    description: agentTask.description,
    status: agentTask.status as TaskStatus,
    priority: agentTask.priority,
    created: new Date(agentTask.created_at),
    updated: new Date(agentTask.updated_at),
    dependencies: agentTask.dependencies || [],
    metadata: agentTask.metadata || {},
    isSubtask: agentTask.is_subtask,
  }
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
 * Получает следующую задачу из Supabase
 */
async function getNextAgentTask(): Promise<AgentTask | null> {
  try {
    logger.info('🔍 Поиск следующей задачи для обработки в Supabase', {
      telegram_id: TELEGRAM_ID,
      bot_name: BOT_NAME,
    })

    // Преобразуем telegram_id в число
    const tgId = parseInt(TELEGRAM_ID, 10)

    // Вызываем SQL-функцию получения следующей задачи
    const { data, error } = await supabase.rpc('get_next_agent_task', {
      p_telegram_id: tgId,
      p_bot_name: BOT_NAME,
    })

    if (error) {
      logger.error('❌ Ошибка при получении следующей задачи из Supabase', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      return null
    }

    if (!data) {
      logger.info('ℹ️ Нет доступных задач для обработки', {
        telegram_id: TELEGRAM_ID,
        bot_name: BOT_NAME,
      })
      return null
    }

    // Преобразуем данные в формат AgentTask
    const task: AgentTask = {
      id: data.id,
      external_id: data.external_id,
      type: data.type,
      description: data.description,
      status: data.status,
      priority: data.priority,
      created_at: data.created_at,
      updated_at: data.updated_at,
      dependencies: data.dependencies || [],
      metadata: data.metadata || {},
      is_subtask: data.is_subtask || false,
    }

    logger.info('✅ Получена следующая задача для обработки', {
      task_id: task.id,
      type: task.type,
      priority: task.priority,
    })

    return task
  } catch (error) {
    logger.error('❌ Необработанная ошибка при получении следующей задачи', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return null
  }
}

/**
 * Обновляет статус задачи в Supabase
 */
async function updateAgentTaskStatus(
  taskId: string,
  status: string,
  result: any = null
): Promise<boolean> {
  try {
    logger.info('🔄 Обновление статуса задачи в Supabase', {
      task_id: taskId,
      status,
      has_result: !!result,
    })

    // Вызываем SQL-функцию обновления статуса задачи
    const { data: updateResult, error } = await supabase.rpc(
      'update_agent_task_status',
      {
        p_task_id: taskId,
        p_status: status,
        p_result: result || null,
      }
    )

    if (error) {
      logger.error('❌ Ошибка при обновлении статуса задачи в Supabase', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        task_id: taskId,
      })
      return false
    }

    logger.info('✅ Статус задачи успешно обновлен в Supabase', {
      task_id: taskId,
      status,
      success: !!updateResult,
    })
    return true
  } catch (error) {
    logger.error('❌ Необработанная ошибка при обновлении статуса задачи', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      task_id: taskId,
    })
    return false
  }
}

/**
 * Создает агента для генерации кода
 */
function createCodeGenerationAgent(router: Router) {
  const codeGenerationAgent: NetworkAgent = {
    id: 'code-generation-agent',
    name: 'Агент генерации кода',
    description:
      'Агент для генерации кода на различных языках программирования',
    capabilities: ['code-generation', 'typescript', 'javascript', 'python'],

    async canHandle(task: Task): Promise<boolean> {
      return task.type === TaskType.CODE_GENERATION
    },

    async handle(task: Task, context: AgentState): Promise<any> {
      try {
        logger.info('🚀 Начало обработки задачи генерации кода', {
          task_id: task.id,
          description: task.description,
        })

        // Используем контекст
        logger.debug('📊 Текущее состояние агента', {
          agent_id: context.id,
          tasks_count: context.tasks.size,
          context_size: context.context.size,
        })

        // Отправляем уведомление о начале обработки задачи
        await sendTelegramNotification(
          `🚀 <b>Агент "${this.name}" начал обработку задачи</b>\n\n` +
            `ID задачи: <code>${task.id}</code>\n` +
            `Тип: ${task.type}\n` +
            `Описание: ${task.description}`
        )

        // Обновляем статус задачи на IN_PROGRESS
        await updateAgentTaskStatus(task.id, TaskStatus.IN_PROGRESS)

        logger.info(`⏳ Обработка задачи ${task.id}...`)

        // Получаем метаданные задачи
        const { language = 'typescript' } = task.metadata || {}

        // Имитация работы агента - генерация кода
        await new Promise(resolve => setTimeout(resolve, 3000)) // Имитация обработки

        // Генерируем код для функции приветствия
        const code = `
/**
 * Функция приветствия пользователя
 * @param name - Имя пользователя
 * @returns Строка приветствия
 */
function greet(name: string): string {
  return \`Привет, \${name}! Добро пожаловать в нашу систему.\`;
}
`.trim()

        // Формируем результат
        const result = {
          code,
          language,
          executionTime: new Date().toISOString(),
        }

        // Обновляем статус задачи на COMPLETED
        await updateAgentTaskStatus(task.id, TaskStatus.COMPLETED, result)

        logger.info(`✅ Задача ${task.id} успешно выполнена`, { result })

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
        await updateAgentTaskStatus(task.id, TaskStatus.FAILED, {
          error: error instanceof Error ? error.message : String(error),
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

  // Регистрируем агента в маршрутизаторе
  router.registerAgent(codeGenerationAgent)

  logger.info('✅ Агент генерации кода успешно зарегистрирован', {
    agent_id: codeGenerationAgent.id,
  })

  return codeGenerationAgent
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
        // Необходимые поля для соответствия интерфейсу Service
        initialize: async () => {},
        close: async () => {},
        processTask: async () => ({}),
        getClient: () => ({}),
      },
    })

    // Создаем и регистрируем агента для генерации кода
    const codeAgent = createCodeGenerationAgent(router)

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
    const nextAgentTask = await getNextAgentTask()

    if (!nextAgentTask) {
      logger.warn('⚠️ Нет доступных задач для обработки')
      await sendTelegramNotification(
        '⚠️ <b>Нет доступных задач для обработки</b>'
      )
      return
    }

    logger.info('✅ Получена задача для обработки', {
      task_id: nextAgentTask.id,
      type: nextAgentTask.type,
      priority: nextAgentTask.priority,
    })

    // Адаптируем задачу для совместимости с системой маршрутизации
    const nextTask = adaptAgentTaskToTask(nextAgentTask)

    // Проверяем, есть ли агент, который может обработать задачу
    const canBeHandled = codeAgent.canHandle(nextTask)

    if (!canBeHandled) {
      logger.warn('⚠️ Не найден агент для обработки задачи', {
        task_id: nextTask.id,
        type: nextTask.type,
      })

      await sendTelegramNotification(
        `⚠️ <b>Не найден агент для обработки задачи</b>\n\n` +
          `ID задачи: <code>${nextTask.id}</code>\n` +
          `Тип: ${nextTask.type}\n` +
          `Описание: ${nextTask.description}`
      )
      return
    }

    logger.info('✅ Найден подходящий агент для задачи', {
      agent: codeAgent.name,
      task_id: nextTask.id,
    })

    // Создаем пустое состояние агента
    const emptyAgentState: AgentState = {
      id: 'code-generation-agent-state',
      tasks: new Map<string, Task>(),
      context: new Map<string, any>(),
      history: [],
    }

    // Обрабатываем задачу
    const result = await codeAgent.handle(nextTask, emptyAgentState)

    if (result) {
      logger.info('✅ Задача успешно обработана', {
        task_id: nextTask.id,
        type: nextTask.type,
      })
    } else {
      logger.error('❌ Ошибка при обработке задачи', {
        task_id: nextTask.id,
        type: nextTask.type,
      })
    }

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
