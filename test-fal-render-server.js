/**
 * Тест отправки Fal payload на render-server
 */

const telegramId = '144022504'
const text = 'Тестовое видео с Fal.ai генерацией аватара'
const avatarPhotoUrl = 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/test-avatar.jpg'
const voiceId = 'oR3nngEAzEtQhlGZHQ6P'

// Импортируем функцию создания payload
const { createRenderAvatarPayload } = require('./dist/inngest_app/render-server-client.js')

console.log('🧪 [TEST] Создаем Fal payload для render-server...\n')

const payload = createRenderAvatarPayload(
  telegramId,
  text,
  avatarPhotoUrl,
  voiceId,
  {
    coverUrl: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
    introText1: 'FAL TEST',
    introText2: 'RENDER',
    upperIntroText: 'Testing Fal.ai',
    avatarService: 'fal',
    falResolution: '720p',
    callbackUrl: 'https://three-head-dragon.shop/api/telegram/ai-reels-callback'
  }
)

console.log('📦 [TEST] Fal Payload:\n')
console.log(JSON.stringify(payload, null, 2))

console.log('\n✅ [TEST] Проверка payload:')
console.log('  avatar_gen_service:', payload.avatar_gen_service)
console.log('  avatar_settings.api_key:', payload.avatar_settings.api_key ? '***' + payload.avatar_settings.api_key.slice(-8) : 'EMPTY')
console.log('  avatar_settings.avatar_photo_url:', payload.avatar_settings.avatar_photo_url ? 'SET' : 'EMPTY')
console.log('  avatar_settings.resolution:', payload.avatar_settings.resolution || 'NOT SET')

if (payload.avatar_gen_service !== 'fal') {
  console.error('❌ [TEST] FAILED: avatar_gen_service должен быть "fal"')
  process.exit(1)
}

if (!payload.avatar_settings.api_key) {
  console.error('❌ [TEST] FAILED: avatar_settings.api_key пустой (нет FAL_KEY в .env?)')
  process.exit(1)
}

if (!payload.avatar_settings.resolution) {
  console.error('❌ [TEST] FAILED: avatar_settings.resolution не установлен')
  process.exit(1)
}

if (payload.avatar_settings.avatar_photo_url === '') {
  console.error('❌ [TEST] FAILED: avatar_settings.avatar_photo_url пустой (должен быть для Fal)')
  process.exit(1)
}

console.log('\n✅ [TEST] Payload корректный! Готов к отправке на render-server.')
console.log('\n💡 [TEST] Для реальной отправки используйте sendRenderAvatarVideoEvent(payload)')
