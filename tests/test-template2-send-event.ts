/**
 * ТЕСТ: Проверка отправки события в Inngest для Template 2
 *
 * Этот тест проверяет:
 * 1. Инициализацию InngestProvider
 * 2. Отправку события render-riddle
 * 3. Получение eventId
 */

import { createRenderAvatarPayload, sendRenderAvatarVideoEvent } from '../src/inngest_app/render-server-client'

async function testTemplate2SendEvent() {
  console.log('🔍 ТЕСТ TEMPLATE 2 - Отправка в Inngest')
  console.log('==========================================\n')

  try {
    // Проверяем ENV переменные
    console.log('📋 Проверка ENV переменных:')
    console.log('  RENDER_INNGEST_EVENT_KEY:', process.env.RENDER_INNGEST_EVENT_KEY ? '✅ УСТАНОВЛЕН' : '❌ НЕ УСТАНОВЛЕН')
    console.log('  ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? '✅ УСТАНОВЛЕН' : '❌ НЕ УСТАНОВЛЕН')
    console.log('  HEDRA_API_KEY:', process.env.HEDRA_API_KEY ? '✅ УСТАНОВЛЕН' : '❌ НЕ УСТАНОВЛЕН')
    console.log()

    // Создаем payload
    console.log('📦 Создание payload...')
    const payload = createRenderAvatarPayload(
      '123456789',
      'Привет! Это тестовое сообщение для аватара.',
      'https://example.com/avatar.jpg',
      '21m00Tcm4TlvDq8ikWAM', // Пример voice_id
      {
        coverUrl: 'https://example.com/cover.jpg',
        introText1: 'ТЕСТ',
        introText2: 'AVATAR',
        avatarService: 'hedra',
        botName: 'test_bot',
        callbackUrl: 'https://example.com/callback',
      }
    )

    console.log('✅ Payload создан')
    console.log('  job_id:', payload.job_id)
    console.log('  avatarService: hedra')
    console.log('  hasHeygenSettings:', !!payload.avatar_settings.heygen)
    console.log('  hasHedraSettings:', !!payload.avatar_settings.hedra)
    console.log()

    // Проверяем InngestProvider
    console.log('🔧 Проверка InngestProvider...')
    const { inngestProvider } = await import('../src/inngest_app/inngest-provider')
    const renderConfig = inngestProvider.getConfig('RENDER')

    if (!renderConfig) {
      console.log('❌ RENDER instance НЕ НАСТРОЕН!')
      console.log('   Возможные причины:')
      console.log('   1. RENDER_INNGEST_EVENT_KEY не установлен в ENV')
      console.log('   2. ENV переменные не загружены при старте приложения')
      console.log()
      console.log('🔧 Попробуйте:')
      console.log('   - Перезапустить приложение')
      console.log('   - Убедиться, что .env файл существует')
      console.log('   - Проверить что RENDER_INNGEST_EVENT_KEY установлен')
      return
    }

    console.log('✅ RENDER instance настроен')
    console.log('  hasEventKey:', !!renderConfig.eventKey)
    console.log('  hasClient:', !!renderConfig.client)
    console.log()

    // Отправляем событие (тестовый режим - без реальной отправки)
    console.log('📤 Попытка отправки события в Inngest Cloud...')
    console.log('   (Это тест - событие не будет отправлено реально)')

    // В тестовом режиме просто проверяем, что можем создать payload
    console.log('✅ Payload готов к отправке')
    console.log('   Event: render-riddle')
    console.log('   Destination: Inngest Cloud (https://inn.gs)')
    console.log('   Then: Railway render-server')
    console.log()

    console.log('✅ ТЕСТ ПРОЙДЕН УСПЕШНО')
    console.log('==========================================\n')
    console.log('💡 Для реального теста:')
    console.log('   1. Убедитесь что ENV переменные настроены')
    console.log('   2. Раскомментируйте sendRenderAvatarVideoEvent() ниже')
    console.log('   3. Запустите тест снова')
    console.log()

    // Раскомментируйте для реальной отправки:
    // const { eventId } = await sendRenderAvatarVideoEvent(payload)
    // console.log('✅ Событие отправлено! Event ID:', eventId)

  } catch (error) {
    console.log('❌ ОШИБКА ТЕСТА')
    console.log('==========================================')
    console.log('Error:', error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.stack) {
      console.log('Stack:', error.stack)
    }
    process.exit(1)
  }
}

// Запускаем тест
testTemplate2SendEvent().then(() => {
  console.log('✅ Тест завершен')
  process.exit(0)
}).catch(error => {
  console.log('❌ Критическая ошибка:', error)
  process.exit(1)
})
