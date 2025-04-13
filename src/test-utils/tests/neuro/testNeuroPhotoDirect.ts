import { logger } from '../../../utils/logger'
import {
  testWithCreativePrompt,
  testWithMultipleImages,
  runSystemCheck,
  testWithRealUserAndAdmin,
  NeuroPhotoDirectTestInput,
} from './neuroPhotoDirectUtils'

/**
 * Тестирует прямую генерацию нейрофото
 * @param telegram_id ID администратора для отправки результатов
 */
export async function testNeuroPhotoDirect(
  telegram_id?: string
): Promise<boolean> {
  try {
    logger.info({
      message: '🚀 Запуск тестирования прямой генерации нейрофото',
      description: 'Starting NeuroPhoto direct generation test',
      admin_telegram_id: telegram_id || 'not provided',
    })

    // Если указан ID, устанавливаем его как переменную окружения
    if (telegram_id) {
      process.env.ADMIN_TELEGRAM_ID = telegram_id
      process.env.TEST_TELEGRAM_ID = telegram_id

      logger.info({
        message: `✅ Установлен ADMIN_TELEGRAM_ID: ${telegram_id}`,
        description: `Set ADMIN_TELEGRAM_ID to: ${telegram_id}`,
      })
    }

    // Проверка готовности системы
    const systemCheck = await runSystemCheck()

    if (!systemCheck.success) {
      logger.error({
        message: '❌ Система не готова для тестирования',
        description: 'System not ready for testing',
        error: systemCheck.error,
      })
      return false
    }

    logger.info({
      message: '✅ Система готова для тестирования',
      description: 'System ready for testing',
    })

    // Тест с креативным промптом
    const creativeTest = await testWithCreativePrompt()

    if (!creativeTest.success) {
      logger.error({
        message: '❌ Тест с креативным промптом не пройден',
        description: 'Creative prompt test failed',
        error: creativeTest.error,
      })
      return false
    }

    logger.info({
      message: '✅ Тест с креативным промптом успешно пройден',
      description: 'Creative prompt test passed',
      details: creativeTest.details,
    })

    // Тест с несколькими изображениями
    const multipleImagesTest = await testWithMultipleImages(2)

    if (!multipleImagesTest.success) {
      logger.error({
        message: '❌ Тест с несколькими изображениями не пройден',
        description: 'Multiple images test failed',
        error: multipleImagesTest.error,
      })
      return false
    }

    logger.info({
      message: '✅ Тест с несколькими изображениями успешно пройден',
      description: 'Multiple images test passed',
      details: multipleImagesTest.details,
    })

    // Все тесты успешно пройдены
    logger.info({
      message: '✅ Все тесты прямой генерации нейрофото успешно пройдены',
      description: 'All NeuroPhoto direct generation tests passed',
    })

    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: '❌ Ошибка при тестировании прямой генерации нейрофото',
      description: 'Error during NeuroPhoto direct generation testing',
      error: errorMessage,
    })

    return false
  }
}

/**
 * Выполняет тест с реальным API и отправляет результаты администратору
 * @param options Параметры теста
 */
export async function runRealApiTest(options: {
  telegram_id: string
  prompt?: string
  numImages?: number
  is_ru?: string
}): Promise<boolean> {
  try {
    const { telegram_id, prompt, numImages, is_ru } = options

    logger.info({
      message:
        '🚀 Запуск теста с реальным API и отправкой результатов администратору',
      description: 'Running real API test with admin notification',
      telegram_id,
      prompt: prompt?.substring(0, 50) || 'default prompt',
      numImages,
      is_ru,
    })

    // Подготовка входных данных для теста
    const testInput: NeuroPhotoDirectTestInput = {
      prompt:
        prompt ||
        'стильный мужской портрет, профессиональное освещение, высокое качество',
      model_url:
        'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355',
      numImages: numImages || 1,
      telegram_id,
      username: 'test_user',
      is_ru: is_ru || 'true',
      bot_name: process.env.BOT_NAME || 'neuro_blogger_bot',
    }

    // Выполняем тест с реальным API
    const result = await testWithRealUserAndAdmin(testInput)

    if (result.success) {
      logger.info({
        message: '✅ Тест с реальным API успешно выполнен',
        description: 'Real API test completed successfully',
        details: result.details,
      })

      return true
    } else {
      logger.error({
        message: '❌ Тест с реальным API не пройден',
        description: 'Real API test failed',
        error: result.error,
      })

      return false
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: '❌ Критическая ошибка при выполнении теста с реальным API',
      description: 'Critical error in real API test',
      error: errorMessage,
    })

    return false
  }
}

// Запуск теста, если файл запущен напрямую
if (require.main === module) {
  // Получаем аргументы командной строки
  const args = process.argv.slice(2)

  // Проверяем наличие флага --real-api
  const realApiFlag = args.includes('--real-api')

  if (realApiFlag) {
    // Получаем остальные параметры
    const telegram_idIndex = args.indexOf('--telegram-id')
    const promptIndex = args.indexOf('--prompt')
    const numImagesIndex = args.indexOf('--num-images')
    const isRuIndex = args.indexOf('--is-ru')

    const telegram_id =
      telegram_idIndex !== -1 && telegram_idIndex + 1 < args.length
        ? args[telegram_idIndex + 1]
        : undefined
    const prompt =
      promptIndex !== -1 && promptIndex + 1 < args.length
        ? args[promptIndex + 1]
        : undefined
    const numImagesStr =
      numImagesIndex !== -1 && numImagesIndex + 1 < args.length
        ? args[numImagesIndex + 1]
        : '1'
    const is_ru =
      isRuIndex !== -1 && isRuIndex + 1 < args.length
        ? args[isRuIndex + 1]
        : 'true'

    if (!telegram_id) {
      console.log(
        'Пожалуйста, укажите ваш Telegram ID как аргумент командной строки'
      )
      console.log(
        'Пример: node testNeuroPhotoDirect.js --real-api --telegram-id 123456789'
      )
      process.exit(1)
    }

    logger.info({
      message: `🚀 Запуск теста NeuroPhoto Direct с реальным API для ID: ${telegram_id}`,
      description: `Running NeuroPhoto Direct test with real API for ID: ${telegram_id}`,
      prompt: prompt ? prompt.substring(0, 30) + '...' : 'Default prompt',
      numImages: numImagesStr,
      is_ru,
    })

    // Выполняем тест с реальным API
    runRealApiTest({
      telegram_id,
      prompt,
      numImages: parseInt(numImagesStr),
      is_ru,
    }).then(success => {
      if (success) {
        console.log('✅ Тест с реальным API успешно пройден')
        process.exit(0)
      } else {
        console.log('❌ Тест с реальным API не пройден')
        process.exit(1)
      }
    })
  } else {
    // Тест без реального API - используем стандартный моковый API
    const telegram_idIndex = args.indexOf('--telegram-id')
    const telegram_id =
      telegram_idIndex !== -1 && telegram_idIndex + 1 < args.length
        ? args[telegram_idIndex + 1]
        : undefined

    if (!telegram_id) {
      console.log(
        'Пожалуйста, укажите ваш Telegram ID как аргумент командной строки'
      )
      console.log(
        'Пример: node testNeuroPhotoDirect.js --telegram-id 123456789'
      )
      console.log(
        'Или для теста с реальным API: node testNeuroPhotoDirect.js --real-api --telegram-id 123456789'
      )
      process.exit(1)
    }

    logger.info({
      message: `🚀 Запуск теста NeuroPhoto Direct с отправкой результатов на ID: ${telegram_id}`,
      description: `Running NeuroPhoto Direct test with results sent to ID: ${telegram_id}`,
    })

    // Выполняем стандартный тест
    testNeuroPhotoDirect(telegram_id).then(success => {
      if (success) {
        console.log('✅ Тесты успешно пройдены')
        process.exit(0)
      } else {
        console.log('❌ Тесты не пройдены')
        process.exit(1)
      }
    })
  }
}
