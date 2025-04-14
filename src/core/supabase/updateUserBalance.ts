import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from './index'
import { logger } from '@/utils/logger'
import { TransactionType } from '@/interfaces/payments.interface'

interface UpdateUserBalanceParams {
  telegram_id: TelegramId
  amount: number
  type: TransactionType
  description: string
  bot_name: string
  service_type?: string
  payment_method?: string
  metadata?: Record<string, any>
}

/**
 * Создает запись в таблице платежей payments_v2
 * Баланс рассчитывается на основе таблицы платежей через SQL-функцию get_user_balance
 */
export const updateUserBalance = async ({
  telegram_id,
  amount,
  type,
  description,
  bot_name,
  service_type = 'default',
  metadata = {},
}: UpdateUserBalanceParams): Promise<{
  success: boolean
  error?: any
}> => {
  try {
    logger.info('💰 Создание записи платежа:', {
      description: 'Creating payment record',
      telegram_id,
      amount,
      type,
      operation_description: description,
      metadata,
      bot_name,
      payment_method: 'system',
      service_type,
    })

    // Нормализуем telegram_id к BIGINT и amount к numeric
    const normalizedTelegramId = String(telegram_id)
    const normalizedAmount = Number(amount)

    // Получаем текущий баланс из функции get_user_balance
    const { data: currentBalance, error: balanceError } = await supabase.rpc(
      'get_user_balance',
      {
        user_telegram_id: normalizedTelegramId,
      }
    )

    if (balanceError) {
      logger.error('❌ Ошибка при получении баланса пользователя:', {
        description: 'Error getting user balance',
        error: balanceError.message,
        error_details: balanceError,
        telegram_id: normalizedTelegramId,
      })
      return { success: false, error: balanceError }
    }

    // Получаем данные пользователя для ID
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', normalizedTelegramId)
      .single()

    let userId: number

    // Если пользователя нет, создаем его
    if (!userData) {
      logger.info('👤 Создание нового пользователя:', {
        description: 'Creating new user',
        telegram_id: normalizedTelegramId,
      })

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: normalizedTelegramId,
          bot_name: bot_name,
          last_payment_date: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (createError) {
        logger.error('❌ Ошибка при создании пользователя:', {
          description: 'Error creating user',
          error: createError.message,
          error_details: createError,
          telegram_id: normalizedTelegramId,
        })
        return { success: false, error: createError }
      }

      userId = newUser.id
    } else {
      userId = userData.id
    }

    // Проверяем достаточность баланса при списании
    if (
      type === TransactionType.MONEY_EXPENSE &&
      currentBalance < Math.abs(normalizedAmount)
    ) {
      const errorMessage = `Недостаточно средств. Текущий баланс: ${currentBalance}, требуется: ${Math.abs(
        normalizedAmount
      )}`
      logger.error('⚠️ Недостаточно средств:', {
        description: 'Insufficient funds',
        current_balance: currentBalance,
        required_amount: Math.abs(normalizedAmount),
        telegram_id: normalizedTelegramId,
      })

      // Создаем запись о неудачной попытке списания
      await supabase.from('payments_v2').insert({
        payment_date: new Date().toISOString(),
        amount: normalizedAmount,
        status: 'FAILED',
        payment_method: 'system',
        description: `${description} (Недостаточно средств)`,
        metadata: {
          type: 'system_deduction_failed',
          error: 'insufficient_funds',
          current_balance: currentBalance,
          requested_stars: normalizedAmount,
          service_type: service_type,
          user_id: userId,
        },
        stars: normalizedAmount,
        telegram_id: normalizedTelegramId,
        currency: 'STARS',
        bot_name: bot_name,
        language: 'ru',
        type: type,
      })

      return {
        success: false,
        error: new Error(errorMessage),
      }
    }

    // Проверяем, не является ли это дублирующей записью платежа
    // Например, если у нас уже есть запись в payments_v2 для этой операции
    // В этом случае не создаем дополнительных системных записей
    if (metadata && metadata.payment_id) {
      logger.info(
        '⚠️ Существует основная запись платежа, пропускаем создание системной:',
        {
          description:
            'Main payment record exists, skipping system record creation',
          telegram_id: normalizedTelegramId,
          payment_id: metadata.payment_id,
          amount: normalizedAmount,
        }
      )

      // Обновляем last_payment_date у пользователя
      await supabase
        .from('users')
        .update({
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('telegram_id', normalizedTelegramId)

      // Получаем актуальный баланс
      const { data: updatedBalance, error: updatedBalanceError } =
        await supabase.rpc('get_user_balance', {
          user_telegram_id: normalizedTelegramId,
        })

      if (updatedBalanceError) {
        logger.error('❌ Ошибка при получении обновленного баланса:', {
          description: 'Error getting updated balance',
          error: updatedBalanceError.message,
          telegram_id: normalizedTelegramId,
        })
        return { success: false, error: updatedBalanceError }
      }

      logger.info('✅ Транзакция уже была обработана, обновили баланс:', {
        description: 'Transaction already processed, updated balance',
        telegram_id: normalizedTelegramId,
        old_balance: currentBalance,
        new_balance: updatedBalance,
        amount: normalizedAmount,
      })

      return {
        success: true,
      }
    }

    // Создаем запись об операции
    const { data: paymentData, error: paymentError } = await supabase
      .from('payments_v2')
      .insert({
        payment_date: new Date().toISOString(),
        amount: normalizedAmount,
        status: 'COMPLETED',
        payment_method: 'system',
        description: description,
        metadata: {
          type: normalizedAmount >= 0 ? 'system_add' : 'system_deduction',
          current_balance: currentBalance,
          stars_change: normalizedAmount,
          service_type: service_type,
          user_id: userId,
        },
        stars: normalizedAmount,
        telegram_id: normalizedTelegramId,
        currency: 'STARS',
        bot_name: bot_name,
        language: 'ru',
        type: type,
      })
      .select('payment_id')
      .single()

    if (paymentError) {
      logger.error('❌ Ошибка при создании записи платежа:', {
        description: 'Error creating payment record',
        error: paymentError.message,
        error_details: paymentError,
        telegram_id: normalizedTelegramId,
      })
      return { success: false, error: paymentError }
    }

    // Обновляем last_payment_date у пользователя
    await supabase
      .from('users')
      .update({
        last_payment_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('telegram_id', normalizedTelegramId)

    // Получаем новый баланс
    const { data: newBalance, error: newBalanceError } = await supabase.rpc(
      'get_user_balance',
      {
        user_telegram_id: normalizedTelegramId,
      }
    )

    if (newBalanceError) {
      logger.error('❌ Ошибка при получении нового баланса пользователя:', {
        description: 'Error getting new user balance',
        error: newBalanceError.message,
        error_details: newBalanceError,
        telegram_id: normalizedTelegramId,
      })
      return { success: false, error: newBalanceError }
    }

    logger.info('✅ Запись платежа создана и баланс обновлен:', {
      description: 'Payment record created successfully',
      telegram_id: normalizedTelegramId,
      payment_id: paymentData.payment_id,
      old_balance: currentBalance,
      new_balance: newBalance,
      amount: normalizedAmount,
      type,
      bot_name,
    })

    return {
      success: true,
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка при создании записи платежа:', {
      description: 'Critical error creating payment record',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      telegram_id,
      amount,
      type,
      bot_name,
    })
    return { success: false, error }
  }
}
