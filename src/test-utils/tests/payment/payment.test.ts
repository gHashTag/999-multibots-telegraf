import { PaymentTester } from './PaymentTester'
import { createTestUser } from '@/test-utils/helpers/createTestUser'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { supabase } from '@/core/supabase'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { sendPaymentNotification } from '@/price/helpers/sendPaymentNotification'
import { sendPaymentNotificationToUser } from '@/price/helpers/sendPaymentNotificationToUser'
import { checkPaymentStatus } from '@/core/supabase/checkPaymentStatus'
import { getBotByName } from '@/core/bot'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { logger } from '@/utils/logger'
import { TransactionType } from '@/interfaces/payments.interface'

describe('Payment System Tests', () => {
  let tester: PaymentTester
  let ctx: MyContext
  let testUserId: string

  beforeAll(async () => {
    tester = new PaymentTester()
    ctx = await createMockContext()
    const testUser = await createTestUser()
    testUserId = testUser.telegram_id
  })

  afterAll(async () => {
    // Очистка тестовых данных
    await supabase.from('payments_v2').delete().eq('telegram_id', testUserId)

    await supabase.from('transactions').delete().eq('telegram_id', testUserId)
  })

  describe('Payment Creation', () => {
    it('should create a new payment record', async () => {
      const amount = 1000
      const stars = 100

      // Создаем тестовый платеж
      const { data: payment, error } = await supabase
        .from('payments_v2')
        .insert({
          telegram_id: testUserId,
          amount,
          stars,
          status: 'PENDING',
          payment_method: 'Robokassa',
          type: TransactionType.MONEY_INCOME,
          service_type: ModeEnum.NeuroPhoto,
          currency: 'RUB',
          bot_name: 'test_bot',
          description: 'Test payment',
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(payment).toBeTruthy()

      const paymentCreated = await tester.checkPaymentCreated(
        testUserId,
        amount,
        'PENDING'
      )
      expect(paymentCreated).toBeTruthy()
    })

    it('should update user balance after successful payment', async () => {
      const initialBalance = 0
      const amount = 100

      // Обновляем баланс пользователя
      await supabase
        .from('users')
        .update({ balance: initialBalance })
        .eq('telegram_id', testUserId)

      // Создаем успешный платеж
      await supabase.from('payments_v2').insert({
        telegram_id: testUserId,
        amount,
        stars: amount,
        status: 'COMPLETED',
        payment_method: 'Robokassa',
        type: TransactionType.MONEY_INCOME,
        service_type: ModeEnum.NeuroPhoto,
        currency: 'RUB',
        bot_name: 'test_bot',
        description: 'Test payment',
      })

      const balanceUpdated = await tester.checkBalanceUpdated(
        testUserId,
        initialBalance + amount
      )
      expect(balanceUpdated).toBeTruthy()
    })
  })

  describe('Funds Deduction', () => {
    it('should deduct funds from user balance', async () => {
      // Установим начальный баланс 1000
      await updateUserBalance({
        telegram_id: testUserId,
        amount: 1000,
        type: TransactionType.MONEY_INCOME,
        description: 'Initial balance for test',
        bot_name: 'test_bot',
      })

      // Списание средств
      const deductionAmount = 500
      const result = await updateUserBalance({
        telegram_id: testUserId,
        amount: -deductionAmount, // Отрицательное значение для списания
        type: TransactionType.MONEY_EXPENSE,
        description: 'Test deduction',
        bot_name: 'test_bot',
        service_type: ModeEnum.TextToVideo,
      })

      // Проверка на null или undefined перед обращением к свойству
      expect(result).toBeDefined()

      if (result) {
        expect(result.success).toBeTruthy()
      } else {
        // Если result undefined, тест должен завершиться неудачей
        expect('Result is undefined').toBe(false)
      }

      // Проверим, что баланс уменьшился
      const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', testUserId)
        .single()

      expect(user?.balance).toBe(500) // 1000 - 500 = 500
    })

    it('should handle insufficient funds', async () => {
      // Установим начальный баланс 100
      await updateUserBalance({
        telegram_id: testUserId,
        amount: 100,
        type: TransactionType.MONEY_INCOME,
        description: 'Small balance for test',
        bot_name: 'test_bot',
      })

      // Пытаемся списать больше, чем есть
      const deductionAmount = 500
      const result = await updateUserBalance({
        telegram_id: testUserId,
        amount: -deductionAmount,
        type: TransactionType.MONEY_EXPENSE,
        description: 'Test deduction with insufficient funds',
        bot_name: 'test_bot',
        service_type: ModeEnum.TextToVideo,
      })

      // Проверка на null или undefined перед обращением к свойству
      expect(result).toBeDefined()

      if (result) {
        expect(result.success).toBeFalsy()
        expect(result.error).toBeDefined()
      } else {
        // Если result undefined, тест должен завершиться неудачей
        expect('Result is undefined').toBe(false)
      }

      // Проверим, что баланс не изменился
      const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', testUserId)
        .single()

      expect(user?.balance).toBe(100) // Баланс должен остаться прежним
    })
  })

  describe('Payment Notifications', () => {
    it('should send payment notification to user', async () => {
      const amount = 1000
      const stars = 100
      const bot = await getBotByName('test_bot')

      await sendPaymentNotificationToUser({
        amount: amount.toString(),
        stars,
        telegramId: testUserId,
        language_code: 'ru',
        bot,
      })

      const notificationSent = await tester.checkPaymentNotification(
        testUserId,
        amount,
        stars
      )
      expect(notificationSent).toBeTruthy()
    })

    it('should send payment notification to admin channel', async () => {
      const amount = 1000
      const stars = 100

      await sendPaymentNotification(
        amount,
        stars,
        testUserId,
        'ru',
        'test_user'
      )

      // Проверяем отправку в админский канал
      const messages = await ctx.telegram.getChatHistory('-4166575919', {
        limit: 1,
      })
      const lastMessage = messages[0]

      expect(lastMessage.text).toContain(amount.toString())
      expect(lastMessage.text).toContain(stars.toString())
      expect(lastMessage.text).toContain(testUserId)
    })
  })

  describe('Payment Status', () => {
    it('should check payment status correctly', async () => {
      const invId = 'test_inv_id'
      const status = 'COMPLETED'

      // Создаем тестовый платеж
      await supabase.from('payments_v2').insert({
        telegram_id: testUserId,
        amount: 1000,
        stars: 100,
        status,
        inv_id: invId,
        payment_method: 'Robokassa',
        type: TransactionType.MONEY_INCOME,
        service_type: ModeEnum.NeuroPhoto,
        currency: 'RUB',
        bot_name: 'test_bot',
        description: 'Test payment',
      })

      const paymentStatus = await checkPaymentStatus(invId)
      expect(paymentStatus?.status).toBe(status)
    })
  })

  describe('Transaction History', () => {
    it('should record transaction history correctly', async () => {
      const amount = 500
      const type = 'money_income'
      const serviceType = ModeEnum.NeuroPhoto

      // Создаем тестовую транзакцию
      await supabase.from('transactions').insert({
        telegram_id: testUserId,
        amount,
        type,
        service_type: serviceType,
        description: 'Test transaction',
      })

      const transactionCreated = await tester.checkTransactionCreated(
        testUserId,
        amount,
        type
      )
      expect(transactionCreated).toBeTruthy()
    })

    it('should maintain correct payment history', async () => {
      const expectedCount = 1
      const historyCorrect = await tester.checkPaymentHistory(
        testUserId,
        expectedCount
      )
      expect(historyCorrect).toBeTruthy()
    })
  })
})
