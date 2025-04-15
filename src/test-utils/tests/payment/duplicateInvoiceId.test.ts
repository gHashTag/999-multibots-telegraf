import { supabase } from '@/core/supabase'
// import { createTestUser } from '@/test-utils/helpers/createTestUser'
import { logger } from '@/utils/logger'
import { generateUniqueShortInvId } from '@/scenes/getRuBillWizard/helper'
import { createPendingPayment } from '@/core/supabase/createPendingPayment'
import { inngest } from '@/inngest-functions'
import assert from '@/test-utils/core/assert'
// import { PaymentTester } from './PaymentTester'
// import { mockSupabase } from '@/test-utils/mocks/supabase'
import { TestResult } from '@/test-utils/core/types'
import { TestCategory } from '@/test-utils/core/categories'
import { TransactionType } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/price/helpers/modelsCost'
import {
  createDbTestUser,
  trackTestUserId,
} from '@/test-utils/helpers/dbTestHelper'

// Test Data
const TEST_TELEGRAM_ID = '144022504' // Use a constant ID
const TEST_BOT_NAME = 'db_test_bot'

// Keep track of created invoice IDs within this test file for assertions
let createdInvoiceIds: string[] = []

// Helper function to reset state before each test
async function setupTestEnvironment() {
  createdInvoiceIds = []
  // No mock reset needed now

  // Ensure the test user exists in the DB for this run
  try {
    await createDbTestUser({
      telegram_id: TEST_TELEGRAM_ID,
      username: 'db_test_user',
      first_name: 'DB',
      last_name: 'Tester',
      is_ru: true,
      bot_name: TEST_BOT_NAME,
      balance: 1000, // Set initial balance if needed
    })
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      logger.warn(
        `[DuplicateInvoiceIdTest] Test user ${TEST_TELEGRAM_ID} already exists. Proceeding.`
      )
      // Track the ID even if creation failed due to existence
      trackTestUserId(TEST_TELEGRAM_ID)
    } else {
      logger.error(
        '[DuplicateInvoiceIdTest] Failed to ensure test user exists:',
        error
      )
      throw error // Rethrow unexpected errors
    }
  }
}

// --- Test Functions ---

/**
 * Проверяет, существует ли платеж с указанным ID (используя реальную БД)
 */
async function invoiceExists(invId: string | number): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('inv_id')
      .eq('inv_id', String(invId))
      .maybeSingle() // Use maybeSingle to handle null case gracefully

    if (error) {
      logger.error(
        '[DuplicateInvoiceIdTest] Error checking invoice existence:',
        { error, invId }
      )
      return false // Assume not exists on error?
    }
    return !!data
  } catch (error) {
    logger.error(
      '[DuplicateInvoiceIdTest] Unexpected error checking invoice:',
      { error, invId }
    )
    return false
  }
}

/**
 * Тестирует создание платежа с уникальным ID
 */
export async function testUniqueInvoiceId(): Promise<TestResult> {
  const testName = 'duplicateInvoiceId: Unique ID Creation'
  await setupTestEnvironment()
  const invId = await generateUniqueShortInvId(TEST_TELEGRAM_ID, 1)
  createdInvoiceIds.push(String(invId)) // Track for potential manual cleanup if needed within test

  try {
    // Проверяем, что такого ID еще нет в базе
    const exists = await invoiceExists(invId)
    assert.isFalse(
      exists,
      `${testName} - Invoice ID ${invId} should not exist yet`
    )
    if (exists) {
      return {
        success: false,
        name: testName,
        message: `Invoice ID ${invId} already exists unexpectedly`,
      }
    }

    // Создаем платеж
    const result = await createPendingPayment({
      telegram_id: TEST_TELEGRAM_ID,
      amount: 1,
      stars: 1,
      inv_id: String(invId),
      description: 'Test unique payment',
      bot_name: TEST_BOT_NAME,
      invoice_url: `https://example.com/invoice/${invId}`,
    })

    assert.isTrue(
      result.success,
      `${testName} - Payment should be created successfully`
    )

    // Проверяем, что платеж появился в базе
    const nowExists = await invoiceExists(invId)
    assert.isTrue(
      nowExists,
      `${testName} - Payment ${invId} should exist in DB after creation`
    )

    return {
      success: true,
      name: testName,
      message: `Payment with ID ${invId} successfully created`,
    }
  } catch (error: any) {
    logger.error(`[DuplicateInvoiceIdTest] Error in ${testName}:`, { error })
    return { success: false, name: testName, message: error.message, error }
  }
}
testUniqueInvoiceId.meta = { category: TestCategory.Payment }

/**
 * Тестирует попытку создания платежа с существующим ID
 */
export async function testDuplicateInvoiceId(): Promise<TestResult> {
  const testName = 'duplicateInvoiceId: Duplicate ID Handling'
  await setupTestEnvironment()
  const invId = await generateUniqueShortInvId(TEST_TELEGRAM_ID, 1)
  createdInvoiceIds.push(String(invId))

  try {
    // Проверяем, что такого ID еще нет в базе
    let exists = await invoiceExists(invId)
    assert.isFalse(
      exists,
      `${testName} - Invoice ID ${invId} should not exist yet (before first create)`
    )
    if (exists) {
      return {
        success: false,
        name: testName,
        message: `Invoice ID ${invId} already exists unexpectedly (before first create)`,
      }
    }

    // Создаем первый платеж
    const result1 = await createPendingPayment({
      telegram_id: TEST_TELEGRAM_ID,
      amount: 1,
      stars: 1,
      inv_id: String(invId),
      description: 'First test payment (duplicate test)',
      bot_name: TEST_BOT_NAME,
      invoice_url: `https://example.com/invoice/${invId}`,
    })
    assert.isTrue(
      result1.success,
      `${testName} - First payment should be created successfully`
    )

    // Убедимся, что он появился
    exists = await invoiceExists(invId)
    assert.isTrue(
      exists,
      `${testName} - Invoice ID ${invId} should exist after first create`
    )
    if (!exists) {
      return {
        success: false,
        name: testName,
        message: `Invoice ID ${invId} did not exist after first create`,
      }
    }

    // Пытаемся создать второй платеж с тем же ID
    let thrownError: any
    try {
      const result2 = await createPendingPayment({
        telegram_id: TEST_TELEGRAM_ID,
        amount: 2,
        stars: 2,
        inv_id: String(invId), // Same ID
        description: 'Second test payment (duplicate attempt)',
        bot_name: TEST_BOT_NAME,
        invoice_url: `https://example.com/invoice/${invId}`,
      })
      // Если платеж создался без ошибки - это провал теста
      return {
        success: false,
        name: testName,
        message: 'System allowed creating a duplicate payment ID',
      }
    } catch (error) {
      // Ожидаем ошибку уникальности ключа от базы данных
      thrownError = error
    }

    assert.ok(
      thrownError,
      `${testName} - Should have thrown an error on duplicate insert`
    )
    // Проверяем, что ошибка связана с дублированием ключа (зависит от текста ошибки Supabase/Postgres)
    const errorMessage =
      thrownError instanceof Error ? thrownError.message : String(thrownError)
    const isDuplicateKeyError =
      errorMessage.includes('duplicate key value violates unique constraint') ||
      errorMessage.includes('payments_v2_inv_id_key') // Check constraint name

    assert.isTrue(
      isDuplicateKeyError,
      `${testName} - Error message should indicate unique constraint violation. Got: ${errorMessage}`
    )

    return {
      success: true,
      name: testName,
      message: 'System correctly prevented duplicate payment ID',
    }
  } catch (error: any) {
    logger.error(`[DuplicateInvoiceIdTest] Error in ${testName}:`, { error })
    return { success: false, name: testName, message: error.message, error }
  }
}
testDuplicateInvoiceId.meta = { category: TestCategory.Payment }

/**
 * Тестирует процесс проверки статуса платежа (все еще релевантно)
 */
export async function testPaymentStatusCheck(): Promise<TestResult> {
  const testName = 'duplicateInvoiceId: Payment Status Check'
  await setupTestEnvironment()
  const invId = await generateUniqueShortInvId(TEST_TELEGRAM_ID, 1)
  createdInvoiceIds.push(String(invId))

  try {
    // Создаем платеж в статусе PENDING
    const createResult = await createPendingPayment({
      telegram_id: TEST_TELEGRAM_ID,
      amount: 1,
      stars: 1,
      inv_id: String(invId),
      description: 'Test payment for status check',
      bot_name: TEST_BOT_NAME,
      invoice_url: `https://example.com/invoice/${invId}`,
    })
    assert.isTrue(
      createResult.success,
      `${testName} - Failed to create initial pending payment`
    )

    // Проверяем статус платежа
    const { data: payment, error: selectError } = await supabase
      .from('payments_v2')
      .select('status')
      .eq('inv_id', String(invId))
      .single()

    assert.isNull(
      selectError,
      `${testName} - Error selecting payment status: ${selectError?.message}`
    )
    assert.isNotNull(payment, `${testName} - Payment should be found`)
    assert.strictEqual(
      payment?.status,
      'PENDING',
      `${testName} - Initial payment status should be PENDING`
    )

    // Обновляем статус платежа
    const { error: updateError } = await supabase
      .from('payments_v2')
      .update({ status: 'COMPLETED' })
      .eq('inv_id', String(invId))
    assert.isNull(
      updateError,
      `${testName} - Error updating payment status: ${updateError?.message}`
    )

    // Проверяем обновленный статус
    const { data: updatedPayment, error: selectUpdatedError } = await supabase
      .from('payments_v2')
      .select('status')
      .eq('inv_id', String(invId))
      .single()

    assert.isNull(
      selectUpdatedError,
      `${testName} - Error selecting updated status: ${selectUpdatedError?.message}`
    )
    assert.isNotNull(
      updatedPayment,
      `${testName} - Updated payment should be found`
    )
    assert.strictEqual(
      updatedPayment?.status,
      'COMPLETED',
      `${testName} - Payment status should be COMPLETED`
    )

    return {
      success: true,
      name: testName,
      message: 'Payment status check and update work correctly',
    }
  } catch (error: any) {
    logger.error(`[DuplicateInvoiceIdTest] Error in ${testName}:`, { error })
    return { success: false, name: testName, message: error.message, error }
  }
}
testPaymentStatusCheck.meta = { category: TestCategory.Payment }

/**
 * Тестирует обработку платежа с использованием Inngest события
 * Этот тест теперь больше проверяет, что повторная обработка не создает дубликат
 */
export async function testPaymentProcessingDuplicateCheck(): Promise<TestResult> {
  const testName = 'duplicateInvoiceId: Inngest Processing Duplicate Check'
  await setupTestEnvironment()
  const invId = await generateUniqueShortInvId(TEST_TELEGRAM_ID, 1)
  createdInvoiceIds.push(String(invId))

  try {
    // Создаем платеж в статусе PENDING
    const createResult = await createPendingPayment({
      telegram_id: TEST_TELEGRAM_ID,
      amount: 1,
      stars: 1,
      inv_id: String(invId),
      description: 'Test payment for Inngest processing check',
      bot_name: TEST_BOT_NAME,
      invoice_url: `https://example.com/invoice/${invId}`,
    })
    assert.isTrue(
      createResult.success,
      `${testName} - Failed to create initial pending payment`
    )

    // Отправляем событие обработки платежа (как будто оно пришло от платежной системы)
    // Payment processor должен использовать inv_id для идемпотентности
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: TEST_TELEGRAM_ID,
        amount: 1, // Сумма из платежа
        stars: 1,
        type: TransactionType.MONEY_INCOME, // Тип = пополнение
        description: 'Test Inngest processing',
        bot_name: TEST_BOT_NAME,
        inv_id: String(invId), // Передаем ID инвойса
        service_type: ModeEnum.TopUpBalance,
        metadata: { source: 'robokassa_test' },
      },
    })

    // Даем немного времени на обработку (в реальных тестах лучше использовать waitFor)
    await new Promise(resolve => setTimeout(resolve, 500))

    // Проверяем, что платеж теперь COMPLETED и запись одна
    const {
      data: payments,
      count,
      error,
    } = await supabase
      .from('payments_v2')
      .select('status', { count: 'exact' })
      .eq('inv_id', String(invId))

    assert.isNull(
      error,
      `${testName} - Error checking payment after processing: ${error?.message}`
    )
    assert.equal(
      count,
      1,
      `${testName} - Should be only one payment record with inv_id ${invId}. Found: ${count}`
    )
    assert.isTrue(
      payments && payments.length === 1,
      `${testName} - Payment record should exist`
    )
    assert.equal(
      payments?.[0]?.status,
      'COMPLETED',
      `${testName} - Payment status should be COMPLETED after processing`
    )

    return {
      success: true,
      name: testName,
      message: 'Inngest processing handled duplicate check correctly',
    }
  } catch (error: any) {
    logger.error(`[DuplicateInvoiceIdTest] Error in ${testName}:`, { error })
    return { success: false, name: testName, message: error.message, error }
  }
}
testPaymentProcessingDuplicateCheck.meta = { category: TestCategory.Payment }

// УДАЛИТЬ: Старый тестер и его логику
// class DuplicateInvoiceIdTester { ... }

// --- Runner Function ---

export async function runDuplicateInvoiceIdTests(
  options: { verbose?: boolean } = {}
): Promise<TestResult[]> {
  logger.info('🧪 Запуск тестов дублирующихся ID инвойсов...')
  const tests = [
    testUniqueInvoiceId,
    testDuplicateInvoiceId,
    testPaymentStatusCheck,
    testPaymentProcessingDuplicateCheck,
    // Добавить другие тесты если нужно
  ]
  const results: TestResult[] = []

  // Запускаем тесты последовательно
  for (const test of tests) {
    try {
      results.push(await test())
    } catch (error) {
      logger.error(
        `🔥 Критическая ошибка при выполнении теста ${test.name}:`,
        error
      )
      results.push({
        name: test.name || 'Unknown Test',
        success: false,
        message: `Critical error during test execution: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }
  logger.info('🏁 Тесты дублирующихся ID инвойсов завершены.')
  return results
}

// Если запускается напрямую
if (require.main === module) {
  runDuplicateInvoiceIdTests({ verbose: true })
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      logger.error('❌ Ошибка при запуске тестов', {
        description: 'Error running tests',
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    })
}
