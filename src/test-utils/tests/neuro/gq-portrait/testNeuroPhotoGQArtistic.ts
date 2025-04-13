import { testDirectGenerationAndReport } from '../utils/neuroPhotoDirectUtils'
import { ModeEnum } from '@/interfaces/modes'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config()

// Режим тестирования (true - имитация API, false - реальный вызов API)
const TEST_MODE = process.env.TEST_MODE === 'true' || false

/**
 * Функция тестирует генерацию художественных портретов в стиле GQ
 * с креативной художественной эстетикой и драматическим светом
 */
export async function testGQArtisticPortrait() {
  const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '144022504'
  const TEST_USERNAME = process.env.TEST_USERNAME || 'test_user'
  const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '-1001234567890'

  console.log(
    '🚀 Запуск теста генерации художественного портрета в стиле GQ...'
  )

  // URL модели на Replicate
  const MODEL_URL =
    'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

  // Художественный портрет в стиле GQ
  const artisticPrompt =
    'NEUROCODER artistic portrait photograph of a bald man with confident expression, masculine features, no hair, strong jawline, in GQ magazine style editorial, dramatic chiaroscuro lighting, moody atmosphere, artistic composition, high fashion aesthetic, strong contrast, film grain, captured on medium format, cinematic color grading, professional retouching, fashion photography, creative expression, portrait orientation, 8k, high resolution, perfect details'

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
      return
    }
  }

  // Реальный вызов API
  console.log('🔄 Запуск в РЕАЛЬНОМ режиме с вызовом API')
  console.log(`📡 Модель: ${MODEL_URL}`)
  console.log(`👤 Пользователь: ${TEST_USERNAME} (${TEST_TELEGRAM_ID})`)
  console.log(`🔊 Группа: @neuro_blogger_pulse (${TELEGRAM_GROUP_ID})`)

  try {
    const result = await testDirectGenerationAndReport({
      mode: ModeEnum.NeuroPhoto,
      prompt: artisticPrompt,
      model_url: MODEL_URL,
      numImages: 1,
      telegram_id: TEST_TELEGRAM_ID,
      username: TEST_USERNAME,
      amount: 0,
      bot_name: 'ai_koshey_bot',
      selectedModel: 'neurocoder',
      selectedSize: '9:16',
      telegram_group_id: TELEGRAM_GROUP_ID,
      is_ru: 'true',
    })

    if (!result.success) {
      throw new Error(
        `Ошибка при генерации: ${result.error || 'неизвестная ошибка'}`
      )
    }

    console.log('✅ Тест успешно завершен!')
    console.log(
      '🔍 Проверьте группу @neuro_blogger_pulse для подтверждения отправки изображений.'
    )

    return result
  } catch (error) {
    console.error(
      '❌ Ошибка при выполнении теста художественного портрета:',
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}

// Запускаем тест
if (require.main === module) {
  testGQArtisticPortrait().catch(error => {
    console.error(
      '❌ Ошибка при выполнении теста GQ художественного портрета:',
      error
    )
    process.exit(1)
  })
}
