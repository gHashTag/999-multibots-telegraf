import { supabase } from '.'
import { logger } from '@/utils/logger'

export const checkSubscriptionByTelegramId = async (
  telegramId: number
): Promise<boolean> => {
  const { data, error } = await supabase
    // .from('payments') // Старая таблица
    .from('payments_v2') // Новая таблица
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('type', 'SUBSCRIPTION_PURCHASE') // Убедимся, что тип правильный
    .eq('status', 'COMPLETED') // И статус завершен
    // Возможно, нужно добавить проверку на дату окончания подписки?
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error('Ошибка при проверке подписки пользователя:', error)
    return false
  }

  return !!data // Возвращаем true, если найдена хотя бы одна запись
}
