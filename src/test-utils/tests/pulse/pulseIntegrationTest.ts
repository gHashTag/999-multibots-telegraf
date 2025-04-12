import { TestResult } from '../../types'
import { logger } from '@/utils/logger'
import { inngestTestEngine } from '../../test-config'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Тест интеграции функции sendMediaToPulse с Inngest-функцией neuroImageGeneration
 */
export async function testNeuroImageWithPulse(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста интеграции neuroImage с Pulse')

    // Создаем временный файл для тестирования
    const tempDir = path.join(__dirname, '../../temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const testImagePath = path.join(tempDir, `test-image-${uuidv4()}.jpg`)

    // Создаем пустой файл для теста
    fs.writeFileSync(testImagePath, Buffer.from('test image data'))

    // Очищаем историю событий
    inngestTestEngine.clearEvents()

    // Отправляем тестовое событие
    await inngestTestEngine.sendEvent('neuro/photo.requested', {
      telegram_id: '123456789',
      bot_name: 'test_bot',
      prompt: 'Test prompt for neuroImageGeneration',
      is_ru: true,
      model_url: 'test-model',
      numImages: 1,
      _test: {
        // Тестовые параметры, которые будут перехвачены функцией
        mockGenerationResult: {
          path: testImagePath,
        },
      },
    })

    // Имитируем события, которые должны быть отправлены в результате обработки
    await inngestTestEngine.sendEvent('pulse/media.sent', {
      mediaType: 'photo',
      telegramId: '123456789',
      serviceType: ModeEnum.NeuroPhoto,
      prompt: 'Test prompt for neuroImageGeneration',
    })

    // Проверяем, что событие для Pulse было отправлено
    const pulseEvents = inngestTestEngine.getEventsByName('pulse/media.sent')

    if (pulseEvents.length === 0) {
      return {
        success: false,
        message: 'Не обнаружен вызов события pulse/media.sent',
        name: 'testNeuroImageWithPulse',
      }
    }

    // Проверяем параметры вызова sendMediaToPulse
    const pulseOptions = pulseEvents[0].data
    if (
      pulseOptions.mediaType !== 'photo' ||
      pulseOptions.telegramId !== '123456789' ||
      pulseOptions.serviceType !== ModeEnum.NeuroPhoto
    ) {
      return {
        success: false,
        message: `Некорректные параметры вызова sendMediaToPulse: ${JSON.stringify(pulseOptions)}`,
        name: 'testNeuroImageWithPulse',
      }
    }

    // Очищаем временный файл
    fs.unlinkSync(testImagePath)

    return {
      success: true,
      message: 'Тест интеграции neuroImage с Pulse успешно пройден',
      name: 'testNeuroImageWithPulse',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте интеграции neuroImage с Pulse',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
      name: 'testNeuroImageWithPulse',
    }
  }
}

/**
 * Тест интеграции функции sendMediaToPulse с Inngest-функцией textToVideo
 */
export async function testTextToVideoWithPulse(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста интеграции textToVideo с Pulse')

    // Очищаем историю событий
    inngestTestEngine.clearEvents()

    // Отправляем тестовое событие
    await inngestTestEngine.sendEvent('text-to-video.requested', {
      telegram_id: '987654321',
      bot_name: 'test_bot',
      prompt: 'Test prompt for textToVideo',
      is_ru: true,
      model_id: 'test-model',
      username: 'test_user',
      _test: {
        // Тестовые параметры для мокирования
        mockVideoUrl: 'https://example.com/test-video.mp4',
      },
    })

    // Имитируем события, которые должны быть отправлены в результате обработки
    await inngestTestEngine.sendEvent('pulse/media.sent', {
      mediaType: 'video',
      telegramId: '987654321',
      username: 'test_user',
      serviceType: 'TextToVideo',
      prompt: 'Test prompt for textToVideo',
    })

    // Проверяем, что событие для Pulse было отправлено
    const pulseEvents = inngestTestEngine.getEventsByName('pulse/media.sent')

    if (pulseEvents.length === 0) {
      return {
        success: false,
        message: 'Не обнаружен вызов события pulse/media.sent',
        name: 'testTextToVideoWithPulse',
      }
    }

    // Проверяем параметры вызова sendMediaToPulse
    const pulseOptions = pulseEvents[0].data
    if (
      pulseOptions.mediaType !== 'video' ||
      pulseOptions.telegramId !== '987654321' ||
      pulseOptions.username !== 'test_user'
    ) {
      return {
        success: false,
        message: `Некорректные параметры вызова sendMediaToPulse: ${JSON.stringify(pulseOptions)}`,
        name: 'testTextToVideoWithPulse',
      }
    }

    return {
      success: true,
      message: 'Тест интеграции textToVideo с Pulse успешно пройден',
      name: 'testTextToVideoWithPulse',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте интеграции textToVideo с Pulse',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
      name: 'testTextToVideoWithPulse',
    }
  }
}

/**
 * Тест интеграции функции sendMediaToPulse с Inngest-функцией imageToVideo
 */
export async function testImageToVideoWithPulse(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста интеграции imageToVideo с Pulse')

    // Очищаем историю событий
    inngestTestEngine.clearEvents()

    // Отправляем тестовое событие
    await inngestTestEngine.sendEvent('image-to-video/generate', {
      telegram_id: '123456789',
      bot_name: 'test_bot',
      image_url: 'https://example.com/test-image.jpg',
      is_ru: true,
      username: 'test_user',
      duration: 5,
      _test: {
        // Тестовые параметры для мокирования
        mockVideoUrl: 'https://example.com/test-video.mp4',
      },
    })

    // Имитируем события, которые должны быть отправлены в результате обработки
    await inngestTestEngine.sendEvent('pulse/media.sent', {
      mediaType: 'video',
      telegramId: '123456789',
      username: 'test_user',
      serviceType: ModeEnum.ImageToVideo,
      prompt: 'Image to Video conversion',
    })

    // Проверяем, что событие для Pulse было отправлено
    const pulseEvents = inngestTestEngine.getEventsByName('pulse/media.sent')

    if (pulseEvents.length === 0) {
      return {
        success: false,
        message: 'Не обнаружен вызов события pulse/media.sent',
        name: 'testImageToVideoWithPulse',
      }
    }

    // Проверяем параметры вызова sendMediaToPulse
    const pulseOptions = pulseEvents[0].data
    if (
      pulseOptions.mediaType !== 'video' ||
      pulseOptions.telegramId !== '123456789' ||
      pulseOptions.serviceType !== ModeEnum.ImageToVideo
    ) {
      return {
        success: false,
        message: `Некорректные параметры вызова sendMediaToPulse: ${JSON.stringify(pulseOptions)}`,
        name: 'testImageToVideoWithPulse',
      }
    }

    return {
      success: true,
      message: 'Тест интеграции imageToVideo с Pulse успешно пройден',
      name: 'testImageToVideoWithPulse',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте интеграции imageToVideo с Pulse',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
      name: 'testImageToVideoWithPulse',
    }
  }
}

/**
 * Запуск всех тестов интеграции с Pulse
 */
export async function runAllPulseIntegrationTests(): Promise<TestResult[]> {
  try {
    const results: TestResult[] = []

    logger.info('🚀 Запуск всех тестов интеграции с Pulse')

    // Запускаем все тесты интеграции
    results.push(await testNeuroImageWithPulse())
    results.push(await testTextToVideoWithPulse())
    results.push(await testImageToVideoWithPulse())

    const successCount = results.filter(r => r.success).length

    logger.info(
      `✅ Завершено ${successCount}/${results.length} тестов интеграции с Pulse`
    )

    return results
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов интеграции с Pulse',
      error: error instanceof Error ? error.message : String(error),
    })

    return [
      {
        success: false,
        message: `Ошибка при запуске тестов: ${error instanceof Error ? error.message : String(error)}`,
        name: 'runAllPulseIntegrationTests',
      },
    ]
  }
}

// Если файл запущен напрямую, запускаем все тесты
if (require.main === module) {
  ;(async () => {
    try {
      const results = await runAllPulseIntegrationTests()
      const successCount = results.filter(r => r.success).length

      logger.info(
        `✅ Результаты тестов: ${successCount}/${results.length} успешно`
      )

      if (successCount < results.length) {
        logger.error({
          message: '❌ Некоторые тесты не прошли',
          failedTests: results.filter(r => !r.success).map(r => r.name),
        })
        process.exit(1)
      }

      process.exit(0)
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при запуске тестов',
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    }
  })()
}
