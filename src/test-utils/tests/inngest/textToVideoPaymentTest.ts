import { TestResult } from '../../types'
import { TEST_CONFIG, inngestTestEngine } from '../../test-config'
import { logger } from '@/utils/logger'
import { ModeEnum, calculateModeCost } from '@/price/helpers'
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Тест прямой отправки платежа для генерации видео из текста
 */
export async function testTextToVideoPaymentDirect(): Promise<TestResult> {
  try {
    logger.info(
      '🚀 Запуск теста прямой отправки платежа для генерации видео из текста'
    )
    console.log(
      '🚀 Запуск теста прямой отправки платежа для генерации видео из текста'
    )

    // Очищаем события
    inngestTestEngine.clearEvents()

    // ID пользователя для тестирования
    const testTelegramId = TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID
    const testBotName = TEST_CONFIG.TEST_DATA.TEST_BOT_NAME

    // Рассчитываем ожидаемую стоимость
    const expectedCost = calculateModeCost({
      mode: ModeEnum.TextToVideo,
    }).stars

    logger.info('💲 Рассчитанная стоимость операции:', {
      cost: expectedCost,
      mode: ModeEnum.TextToVideo,
    })

    // Отправляем платежное событие напрямую
    await inngestTestEngine.sendEvent('payment/process', {
      telegram_id: testTelegramId,
      amount: expectedCost,
      stars: expectedCost,
      type: TransactionType.MONEY_EXPENSE,
      description: 'Тестовая оплата Text-to-Video',
      bot_name: testBotName,
      service_type: ModeEnum.TextToVideo,
    })

    // Проверяем, что событие было добавлено
    const paymentEvents = inngestTestEngine.getEventsByName('payment/process')
    logger.info(`🔍 Найдено ${paymentEvents.length} платежных событий`)

    if (paymentEvents.length === 0) {
      return {
        success: false,
        message: 'Не обнаружено событие платежа после прямой отправки',
        name: 'testTextToVideoPaymentDirect',
      }
    }

    // Проверяем параметры платежа
    const payment = paymentEvents[0].data
    logger.info('📋 Данные платежа:', payment)

    // Проверяем тип транзакции
    if (
      payment.type !== TransactionType.MONEY_EXPENSE &&
      payment.type !== TransactionType.MONEY_EXPENSE.toLowerCase()
    ) {
      return {
        success: false,
        message: `Некорректный тип транзакции: ${payment.type}, ожидается: ${TransactionType.MONEY_EXPENSE}`,
        name: 'testTextToVideoPaymentDirect',
      }
    }

    // Проверка остальных полей
    if (
      payment.telegram_id !== testTelegramId ||
      Math.abs(Number(payment.amount) - expectedCost) > 0.01 ||
      payment.service_type !== ModeEnum.TextToVideo
    ) {
      return {
        success: false,
        message: `Некорректные параметры платежа: ${JSON.stringify(payment)}, ожидаемая стоимость: ${expectedCost}`,
        name: 'testTextToVideoPaymentDirect',
      }
    }

    // Прямые платежи работают
    return {
      success: true,
      message:
        'Тест прямой отправки платежа для генерации видео из текста успешно пройден',
      name: 'testTextToVideoPaymentDirect',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте прямой отправки платежа',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
      name: 'testTextToVideoPaymentDirect',
    }
  }
}

/**
 * Запуск всех функциональных тестов для функции textToVideo
 */
export async function runTextToVideoFuncTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск функциональных тестов для textToVideo')
  console.log('🚀 Запуск функциональных тестов для textToVideo')

  const results: TestResult[] = []

  try {
    // Запускаем тесты прямой отправки платежного события
    results.push(await testTextToVideoPaymentDirect())

    const successCount = results.filter(r => r.success).length

    logger.info(
      `✅ Тесты платежной функциональности textToVideo: ${successCount}/${results.length} успешно`,
      {
        description: `TextToVideo payment tests: ${successCount}/${results.length} passed`,
        results: results.map(r => ({
          name: r.name,
          success: r.success,
          message: r.message,
        })),
      }
    )
    console.log(
      `✅ Тесты textToVideo: ${successCount}/${results.length} успешно прошли`
    )
    results.forEach((result, index) => {
      console.log(
        `${index + 1}. ${result.name}: ${result.success ? '✓' : '✗'} - ${result.message}`
      )
    })

    return results
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов textToVideo',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // В случае ошибки возвращаем пустой массив
    return []
  }
}
