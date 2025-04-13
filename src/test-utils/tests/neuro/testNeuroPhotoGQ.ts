import { testDirectGenerationAndReport } from './neuroPhotoDirectUtils'
import { ModeEnum } from '@/interfaces/modes'
import dotenv from 'dotenv'

dotenv.config()

export async function testGQPortrait() {
  const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '12345678'
  const TEST_USERNAME = process.env.TEST_USERNAME || 'test_user'

  console.log('🚀 Запуск теста генерации портрета в стиле GQ...')

  // URL модели на Replicate
  const MODEL_URL =
    'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

  const gqPrompt =
    'NEUROCODER professional portrait photograph of a stylish man, high fashion GQ magazine cover, close-up face, professional studio lighting, sharp facial features, portrait orientation, 8k, high resolution, perfect details, fashion photography, professional retouching, cinematic lighting, dramatic shadows, professional DSLR'

  await testDirectGenerationAndReport({
    mode: ModeEnum.NeuroPhoto,
    prompt: gqPrompt,
    model_url: MODEL_URL,
    numImages: 1,
    telegram_id: TEST_TELEGRAM_ID,
    username: TEST_USERNAME,
    amount: 0,
    bot_name: 'neuro-photo-test',
    selectedModel: 'neurocoder',
    selectedSize: '1024x1024',
  })

  console.log(
    '✅ Тест завершен. Проверьте папку uploads для просмотра результатов.'
  )
}

// Запускаем тест
testGQPortrait().catch(error => {
  console.error('❌ Ошибка при выполнении теста GQ портрета:', error)
  process.exit(1)
})
