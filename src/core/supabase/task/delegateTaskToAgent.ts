/**
 * Функция для назначения задачи агенту в Supabase
 */
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TaskStatus } from '@/core/mcp/agent/state'

/**
 * Интерфейс для параметров назначения задачи агенту
 */
export interface DelegateTaskParams {
  task_id: string
  agent_id: string
}

/**
 * Назначает задачу агенту и обновляет ее статус на "PROCESSING" в Supabase
 * @param params Параметры назначения задачи
 * @returns true, если задача успешно назначена, иначе false
 */
export async function delegateTaskToAgent(
  params: DelegateTaskParams
): Promise<boolean> {
  try {
    logger.info('🔄 Назначение задачи агенту в Supabase', {
      task_id: params.task_id,
      agent_id: params.agent_id,
    })

    // Вызываем SQL-функцию назначения задачи агенту
    const { data, error } = await supabase.rpc('delegate_task_to_agent', {
      p_task_id: params.task_id,
      p_agent_id: params.agent_id,
    })

    if (error) {
      logger.error('❌ Ошибка при назначении задачи агенту в Supabase', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        params,
      })
      return false
    }

    if (!data) {
      logger.warn('⚠️ Не удалось назначить задачу агенту: задача не найдена', {
        task_id: params.task_id,
        agent_id: params.agent_id,
      })
      return false
    }

    logger.info('✅ Задача успешно назначена агенту', {
      task_id: params.task_id,
      agent_id: params.agent_id,
      status: TaskStatus.PROCESSING,
    })

    return true
  } catch (error) {
    logger.error('❌ Необработанная ошибка при назначении задачи агенту', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      params,
    })
    return false
  }
}
