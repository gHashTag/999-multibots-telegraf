import { supabase } from '@/core/supabase'
import { TelegramId } from '@/interfaces/telegram.interface'
import { logger } from '@/utils/logger'
// Определяем тип для обновлений и экспортируем его
export type UpdateLatestModelTraining = {
  status?: string
  error?: string
  model_url?: string
  output_url?: string | null
  weights?: string | null
  replicate_training_id?: string
}

export const updateLatestModelTraining = async (
  telegram_id: TelegramId,
  bot_name: string,
  model_name: string,
  api: string
): Promise<boolean> => {
  try {
    const { error } = await supabase.from('latest_model_training').upsert(
      {
        telegram_id: telegram_id.toString(),
        bot_name,
        model_name,
        api,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_id,bot_name' }
    )

    if (error) {
      logger.error('❌ Ошибка при обновлении latest_model_training:', {
        description: 'Error updating latest_model_training',
        error: error.message,
        telegram_id,
        bot_name,
      })
      return false
    }

    logger.info('✅ Успешно обновлен latest_model_training:', {
      description: 'Successfully updated latest_model_training',
      telegram_id,
      bot_name,
      model_name,
    })
    return true
  } catch (error) {
    logger.error('❌ Ошибка при обновлении latest_model_training:', {
      description: 'Error updating latest_model_training',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      bot_name,
    })
    return false
  }
}
