import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { inngest } from '@/core/inngest/clients'
import { createTestUser } from './helpers/createTestUser'
import { getUserBalance } from '@/core/supabase'
import { TestResult } from './interfaces'

/**
 * Запускает тест генерации нейрофото
 */
async function runNeuroPhotoTest(): Promise<TestResult> {
  try {
    logger.info({
      message: '🚀 Запуск теста генерации нейрофото',
      description: 'Starting neurophoto generation test',
    })

    // Создаем тестового пользователя
    const telegram_id = `${Math.floor(Math.random() * 1000000000000)}`
    await createTestUser(telegram_id)

    // Получаем начальный баланс
    const initialBalance = await getUserBalance(
      telegram_id,
      TEST_CONFIG.bots.default
    )

    logger.info({
      message: '💰 Начальный баланс пользователя',
      description: 'Initial user balance',
      balance: initialBalance,
      telegram_id,
    })

    // Отправляем событие для генерации нейрофото
    const eventResponse = await inngest.send({
      name: 'neuro/photo.generate',
      data: {
        prompt: 'Test prompt for neurophoto generation',
        model_url: TEST_CONFIG.models.neurophoto,
        numImages: 1,
        telegram_id,
        username: 'test_user',
        is_ru: true,
        bot_name: TEST_CONFIG.bots.default,
      },
    })

    logger.info({
      message: '✅ Событие генерации отправлено',
      description: 'Generation event sent',
      eventId: eventResponse.ids?.[0],
      telegram_id,
    })

    // Даем время на обработку
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Проверяем новый баланс
    const newBalance = await getUserBalance(
      telegram_id,
      TEST_CONFIG.bots.default
    )

    logger.info({
      message: '💰 Новый баланс пользователя',
      description: 'New user balance',
      balance: newBalance,
      telegram_id,
    })

    return {
      testName: 'NeuroPhoto Generation Test',
      success: true,
      message: 'Тест генерации нейрофото успешно завершен',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте генерации нейрофото',
      description: 'Error in neurophoto generation test',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      testName: 'NeuroPhoto Generation Test',
      success: false,
      message: 'Ошибка при тестировании генерации нейрофото',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Запускаем тест если файл вызван напрямую
if (require.main === module) {
  runNeuroPhotoTest()
    .then(result => {
      if (!result.success) {
        process.exit(1)
      }
    })
    .catch(error => {
      logger.error({
        message: '❌ Критическая ошибка при запуске теста',
        description: 'Critical error running test',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      process.exit(1)
    })
}

export { runNeuroPhotoTest }
