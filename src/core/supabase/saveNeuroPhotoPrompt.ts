import { supabase } from '.'
import { Mode } from '@/types'
import { logger } from '@/utils/logger'
import { TelegramId } from '@/types/telegram.interface'
export const saveNeuroPhotoPrompt = async (
  id: string,
  prompt: string,
  mode: Mode,
  telegram_id?: TelegramId,
  status?: string
): Promise<number | null> => {
  try {
    logger.info({
      message: 'saveNeuroPhotoPrompt',
      description: 'Save neuro photo prompt',
      id,
      prompt,
      telegram_id,
      status,
    })
    const { data: newPrompt, error } = await supabase
      .from('prompts_history')
      .insert({
        task_id: id,
        prompt,
        telegram_id,
        status,
        model_type: 'neurophoto',
        mode,
      })
      .select()
      .single()

    if (error) {
      logger.error({
        message: 'Ошибка при сохранении промпта:',
        description: 'Error saving prompt',
        error,
      })
      return null
    }

    if (!newPrompt) {
      logger.error({
        message: 'Вставка не вернула данные',
        description: 'Insert did not return data',
      })
      return null
    }

    return newPrompt.prompt_id
  } catch (error) {
    logger.error({
      message: 'Ошибка при сохранении промпта:',
      description: 'Error saving prompt',
      error,
    })
    return null
  }
}
