/**
 * Функция для получения следующей задачи для обработки из Supabase
 */
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { Task, TaskStatus, TaskType } from '@/core/mcp/agent/state'

/**
 * Интерфейс для параметров получения следующей задачи
 */
export interface GetNextTaskParams {
  telegram_id: string | number
  bot_name: string
}

/**
 * Получает следующую задачу для обработки из Supabase
 * @param params Параметры получения следующей задачи
 * @returns Задача для обработки или null, если нет доступных задач
 */
export async function getNextTask(
  params: GetNextTaskParams
): Promise<Task | null> {
  try {
    logger.info('🔍 Поиск следующей задачи для обработки в Supabase', {
      telegram_id: params.telegram_id,
      bot_name: params.bot_name,
    })

    // Преобразуем telegram_id в число, если он передан как строка
    const telegram_id =
      typeof params.telegram_id === 'string'
        ? parseInt(params.telegram_id, 10)
        : params.telegram_id

    // Вызываем SQL-функцию получения следующей задачи
    const { data, error } = await supabase.rpc('get_next_task', {
      p_telegram_id: telegram_id,
      p_bot_name: params.bot_name,
    })

    if (error) {
      logger.error('❌ Ошибка при получении следующей задачи из Supabase', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        params,
      })
      return null
    }

    if (!data) {
      logger.info('ℹ️ Нет доступных задач для обработки', {
        telegram_id: params.telegram_id,
        bot_name: params.bot_name,
      })
      return null
    }

    // Преобразуем данные из Supabase в формат Task
    const task: Task = {
      id: data.external_id || data.id,
      type: data.type as TaskType,
      description: data.description,
      status: data.status as TaskStatus,
      priority: data.priority,
      created: new Date(data.created_at),
      updated: new Date(data.updated_at),
      dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
      metadata: data.metadata || {},
      parentTaskId: data.parent_task_id || undefined,
      isSubtask: data.is_subtask || false,
      // Сохраняем оригинальный ID в метаданных для дальнейшего использования
      _originalId: data.id,
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
      params,
    })
    return null
  }
}
