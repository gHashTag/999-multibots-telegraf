import { supabase } from '../../../supabase'
import { logger } from '../../../utils/logger'
import { TEST_PAYMENT_CONFIG } from '../../../config/test'
import { createTestUser } from '../../helpers/users'
import { TestResult, TestUser } from '../../../types/tests'
import { getBotByName } from '../../../utils/bot'
import { ModeEnum } from '../../../types/modes'
import { TransactionType, PaymentStatus } from '../../../interfaces/payments.interface'

type User = TestUser

interface BalanceCheckResult {
  success: boolean
  currentBalance?: number
}

const TRANSACTION_TYPES = {
  MONEY_INCOME: 'MONEY_INCOME' as TransactionType,
  MONEY_EXPENSE: 'MONEY_EXPENSE' as TransactionType
}

type TransactionData = {
  telegram_id: string
  amount: number
  type: TransactionType
  service_type: ModeEnum
  description: string
}

async function checkBalance(userId: string, expectedBalance: number): Promise<BalanceCheckResult> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .single()

    if (error) {
      logger.error('❌ Ошибка при проверке баланса:', error)
      return { success: false }
    }

    if (!user) {
      logger.error('❌ Пользователь не найден')
      return { success: false }
    }

    const currentBalance = user.balance || 0
    return {
      success: currentBalance === expectedBalance,
      currentBalance
    }
  } catch (error) {
    logger.error('Ошибка при проверке баланса:', error)
    return { success: false }
  }
}

async function getUserBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', userId)
    .single()

  if (error) {
    throw new Error(`Ошибка при получении баланса: ${error.message}`)
  }

  return data?.balance || 0
}

export async function runBalanceTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  let testUserId: string = ''
  let testUser: User | null = null
  let requiredAmount = 0

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
    const initialBalanceResult = await checkBalance(testUserId, TEST_PAYMENT_CONFIG.testUser.initialBalance)
    if (!initialBalanceResult.success) {
      throw new Error(`Неверный начальный баланс. Ожидалось: ${TEST_PAYMENT_CONFIG.testUser.initialBalance}, Получено: ${initialBalanceResult.currentBalance}`)
    }

    results.push({
      success: true,
      name: 'Проверка баланса',
      message: 'Начальный баланс корректен'
    })

    // Создаем тестовые транзакции
    const transactionAmount = 100
    const testTransactions: TransactionData[] = [
      {
        telegram_id: testUserId,
        amount: transactionAmount,
        type: TRANSACTION_TYPES.MONEY_INCOME,
        service_type: ModeEnum.PHOTO,
        description: 'Test income'
      },
      {
        telegram_id: testUserId,
        amount: transactionAmount,
        type: TRANSACTION_TYPES.MONEY_EXPENSE,
        service_type: ModeEnum.PHOTO,
        description: 'Test expense'
      }
    ]

    for (const transaction of testTransactions) {
      await supabase
        .from('transactions')
        .insert(transaction)
    }

    // Проверяем созданные транзакции
    const { data: createdTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', testUserId)

    if (!createdTransactions || createdTransactions.length !== testTransactions.length) {
      throw new Error(`Ошибка при создании транзакций. Ожидалось: ${testTransactions.length}, Получено: ${createdTransactions?.length || 0}`)
    }

    results.push({
      success: true,
      name: 'Создание транзакций',
      message: `✅ Создано ${createdTransactions.length} транзакций`
    })

    // Проверяем баланс после всех операций
    const requiredAmount = TEST_PAYMENT_CONFIG.initialBalance - 100
    const { success: balanceCheckSuccess, currentBalance } = await checkBalance(testUserId, requiredAmount)
    
    results.push({
      success: balanceCheckSuccess,
      name: 'Проверка конечного баланса',
      message: balanceCheckSuccess 
        ? `✅ Баланс соответствует ожидаемому значению: ${currentBalance}`
        : `❌ Баланс не соответствует ожидаемому значению. Текущий: ${currentBalance}, ожидаемый: ${requiredAmount}`
    })

    // Проверяем обработку ошибок при некорректном ID пользователя
    const invalidCheck = await checkBalance('invalid_id', 0)
    results.push({
      success: !invalidCheck.success,
      name: 'Invalid User ID Check',
      message: invalidCheck.success
        ? '❌ Ошибка: проверка баланса прошла успешно с неверным ID пользователя'
        : '✅ Успешно обнаружен неверный ID пользователя'
    })

    // Проверяем достаточность баланса для разных типов операций
    for (const mode of Object.values(ModeEnum)) {
      const requiredAmount = TEST_PAYMENT_CONFIG.modes[mode.toLowerCase()] || 0
      const balanceCheck = await checkBalance(testUserId, TEST_PAYMENT_CONFIG.initialBalance)

      if (balanceCheck.success && balanceCheck.currentBalance >= requiredAmount) {
        results.push({
          success: true,
          name: `Balance Check for ${mode}`,
          message: `✅ Достаточно средств для ${mode}: ${balanceCheck.currentBalance} >= ${requiredAmount}`
        })
      } else {
        results.push({
          success: false,
          name: `Balance Check for ${mode}`,
          message: `❌ Недостаточно средств для ${mode}: ${balanceCheck.currentBalance} < ${requiredAmount}`
        })
      }
    }

    return results
  } catch (error) {
    logger.error('❌ Ошибка в тестах баланса:', error)
    return [{
      success: false,
      name: 'Тесты баланса',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    }]
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
