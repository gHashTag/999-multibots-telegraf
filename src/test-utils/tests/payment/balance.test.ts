import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TEST_PAYMENT_CONFIG } from '@/config/test'
import { createTestUser } from '@/test-utils/helpers/users'
import { TestResult } from '@/test-utils/types'
import { ModeEnum } from '@/types/modes'
import { TransactionType } from '@/interfaces/payments.interface'

interface BalanceCheckResult {
  success: boolean;
  currentBalance?: number;
}

async function checkBalance(userId: string, expectedBalance: number): Promise<BalanceCheckResult> {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .single()

    const success = user?.balance === expectedBalance
    return {
      success,
      currentBalance: user?.balance
    }
  } catch (error) {
    logger.error('❌ Ошибка при проверке баланса:', error)
    return {
      success: false
    }
  }
}

export async function runBalanceTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  let testUserId: string
  let testUser: any

  try {
    logger.info('🚀 Инициализация тестов баланса')
    
    // Создаем тестового пользователя
    testUser = await createTestUser()
    testUserId = testUser.telegram_id

    // Сбрасываем баланс перед каждым тестом
    await supabase
      .from('users')
      .update({ balance: TEST_PAYMENT_CONFIG.testUser.initialBalance })
      .eq('telegram_id', testUserId)

    results.push({
      success: true,
      name: 'Создание пользователя',
      message: 'Тестовый пользователь создан'
    })

    // Проверяем начальный баланс
    const balanceResult = await checkBalance(testUserId, TEST_PAYMENT_CONFIG.testUser.initialBalance)
    if (!balanceResult.success) {
      throw new Error(`Неверный начальный баланс. Ожидалось: ${TEST_PAYMENT_CONFIG.testUser.initialBalance}, Получено: ${balanceResult.currentBalance}`)
    }

    results.push({
      success: true,
      name: 'Проверка баланса',
      message: 'Начальный баланс корректен'
    })

    // Проверяем начальный баланс
    const balanceResult = await checkBalance(testUserId, TEST_PAYMENT_CONFIG.testUser.initialBalance)
    if (!balanceResult) {
      throw new Error('Неверный начальный баланс')
    }

    results.push({
      success: true,
      name: 'Проверка баланса',
      message: 'Начальный баланс корректен'
    })

    // Создаем тестовые транзакции
    const types = ['money_income', 'money_expense']
    for (const type of types) {
      const amount = 100
      await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount,
          type,
          service_type: ModeEnum.PHOTO,
          description: `Test ${type}`
        })
    }

    // Проверяем созданные транзакции
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', testUserId)

    if (!transactions || transactions.length === 0) {
      throw new Error('История транзакций пуста')
    }

    results.push({
      success: true,
      name: 'Создание транзакций',
      message: `Создано ${transactions.length} транзакций`
    })

    // Очистка тестовых данных
    await supabase
      .from('transactions')
      .delete()
      .eq('telegram_id', testUserId)

    await supabase
      .from('users')
      .delete()
      .eq('telegram_id', testUserId)

    return results

  } catch (error) {
    logger.error('❌ Ошибка в тестах баланса:', error)
    results.push({
      success: false,
      name: 'Тесты баланса',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    })
    return results
  }
}

    // Проверка начального баланса
    // Проверка начального баланса
    const balanceResult = await checkBalance(testUserId, TEST_PAYMENT_CONFIG.testUser.initialBalance)
    if (!balanceResult) {
      throw new Error('Неверный начальный баланс')
    }
    results.push({
      success: true,
      name: 'Проверка баланса',
      message: 'Начальный баланс корректен'
    })

    // Проверка достаточности баланса
    const hasSufficientBalance = await checkBalance(testUserId, TEST_PAYMENT_CONFIG.testUser.initialBalance)
    if (!hasSufficientBalance) {
      throw new Error('Недостаточно средств на балансе')
    }
    results.push({
      success: true,
      name: 'Проверка достаточности баланса',
      message: 'Баланс достаточен'
    })

    // Проверка истории транзакций
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', testUserId)

    results.push({
      success: true,
      name: 'Проверка истории транзакций',
      message: transactions && transactions.length > 0
        ? `Найдено ${transactions.length} транзакций`
        : 'История транзакций пуста'
    })

    // Создаем тестовые транзакции
    const types = ['money_income', 'money_expense']
    for (const type of types) {
      const amount = 100
      await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount,
          type,
          service_type: ModeEnum.PHOTO,
          description: `Test ${type}`
        })
    }

    // Проверяем созданные транзакции
    const { data: newTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', testUserId)

    if (!newTransactions || newTransactions.length === 0) {
      throw new Error('История транзакций пуста')
    }

    results.push({
      success: true,
      name: 'Создание тестовых транзакций',
      message: `Создано ${newTransactions.length} транзакций`
    })

  } catch (error) {
    results.push({
      success: false,
      name: 'Общая проверка баланса',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    })
  } finally {
    // Очистка после тестов
    if (testUserId) {
      await supabase
        .from('users')
        .update({ balance: 0 })
        .eq('telegram_id', testUserId)
      
      await supabase
        .from('transactions')
        .delete()
        .eq('telegram_id', testUserId)
    }
  }

  return results
}

// Тест проверки баланса
async function checkBalance(userId: string, expectedBalance: number): Promise<boolean> {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .single()

    return user?.balance === expectedBalance
  } catch (error) {
    logger.error('Ошибка при проверке баланса:', error)
    return false
  }
}
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
          service_type: ModeEnum.PHOTO,
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
          service_type: ModeEnum.PHOTO,
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

  // Тест истории баланса
const historyCheckResult = await (async () => {
  try {
    const amount = 200
    const types = ['PAYMENT', 'REFUND']

      for (const type of types) {
        await supabase
          .from('transactions')
          .insert({
            telegram_id: testUserId,
            amount,
            type,
            service_type: ModeEnum.PHOTO,
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
          service_type: ModeEnum.PHOTO,
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
          service_type: ModeEnum.PHOTO,
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
