import { supabaseAdmin } from '@/core/supabase/client'
import { TelegramId } from '@/interfaces/telegram.interface'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { logger } from '@/utils/logger'
import { getUserById } from '../getUserById' // Corrected path
import { invalidateBalanceCache } from '../balance/getUserBalance' // Corrected path

/**
 * Обновляет баланс звезд пользователя в таблице users.
 * @param telegram_id ID пользователя в Telegram.
 * @param amount Количество звезд для добавления (положительное) или списания (отрицательное).
 * @returns true в случае успеха, false в случае ошибки.
 */
export const updateUserStarsBalance = async (
  telegram_id: TelegramId,
  amount: number // Количество звезд (может быть отрицательным)
): Promise<boolean> => {
  const normalizedId = normalizeTelegramId(telegram_id)
  logger.info('🔄 Обновление баланса звезд:', {
    telegram_id: normalizedId,
    amount,
  })

  try {
    // 1. Получаем пользователя, чтобы проверить существование
    const user = await getUserById(normalizedId)
    if (!user) {
      logger.error('❌ updateUserStarsBalance: Пользователь не найден', {
        telegram_id: normalizedId,
      })
      return false
    }

    // 2. Обновляем баланс звезд в таблице users
    // Предполагаем, что поле называется stars_balance
    // Используем rpc вызов для атомарного обновления (value = value + amount)
    const { error } = await supabaseAdmin.rpc('update_user_stars', {
      user_id_param: user.id,
      stars_to_add: amount,
    })

    // Если RPC не удалась (или нет такой функции), попробуем прямой UPDATE
    // ВАЖНО: Прямой UPDATE менее безопасен в плане гонок данных, RPC предпочтительнее.
    // Если будем использовать UPDATE, нужно сначала получить текущий баланс.
    /*
    const { data: userData, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('stars_balance')
        .eq('id', user.id)
        .single();

    if (fetchError || !userData) {
        logger.error('❌ updateUserStarsBalance: Ошибка получения текущего баланса звезд', {
            telegram_id: normalizedId,
            error: fetchError,
        });
        return false;
    }

    const currentStars = userData.stars_balance || 0;
    const newStarsBalance = currentStars + amount;

    // Проверка на отрицательный баланс (если не разрешено)
    if (newStarsBalance < 0) {
         logger.warn('⚠️ updateUserStarsBalance: Попытка установить отрицательный баланс звезд', {
            telegram_id: normalizedId,
            currentStars,
            amount,
            newStarsBalance
         });
         // Можно вернуть false или разрешить отрицательный баланс
         // return false;
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({ stars_balance: newStarsBalance })
      .eq('id', user.id)
    */

    if (error) {
      logger.error(
        '❌ updateUserStarsBalance: Ошибка обновления баланса звезд',
        {
          telegram_id: normalizedId,
          error: error.message,
          error_details: error,
        }
      )
      return false
    }

    // 3. Инвалидируем кэш баланса
    invalidateBalanceCache(normalizedId)

    logger.info('✅ Баланс звезд успешно обновлен', {
      telegram_id: normalizedId,
      amount,
    })
    return true
  } catch (error) {
    logger.error('❌ КРИТИЧЕСКАЯ ОШИБКА в updateUserStarsBalance:', {
      telegram_id: normalizedId,
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
    })
    return false
  }
}
