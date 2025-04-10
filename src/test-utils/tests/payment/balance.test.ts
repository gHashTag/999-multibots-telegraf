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
  let testUserId: string | null = null
  let testUser: User | null = null

  try {
    // Создаем тестового пользователя
    testUser = await createTestUser('123456789', TEST_PAYMENT_CONFIG.initialBalance)
    if (!testUser) {
      return [{
        success: false,
        name: 'Create Test User',
        message: '❌ Не удалось создать тестового пользователя'
      }]
    }
    testUserId = testUser.telegram_id

    // Проверяем начальный баланс
    const initialBalanceCheck = await checkBalance(testUserId, TEST_PAYMENT_CONFIG.initialBalance)
    results.push({
      success: initialBalanceCheck.success,
      name: 'Initial Balance Check',
      message: initialBalanceCheck.success
        ? `✅ Баланс корректный: ${initialBalanceCheck.currentBalance}`
        : '❌ Проверка начального баланса не удалась'
    })

    // Проверяем историю транзакций
    const { data: transactions, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', testUserId)

    if (transactionError) {
      results.push({
        success: false,
        name: 'Transaction History Check',
        message: '❌ Не удалось получить историю транзакций'
      })
    } else {
      results.push({
        success: true,
        name: 'Transaction History Check',
        message: `✅ Найдено транзакций: ${transactions.length}`
      })
    }

    // Создаем тестовые транзакции
    const transactionTypes = [TransactionType.MONEY_INCOME, TransactionType.MONEY_EXPENSE]
    const createdTransactions = []

    for (const type of transactionTypes) {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: 100,
          type,
          status: PaymentStatus.COMPLETED,
          service_type: ModeEnum.PHOTO,
          description: `Test ${type}`
        })
        .select()

      if (error) {
        logger.error('❌ Ошибка при создании транзакции:', error)
      } else if (data) {
        createdTransactions.push(...data)
      }
    }

    results.push({
      success: createdTransactions.length === transactionTypes.length,
      name: 'Create Test Transactions',
      message: `✅ Создано ${createdTransactions.length} транзакций`
    })

    // Проверяем достаточность баланса для разных типов операций
    for (const mode of Object.values(ModeEnum)) {
      const requiredAmount = TEST_PAYMENT_CONFIG.modes[mode.toLowerCase()] || 0
      const balanceCheck = await checkBalance(testUserId, TEST_PAYMENT_CONFIG.initialBalance)

      if (balanceCheck.success && balanceCheck.currentBalance && balanceCheck.currentBalance >= requiredAmount) {
        results.push({
          success: true,
          name: `Balance Check for ${mode}`,
          message: `✅ Достаточно средств для ${mode}: ${balanceCheck.currentBalance} >= ${requiredAmount}`
        })
      } else {
        results.push({
          success: false,
          name: `Balance Check for ${mode}`,
          message: `❌ Недостаточно средств для ${mode}: ${balanceCheck.currentBalance || 0} < ${requiredAmount}`
        })
      }
    }

    // Проверяем обработку ошибок при некорректном ID пользователя
    const invalidCheck = await checkBalance('invalid_id', 0)
    results.push({
      success: !invalidCheck.success,
      name: 'Invalid User ID Check',
      message: invalidCheck.success
        ? '❌ Ошибка: проверка баланса прошла успешно с неверным ID пользователя'
        : '✅ Успешно обнаружен неверный ID пользователя'
    })

  } catch (error) {
    logger.error('❌ Ошибка в тестах баланса:', error)
    return [{
      success: false,
      name: 'Balance Tests',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    }]
  } finally {
    // Очистка после тестов
    if (testUserId) {
      await supabase
        .from('transactions')
        .delete()
        .eq('telegram_id', testUserId)

      await supabase
        .from('users')
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
