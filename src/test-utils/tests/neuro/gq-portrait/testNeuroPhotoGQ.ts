import { testDirectGenerationAndReport } from '../utils/neuroPhotoDirectUtils'
import { ModeEnum } from '@/interfaces/modes'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config()

// Проверяем аргументы командной строки
const args = process.argv.slice(2)
const testModeArg = args.find(arg => arg.startsWith('--test-mode='))

// Получаем значение параметра test-mode из командной строки или переменной окружения
let TEST_MODE = false // По умолчанию включен режим реального API

if (testModeArg) {
  const testModeValue = testModeArg.split('=')[1].toLowerCase()
  TEST_MODE = testModeValue === 'true'
} else if (process.env.TEST_MODE !== undefined) {
  TEST_MODE = process.env.TEST_MODE === 'true'
}

console.log(
  `🔍 Режим тестирования: ${TEST_MODE ? 'Тестовый (без реального API)' : 'Реальный (с вызовом API)'}`
)

export async function testGQPortrait() {
  const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '144022504'
  const TEST_USERNAME = process.env.TEST_USERNAME || 'test_user'
  const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '-1001234567890'

  console.log('🚀 Запуск теста генерации портрета в стиле GQ...')

  // URL модели на Replicate
  const MODEL_URL =
    'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

  // Стандартный промпт для GQ портрета
  const gqPrompt =
    'NEUROCODER professional portrait photograph of a bald man with masculine features, no hair, clean shaven head, strong jawline, in GQ magazine style, high fashion editorial, perfect studio lighting, sharp facial features, strong masculine look, portrait orientation, 8k, high resolution, perfect details, elegant fashion photography, professional retouching, cinematic lighting, detailed skin texture, professional DSLR quality'

  // В тестовом режиме не делаем реальный вызов API
  if (TEST_MODE) {
    console.log('⚠️ Запуск в тестовом режиме (без вызова реального API)')

    // Создаем директорию для тестовых результатов, если она не существует
    const uploadsDir = path.join(
      process.cwd(),
      'src',
      'uploads',
      TEST_TELEGRAM_ID,
      'neuro-photo'
    )
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }

      console.log(
        `✅ Директория для тестовых результатов создана: ${uploadsDir}`
      )
      console.log('✅ Тест в режиме эмуляции выполнен успешно')
      return
    } catch (error) {
      console.error('❌ Ошибка при создании директории:', error)
      throw new Error(
        `Ошибка при создании директории: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  console.log('🔄 Запуск в РЕАЛЬНОМ режиме с вызовом API')
  console.log(`📡 Модель: ${MODEL_URL}`)
  console.log(`👤 Пользователь: ${TEST_USERNAME} (${TEST_TELEGRAM_ID})`)
  console.log(`🔊 Группа: @neuro_blogger_pulse (${TELEGRAM_GROUP_ID})`)

  try {
    // Проверяем переменные окружения для Telegram-бота
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error(
        'Не задан токен Telegram-бота (TELEGRAM_BOT_TOKEN). Невозможно отправить результаты в группу.'
      )
    }

    // Выводим все входные параметры для отладки
    console.log('📋 Входные параметры для testDirectGenerationAndReport:')
    const inputParams = {
      mode: ModeEnum.NeuroPhoto,
      prompt: gqPrompt,
      model_url: MODEL_URL,
      numImages: 1,
      telegram_id: TEST_TELEGRAM_ID,
      username: TEST_USERNAME,
      amount: 0, // Добавляем amount
      bot_name: 'ai_koshey_bot',
      selectedModel: 'neurocoder',
      selectedSize: '9:16',
      telegram_group_id: TELEGRAM_GROUP_ID,
      is_ru: 'true',
      // Добавляем фиксированные URL для тестирования отправки в группу
      fakeUrls: [
        'https://replicate.delivery/pbxt/a6TPH3gYlQTOuZ9QaRTpZD8QFhLJPg6bODnz7WLmOMwLcB4IA/out-0.png',
        'https://replicate.delivery/pbxt/BoZjcXl3UtU9Bm2Mq9wPB1tYz3rOzQKH8STSo3ykOLCe4BHA/out-0.png',
      ],
    }

    console.log(JSON.stringify(inputParams, null, 2))

    console.log('🔄 Вызов функции testDirectGenerationAndReport...')
    const result = await testDirectGenerationAndReport(inputParams)

    // Проверяем результат
    console.log('📋 Результат вызова:')
    console.log(JSON.stringify(result, null, 2))

    if (!result) {
      throw new Error('testDirectGenerationAndReport вернул null или undefined')
    }

    if (!result.success) {
      throw new Error(`Тест завершился с ошибкой: ${result.message}`)
    }

    console.log('✅ Тест успешно завершен!')
    console.log(
      '🔍 Проверьте группу @neuro_blogger_pulse для подтверждения отправки изображений.'
    )

    // Выводим информацию о сгенерированных URL
    if (result.details?.urls && result.details.urls.length > 0) {
      console.log(`📸 Сгенерировано изображений: ${result.details.urls.length}`)
      result.details.urls.forEach((url, index) => {
        console.log(`📷 Изображение ${index + 1}: ${url.substring(0, 60)}...`)
      })
    }

    return result
  } catch (error) {
    console.error(
      '❌ Ошибка при выполнении теста в реальном режиме:',
      error instanceof Error ? error.message : String(error)
    )
    if (error instanceof Error && error.stack) {
      console.error('📚 Стек ошибки:', error.stack)
    }
    throw error // Пробрасываем ошибку дальше для корректного завершения скрипта
  }
}

// Запускаем тест
if (require.main === module) {
  testGQPortrait().catch(error => {
    console.error(
      '❌ Ошибка при выполнении теста GQ портрета:',
      error instanceof Error ? error.message : String(error)
    )
    process.exit(1)
  })
}
