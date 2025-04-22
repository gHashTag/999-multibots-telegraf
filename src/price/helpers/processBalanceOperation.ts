import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult, MyContext } from '@/interfaces'

type BalanceOperationProps = {
  ctx: MyContext
  model?: string
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
}

export const processBalanceOperation = async ({
  ctx,
  telegram_id,
  paymentAmount,
  is_ru,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  try {
    // Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id.toString())
    // Проверяем достаточно ли средств
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
        : 'Insufficient funds. Top up your balance by calling the /buy command.'
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

    // Рассчитываем сумму для списания (отрицательное значение)
    const amountToUpdate = -paymentAmount

    // Обновляем баланс в БД, передавая только telegramId и сумму изменения
    const newBalance = await updateUserBalance(
      telegram_id.toString(),
      amountToUpdate // Передаем отрицательное значение для списания
    )

    // Проверяем результат updateUserBalance (возвращает null при ошибке)
    if (newBalance === null) {
      // Обработка ошибки обновления баланса
      const message = is_ru
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      return {
        newBalance: currentBalance, // Возвращаем старый баланс
        success: false,
        error: message,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    // Если newBalance не null, значит обновление прошло успешно
    return {
      newBalance, // Возвращаем новый баланс из updateUserBalance
      success: true,
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance, // Старый баланс до операции
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
