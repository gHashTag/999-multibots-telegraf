import { testDirectGenerationAndReport } from '../utils/neuroPhotoDirectUtils'
import { ModeEnum } from '@/interfaces/modes'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config()

// Режим тестирования (true - имитация API, false - реальный вызов API)
const TEST_MODE = process.env.TEST_MODE === 'true' || true

export async function testGQPortraitBatch() {
  const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '144022504'
  const TEST_USERNAME = process.env.TEST_USERNAME || 'test_user'
  const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '-1001234567890'

  console.log('🚀 Запуск пакетного теста генерации портретов в стиле GQ...')

  // URL модели на Replicate
  const MODEL_URL =
    'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

  // Различные вариации GQ-промптов
  const gqPrompts = [
    'NEUROCODER professional portrait photograph of a handsome businessman in luxury suit, GQ magazine cover style, perfect studio lighting, close-up face, sharp focus, portrait orientation, 8k, high resolution, perfect details',

    'NEUROCODER elegant male model with perfect facial features, fashion magazine editorial, professional studio lighting, dramatic shadows, cinematic lighting, sharp focus on face, portrait orientation, 8k, high resolution',

    'NEUROCODER confident male model with strong jawline, high-end fashion photography, perfect studio lighting, professional retouching, portrait orientation, head and shoulders framing, 8k, photorealistic quality',

    'NEUROCODER stylish entrepreneur with sophisticated look, luxury brand advertisement style, perfect three-point lighting, crisp details, professional retouching, portrait orientation, 8k, high resolution',
  ]

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

      // Имитируем запуск тестов
      for (const [index, prompt] of gqPrompts.entries()) {
        console.log(
          `\n🧪 Тест ${index + 1}/${gqPrompts.length}: Генерация GQ-портрета (тестовый режим)`
        )
        console.log(`✨ Промпт: "${prompt.substring(0, 50)}..."`)

        // Небольшая пауза между запросами для имитации
        if (index < gqPrompts.length - 1) {
          console.log('⏱️ Пауза перед следующим тестом...')
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      console.log('\n✅ Пакетный тест в режиме эмуляции выполнен успешно')
      return
    } catch (error) {
      console.error('❌ Ошибка при создании директории:', error)
      return
    }
  }

  // Запускаем тесты последовательно
  for (const [index, prompt] of gqPrompts.entries()) {
    console.log(
      `\n🧪 Тест ${index + 1}/${gqPrompts.length}: Генерация GQ-портрета`
    )

    await testDirectGenerationAndReport({
      mode: ModeEnum.NeuroPhoto,
      prompt: prompt,
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

    // Небольшая пауза между запросами
    if (index < gqPrompts.length - 1) {
      console.log('⏱️ Пауза перед следующим тестом...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  console.log(
    '\n✅ Пакетный тест завершен. Проверьте папку uploads для просмотра результатов.'
  )
}

// Запускаем тесты
if (require.main === module) {
  testGQPortraitBatch().catch(error => {
    console.error(
      '❌ Ошибка при выполнении пакетного теста GQ портретов:',
      error
    )
    process.exit(1)
  })
}
