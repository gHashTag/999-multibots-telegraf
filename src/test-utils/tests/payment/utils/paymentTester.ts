import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'
import { ModeEnum } from '@/interfaces/modes'
import { TransactionType } from '@/interfaces/payments.interface'

interface CreatePaymentParams {
  telegram_id: string
  amount: number
  type: TransactionType
  description: string
  bot_name: string
  service_type: ModeEnum
  inv_id?: string
}

export class PaymentTester {
  /**
   * Создает тестового пользователя с заданным балансом
   */
  async createTestUser(
    telegramId: string,
    initialBalance: number = 0
  ): Promise<void> {
    logger.info('💾 Создание тестового пользователя', {
      description: 'Creating test user',
      telegram_id: telegramId,
      initial_balance: initialBalance,
    })

    // Создаем пользователя если не существует
    const { error: userError } = await supabase.from('users').upsert({
      telegram_id: telegramId,
      language: 'ru',
      created_at: new Date().toISOString(),
    })

    if (userError) {
      throw new Error(`Ошибка создания пользователя: ${userError.message}`)
    }

    // Если задан начальный баланс, создаем платеж
    if (initialBalance > 0) {
      await this.createPayment({
        telegram_id: telegramId,
        amount: initialBalance,
        type: TransactionType.MONEY_INCOME,
        description: 'Initial balance',
        bot_name: 'test_bot',
        service_type: ModeEnum.TopUpBalance,
      })
    }
  }

  /**
   * Создает тестовый платеж
   */
  async createPayment(params: CreatePaymentParams): Promise<void> {
    logger.info('💾 Создание тестового платежа', {
      telegram_id: params.telegram_id,
      amount: params.amount,
      type: params.type,
      description: 'Creating test payment',
      bot_name: params.bot_name,
      service_type: params.service_type,
    })

    await inngest.send({
      name: 'payment/process',
      data: {
        ...params,
        stars: params.amount, // Для тестов используем 1:1
      },
    })

    // Ждем обработки платежа
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  /**
   * Проверяет создание платежа
   */
  async checkPaymentCreated(
    telegramId: string,
    amount: number
  ): Promise<boolean> {
    const { data: payment, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('amount', amount)
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !payment) {
      logger.error('❌ Ошибка проверки создания платежа', {
        description: 'Error checking payment creation',
        error: error?.message,
      })
      return false
    }

    return true
  }

  /**
   * Проверяет текущий баланс пользователя
   */
  async checkBalance(telegramId: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_user_balance', {
      user_telegram_id: telegramId,
    })

    if (error) {
      throw new Error(`Ошибка получения баланса: ${error.message}`)
    }

    return data || 0
  }

  /**
   * Очищает тестовые данные
   */
  async cleanupTestData(telegramId: string): Promise<void> {
    logger.info('🧹 Очистка тестовых данных', {
      description: 'Cleaning up test data',
      telegram_id: telegramId,
    })

    // Удаляем платежи
    await supabase.from('payments_v2').delete().eq('telegram_id', telegramId)

    // Удаляем пользователя
    await supabase.from('users').delete().eq('telegram_id', telegramId)
  }
}
