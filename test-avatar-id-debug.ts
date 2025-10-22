/**
 * Отладка avatar_id в payload
 */

import { config } from 'dotenv'
config() // Загружаем переменные окружения

import { createRenderAvatarPayload } from './src/inngest_app/render-server-client'

console.log('🔍 [DEBUG] Checking avatar_id in payload...')

// Создаем payload
const payload = createRenderAvatarPayload(
  '123456789',
  'Тестовый текст для озвучки аватара',
  'https://example.com/avatar.jpg',
  '0BcDz9UPwL3MpsnTeUlO',
  {
    coverUrl: 'https://example.com/cover.jpg',
    introText1: 'Ai-Stars',
    introText2: 'News',
    upperIntroText: 'Ai-Stars'
  }
)

console.log('📦 [DEBUG] Generated payload:')
console.log('  - job_id:', payload.job_id)
console.log('  - avatar_gen_service:', payload.avatar_gen_service)
console.log('  - avatar_settings:')
console.log('    - api_key:', payload.avatar_settings.api_key ? 'SET' : 'NOT SET')
console.log('    - avatar_photo_url:', payload.avatar_settings.avatar_photo_url)
console.log('    - avatar_id:', payload.avatar_settings.avatar_id)
console.log('    - voice_id:', payload.avatar_settings.voice_id)
console.log('    - avatar_speech:', payload.avatar_settings.avatar_speech)

console.log('')
console.log('🔍 [DEBUG] Full avatar_settings object:')
console.log(JSON.stringify(payload.avatar_settings, null, 2))

console.log('')
console.log('🔍 [DEBUG] Full payload structure:')
console.log(JSON.stringify(payload, null, 2))
