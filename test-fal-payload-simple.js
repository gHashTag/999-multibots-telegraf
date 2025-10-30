/**
 * Простой тест создания Fal payload (без импортов)
 */

require('dotenv').config()

const FAL_KEY = process.env.FAL_KEY

console.log('🧪 [TEST] Проверка FAL_KEY...\n')

if (!FAL_KEY) {
  console.error('❌ [TEST] FAL_KEY не найден в .env!')
  process.exit(1)
}

console.log('✅ [TEST] FAL_KEY найден:', FAL_KEY.substring(0, 30) + '...')

// Проверяем формат (UUID:hash)
const falKeyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[a-f0-9]{32}$/
if (!falKeyPattern.test(FAL_KEY)) {
  console.error('❌ [TEST] FAL_KEY имеет неправильный формат!')
  console.error('   Ожидается: UUID:hash (например, 71230666-...:fbb06be4...)')
  process.exit(1)
}

console.log('✅ [TEST] FAL_KEY формат корректный (UUID:hash)')

// Создаем примерный payload вручную
const payload = {
  job_id: `telegram-144022504-${Date.now()}`,
  avatar_gen_service: 'fal',
  avatar_settings: {
    api_key: FAL_KEY,
    avatar_photo_url: 'https://example.com/avatar.jpg',
    avatar_id: `avatar-144022504-${Date.now()}`,
    voice_id: 'oR3nngEAzEtQhlGZHQ6P',
    avatar_speech: 'Тест Fal генерации',
    resolution: '720p'
  }
}

console.log('\n📦 [TEST] Примерный Fal Payload:\n')
console.log(JSON.stringify({
  ...payload,
  avatar_settings: {
    ...payload.avatar_settings,
    api_key: '***' + FAL_KEY.slice(-8)
  }
}, null, 2))

console.log('\n✅ [TEST] Payload structure:')
console.log('  ✓ avatar_gen_service: "fal"')
console.log('  ✓ avatar_settings.api_key: SET')
console.log('  ✓ avatar_settings.resolution: "720p"')
console.log('  ✓ avatar_settings.avatar_photo_url: SET')

console.log('\n💡 [TEST] FAL_KEY готов к использованию!')
console.log('💡 [TEST] Добавь этот же ключ на Railway в env vars для render-server')
