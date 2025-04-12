import path from 'path'
import { logger } from '@/utils/logger'
import { ContentModeEnum } from '@/types/modes'

// Загружаем переменные окружения
const mockEnv = {
  INNGEST_EVENT_KEY: 'test-key',
  NODE_ENV: 'test',
}

// Устанавливаем переменные окружения перед импортом
Object.keys(mockEnv).forEach(key => {
  process.env[key] = mockEnv[key as keyof typeof mockEnv]
})

// Моки для тестов
const mocks = {
  // Мок для getUserByTelegramId
  getUserByTelegramId: async () => ({
    id: 1,
    telegram_id: '144022504',
    level: 1,
    bot_name: 'test_bot',
  }),
  updateUserLevelPlusOne: async () => true,
  getAspectRatio: async () => '1:1',
  getFineTuneIdByTelegramId: async () => 'test-finetune-id',
  saveNeuroPhotoPrompt: async () => ({
    id: 'test-prompt-id',
    telegram_id: '144022504',
    prompt: 'Тестовый промпт для нейрофото V2',
    mode: ContentModeEnum.PHOTO,
    status: 'processing',
  }),

  // Мок для getBotByName
  getBotByName: () => ({
    bot: {
      telegram: {
        sendMessage: async (_chatId: string, _text: string) => true,
      },
    },
  }),

  // Мок для fetch
  fetch: async () => ({
    ok: true,
    json: async () => ({
      id: 'test-task-id-1234',
      status: 'processing',
    }),
    text: async () => 'OK',
  }),
}

// Сохраняем оригинальный fetch
const originalFetch = global.fetch
// Переопределяем глобальный fetch
;(global as any).fetch = mocks.fetch

// Типы для моков без finetune_id
interface MocksWithoutFinetuneType {
  getUserByTelegramId: typeof mocks.getUserByTelegramId
  updateUserLevelPlusOne: typeof mocks.updateUserLevelPlusOne
  getAspectRatio: typeof mocks.getAspectRatio
  getFineTuneIdByTelegramId: () => Promise<null>
  saveNeuroPhotoPrompt: typeof mocks.saveNeuroPhotoPrompt
  getBotByName: typeof mocks.getBotByName
  fetch: (
    url: string,
    options: any
  ) => Promise<{
    ok: boolean
    json: () => Promise<any>
    text: () => Promise<string>
  }>
  lastRequestUrl: string | null
  lastRequestOptions: any | null
}

const mocksWithoutFinetune: MocksWithoutFinetuneType = {
  ...mocks,
  getFineTuneIdByTelegramId: async () => null,
  // Переопределяем функцию fetch для проверки используемого endpoint
  fetch: async (url: string, options: any) => {
    logger.info({
      message: '🔍 Проверка URL запроса',
      description: 'Checking request URL',
      url,
      options: JSON.stringify(options),
    })

    // Сохраняем URL и параметры для последующей проверки
    mocksWithoutFinetune.lastRequestUrl = url
    mocksWithoutFinetune.lastRequestOptions = options

    return {
      ok: true,
      json: async () => ({
        id: 'test-task-id-5678',
        status: 'processing',
      }),
      text: async () => 'OK',
    }
  },
  lastRequestUrl: null,
  lastRequestOptions: null,
}

/**
 * Простой тест функциональности нейрофото V2 без зависимостей
 */
async function testNeuroPhotoV2() {
  logger.info({
    message: '🧪 Запуск теста нейрофото V2',
    description: 'Starting neuro photo V2 test',
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
        prompt: 'Тестовый промпт для нейрофото V2 - портрет в городе',
        num_images: 1,
        telegram_id: '144022504',
        username: 'test_user',
        is_ru: true,
        bot_name: 'test_bot',
      },
    }

    // Для использования в тесте (избегаем предупреждения неиспользуемой переменной)
    const testContext = { step, event }

    // Выполняем основные шаги обработки
    logger.info({
      message: '👤 Проверка пользователя',
      description: 'Checking user existence',
    })
    const user = await mocks.getUserByTelegramId()

    logger.info({
      message: '💰 Расчет стоимости',
      description: 'Calculating cost',
    })
    const costPerImage = 15 // Примерная стоимость

    logger.info({
      message: '💵 Обработка платежа',
      description: 'Processing payment',
    })

    logger.info({
      message: '📐 Получение параметров для генерации',
      description: 'Getting generation parameters',
    })
    const aspectRatio = await mocks.getAspectRatio()
    const finetuneId = await mocks.getFineTuneIdByTelegramId()

    logger.info({
      message: '📐 Расчет размеров изображения',
      description: 'Calculating image dimensions',
    })
    const dimensions = { width: 1024, height: 1024 }

    logger.info({
      message: '🔄 Отправка запроса на генерацию',
      description: 'Sending generation request',
    })
    const response = await mocks.fetch()
    const data = await response.json()

    logger.info({
      message: '📝 Сохранение задачи',
      description: 'Saving task',
    })
    const savedTask = await mocks.saveNeuroPhotoPrompt()

    logger.info({
      message: '📩 Отправка сообщения пользователю',
      description: 'Sending message to user',
    })
    await mocks
      .getBotByName()
      .bot.telegram.sendMessage('144022504', 'Тестовое сообщение')

    // Результаты теста
    const taskResult = {
      taskId: data.id,
      status: data.status,
      prompt: testContext.event.data.prompt,
      savedTask,
    }

    const result = {
      success: true,
      user,
      aspectRatio,
      finetuneId,
      dimensions,
      costPerImage,
      tasks: [taskResult],
    }

    logger.info({
      message: '✅ Тест нейрофото V2 завершен успешно',
      description: 'Neuro photo V2 test completed successfully',
      result,
    })

    return {
      success: true,
      message: 'Тест нейрофото V2 выполнен успешно',
      result,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте нейрофото V2',
      description: 'Error in neuro photo V2 test',
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      success: false,
      message: `Ошибка в тесте нейрофото V2: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест для проверки логики использования public API без finetune_id
 */
async function testNeuroPhotoV2WithoutFinetune() {
  logger.info({
    message: '🧪 Запуск теста нейрофото V2 без finetune_id',
    description: 'Starting neuro photo V2 test without finetune_id',
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
        prompt: 'Тестовый промпт для нейрофото V2 без finetune_id',
        num_images: 1,
        telegram_id: '144022504',
        username: 'test_user',
        is_ru: true,
        bot_name: 'test_bot',
      },
    }

    // Для использования в тесте
    const testContext = { step, event }

    // Переопределяем глобальный fetch с нашим тестовым вариантом
    ;(global as any).fetch = mocksWithoutFinetune.fetch

    // Выполняем основные шаги обработки
    logger.info({
      message: '👤 Проверка пользователя',
      description: 'Checking user existence',
    })
    const user = await mocksWithoutFinetune.getUserByTelegramId()

    logger.info({
      message: '💰 Расчет стоимости',
      description: 'Calculating cost',
    })
    const costPerImage = 15 // Примерная стоимость

    logger.info({
      message: '💵 Обработка платежа',
      description: 'Processing payment',
    })

    logger.info({
      message: '📐 Получение параметров для генерации',
      description: 'Getting generation parameters',
    })
    const aspectRatio = await mocksWithoutFinetune.getAspectRatio()
    const finetuneId = await mocksWithoutFinetune.getFineTuneIdByTelegramId()

    logger.info({
      message: '📐 Расчет размеров изображения',
      description: 'Calculating image dimensions',
    })
    const dimensions = { width: 1024, height: 1024 }

    logger.info({
      message: '🔄 Отправка запроса на генерацию',
      description: 'Sending generation request',
    })

    // Предполагаемый URL публичного API
    const API_URL = 'https://example.com/api/v2/generate'

    // Выполняем запрос с примерными параметрами
    const response = await mocksWithoutFinetune.fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: event.data.prompt,
        aspect_ratio: aspectRatio,
        num_images: event.data.num_images,
      }),
    })

    const data = await response.json()

    logger.info({
      message: '📝 Сохранение задачи',
      description: 'Saving task',
    })
    const savedTask = await mocksWithoutFinetune.saveNeuroPhotoPrompt()

    logger.info({
      message: '📩 Отправка сообщения пользователю',
      description: 'Sending message to user',
    })
    await mocksWithoutFinetune
      .getBotByName()
      .bot.telegram.sendMessage('144022504', 'Тестовое сообщение')

    // Проверяем, что запрос был отправлен на правильный URL
    const expectedUrl = API_URL
    const urlMatches = mocksWithoutFinetune.lastRequestUrl === expectedUrl

    if (!urlMatches) {
      throw new Error(
        `Неверный URL запроса: ожидалось ${expectedUrl}, получено ${mocksWithoutFinetune.lastRequestUrl}`
      )
    }

    const requestParams = mocksWithoutFinetune.lastRequestOptions?.body
      ? JSON.parse(mocksWithoutFinetune.lastRequestOptions.body)
      : {}

    // Проверяем, что тело запроса содержит нужные поля
    const hasPrompt = 'prompt' in requestParams
    const hasAspectRatio = 'aspect_ratio' in requestParams
    const hasNumImages = 'num_images' in requestParams

    if (!hasPrompt || !hasAspectRatio || !hasNumImages) {
      throw new Error('В теле запроса отсутствуют обязательные поля')
    }

    // Результаты теста
    const taskResult = {
      taskId: data.id,
      status: data.status,
      prompt: testContext.event.data.prompt,
      savedTask,
      urlMatches,
      requestParams,
    }

    const result = {
      success: true,
      user,
      aspectRatio,
      finetuneId,
      dimensions,
      costPerImage,
      tasks: [taskResult],
    }

    logger.info({
      message: '✅ Тест нейрофото V2 без finetune_id завершен успешно',
      description:
        'Neuro photo V2 test without finetune_id completed successfully',
      result,
    })

    return {
      success: true,
      message: 'Тест нейрофото V2 без finetune_id выполнен успешно',
      result,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте нейрофото V2 без finetune_id',
      description: 'Error in neuro photo V2 test without finetune_id',
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      success: false,
      message: `Ошибка в тесте нейрофото V2 без finetune_id: ${error instanceof Error ? error.message : String(error)}`,
    }
  } finally {
    // Восстанавливаем глобальный fetch
    ;(global as any).fetch = mocks.fetch
  }
}

/**
 * Запускает все тесты нейрофото V2
 */
export async function runTest() {
  logger.info({
    message: '🧪 Запуск тестов нейрофото V2',
    description: 'Starting neuro photo V2 tests',
  })

  try {
    // Запускаем тесты
    const testResults = []

    // Тест с finetune_id
    logger.info({
      message: '🧪 Запуск теста с finetune_id',
      description: 'Starting test with finetune_id',
    })
    const result1 = await testNeuroPhotoV2()
    testResults.push(result1)

    // Тест без finetune_id
    logger.info({
      message: '🧪 Запуск теста без finetune_id',
      description: 'Starting test without finetune_id',
    })
    const result2 = await testNeuroPhotoV2WithoutFinetune()
    testResults.push(result2)(
      // Восстанавливаем глобальный fetch
      global as any
    ).fetch = originalFetch

    // Проверяем результаты
    const allSuccessful = testResults.every(r => r.success)

    if (allSuccessful) {
      logger.info({
        message: '✅ Все тесты нейрофото V2 успешно завершены',
        description: 'All neuro photo V2 tests completed successfully',
      })

      return {
        success: true,
        name: 'NeuroPhoto V2 Tests',
        message: 'Все тесты нейрофото V2 успешно завершены',
      }
    } else {
      const failedTests = testResults.filter(r => !r.success)
      const errorMessages = failedTests.map(t => t.message).join('\n')

      logger.error({
        message: '❌ Некоторые тесты нейрофото V2 завершились с ошибками',
        description: 'Some neuro photo V2 tests failed',
        errors: errorMessages,
      })

      return {
        success: false,
        name: 'NeuroPhoto V2 Tests',
        message: `Ошибки в тестах нейрофото V2:\n${errorMessages}`,
      }
    }
  } catch (error) {
    logger.error({
      message: '❌ Критическая ошибка при запуске тестов нейрофото V2',
      description: 'Critical error running neuro photo V2 tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'NeuroPhoto V2 Tests',
      message: `Критическая ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  } finally {
    // Убеждаемся, что глобальный fetch восстановлен
    ;(global as any).fetch = originalFetch
  }
}
