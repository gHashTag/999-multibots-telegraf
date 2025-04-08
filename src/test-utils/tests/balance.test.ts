import { logger } from '@/utils/logger'
import { TestResult } from '@/test-utils/types'
import { TEST_CONFIG } from '@/test-utils/test-config'
import { InngestTestEngine } from '@/test-utils/inngest-test-engine'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'

// Создаем один экземпляр для всех тестов
const inngestTestEngine = new InngestTestEngine()

export async function runBalanceTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    logger.info('🚀 Запуск тестов баланса', {
      description: 'Starting balance tests',
      test_user_id: TEST_CONFIG.TEST_TELEGRAM_ID,
    })

    // Инициализируем тестовый движок
    await inngestTestEngine.init()

    // Очищаем предыдущие тестовые данные
    await Promise.all([
      supabase
        .from('users')
        .delete()
        .eq('telegram_id', TEST_CONFIG.TEST_TELEGRAM_ID)
        .eq('bot_name', TEST_CONFIG.TEST_BOT_NAME),
      supabase
        .from('payments_v2')
        .delete()
        .eq('telegram_id', TEST_CONFIG.TEST_TELEGRAM_ID)
        .eq('bot_name', TEST_CONFIG.TEST_BOT_NAME),
    ])

    // Создаем тестового пользователя
    const { error: createError } = await supabase.from('users').insert({
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      username: `test_user_${TEST_CONFIG.TEST_TELEGRAM_ID}`,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
    })

    if (createError) {
      throw createError
    }

    // Регистрируем обработчик платежей
    inngestTestEngine.registerEventHandler(
      'payment/process',
      async ({ event }: { event: any }) => {
        logger.info('💰 Processing test payment:', {
          description: 'Processing test payment',
          eventData: event.data,
        })
        return { success: true }
      }
    )

    logger.info('✅ Обработчик платежей зарегистрирован успешно', {
      description: 'Payment handler registered successfully',
    })

    // Проверяем начальный баланс
    const initialBalance = await getUserBalance(TEST_CONFIG.TEST_TELEGRAM_ID)

    results.push({
      success: initialBalance === 0,
      name: 'Initial Balance Test',
      message:
        initialBalance === 0
          ? '✅ Начальный баланс равен 0'
          : `❌ Ошибка: начальный баланс ${initialBalance}, ожидалось 0`,
      startTime: Date.now(),
    })

    // Пополняем баланс
    try {
      await inngestTestEngine.send({
        name: 'payment/process',
        data: {
          telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
          amount: 100,
          type: 'money_income',
          description: 'Test balance add',
          bot_name: TEST_CONFIG.TEST_BOT_NAME,
          service_type: ModeEnum.TopUpBalance,
        },
      })

      logger.info('✅ Событие платежа отправлено успешно', {
        description: 'Payment event sent successfully',
      })
    } catch (error) {
      logger.error('❌ Ошибка при отправке события платежа:', {
        description: 'Error sending payment event',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    // Ждем обработки платежа и проверяем баланс
    await new Promise(resolve => setTimeout(resolve, 1000))
    const balanceAfterAdd = await getUserBalance(TEST_CONFIG.TEST_TELEGRAM_ID)

    results.push({
      success: balanceAfterAdd === 100,
      name: 'Balance After Add Test',
      message:
        balanceAfterAdd === 100
          ? '✅ Баланс после пополнения равен 100'
          : `❌ Ошибка: баланс после пополнения ${balanceAfterAdd}, ожидалось 100`,
      startTime: Date.now(),
    })

    logger.info('✅ Все тесты баланса пройдены успешно', {
      description: 'All balance tests passed successfully',
    })

    // Очищаем тестовые данные
    await Promise.all([
      supabase
        .from('users')
        .delete()
        .eq('telegram_id', TEST_CONFIG.TEST_TELEGRAM_ID)
        .eq('bot_name', TEST_CONFIG.TEST_BOT_NAME),
      supabase
        .from('payments_v2')
        .delete()
        .eq('telegram_id', TEST_CONFIG.TEST_TELEGRAM_ID)
        .eq('bot_name', TEST_CONFIG.TEST_BOT_NAME),
    ])

    return results
  } catch (error) {
    logger.error('❌ Ошибка в тестах баланса:', {
      description: 'Error in balance tests',
      error: error instanceof Error ? error.message : String(error),
    })

    results.push({
      success: false,
      name: 'Balance Tests',
      message: 'Ошибка в тестах баланса',
      error: error instanceof Error ? error : new Error(String(error)),
      startTime: Date.now(),
    })

    return results
  }
}
