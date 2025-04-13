import { testDirectGenerationAndReport } from '../utils/neuroPhotoDirectUtils'
import { ModeEnum } from '@/interfaces/modes'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config()

// Режим тестирования (true - имитация API, false - реальный вызов API)
const TEST_MODE = process.env.TEST_MODE === 'true' || true

/**
 * Функция тестирует генерацию модных женских портретов в стиле GQ/Vogue
 * для использования в фэшн-проектах
 */
export async function testGQFashionPortrait() {
  const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '144022504'
  const TEST_USERNAME = process.env.TEST_USERNAME || 'test_user'
  const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '-1001234567890'

  console.log(
    '🚀 Запуск теста генерации модного женского портрета в стиле GQ/Vogue...'
  )

  // URL модели на Replicate
  const MODEL_URL =
    'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

  // Модный женский портрет в стиле GQ/Vogue
  const fashionPrompt =
    'NEUROCODER professional portrait photograph of an elegant fashion model woman, high fashion Vogue/GQ magazine editorial style, perfect professional studio lighting, sharp features, flawless skin, fashion week aesthetic, portrait orientation with dramatic composition, 8k, high resolution, perfect details, haute couture, professional retouching, cinematic lighting with artistic shadows, luxury fashion photography, professional styling, designer clothing, minimalist background'

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

  await testDirectGenerationAndReport({
    mode: ModeEnum.NeuroPhoto,
    prompt: fashionPrompt,
    model_url: MODEL_URL,
    numImages: 1,
    telegram_id: TEST_TELEGRAM_ID,
    username: TEST_USERNAME,
    amount: 0,
    bot_name: 'neuro-photo-test',
    selectedModel: 'neurocoder',
    selectedSize: '9:16',
    telegram_group_id: TELEGRAM_GROUP_ID,
    is_ru: 'true',
  })

  console.log(
    '✅ Тест генерации модного портрета завершен. Проверьте папку uploads для просмотра результатов.'
  )
}

// Запускаем тест
if (require.main === module) {
  testGQFashionPortrait().catch(error => {
    console.error('❌ Ошибка при выполнении теста модного GQ портрета:', error)
    process.exit(1)
  })
}
