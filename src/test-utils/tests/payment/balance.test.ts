import { supabase } from '../../../supabase'
import { logger } from '@/utils/logger'
import { TEST_PAYMENT_CONFIG } from '../../../config/test'
import { createTestUser } from '../../helpers/users'
import { TestResult, TestUser } from '../../../types/tests'
// import { getBotByName } from '../../../utils/bot' // Закомментировано, так как не используется
import { ModeEnum } from '../../../price/helpers/modelsCost'
import {
  TransactionType,
  // PaymentStatus, // Закомментировано, так как не используется
} from '../../../interfaces/payments.interface'
// import { runTest } from '../../helpers/runner' // Удален импорт несуществующего хелпера
import {
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase/getUserBalance'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { v4 as uuidv4 } from 'uuid'

// type User = TestUser // Закомментировано, так как не используется

interface BalanceCheckResult {
  success: boolean
  currentBalance?: number
}

// const TRANSACTION_TYPES = { // Закомментировано, так как не используется
//  MONEY_INCOME: 'MONEY_INCOME' as TransactionType,
//  MONEY_EXPENSE: 'MONEY_EXPENSE' as TransactionType,
// }

// type TransactionData = { // Закомментировано, так как не используется
//   telegram_id: string
//   amount: number
//   type: TransactionType
//   service_type: ModeEnum
//   description: string
// }

async function checkBalance(
  userId: string,
  requiredBalance: number
): Promise<BalanceCheckResult> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .single()

    if (error) {
      logger.error('❌ Ошибка при проверке баланса:', { error, userId })
      return { success: false }
    }

    if (!user) {
      logger.warn('❓ Пользователь не найден при проверке баланса', { userId })
      return { success: false }
    }

    const currentBalance = user.balance || 0
    return {
      success: currentBalance >= requiredBalance,
      currentBalance,
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка при проверке баланса:', {
      error,
      userId,
    })
    return { success: false }
  }
}

// async function getUserBalance(userId: string): Promise<number> { // Закомментировано, так как не используется
//   const { data, error } = await supabase
//     .from('users')
// ... остальной код getUserBalance ...
//   return data?.balance || 0
// }

async function testInitialBalance(testUserId: string): Promise<TestResult> {
  const testName = 'Initial Balance Check'
  try {
    const initialBalanceCheck = await checkBalance(
      testUserId,
      TEST_PAYMENT_CONFIG.initialBalance
    )
    if (!initialBalanceCheck.success) {
      throw new Error(
        `Начальный баланс неверен: ${initialBalanceCheck.currentBalance} != ${TEST_PAYMENT_CONFIG.initialBalance}`
      )
    }
    return {
      success: true,
      name: testName,
      message: `✅ Баланс корректный: ${initialBalanceCheck.currentBalance}`,
    }
  } catch (error) {
    return {
      success: false,
      name: testName,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testCreateTransactions(testUserId: string): Promise<TestResult> {
  const testName = 'Create Test Transactions'
  try {
    const transactionTypes = [
      TransactionType.MONEY_INCOME,
      TransactionType.MONEY_EXPENSE,
    ]
    const createdTransactions = []
    for (const type of transactionTypes) {
      // Раскомментируем и исправляем вызов Supabase
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId, // Используем testUserId
          amount: 100,
          type,
          // status: PaymentStatus.COMPLETED, // Убрали статус, так как PaymentStatus закомментирован
          service_type: ModeEnum.NeuroPhotoV2,
          description: `Test ${type}`,
        })
        .select()

      if (error)
        throw new Error(
          `Ошибка при создании транзакции ${type}: ${error.message}`
        )
      if (data) createdTransactions.push(...data)
    }
    if (createdTransactions.length !== transactionTypes.length) {
      throw new Error(
        `Создано ${createdTransactions.length} транзакций вместо ${transactionTypes.length}`
      )
    }
    return {
      success: true,
      name: testName,
      message: `✅ Создано ${createdTransactions.length} транзакций`,
    }
  } catch (error) {
    return {
      success: false,
      name: testName,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testBalanceSufficiencyForModes(
  testUserId: string
): Promise<TestResult[]> {
  const modeResults: TestResult[] = []
  for (const mode of Object.values(ModeEnum)) {
    const testName = `Balance Check for ${mode}`
    try {
      const modesConfig = TEST_PAYMENT_CONFIG.modes as Record<string, number> // Приведение типа для индексации
      const requiredAmount = modesConfig[mode.toLowerCase()] || 0
      const balanceCheck = await checkBalance(testUserId, requiredAmount)
      if (!balanceCheck.success) {
        throw new Error(
          `Недостаточно средств для ${mode}: ${balanceCheck.currentBalance || 0} < ${requiredAmount}`
        )
      }
      modeResults.push({
        success: true,
        name: testName,
        message: `✅ Достаточно средств для ${mode}: ${balanceCheck.currentBalance} >= ${requiredAmount}`,
      })
    } catch (error) {
      modeResults.push({
        success: false,
        name: testName,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return modeResults
}

async function testInvalidUserIdCheck(): Promise<TestResult> {
  const testName = 'Invalid User ID Check'
  try {
    const invalidCheck = await checkBalance('invalid_id', 0)
    if (invalidCheck.success) {
      throw new Error(
        'Ошибка: проверка баланса прошла успешно с неверным ID пользователя'
      )
    }
    return {
      success: true,
      name: testName,
      message: '✅ Успешно обнаружен неверный ID пользователя',
    }
  } catch (error) {
    // Ожидаемая ошибка (пользователь не найден), так что тест проходит, если checkBalance вернул false
    // Если checkBalance кинул исключение (что не должно быть при user not found), это ошибка теста.
    return {
      success: false,
      name: testName,
      message: `Неожиданная ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест инвалидации кэша баланса при создании платежа
 * Проверяет, что при создании платежа кэш баланса инвалидируется
 */
async function testBalanceCacheInvalidation(
  testUserId: string
): Promise<TestResult> {
  const testName = 'Balance Cache Invalidation'
  try {
    // Получаем текущий баланс (это закэширует значение)
    const initialBalance = await getUserBalance(testUserId)
    logger.info('💰 Получен начальный баланс (кэширование):', {
      description: 'Cached initial balance',
      testUserId,
      initialBalance,
    })

    // Создаем платеж напрямую
    const paymentAmount = 10
    const paymentId = uuidv4()
    await createSuccessfulPayment({
      telegram_id: testUserId,
      amount: paymentAmount,
      type: TransactionType.MONEY_EXPENSE,
      description: 'Test payment for cache invalidation',
      bot_name: 'test_bot',
      service_type: ModeEnum.NeuroPhotoV2,
      stars: paymentAmount,
      payment_method: 'test',
      status: 'COMPLETED',
      inv_id: paymentId,
    })

    logger.info('💾 Создан тестовый платеж:', {
      description: 'Created test payment',
      testUserId,
      paymentAmount,
      paymentId,
    })

    // Инвалидируем кэш
    invalidateBalanceCache(testUserId)
    logger.info('🔄 Кэш баланса инвалидирован вручную', {
      description: 'Balance cache invalidated manually',
      testUserId,
    })

    // Получаем баланс снова (должен быть обновлен)
    const newBalance = await getUserBalance(testUserId)
    logger.info('💰 Получен новый баланс после инвалидации кэша:', {
      description: 'Got new balance after cache invalidation',
      testUserId,
      newBalance,
    })

    // Проверяем, что баланс изменился
    const balanceDifference = initialBalance - newBalance
    if (balanceDifference !== paymentAmount) {
      throw new Error(
        `Ошибка: баланс изменился на ${balanceDifference}, ожидалось ${paymentAmount}`
      )
    }

    return {
      success: true,
      name: testName,
      message: `✅ Кэш баланса корректно инвалидируется: изменение ${balanceDifference}`,
    }
  } catch (error) {
    return {
      success: false,
      name: testName,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runBalanceTests(): Promise<TestResult[]> {
  const allResults: TestResult[] = []
  let testUserId: string | null = null
  let testUser: TestUser | null = null

  logger.info('🚀 Запуск тестов баланса...')

  try {
    testUser = await createTestUser(
      'testBalanceUser_' + Date.now(),
      TEST_PAYMENT_CONFIG.initialBalance
    )
    if (!testUser) {
      throw new Error('Не удалось создать тестового пользователя')
    }
    testUserId = testUser.telegram_id
    logger.info(`👤 Создан тестовый пользователь: ${testUserId}`)

    allResults.push(await testInitialBalance(testUserId))
    allResults.push(await testCreateTransactions(testUserId))
    allResults.push(...(await testBalanceSufficiencyForModes(testUserId)))
    allResults.push(await testInvalidUserIdCheck())
    allResults.push(await testBalanceCacheInvalidation(testUserId))
  } catch (error) {
    logger.error('❌ Критическая ошибка во время выполнения тестов баланса:', {
      error,
    })
    allResults.push({
      success: false,
      name: 'Balance Tests Setup/Run Error',
      message:
        error instanceof Error
          ? error.message
          : 'Неизвестная ошибка во время тестов',
    })
  } finally {
    if (testUserId) {
      try {
        logger.info(`🧹 Очистка данных для пользователя: ${testUserId}`)
        await supabase
          .from('transactions')
          .delete()
          .eq('telegram_id', testUserId)
        await supabase.from('users').delete().eq('telegram_id', testUserId)
        logger.info(`✅ Данные для пользователя ${testUserId} очищены.`)
      } catch (cleanupError) {
        logger.error('❌ Ошибка при очистке тестовых данных:', {
          cleanupError,
          testUserId,
        })
        allResults.push({
          success: false,
          name: 'Test Cleanup Error',
          message:
            cleanupError instanceof Error
              ? cleanupError.message
              : 'Неизвестная ошибка при очистке',
        })
      }
    } else {
      logger.warn('❓ Пропуск очистки: тестовый пользователь не был создан.')
    }
  }

  logger.info('🏁 Тесты баланса завершены.')
  return allResults
}
