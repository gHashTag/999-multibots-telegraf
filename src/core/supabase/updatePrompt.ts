import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'

export const updatePrompt = async (
  task_id: number,
  mediaUrl: string,
  status?: string
): Promise<{
  telegram_id: TelegramId
  username: string
  bot_name: string
  language_code: string
  prompt: string
} | null> => {
  try {
    // Сначала получаем данные по task_id
    const { data: existingData, error: selectError } = await supabase
      .from('prompts_history')
      .select('telegram_id, prompt, users(bot_name, language_code, username)')
      .eq('task_id', task_id)
      .single()

    logger.info({
      message: 'updatePrompt: existingData',
      description: 'Update prompt: existing data',
      existingData,
    })

    if (selectError || !existingData) {
      logger.error({
        message: 'Ошибка при получении данных промпта:',
        description: 'Error getting prompt data',
        error: selectError,
      })
      return null
    }

    // Обновляем запись, если она существует
    const { error: updateError } = await supabase
      .from('prompts_history')
      .update({ media_url: mediaUrl, status: status })
      .eq('task_id', task_id)

    if (updateError) {
      logger.error({
        message: 'Ошибка при обновлении промпта с изображением:',
        description: 'Error updating prompt with image',
        error: updateError,
      })
      return null
    }

    const telegram_id = existingData.telegram_id
    // @ts-ignore
    const username = existingData.users.username
    // @ts-ignore
    const bot_name = existingData.users.bot_name
    // @ts-ignore
    const language_code = existingData.users.language_code

    const prompt = existingData.prompt

    return {
      telegram_id,
      username,
      bot_name,
      language_code,
      prompt,
    }
  } catch (error) {
    console.error('Ошибка при обновлении промпта с изображением:', error)
    return null
  }
}
