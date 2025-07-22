// Загружаем переменные окружения из .env файла
require('dotenv').config()

const { Inngest } = require('inngest')

console.log('🧪 Тестируем отправку Inngest события на ПРОДАКШН сервер...')

// Создаем клиент для ПРОДАКШН сервера
const inngest = new Inngest({
  name: 'telegram-bot-client',
  id: 'telegram-bot-client',
  // Принудительно подключаемся к ПРОДАКШН серверу
  baseUrl: 'https://ai-server-u14194.vm.elestio.app/api/inngest',
  isDev: false, // ПРОДАКШН режим
})

async function testProductionInstagramEvent() {
  console.log('📤 Отправляем тестовое Instagram событие на ПРОДАКШН...')
  console.log(
    '🌐 Целевой сервер: https://ai-server-u14194.vm.elestio.app/api/inngest'
  )

  try {
    const result = await inngest.send({
      name: 'instagram/scraper-v2',
      data: {
        username_or_id: 'neuro_sage',
        project_id: 37,
        max_users: 10,
        max_reels_per_user: 5,
        scrape_reels: true,
        requester_telegram_id: '144022504',
        // Дополнительные данные для контекста
        username: 'test_username',
        bot_name: 'ai_koshey_bot',
        language: 'ru',
        // Метка что это тест
        is_test: true,
      },
    })

    console.log('✅ ПРОДАКШН СОБЫТИЕ ОТПРАВЛЕНО УСПЕШНО!')
    console.log('📊 Результат:', JSON.stringify(result, null, 2))

    if (result.ids && result.ids.length > 0) {
      console.log(`🔍 ID события: ${result.ids[0]}`)
      console.log(
        '📊 Проверь в dashboard: https://ai-server-u14194.vm.elestio.app/admin/inngest'
      )
    }
  } catch (error) {
    console.error('❌ ОШИБКА отправки ПРОДАКШН события:')
    console.error('📝 Детали ошибки:', error.message)
    console.error('📋 Полная ошибка:', error)
  }
}

// Запускаем тест
testProductionInstagramEvent()
  .then(() => {
    console.log('🏁 Тест ПРОДАКШН сервера завершен')
  })
  .catch(error => {
    console.error('💥 Критическая ошибка теста:', error)
  })
