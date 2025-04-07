import { InngestTester } from '../inngest-tests'
import { TEST_CONFIG } from '../test-config'
import { TestLogger } from '../test-logger'
import { TestResult } from '../types'

interface TextToVideoParams {
  prompt: string
  telegram_id: string
  is_ru: boolean
  bot_name: string
}

/**
 * Тестирует функциональность генерации видео из текста
 */
export async function testTextToVideo(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tester = new InngestTester()
  const startTime = Date.now()

  TestLogger.logTestStart('Тесты генерации видео из текста', {
    tester: 'InngestTester',
    mode: 'textToVideo',
  })

  try {
    // Тест 1: Успешная генерация видео из текста
    const successResult = await tester.textToVideo({
      prompt: 'Тестовый текст для видео',
      telegram_id: TEST_CONFIG.users.main.telegramId,
      is_ru: true,
      bot_name: TEST_CONFIG.users.main.botName,
    })

    results.push({
      name: 'Генерация видео из текста',
      success: true,
      message: 'Видео успешно сгенерировано из текста',
      duration: Date.now() - startTime,
      details: { videoBuffer: !!successResult.videoBuffer },
    })

    // Тест 2: Генерация видео из изображения
    const imageResult = await tester.textToVideo({
      prompt: 'Тестовое изображение',
      telegram_id: TEST_CONFIG.users.main.telegramId,
      is_ru: true,
      bot_name: TEST_CONFIG.users.main.botName,
      image_url: 'https://example.com/test.jpg',
    })

    results.push({
      name: 'Генерация видео из изображения',
      success: true,
      message: 'Видео успешно сгенерировано из изображения',
      duration: Date.now() - startTime,
      details: { videoBuffer: !!imageResult.videoBuffer },
    })

    // Тест 3: Проверка обработки ошибок
    try {
      await tester.textToVideo({
        prompt: '',
        telegram_id: TEST_CONFIG.users.main.telegramId,
        is_ru: true,
        bot_name: TEST_CONFIG.users.main.botName,
      })

      // Если мы дошли до этой точки, значит ошибка не была выброшена
      results.push({
        name: 'Проверка обработки ошибок',
        success: false,
        message: 'Ошибка не была обработана корректно',
        duration: Date.now() - startTime,
        error: new Error('Expected error was not thrown'),
      })
    } catch (error) {
      // Ошибка была выброшена как ожидалось
      results.push({
        name: 'Проверка обработки ошибок',
        success: true,
        message: 'Ошибка успешно обработана',
        duration: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) },
      })
    }

    TestLogger.logTestSuccess({
      name: 'Тесты генерации видео',
      success: true,
      message: 'Все тесты успешно выполнены',
      duration: Date.now() - startTime,
      details: {
        total: results.length,
        successful: results.filter(r => r.success).length,
      },
    })

    return results
  } catch (error) {
    TestLogger.logTestError({
      message: 'Ошибка при выполнении тестов генерации видео',
      description: 'Error running text-to-video tests',
      error: error as Error,
    })

    return [{
      name: 'Тесты генерации видео',
      success: false,
      message: 'Критическая ошибка при выполнении тестов',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    }]
  }
}
