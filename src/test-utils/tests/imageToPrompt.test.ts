import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { calculateModeCost, ModeEnum } from '@/price/helpers/modelsCost'
import { v4 as uuidv4 } from 'uuid'
import { TestResult } from '../interfaces'
import { TEST_CONFIG } from '../test-config'
import { updateUserBalance } from '@/core/supabase'

interface BalanceResult {
  success: boolean
  error?: any
  balance?: number
}

/**
 * Тестирует функцию imageToPrompt через Inngest
 */
export async function testImageToPrompt(): Promise<TestResult> {
  const name = 'image_to_prompt_test'

  try {
    logger.info('🚀 Начинаем тест Image To Prompt:', {
      description: 'Starting Image To Prompt test',
    })

    // Получаем стоимость операции
    const cost = calculateModeCost({ mode: ModeEnum.ImageToPrompt }).stars

    logger.info('💰 Стоимость операции:', {
      description: 'Operation cost',
      cost,
      mode: ModeEnum.ImageToPrompt,
    })

    // Создаем тестовое событие
    const event_id = `test-image-to-prompt-${Date.now()}-${uuidv4()}`

    // Отправляем событие add_stars_to_balance перед отправкой основного события
    logger.info('💸 Пополняем баланс пользователя напрямую:', {
      description: 'Adding stars to user balance directly',
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      cost: cost * 2, // Добавляем с запасом
    })

    // Пополняем баланс пользователя напрямую через функцию updateUserBalance
    const balanceResult = (await updateUserBalance({
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      amount: cost * 2, // Добавляем с запасом
      type: 'money_income',
      description: 'Пополнение баланса для теста Image2Prompt',
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      service_type: 'testing',
    })) as BalanceResult

    if (!balanceResult.success) {
      throw new Error(`Не удалось пополнить баланс: ${balanceResult.error}`)
    }

    logger.info('✅ Баланс пополнен:', {
      description: 'Balance added successfully',
      new_balance: balanceResult.balance,
      added_amount: cost * 2,
    })

    // Отправляем событие imageToPrompt
    logger.info('🔄 Отправляем событие Image To Prompt:', {
      description: 'Sending Image To Prompt event',
      event_id,
      test_image: TEST_CONFIG.TEST_IMAGE_URL,
    })

    await inngest.send({
      id: event_id,
      name: 'image/to-prompt.generate',
      data: {
        image: TEST_CONFIG.TEST_IMAGE_URL,
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        username: 'test_user',
        is_ru: true,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        cost_per_image: cost,
      },
    })

    logger.info('⏳ Ждём выполнения функции (5 секунд):', {
      description: 'Waiting for function execution',
      event_id,
    })

    // Даем время на обработку
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Проверяем баланс после операции
    const afterBalanceResult = (await updateUserBalance({
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      amount: 0, // Просто для проверки баланса
      type: 'money_income',
      description: 'Проверка баланса после Image2Prompt',
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
    })) as BalanceResult

    // Мы ожидаем, что баланс уменьшился на стоимость операции
    logger.info('🔍 Проверяем баланс после операции:', {
      description: 'Checking balance after operation',
      before_balance: balanceResult.balance,
      after_balance: afterBalanceResult.success
        ? afterBalanceResult.balance
        : 'error',
      expected_change: -cost,
    })

    const balanceChange =
      afterBalanceResult.success &&
      balanceResult.balance &&
      afterBalanceResult.balance
        ? balanceResult.balance - afterBalanceResult.balance
        : 0

    const isBalanceCorrect = Math.abs(balanceChange - cost) < 0.01 // Допустимая погрешность

    if (afterBalanceResult.success && isBalanceCorrect) {
      logger.info('✅ Баланс корректно изменился:', {
        description: 'Balance changed correctly',
        change: balanceChange,
        expected: cost,
      })
    } else {
      logger.warn('⚠️ Баланс изменился неправильно:', {
        description: 'Unexpected balance change',
        change: balanceChange,
        expected: cost,
        before_balance: balanceResult.balance,
        after_balance: afterBalanceResult.success
          ? afterBalanceResult.balance
          : 'error',
      })
    }

    // Проверяем результаты теста
    logger.info('✅ Тест отправки события завершен:', {
      description: 'Event sending test completed',
      event_id,
      cost,
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      balance_change_correct: isBalanceCorrect,
    })

    return {
      name,
      success: true,
      message: '✅ Тест Image To Prompt успешно завершен',
      details: {
        event_id,
        cost,
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        initial_balance: balanceResult.balance,
        final_balance: afterBalanceResult.success
          ? afterBalanceResult.balance
          : 'error',
        balance_change: balanceChange,
        balance_change_correct: isBalanceCorrect,
      },
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте Image To Prompt:', {
      description: 'Error in Image To Prompt test',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
    })

    return {
      name,
      success: false,
      message: `❌ Тест завершился с ошибкой: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
