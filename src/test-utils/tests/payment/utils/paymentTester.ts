import { supabase } from '@/core/supabase'
import { TelegramId } from '@/interfaces/telegram.interface'
import {
  PaymentStatus,
  TransactionType,
  ModeEnum,
} from '@/interfaces/payments.interface'
import { getUserBalance } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TEST_PAYMENT_CONFIG } from './testConfig'

/**
 * Класс для тестирования платежной системы
 * Содержит общие методы для проверки различных аспектов платежной системы
 */
export class PaymentTester {
  /**
   * Создает экземпляр класса PaymentTester
   */
  constructor() {
    logger.info('🔍 Инициализация PaymentTester для тестов платежной системы', {
      description: 'Initializing PaymentTester for payment system tests',
    })
  }

  /**
   * Проверяет, достаточно ли у пользователя средств на балансе
   * @param userId - Telegram ID пользователя
   * @param amount - Необходимая сумма
   * @returns true, если баланс достаточен, иначе false
   */
  async checkBalance(userId: string, amount: number): Promise<boolean> {
    try {
      const balance = await getUserBalance(userId)

      logger.info('💰 Проверка баланса пользователя', {
        description: 'Checking user balance',
        userId,
        balance,
        requiredAmount: amount,
        sufficient: balance >= amount,
      })

      return balance >= amount
    } catch (error) {
      logger.error('❌ Ошибка при проверке баланса', {
        description: 'Error checking balance',
        userId,
        amount,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Создает тестового пользователя с заданным балансом
   * @param telegramId - Telegram ID пользователя
   * @param initialBalance - Начальный баланс (по умолчанию из конфига)
   * @returns true, если пользователь успешно создан или уже существует
   */
  async createTestUser(
    telegramId: TelegramId,
    initialBalance: number = TEST_PAYMENT_CONFIG.testUser.initialBalance
  ): Promise<boolean> {
    try {
      // Проверяем, существует ли пользователь
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single()

      if (existingUser) {
        // Обновляем баланс существующего пользователя
        const { error: updateError } = await supabase
          .from('users')
          .update({ balance: initialBalance })
          .eq('telegram_id', telegramId)

        if (updateError) {
          throw new Error(`Ошибка обновления баланса: ${updateError.message}`)
        }

        logger.info('✅ Обновлен тестовый пользователь', {
          description: 'Test user updated',
          telegramId,
          initialBalance,
        })
      } else {
        // Создаем нового пользователя
        const { error: insertError } = await supabase.from('users').insert({
          telegram_id: telegramId,
          balance: initialBalance,
          language: TEST_PAYMENT_CONFIG.testUser.language,
        })

        if (insertError) {
          throw new Error(
            `Ошибка создания пользователя: ${insertError.message}`
          )
        }

        logger.info('✅ Создан тестовый пользователь', {
          description: 'Test user created',
          telegramId,
          initialBalance,
        })
      }

      return true
    } catch (error) {
      logger.error('❌ Ошибка при создании тестового пользователя', {
        description: 'Error creating test user',
        telegramId,
        initialBalance,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Проверяет создание платежа в базе данных
   * @param telegramId - Telegram ID пользователя
   * @param amount - Сумма платежа
   * @param status - Статус платежа (по умолчанию PENDING)
   * @returns true, если платеж найден
   */
  async checkPaymentCreated(
    telegramId: TelegramId,
    amount: number,
    status: PaymentStatus = 'PENDING'
  ): Promise<boolean> {
    try {
      const { data: payment, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('telegram_id', telegramId.toString())
        .eq('amount', amount)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        throw new Error(`Ошибка при проверке платежа: ${error.message}`)
      }

      logger.info('🧾 Проверка создания платежа', {
        description: 'Checking payment creation',
        telegramId,
        amount,
        status,
        found: !!payment,
      })

      return !!payment
    } catch (error) {
      logger.error('❌ Ошибка при проверке создания платежа', {
        description: 'Error checking payment creation',
        telegramId,
        amount,
        status,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Проверяет обновление баланса пользователя
   * @param telegramId - Telegram ID пользователя
   * @param expectedBalance - Ожидаемый баланс
   * @returns true, если баланс соответствует ожидаемому
   */
  async checkBalanceUpdated(
    telegramId: TelegramId,
    expectedBalance: number
  ): Promise<boolean> {
    try {
      const balance = await getUserBalance(telegramId.toString())

      logger.info('💰 Проверка обновления баланса', {
        description: 'Checking balance update',
        telegramId,
        expectedBalance,
        actualBalance: balance,
        matches: balance === expectedBalance,
      })

      return balance === expectedBalance
    } catch (error) {
      logger.error('❌ Ошибка при проверке обновления баланса', {
        description: 'Error checking balance update',
        telegramId,
        expectedBalance,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Проверяет статус платежа
   * @param invId - ID инвойса
   * @param expectedStatus - Ожидаемый статус
   * @returns true, если статус соответствует ожидаемому
   */
  async checkPaymentStatus(
    invId: string,
    expectedStatus: PaymentStatus
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('payments_v2')
        .select('status')
        .eq('inv_id', invId)
        .single()

      if (error) {
        throw new Error(`Ошибка при проверке статуса платежа: ${error.message}`)
      }

      logger.info('🔍 Проверка статуса платежа', {
        description: 'Checking payment status',
        invId,
        expectedStatus,
        actualStatus: data?.status,
        matches: data?.status === expectedStatus,
      })

      return data?.status === expectedStatus
    } catch (error) {
      logger.error('❌ Ошибка при проверке статуса платежа', {
        description: 'Error checking payment status',
        invId,
        expectedStatus,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Проверяет историю платежей пользователя
   * @param telegramId - Telegram ID пользователя
   * @param expectedCount - Ожидаемое количество платежей
   * @returns true, если количество соответствует ожидаемому
   */
  async checkPaymentHistory(
    telegramId: TelegramId,
    expectedCount: number
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('telegram_id', telegramId.toString())

      if (error) {
        throw new Error(
          `Ошибка при проверке истории платежей: ${error.message}`
        )
      }

      logger.info('📝 Проверка истории платежей', {
        description: 'Checking payment history',
        telegramId,
        expectedCount,
        actualCount: data?.length || 0,
        matches: (data?.length || 0) === expectedCount,
      })

      return (data?.length || 0) === expectedCount
    } catch (error) {
      logger.error('❌ Ошибка при проверке истории платежей', {
        description: 'Error checking payment history',
        telegramId,
        expectedCount,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Проверяет существование платежа по operation_id
   * @param operationId - ID операции
   * @returns true, если платеж с таким operation_id существует
   */
  async checkPaymentExistsByOperationId(operationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('payments_v2')
        .select('id')
        .eq('operation_id', operationId)
        .limit(1)

      if (error) {
        throw new Error(
          `Ошибка при проверке платежа по operation_id: ${error.message}`
        )
      }

      logger.info('🔍 Проверка существования платежа по operation_id', {
        description: 'Checking payment existence by operation_id',
        operationId,
        exists: data && data.length > 0,
      })

      return data && data.length > 0
    } catch (error) {
      logger.error('❌ Ошибка при проверке платежа по operation_id', {
        description: 'Error checking payment by operation_id',
        operationId,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Проверяет корректное создание платежа для выбранной модели
   * @param telegramId - Telegram ID пользователя
   * @param modelName - Название модели
   * @param cost - Стоимость модели
   * @returns true, если платеж корректно создан
   */
  async checkModelPaymentCreated(
    telegramId: TelegramId,
    modelName: string,
    cost: number
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('telegram_id', telegramId.toString())
        .eq('amount', cost)
        .eq('status', 'COMPLETED')
        .eq('description', `Оплата модели: ${modelName}`)
        .eq('type', 'money_expense')
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
        throw new Error(
          `Ошибка при проверке платежа за модель: ${error.message}`
        )
      }

      logger.info('🧾 Проверка создания платежа за модель', {
        description: 'Checking model payment creation',
        telegramId,
        modelName,
        cost,
        found: data && data.length > 0,
      })

      return data && data.length > 0
    } catch (error) {
      logger.error('❌ Ошибка при проверке платежа за модель', {
        description: 'Error checking model payment',
        telegramId,
        modelName,
        cost,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Очищает тестовые данные (платежи и транзакции) для пользователя
   * @param telegramId - Telegram ID пользователя
   * @returns true, если данные успешно очищены
   */
  async cleanupTestData(telegramId: TelegramId): Promise<boolean> {
    try {
      // Удаляем платежи пользователя
      const { error: paymentsError } = await supabase
        .from('payments_v2')
        .delete()
        .eq('telegram_id', telegramId.toString())
        .eq('description', 'like', '%TEST%')

      if (paymentsError) {
        throw new Error(
          `Ошибка при удалении тестовых платежей: ${paymentsError.message}`
        )
      }

      logger.info('🧹 Очистка тестовых данных', {
        description: 'Cleaning up test data',
        telegramId,
        success: true,
      })

      return true
    } catch (error) {
      logger.error('❌ Ошибка при очистке тестовых данных', {
        description: 'Error cleaning test data',
        telegramId,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }
}
