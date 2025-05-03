import { supabase } from './client'
import { logger } from '@/utils/logger'

/**
 * Обновляет текущую используемую модель для пользователя.
 * @param telegram_id - Telegram ID пользователя.
 * @param model - Новое название модели.
 */
export const updateUserModel = async (
  telegram_id: string,
  model: string
): Promise<void> => {
  const { data, error } = await supabase
    .from('users')
    .update({ model: model })
    .eq('telegram_id', telegram_id)
    .select('id') // Добавляем select, чтобы проверить, был ли пользователь найден
    .single()

  if (error) {
    logger.error(`Error updating user model in Supabase: ${error.message}`, {
      telegram_id,
      model,
      error,
    })
    throw new Error(
      `Ошибка при обновлении модели пользователя: ${error.message}`
    )
  }

  if (!data) {
    logger.warn('User not found when trying to update model', {
      telegram_id,
      model,
    })
    // Можно решить, бросать ли ошибку, если пользователь не найден
    // throw new Error('Пользователь не найден при попытке обновить модель')
  }

  logger.info('User model updated successfully', { telegram_id, model })
}
