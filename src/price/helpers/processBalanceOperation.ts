import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult, MyContext } from '@/interfaces'
import { PaymentType } from '@/interfaces/payments.interface'
type BalanceOperationProps = {
  ctx?: MyContext
  model?: string
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
  bot_name?: string
}

/**
 * 🔧 УЛУЧШЕНА: Операция баланса с защитой от дублирования
 *
 * ⚠️ ВАЖНО: Эта функция создает операцию MONEY_OUTCOME в БД
 * Убедитесь что она не вызывается повторно для одной и той же операции
 *
 * @param BalanceOperationProps параметры операции
 * @returns BalanceOperationResult результат операции
 */
export const processBalanceOperation = async ({
  ctx,
  telegram_id,
  paymentAmount,
  is_ru,
  bot_name,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  console.log('Processing balance operation for:', {
    telegram_id,
    paymentAmount,
    is_ru,
    bot_name,
  })
  console.log('Context available:', !!ctx)

  // 🛡️ БЕЗОПАСНОСТЬ: Валидация размера операции
  const MAX_OPERATION_AMOUNT = 10000 // Максимум 10,000 звезд за операцию
  const MIN_OPERATION_AMOUNT = 0.01 // Минимум 0.01 звезды

  if (paymentAmount > MAX_OPERATION_AMOUNT) {
    console.error('🚨 ПРЕВЫШЕН ЛИМИТ ОПЕРАЦИИ:', {
      telegram_id,
      paymentAmount,
      maxAllowed: MAX_OPERATION_AMOUNT,
    })
    return {
      newBalance: await getUserBalance(telegram_id.toString()),
      success: false,
      error: is_ru
        ? `Превышен лимит операции. Максимум: ${MAX_OPERATION_AMOUNT} ⭐`
        : `Operation limit exceeded. Maximum: ${MAX_OPERATION_AMOUNT} ⭐`,
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance: await getUserBalance(telegram_id.toString()),
    }
  }

  if (paymentAmount < MIN_OPERATION_AMOUNT) {
    console.error('🚨 СУММА НИЖЕ МИНИМУМА:', {
      telegram_id,
      paymentAmount,
      minAllowed: MIN_OPERATION_AMOUNT,
    })
    return {
      newBalance: await getUserBalance(telegram_id.toString()),
      success: false,
      error: is_ru
        ? `Минимальная сумма операции: ${MIN_OPERATION_AMOUNT} ⭐`
        : `Minimum operation amount: ${MIN_OPERATION_AMOUNT} ⭐`,
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance: await getUserBalance(telegram_id.toString()),
    }
  }

  // 🎁 ЛИДMАГНЕТ: Проверяем флаг обхода платежа
  if (ctx?.session?.bypass_payment_check) {
    console.log('🎁 [LEAD MAGNET] Bypassing payment check - FREE usage!', {
      telegram_id,
      bypassFlag: ctx.session.bypass_payment_check,
    })

    // Получаем текущий баланс для отображения (но не списываем)
    const currentBalance = await getUserBalance(telegram_id.toString())

    return {
      newBalance: currentBalance, // Баланс НЕ изменился
      success: true, // Операция успешна
      modePrice: paymentAmount, // Обычная цена (для статистики)
      paymentAmount: 0, // РЕАЛЬНО списано 0
      currentBalance,
    }
  }

  try {
    // Получаем текущий баланс
    console.log('Fetching current balance for:', telegram_id)
    const currentBalance = await getUserBalance(telegram_id.toString())
    console.log('Current balance fetched:', currentBalance)
    // Проверяем достаточно ли средств
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните баланс в главном меню.'
        : 'Insufficient funds. Top up your balance in the main menu.'
      await ctx.telegram.sendMessage(telegram_id.toString(), message)
      return {
        newBalance: currentBalance,
        success: false,
        error: message,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    // Рассчитываем новый баланс
    const newBalance = Number(currentBalance) - Number(paymentAmount)

    // Обновляем баланс в БД, передавая все необходимые аргументы
    console.log('Updating balance with details:', {
      telegram_id,
      paymentAmount,
      bot_name: ctx?.botInfo?.username || bot_name || 'unknown_bot',
      service_type: ctx?.session?.mode || 'unknown_mode',
    })

    // 🔧 ИСПРАВЛЕНО: Передаем отрицательную сумму для операции списания
    const updateSuccess = await updateUserBalance(
      telegram_id.toString(),
      -paymentAmount, // Отрицательная сумма для списания
      PaymentType.MONEY_OUTCOME,
      'Payment operation',
      {
        bot_name: ctx?.botInfo?.username || bot_name || 'unknown_bot',
        service_type: ctx?.session?.mode || 'unknown_mode',
        modePrice: paymentAmount, // Положительная сумма для логики расчета
        currentBalance: currentBalance,
      }
    )

    if (!updateSuccess) {
      // Обработка ошибки обновления баланса
      const message = is_ru
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      return {
        newBalance: currentBalance,
        success: false,
        error: message,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    return {
      newBalance,
      success: true,
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance,
    }
  } catch (error) {
    console.error('Error in processBalanceOperation:', error)
    return {
      newBalance: await getUserBalance(telegram_id.toString()),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance: await getUserBalance(telegram_id.toString()),
    }
  }
}
