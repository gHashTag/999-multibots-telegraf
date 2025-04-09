import { supabase } from '../supabase'
import { logger } from '@/utils/logger'

/**
 * Получает Telegram ID пользователя по ID финтюна
 */
export async function getTelegramIdFromFinetune(
  finetuneId: string
): Promise<string> {
  try {
    logger.info({
      message: '🔍 Поиск пользователя по ID финтюна',
      finetuneId,
    })

    const { data, error } = await supabase
      .from('model_trainings')
      .select('telegram_id')
      .eq('finetune_id', finetuneId)
      .single()

    if (error || !data) {
      logger.error({
        message: '❌ Ошибка при получении Telegram ID из финтюна',
        finetuneId,
        error: error?.message,
      })
      throw new Error(`Не удалось найти тренировку по ID: ${finetuneId}`)
    }

    return data.telegram_id.toString()
  } catch (err) {
    const error = err as Error
    logger.error({
      message: '❌ Ошибка при получении Telegram ID из финтюна',
      finetuneId,
      error: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace',
    })
    throw error
  }
}
