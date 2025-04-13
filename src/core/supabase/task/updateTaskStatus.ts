/**
 * Функция для обновления статуса задачи в Supabase
 */
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TaskStatus } from '@/core/mcp/agent/state'

/**
 * Интерфейс для обновления статуса задачи
 */
export interface UpdateTaskStatusParams {
  task_id: string
  status: TaskStatus
  result?: Record<string, any>
}

/**
 * Обновляет статус задачи в Supabase
 * @param params Параметры обновления статуса задачи
 * @returns true в случае успеха, false в случае ошибки
 */
export async function updateTaskStatus(
  params: UpdateTaskStatusParams
): Promise<boolean> {
  try {
    logger.info('🔄 Обновление статуса задачи в Supabase', {
      task_id: params.task_id,
      status: params.status,
      has_result: !!params.result,
    })

    // Вызываем SQL-функцию обновления статуса задачи
    const { data, error } = await supabase.rpc('update_task_status', {
      p_task_id: params.task_id,
      p_status: params.status,
      p_result: params.result || null,
    })

    if (error) {
      logger.error('❌ Ошибка при обновлении статуса задачи в Supabase', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        params,
      })
      return false
    }

    if (!data) {
      logger.warn('⚠️ Задача не найдена при обновлении статуса', {
        task_id: params.task_id,
      })
      return false
    }

    logger.info('✅ Статус задачи успешно обновлен в Supabase', {
      task_id: params.task_id,
      status: params.status,
    })
    return true
  } catch (error) {
    logger.error('❌ Необработанная ошибка при обновлении статуса задачи', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      params,
    })
    return false
  }
}
