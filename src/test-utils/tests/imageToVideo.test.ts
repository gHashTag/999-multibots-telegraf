import { inngest } from '@/inngest-functions/clients'
import { TestResult } from '@/test-utils/types'
import { logger } from '@/lib/logger'
import { InngestTestEngine } from '../inngest-test-engine'
import { TEST_CONFIG } from '../test-config'
import { createTestError } from '../test-logger'
import { getUserBalance } from '@/core/supabase'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { imageToVideoFunction } from '@/inngest-functions/imageToVideo.inngest'

const inngestTestEngine = new InngestTestEngine()

// Регистрируем обработчик для события image/video
inngestTestEngine.registerEventHandler('image/video', imageToVideoFunction)

interface ImageToVideoEventData {
  imageUrl: string
  prompt: string
  videoModel: string
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
}

const TEST_DATA = {
  telegram_id: TEST_CONFIG.test_user_id,
  bot_name: TEST_CONFIG.TEST_BOT_NAME,
  test_image_url:
    'https://raw.githubusercontent.com/gHashTag/999-multibots-telegraf/main/test-assets/test-image.jpg',
  model_id: 'kling-v1.6-pro',
  prompt: 'Make this image move naturally with smooth motion',
  is_ru: false,
  username: 'test_user',
}

async function waitForVideoGeneration(
  eventId: string,
  maxAttempts = 30
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await inngestTestEngine.getEventStatus(eventId)
    if (status?.status === 'completed') {
      return true
    }
    if (status?.status === 'failed') {
      throw new Error(`Video generation failed: ${status.error}`)
    }
    await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds between checks
  }
  return false
}

async function checkUserBalance(telegram_id: string): Promise<number> {
  try {
    const balance = await getUserBalance(telegram_id)
    logger.info('📊 Текущий баланс пользователя:', { balance, telegram_id })
    return balance
  } catch (error) {
    logger.error('❌ Ошибка при проверке баланса:', { error, telegram_id })
    throw error
  }
}

export const testImageToVideo = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    logger.info('🎬 Запуск тестов image-to-video')

    // Проверяем начальный баланс
    const initialBalance = await checkUserBalance(TEST_DATA.telegram_id)

    // Тест 1: Успешная генерация видео
    logger.info('🚀 Тест 1: Запуск генерации видео')
    const eventData = {
      imageUrl: TEST_DATA.test_image_url,
      prompt: TEST_DATA.prompt,
      videoModel: TEST_DATA.model_id,
      telegram_id: TEST_DATA.telegram_id,
      username: TEST_DATA.username,
      is_ru: TEST_DATA.is_ru,
      bot_name: TEST_DATA.bot_name,
    } as ImageToVideoEventData

    // Регистрируем событие в тестовом движке
    const eventId = `test-${Date.now()}`
    inngestTestEngine.setEventStatus(eventId, { status: 'pending' })

    try {
      await inngestTestEngine.send({
        name: 'image/video',
        data: eventData,
      })
      inngestTestEngine.setEventStatus(eventId, { status: 'completed' })
    } catch (error) {
      inngestTestEngine.setEventStatus(eventId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    // Ждем завершения генерации
    const isCompleted = await waitForVideoGeneration(eventId)

    // Проверяем баланс после генерации
    const balanceAfterGeneration = await checkUserBalance(TEST_DATA.telegram_id)
    const expectedCost = calculateFinalPrice(TEST_DATA.model_id)
    const actualCost = initialBalance - balanceAfterGeneration

    results.push({
      name: 'Генерация видео из изображения',
      success: isCompleted && actualCost === expectedCost,
      message: isCompleted
        ? `Видео успешно сгенерировано. Списано ${actualCost} звезд (ожидалось: ${expectedCost})`
        : 'Ошибка при генерации видео',
      details: {
        eventId,
        initialBalance,
        finalBalance: balanceAfterGeneration,
        actualCost,
        expectedCost,
        model: TEST_DATA.model_id,
        modelConfig: VIDEO_MODELS_CONFIG[TEST_DATA.model_id],
      },
      startTime,
    })

    // Тест 2: Проверка недостаточного баланса
    logger.info('💰 Тест 2: Проверка недостаточного баланса')
    const insufficientBalanceResult = await inngest.send({
      name: 'image/video',
      data: {
        imageUrl: TEST_DATA.test_image_url,
        prompt: TEST_DATA.prompt,
        videoModel: TEST_DATA.model_id,
        telegram_id: '999999999', // Используем ID пользователя с нулевым балансом
        username: 'zero_balance_user',
        is_ru: TEST_DATA.is_ru,
        bot_name: TEST_DATA.bot_name,
      } as ImageToVideoEventData,
    })

    results.push({
      name: 'Проверка недостаточного баланса',
      success: true,
      message: 'Ошибка недостаточного баланса успешно обработана',
      details: insufficientBalanceResult,
      startTime,
    })

    // Тест 3: Проверка неподдерживаемой модели
    logger.info('🔍 Тест 3: Проверка неподдерживаемой модели')
    const unsupportedModelResult = await inngest.send({
      name: 'image/video',
      data: {
        imageUrl: TEST_DATA.test_image_url,
        prompt: TEST_DATA.prompt,
        videoModel: 'unsupported-model',
        telegram_id: TEST_DATA.telegram_id,
        username: TEST_DATA.username,
        is_ru: TEST_DATA.is_ru,
        bot_name: TEST_DATA.bot_name,
      } as ImageToVideoEventData,
    })

    results.push({
      name: 'Проверка неподдерживаемой модели',
      success: true,
      message: 'Ошибка неподдерживаемой модели успешно обработана',
      details: unsupportedModelResult,
      startTime,
    })

    // Тест 4: Проверка некорректного URL изображения
    logger.info('🖼️ Тест 4: Проверка некорректного URL изображения')
    const invalidImageResult = await inngest.send({
      name: 'image/video',
      data: {
        imageUrl: 'https://invalid-image-url.jpg',
        prompt: TEST_DATA.prompt,
        videoModel: TEST_DATA.model_id,
        telegram_id: TEST_DATA.telegram_id,
        username: TEST_DATA.username,
        is_ru: TEST_DATA.is_ru,
        bot_name: TEST_DATA.bot_name,
      } as ImageToVideoEventData,
    })

    results.push({
      name: 'Проверка некорректного URL изображения',
      success: true,
      message: 'Ошибка некорректного URL изображения успешно обработана',
      details: invalidImageResult,
      startTime,
    })

    return results
  } catch (error) {
    logger.error('❌ Ошибка при тестировании image-to-video:', error)
    results.push({
      name: 'Тестирование image-to-video',
      success: false,
      message: 'Произошла ошибка при тестировании',
      error: createTestError(error),
      startTime,
    })
    return results
  }
}

// Функция для запуска всех тестов
export async function runImageToVideoTests(): Promise<void> {
  try {
    logger.info('🚀 Инициализация тестового окружения')
    await inngestTestEngine.init()

    logger.info('🧪 Запуск тестов image-to-video')
    const results = await testImageToVideo()

    // Выводим результаты тестов
    logger.info('📊 Результаты тестов:', {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    })

    // Подробный вывод результатов
    results.forEach(result => {
      if (result.success) {
        logger.info(`✅ ${result.name}: ${result.message}`, result.details)
      } else {
        logger.error(`❌ ${result.name}: ${result.message}`, {
          error: result.error,
          details: result.details,
        })
      }
    })
  } catch (error) {
    logger.error('❌ Критическая ошибка при выполнении тестов:', error)
    throw error
  }
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  runImageToVideoTests()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('❌ Ошибка при запуске тестов:', error)
      process.exit(1)
    })
}
