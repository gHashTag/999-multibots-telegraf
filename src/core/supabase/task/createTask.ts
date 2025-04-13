/**
 * Функция для создания новой задачи в Supabase
 */
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TaskType } from '@/core/mcp/agent/state'

/**
 * Интерфейс для создания задачи
 */
export interface CreateTaskParams {
  telegram_id: string | number
  bot_name: string
  type: TaskType
  description: string
  priority?: number
  metadata?: Record<string, any>
  external_id?: string
  parent_task_id?: string
  is_subtask?: boolean
}

/**
 * Создает новую задачу в Supabase
 * @param params Параметры задачи
 * @returns ID созданной задачи или null в случае ошибки
 */
export async function createTask(
  params: CreateTaskParams
): Promise<string | null> {
  try {
    logger.info('🚀 Создание новой задачи в Supabase', {
      telegram_id: params.telegram_id,
      bot_name: params.bot_name,
      type: params.type,
      description: params.description.substring(0, 50) + '...',
    })

    // Преобразуем telegram_id в число, если он передан как строка
    const telegram_id =
      typeof params.telegram_id === 'string'
        ? parseInt(params.telegram_id, 10)
        : params.telegram_id

    // Вызываем SQL-функцию создания задачи
    const { data, error } = await supabase.rpc('create_task', {
      p_telegram_id: telegram_id,
      p_bot_name: params.bot_name,
      p_type: params.type,
      p_description: params.description,
      p_priority: params.priority || 1,
      p_metadata: params.metadata || {},
      p_external_id: params.external_id || null,
      p_parent_task_id: params.parent_task_id || null,
      p_is_subtask: params.is_subtask || false,
    })

    if (error) {
      logger.error('❌ Ошибка при создании задачи в Supabase', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        params,
      })
      return null
    }

    logger.info('✅ Задача успешно создана в Supabase', { task_id: data })
    return data
  } catch (error) {
    logger.error('❌ Необработанная ошибка при создании задачи', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      params,
    })
    return null
  }
}
