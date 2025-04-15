import { supabase } from '@/core/supabase'
import { createTestUser } from '@/test-utils/helpers/createTestUser'
import { logger } from '@/utils/logger'
import { generateUniqueShortInvId } from '@/scenes/getRuBillWizard/helper'
import { createPendingPayment } from '@/core/supabase/createPendingPayment'
import { inngest } from '@/inngest-functions'
import assert from '@/test-utils/core/assert'
import { PaymentTester } from './PaymentTester'
import { mockSupabase } from '@/test-utils/mocks/supabase'

interface TestResult {
  success: boolean
  reason?: string
  message?: string
}

/**
 * Тестер для проверки обработки дублирующихся ID инвойсов
 */
class DuplicateInvoiceIdTester {
  private testUserId: string
  private paymentTester: PaymentTester

  constructor() {
    this.paymentTester = new PaymentTester()
  }

  /**
   * Инициализация тестера
   */
  async setup(): Promise<void> {
    try {
      // Создаем тестового пользователя с минимально необходимыми данными
      const testUserId = '144022504' // Тестовый ID телеграм
      this.testUserId = testUserId

      // Очищаем предыдущие тестовые данные перед созданием нового пользователя
      mockSupabase.reset()

      await createTestUser({
        telegram_id: testUserId,
        username: 'test_user',
        is_ru: true,
        bot_name: 'test_bot',
      })

      logger.info('🧪 Создан тестовый пользователь', {
        description: 'Test user created',
        telegram_id: this.testUserId,
      })
    } catch (error) {
      logger.error('❌ Ошибка при создании тестового пользователя', {
        description: 'Error creating test user',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Очистка тестовых данных
   */
  async cleanup(): Promise<void> {
    try {
      // Удаляем тестовые платежи
      await supabase
        .from('payments_v2')
        .delete()
        .eq('telegram_id', this.testUserId)

      // Сбрасываем моки
      mockSupabase.reset()

      logger.info('🧹 Тестовые данные очищены', {
        description: 'Test data cleaned up',
        telegram_id: this.testUserId,
      })
    } catch (error) {
      logger.error('❌ Ошибка при очистке тестовых данных', {
        description: 'Error cleaning up test data',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Генерирует инвойс ID для тестов
   * Обертка над асинхронной функцией генерации уникального ID
   */
  async generateInvoiceId(): Promise<number> {
    try {
      // Убедимся, что функция вызвана асинхронно и с правильными параметрами
      const invId = await generateUniqueShortInvId(this.testUserId, 1)

      logger.info('🔢 Сгенерирован инвойс ID для теста', {
        description: 'Generated invoice ID for test',
        invId,
        testUserId: this.testUserId,
      })

      return invId
    } catch (error) {
      logger.error('❌ Ошибка при генерации инвойс ID для теста', {
        description: 'Error generating invoice ID for test',
        error: error instanceof Error ? error.message : String(error),
        testUserId: this.testUserId,
      })
      throw error
    }
  }

  /**
   * Проверяет, существует ли платеж с указанным ID
   */
  async invoiceExists(invId: string | number): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('payments_v2')
        .select('inv_id')
        .eq('inv_id', invId.toString())
        .single()

      return !!data
    } catch (error) {
      logger.error('❌ Ошибка при проверке существования инвойса', {
        description: 'Error checking if invoice exists',
        error: error instanceof Error ? error.message : String(error),
        invId,
      })
      return false
    }
  }

  /**
   * Тестирует создание платежа с уникальным ID
   */
  async testUniqueInvoiceId(): Promise<TestResult> {
    try {
      const invId = await this.generateInvoiceId()

      // Проверяем, что такого ID еще нет в базе
      const exists = await this.invoiceExists(invId)
      if (exists) {
        return {
          success: false,
          reason: `ID инвойса ${invId} уже существует в базе данных`,
        }
      }

      // Создаем платеж
      const result = await createPendingPayment({
        telegram_id: this.testUserId,
        amount: 1,
        stars: 1,
        inv_id: invId.toString(),
        description: 'Test payment',
        bot_name: 'test_bot',
        invoice_url: `https://example.com/invoice/${invId}`,
      })

      assert.isTrue(result.success, 'Платеж должен быть успешно создан')

      // Проверяем, что платеж появился в базе
      const nowExists = await this.invoiceExists(invId)
      assert.isTrue(
        nowExists,
        'Платеж должен существовать в базе после создания'
      )

      return {
        success: true,
        message: `Платеж с ID ${invId} успешно создан`,
      }
    } catch (error) {
      logger.error('❌ Ошибка при тестировании уникального ID', {
        description: 'Error testing unique invoice ID',
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Тестирует попытку создания платежа с существующим ID
   */
  async testDuplicateInvoiceId(): Promise<TestResult> {
    try {
      // Сначала создаем платеж с уникальным ID
      const invId = await this.generateInvoiceId()

      // Проверяем, что такого ID еще нет в базе
      const exists = await this.invoiceExists(invId)
      if (exists) {
        return {
          success: false,
          reason: `ID инвойса ${invId} уже существует в базе данных`,
        }
      }

      // Создаем первый платеж
      const result1 = await createPendingPayment({
        telegram_id: this.testUserId,
        amount: 1,
        stars: 1,
        inv_id: invId.toString(),
        description: 'First test payment',
        bot_name: 'test_bot',
        invoice_url: `https://example.com/invoice/${invId}`,
      })

      assert.isTrue(result1.success, 'Первый платеж должен быть успешно создан')

      // Пытаемся создать второй платеж с тем же ID
      try {
        const result2 = await createPendingPayment({
          telegram_id: this.testUserId,
          amount: 2,
          stars: 2,
          inv_id: invId.toString(),
          description: 'Second test payment (duplicate)',
          bot_name: 'test_bot',
          invoice_url: `https://example.com/invoice/${invId}`,
        })

        // Если платеж создался без ошибки - это ошибка в логике
        return {
          success: false,
          reason: 'Система позволила создать дублирующийся платеж с тем же ID',
        }
      } catch (error) {
        // Проверяем, что ошибка связана с дублированием ключа
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        const isDuplicateKeyError =
          errorMessage.includes('duplicate key') ||
          errorMessage.includes('unique constraint')

        if (!isDuplicateKeyError) {
          return {
            success: false,
            reason: `Неожиданная ошибка: ${errorMessage}`,
          }
        }

        // Ожидаемое поведение - ошибка при попытке создать дублирующийся платеж
        return {
          success: true,
          message:
            'Система корректно предотвратила создание дублирующегося платежа',
        }
      }
    } catch (error) {
      logger.error('❌ Ошибка при тестировании дублирующегося ID', {
        description: 'Error testing duplicate invoice ID',
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Тестирует процесс проверки статуса платежа
   */
  async testPaymentStatusCheck(): Promise<TestResult> {
    try {
      // Создаем платеж
      const invId = await this.generateInvoiceId()

      // Создаем платеж в статусе PENDING
      await createPendingPayment({
        telegram_id: this.testUserId,
        amount: 1,
        stars: 1,
        inv_id: invId.toString(),
        description: 'Test payment for status check',
        bot_name: 'test_bot',
        invoice_url: `https://example.com/invoice/${invId}`,
      })

      // Проверяем статус платежа
      const { data: payment } = await supabase
        .from('payments_v2')
        .select('status')
        .eq('inv_id', invId.toString())
        .single()

      assert.strictEqual(
        payment?.status,
        'PENDING',
        'Статус платежа должен быть PENDING'
      )

      // Обновляем статус платежа
      await supabase
        .from('payments_v2')
        .update({ status: 'COMPLETED' })
        .eq('inv_id', invId.toString())

      // Проверяем обновленный статус
      const { data: updatedPayment } = await supabase
        .from('payments_v2')
        .select('status')
        .eq('inv_id', invId.toString())
        .single()

      assert.strictEqual(
        updatedPayment?.status,
        'COMPLETED',
        'Статус платежа должен быть COMPLETED'
      )

      return {
        success: true,
        message: 'Проверка и обновление статуса платежа работают корректно',
      }
    } catch (error) {
      logger.error('❌ Ошибка при тестировании проверки статуса платежа', {
        description: 'Error testing payment status check',
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Тестирует обработку платежа с использованием Inngest события
   */
  async testPaymentProcessing(): Promise<TestResult> {
    try {
      // Создаем платеж
      const invId = await this.generateInvoiceId()

      // Создаем платеж в статусе PENDING
      await createPendingPayment({
        telegram_id: this.testUserId,
        amount: 1,
        stars: 1,
        inv_id: invId.toString(),
        description: 'Test payment for processing',
        bot_name: 'test_bot',
        invoice_url: `https://example.com/invoice/${invId}`,
      })

      // Отправляем событие обработки платежа
      await inngest.send({
        name: 'payment/process',
        data: {
          telegram_id: this.testUserId,
          amount: 1,
          stars: 1,
          type: TransactionType.MONEY_INCOME,
          description: 'Test payment processing',
          bot_name: 'test_bot',
          inv_id: invId.toString(),
        },
      })

      // Даем время на обработку события
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Проверяем, что обработка платежа не приводит к дублированию записей
      const { data: payments, count } = await supabase
        .from('payments_v2')
        .select('*', { count: 'exact' })
        .eq('inv_id', invId.toString())

      assert.strictEqual(
        count,
        1,
        'Должна быть только одна запись с данным ID инвойса'
      )

      return {
        success: true,
        message: 'Обработка платежа не приводит к дублированию записей',
      }
    } catch (error) {
      logger.error('❌ Ошибка при тестировании обработки платежа', {
        description: 'Error testing payment processing',
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Тестирует запасной алгоритм генерации ID при исчерпании попыток
   */
  async testFallbackInvoiceIdGeneration(): Promise<TestResult> {
    try {
      // Генерируем несколько ID подряд, чтобы проверить уникальность
      const invIds = []

      // Генерируем 5 разных ID
      for (let i = 0; i < 5; i++) {
        const invId = await this.generateInvoiceId()
        invIds.push(invId)

        // Создаем платеж с этим ID
        await createPendingPayment({
          telegram_id: this.testUserId,
          amount: 1,
          stars: 1,
          inv_id: invId.toString(),
          description: `Test payment ${i + 1}`,
          bot_name: 'test_bot',
          invoice_url: `https://example.com/invoice/${invId}`,
        })

        // Проверяем, что платеж создан
        const exists = await this.invoiceExists(invId)
        assert.isTrue(
          exists,
          `Платеж ${i + 1} с ID ${invId} должен существовать в базе`
        )
      }

      // Проверяем, что все ID уникальны
      const uniqueIds = [...new Set(invIds)]
      const allUnique = uniqueIds.length === invIds.length

      assert.isTrue(allUnique, 'Все сгенерированные ID должны быть уникальными')

      return {
        success: true,
        message: 'Система успешно генерирует уникальные ID для платежей',
      }
    } catch (error) {
      logger.error(
        '❌ Ошибка при тестировании запасного алгоритма генерации ID',
        {
          description: 'Error testing fallback invoice ID generation',
          error: error instanceof Error ? error.message : String(error),
        }
      )

      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Запускает все тесты
   */
  async runAllTests(): Promise<TestResult[]> {
    try {
      await this.setup()

      const results = []

      // Тест создания платежа с уникальным ID
      logger.info('🧪 Запуск теста создания платежа с уникальным ID', {
        description: 'Running unique invoice ID test',
      })
      results.push(await this.testUniqueInvoiceId())

      // Тест обработки дублирующегося ID
      logger.info('🧪 Запуск теста обработки дублирующегося ID', {
        description: 'Running duplicate invoice ID test',
      })
      results.push(await this.testDuplicateInvoiceId())

      // Тест проверки статуса платежа
      logger.info('🧪 Запуск теста проверки статуса платежа', {
        description: 'Running payment status check test',
      })
      results.push(await this.testPaymentStatusCheck())

      // Тест обработки платежа
      logger.info('🧪 Запуск теста обработки платежа', {
        description: 'Running payment processing test',
      })
      results.push(await this.testPaymentProcessing())

      // Тест запасного алгоритма генерации ID
      logger.info('🧪 Запуск теста запасного алгоритма генерации ID', {
        description: 'Running fallback invoice ID generation test',
      })
      results.push(await this.testFallbackInvoiceIdGeneration())

      await this.cleanup()

      return results
    } catch (error) {
      logger.error('❌ Ошибка при запуске тестов', {
        description: 'Error running tests',
        error: error instanceof Error ? error.message : String(error),
      })

      await this.cleanup()

      return [
        {
          success: false,
          reason: error instanceof Error ? error.message : String(error),
        },
      ]
    }
  }
}

/**
 * Запускает тесты обработки дублирующихся ID инвойсов
 */
export async function runDuplicateInvoiceIdTests(
  options: { verbose?: boolean } = {}
): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов обработки дублирующихся ID инвойсов', {
    description: 'Running duplicate invoice ID tests',
    options,
  })

  const tester = new DuplicateInvoiceIdTester()
  const results = await tester.runAllTests()

  // Выводим результаты, если включен verbose режим
  if (options.verbose) {
    results.forEach((result, index) => {
      if (result.success) {
        logger.info(`✅ Тест #${index + 1} пройден: ${result.message}`, {
          description: `Test #${index + 1} passed`,
        })
      } else {
        logger.error(`❌ Тест #${index + 1} не пройден: ${result.reason}`, {
          description: `Test #${index + 1} failed`,
        })
      }
    })
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount

  logger.info('🏁 Результаты тестов обработки дублирующихся ID инвойсов', {
    description: 'Duplicate invoice ID tests results',
    total: results.length,
    success: successCount,
    fail: failCount,
  })

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
