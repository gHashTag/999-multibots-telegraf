import { Logger as logger } from '@/utils/logger'
import { InngestService } from '@/test-utils/inngest'
import { supabase } from '@/core/supabase'
import { generateRandomTelegramId } from '@/utils/generateRandomTelegramId'

const testImageGeneration = async () => {
  try {
    logger.info('🚀 Начало тестирования генерации изображений', {
      description: 'Starting image generation testing',
    })

    // 1. Создаем тестового пользователя
    const testTelegramId = generateRandomTelegramId()
    logger.info('👤 Создание тестового пользователя', {
      description: 'Creating test user',
      telegram_id: testTelegramId,
    })

    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([
        {
          telegram_id: testTelegramId,
          first_name: 'Test',
          last_name: 'User',
          username: `test_user_${Math.floor(Math.random() * 1000000)}`,
          language_code: 'ru',
          bot_name: 'test_bot',
          balance: 1000, // Начальный баланс
          subscription: 'stars',
        },
      ])
      .select()

    if (userError) {
      logger.error('❌ Ошибка при создании пользователя', {
        description: 'Error creating test user',
        error: userError.message,
      })
      throw userError
    }

    logger.info('✅ Тестовый пользователь создан', {
      description: 'Test user created',
      telegram_id: testTelegramId,
      user_data: userData,
    })

    // 2. Отправляем событие генерации изображения
    logger.info('🎨 Отправка события генерации изображения', {
      description: 'Sending image generation event',
      telegram_id: testTelegramId,
    })

    await InngestService.sendEvent('text-to-image.requested', {
      prompt: 'Test prompt for image generation',
      model: 'FLUX1.1 [pro]',
      num_images: 1,
      telegram_id: testTelegramId.toString(),
      username: 'test_user',
      is_ru: true,
      bot_name: 'test_bot',
    })

    logger.info('✅ Событие генерации отправлено', {
      description: 'Image generation event sent',
      telegram_id: testTelegramId,
    })

    // 3. Ждем 5 секунд для обработки события
    await new Promise(resolve => setTimeout(resolve, 5000))

    // 4. Проверяем баланс пользователя
    const { data: balanceData, error: balanceError } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', testTelegramId)
      .single()

    if (balanceError) {
      logger.error('❌ Ошибка при проверке баланса', {
        description: 'Error checking balance',
        error: balanceError.message,
      })
      throw balanceError
    }

    logger.info('💰 Баланс пользователя после генерации', {
      description: 'User balance after generation',
      telegram_id: testTelegramId,
      initial_balance: 1000,
      final_balance: balanceData.balance,
    })

    logger.info('✅ Тестирование генерации изображений завершено', {
      description: 'Image generation testing completed',
    })
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

testImageGeneration().catch(error => {
  logger.error('❌ Критическая ошибка', {
    description: 'Critical error',
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
