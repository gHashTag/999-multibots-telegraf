// Загружаем переменные окружения из .env файла
require('dotenv').config()

const { Inngest } = require('inngest')

console.log('🧪 Тестируем отправку Inngest события...')
console.log('🔑 INNGEST_EVENT_KEY найден:', !!process.env.INNGEST_EVENT_KEY)
console.log(
  '🔑 Длина ключа:',
  process.env.INNGEST_EVENT_KEY ? process.env.INNGEST_EVENT_KEY.length : 0
)

// Создаем клиент с теми же настройками что и в приложении
const inngest = new Inngest({
  id: 'telegram-bot-client',
  // Подключение к нашему Inngest Dev Server
  baseUrl: 'http://localhost:8288', // Наш dev server
  isDev: true,
  // Event key НЕ нужен в dev mode
})

async function testInstagramScrapingEvent() {
  console.log('📤 Отправляем тестовое Instagram событие...')

  try {
    const result = await inngest.send({
      name: 'instagram/scraper-v2',
      data: {
        username_or_id: 'test_user',
        project_id: 1,
        max_users: 10,
        max_reels_per_user: 5,
        scrape_reels: true,
        requester_telegram_id: '12345',
        // Дополнительные данные для контекста
        username: 'test_username',
        bot_name: 'ai_koshey_bot',
        language: 'ru',
        timestamp: new Date().toISOString(),
      },
      user: {
        external_id: '12345',
      },
      id: `instagram-scraper-test-${Date.now()}`,
    })

    console.log('✅ Событие отправлено успешно!')
    console.log('📊 Результат:', JSON.stringify(result, null, 2))
    console.log(
      '🎯 Проверьте Inngest dashboard: https://app.inngest.com/env/production/runs'
    )
  } catch (error) {
    console.error('❌ Ошибка при отправке события:', error.message)
    console.error('📋 Детали ошибки:', error)
  }
}

// Запускаем тест
testInstagramScrapingEvent()
  .then(() => {
    console.log('🏁 Тест завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Критическая ошибка:', error)
    process.exit(1)
  })
