import { TelegramId } from '@/types/telegram.interface'
import { supabase } from '@/core/supabase'

export const updateUserSubscription = async (
  telegram_id: TelegramId,
  subscription: string
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('users')
      .update({ subscription })
      .eq('telegram_id', telegram_id)

    if (error) {
      console.error('Ошибка при обновлении подписки пользователя:', error)
      throw new Error('Не удалось обновить подписку пользователя')
    }
  } catch (error) {
    console.error('Ошибка при обновлении подписки пользователя:', error)
    throw new Error('Не удалось обновить подписку пользователя')
  }
}
