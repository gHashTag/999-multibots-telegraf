import { MyContext } from '@/interfaces'
import { InngestFunctionTester } from '@/test-utils/core/InngestFunctionTester'
import { supabase } from '@/core/supabase'
import { TelegramId } from '@/interfaces/telegram.interface'
import { Payment, PaymentStatus, TransactionType } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/price/helpers/modelsCost'

export class PaymentTester extends InngestFunctionTester {
  constructor() {
    super('payment')
  }

  /**
   * Проверяет создание платежа в базе данных
   */
  async checkPaymentCreation(
    telegramId: TelegramId,
    amount: number,
    stars: number,
    status: PaymentStatus = 'PENDING'
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId.toString())
      .eq('amount', amount)
      .eq('stars', stars)
      .eq('status', status)
      .single()

    if (error) {
      console.error('Error checking payment:', error)
      return false
    }

    return !!data
  }

  /**
   * Проверяет обновление баланса пользователя
   */
  async checkBalanceUpdate(
    telegramId: TelegramId,
    expectedBalance: number
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', telegramId.toString())
      .single()

    if (error) {
      console.error('Error checking balance:', error)
      return false
    }

    return data?.balance === expectedBalance
  }

  /**
   * Проверяет создание транзакции
   */
  async checkTransactionCreation(
    telegramId: TelegramId,
    amount: number,
    type: TransactionType,
    serviceType: ModeEnum
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', telegramId.toString())
      .eq('amount', amount)
      .eq('type', type)
      .eq('service_type', serviceType)
      .single()

    if (error) {
      console.error('Error checking transaction:', error)
      return false
    }

    return !!data
  }

  /**
   * Проверяет отправку уведомления об оплате
   */
  async checkPaymentNotification(
    ctx: MyContext,
    telegramId: TelegramId,
    amount: number,
    stars: number
  ): Promise<boolean> {
    // Проверяем, что уведомление было отправлено в чат
    try {
      const messages = await ctx.telegram.getChatHistory(telegramId.toString(), { limit: 1 })
      const lastMessage = messages[0]
      
      return lastMessage.text.includes(`${amount}`) && lastMessage.text.includes(`${stars}`)
    } catch (error) {
      console.error('Error checking notification:', error)
      return false
    }
  }

  /**
   * Проверяет статус платежа
   */
  async checkPaymentStatus(
    invId: string,
    expectedStatus: PaymentStatus
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('status')
      .eq('inv_id', invId)
      .single()

    if (error) {
      console.error('Error checking payment status:', error)
      return false
    }

    return data?.status === expectedStatus
  }

  /**
   * Проверяет историю платежей пользователя
   */
  async checkPaymentHistory(
    telegramId: TelegramId,
    expectedCount: number
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId.toString())

    if (error) {
      console.error('Error checking payment history:', error)
      return false
    }

    return data?.length === expectedCount
  }
}
