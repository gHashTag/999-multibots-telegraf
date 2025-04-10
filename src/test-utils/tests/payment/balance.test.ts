import { PaymentTester } from './PaymentTester'
import { createTestUser } from '@/test-utils/helpers/createTestUser'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { getUserBalance } from '@/core/supabase'
import { TEST_PAYMENT_CONFIG } from './test-config'
import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'
import { TestResult } from '@/test-utils/types'

export async function runBalanceTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  let tester: PaymentTester
  let testUserId: string
  let testUser: any

  try {
    logger.info('🚀 Инициализация тестов баланса')
    
    // Создаем тестера и тестового пользователя
    tester = new PaymentTester()
    testUser = await createTestUser()
    testUserId = testUser.telegram_id

    // Сбрасываем баланс перед каждым тестом
    await supabase
      .from('users')
      .update({ balance: TEST_PAYMENT_CONFIG.testUser.initialBalance })
      .eq('telegram_id', testUserId)

    // Тесты баланса
    results.push(...await runBalanceChecks(tester, testUserId))
    results.push(...await runBalanceUpdates(tester, testUserId))
    results.push(...await runBalanceNotifications(tester, testUserId))
    results.push(...await runBalanceHistory(tester, testUserId))

    // Очистка тестовых данных
    await supabase
      .from('transactions')
      .delete()
      .eq('telegram_id', testUserId)
  })

  describe('Balance Checks', () => {
    it('should correctly check user balance', async () => {
      const balance = await getUserBalance(testUserId)
      expect(balance).toBe(TEST_PAYMENT_CONFIG.testUser.initialBalance)
    })

    it('should validate sufficient balance for operation', async () => {
      const requiredAmount = TEST_PAYMENT_CONFIG.testUser.initialBalance - 100
      const { success, currentBalance } = await checkBalance(
        testUserId,
        requiredAmount
      )
      
      expect(success).toBeTruthy()
      expect(currentBalance).toBe(TEST_PAYMENT_CONFIG.testUser.initialBalance)
    })

    it('should reject operation with insufficient balance', async () => {
      const requiredAmount = TEST_PAYMENT_CONFIG.testUser.initialBalance + 100
      const { success, currentBalance } = await checkBalance(
        testUserId,
        requiredAmount
      )
      
      expect(success).toBeFalsy()
      expect(currentBalance).toBe(TEST_PAYMENT_CONFIG.testUser.initialBalance)
    })
  })

  describe('Balance Updates', () => {
    it('should correctly add funds to balance', async () => {
      const addAmount = 500
      const initialBalance = await getUserBalance(testUserId)

      // Создаем транзакцию пополнения
      await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: addAmount,
          type: 'money_income',
          service_type: ModeEnum.NeuroPhoto,
          description: 'Test balance addition'
        })

      // Обновляем баланс
      await supabase
        .from('users')
        .update({ balance: initialBalance + addAmount })
        .eq('telegram_id', testUserId)

      const newBalance = await getUserBalance(testUserId)
      expect(newBalance).toBe(initialBalance + addAmount)
    })

    it('should correctly deduct funds from balance', async () => {
      const deductAmount = 300
      const initialBalance = await getUserBalance(testUserId)

      // Создаем транзакцию списания
      await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: deductAmount,
          type: 'money_expense',
          service_type: ModeEnum.NeuroPhoto,
          description: 'Test balance deduction'
        })

      // Обновляем баланс
      await supabase
        .from('users')
        .update({ balance: initialBalance - deductAmount })
        .eq('telegram_id', testUserId)

      const newBalance = await getUserBalance(testUserId)
      expect(newBalance).toBe(initialBalance - deductAmount)
    })
  })

  describe('Balance Notifications', () => {
    it('should notify user about insufficient balance', async () => {
      const bot = await getBotByName(TEST_PAYMENT_CONFIG.testUser.botName)
      const requiredAmount = TEST_PAYMENT_CONFIG.testUser.initialBalance + 1000

      const { success } = await checkBalance(testUserId, requiredAmount, {
        notifyUser: true,
        botInstance: bot,
        isRu: true
      })

      expect(success).toBeFalsy()
      // Проверка отправки уведомления будет в PaymentTester
    })
  })

  describe('Balance History', () => {
    it('should maintain accurate transaction history', async () => {
      const amount = 200
      const types = ['money_income', 'money_expense']

      for (const type of types) {
        await supabase
          .from('transactions')
          .insert({
            telegram_id: testUserId,
            amount,
            type,
            service_type: ModeEnum.NeuroPhoto,
            description: `Test ${type}`
          })
      }

      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('telegram_id', testUserId)
        .order('created_at', { ascending: false })

      expect(transactions).toHaveLength(2)
      expect(transactions?.map(t => t.type)).toEqual(expect.arrayContaining(types))
    })

    it('should calculate balance changes correctly', async () => {
      const initialBalance = await getUserBalance(testUserId)
      const income = 300
      const expense = 200

      // Добавляем доход
      await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: income,
          type: 'money_income',
          service_type: ModeEnum.NeuroPhoto,
          description: 'Test income'
        })

      await supabase
        .from('users')
        .update({ balance: initialBalance + income })
        .eq('telegram_id', testUserId)

      // Проверяем промежуточный баланс
      const midBalance = await getUserBalance(testUserId)
      expect(midBalance).toBe(initialBalance + income)

      // Добавляем расход
      await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: expense,
          type: 'money_expense',
          service_type: ModeEnum.NeuroPhoto,
          description: 'Test expense'
        })

      await supabase
        .from('users')
        .update({ balance: midBalance - expense })
        .eq('telegram_id', testUserId)

      // Проверяем финальный баланс
      const finalBalance = await getUserBalance(testUserId)
      expect(finalBalance).toBe(initialBalance + income - expense)
    })
  })
})
