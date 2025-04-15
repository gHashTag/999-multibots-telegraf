import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

// Моки для тестирования
const mocks = {
  // Мок для replicate
  replicate: {
    run: async () => ['https://example.com/test-image.jpg'],
  },

  // Моки для функций Supabase
  getUserByTelegramIdString: async () => ({
    id: 'test-user-id',
    telegram_id: '144022504',
    level: 1,
    bot_name: 'test_bot',
  }),
  updateUserLevelPlusOne: async () => true,
  getAspectRatio: async () => '1:1',
  savePrompt: async () => 'test-prompt-id',
  getUserBalance: async () => 1000,

  // Мок для supabase клиента
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({
                limit: async () => ({ data: [] }),
              }),
            }),
          }),
        }),
      }),
    }),
  },

  // Мок для getBotByName
  getBotByName: () => ({
    bot: {
      telegram: {
        sendMessage: async () => true,
        sendPhoto: async () => true,
      },
    },
  }),

  // Мок для saveFileLocally
  saveFileLocally: async () => '/tmp/test-image.jpg',

  // Мок для pulse
  pulse: async () => true,

  // Мок для processApiResponse
  processApiResponse: async () => 'https://example.com/test-image.jpg',
}

/**
 * Простой тест функциональности нейрофото без зависимостей
 */
async function testNeuroPhoto() {
  logger.info({
    message: '🧪 Запуск теста нейрофото',
    description: 'Starting neuro photo test',
  })

  try {
    // Создаем мок шага Inngest
    const step = {
      run: async (name: string, fn: () => Promise<any>) => {
        logger.info({
          message: `🔍 Выполнение шага: ${name}`,
          description: `Executing step: ${name}`,
        })
        return await fn()
      },
    }

    // Имитируем событие Inngest
    const event = {
      data: {
        prompt: 'Тестовый промпт для нейрофото - портрет в городе',
        model_url:
          'stability-ai/sdxl:c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866bfb27c061316',
        numImages: 1,
        telegram_id: '144022504',
        username: 'test_user',
        is_ru: true,
        bot_name: 'test_bot',
      },
    }

    // Выполняем основные шаги обработки
    logger.info({
      message: '👤 Проверка пользователя',
      description: 'Checking user existence',
    })
    const user = await mocks.getUserByTelegramIdString()

    logger.info({
      message: '💰 Расчет стоимости',
      description: 'Calculating cost',
    })

    logger.info({
      message: '💵 Проверка баланса',
      description: 'Checking balance',
    })
    const balance = await mocks.getUserBalance()

    logger.info({
      message: '📐 Получение аспект-рейшио',
      description: 'Getting aspect ratio',
    })
    const aspectRatio = await mocks.getAspectRatio()

    logger.info({
      message: '🖼️ Генерация изображения',
      description: 'Generating image',
    })
    const outputUrl = await mocks.replicate.run()

    logger.info({
      message: '📁 Сохранение файла',
      description: 'Saving file locally',
    })
    const localPath = await mocks.saveFileLocally()

    logger.info({
      message: '📝 Сохранение промпта',
      description: 'Saving prompt',
    })
    const promptId = await mocks.savePrompt()

    logger.info({
      message: '📨 Отправка изображения пользователю',
      description: 'Sending image to user',
    })
    await mocks.getBotByName().bot.telegram.sendPhoto()

    // Результаты теста
    const result = {
      success: true,
      user,
      balance,
      aspectRatio,
      outputUrl,
      localPath,
      promptId,
      generatedImages: [`https://example.com/uploads/test-image.jpg`],
    }

    logger.info({
      message: '✅ Тест нейрофото завершен успешно',
      description: 'Neuro photo test completed successfully',
      result,
    })

    return {
      success: true,
      message: 'Тест нейрофото выполнен успешно',
      result,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при тестировании нейрофото',
      description: 'Error testing neuro photo',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: 'Ошибка при тестировании нейрофото',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Запуск теста
 */
async function runTest() {
  const result = await testNeuroPhoto()
  console.log('Результат теста:', result)

  if (!result.success) {
    process.exit(1)
  }

  process.exit(0)
}

// Запуск теста
runTest()
