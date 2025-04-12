const { Inngest } = require('inngest')
require('dotenv').config()

// Получаем ключи из переменных окружения
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY
const INNGEST_URL = process.env.INNGEST_URL || 'https://api.inngest.com'
const INNGEST_BASE_URL =
  process.env.INNGEST_BASE_URL || 'http://localhost:2999/api/inngest'

console.log('🔑 INNGEST_EVENT_KEY доступен:', !!INNGEST_EVENT_KEY)
console.log('🌐 INNGEST_URL:', INNGEST_URL)
console.log('🌐 INNGEST_BASE_URL:', INNGEST_BASE_URL)

// Создаем клиент с URL для разработки
const inngest = new Inngest({
  id: 'test-client',
  eventKey: INNGEST_EVENT_KEY,
  isDev: true,
  baseUrl: INNGEST_BASE_URL,
  // Кастомная функция fetch для отправки событий к локальному эндпоинту
  fetch: async (url, init) => {
    console.log('🔄 Запрос к URL:', url)

    // Если это отправка события, перенаправляем к локальному эндпоинту
    if (url.includes('/e/')) {
      const newUrl = `${INNGEST_BASE_URL}/e`
      console.log(`🔀 Перенаправляем запрос к: ${newUrl}`)

      // Выполняем запрос
      const response = await require('node-fetch')(newUrl, init)
      console.log(`🔄 Статус ответа: ${response.status}`)

      // Возвращаем ответ
      return response
    }

    // Для других запросов используем стандартный URL
    return require('node-fetch')(url, init)
  },
})

async function testInngest() {
  try {
    console.log('🚀 Отправка тестового события...')

    const result = await inngest.send({
      name: 'test/hello.world',
      data: {
        message: 'Тестовое событие!',
        timestamp: new Date().toISOString(),
      },
    })

    console.log('✅ Событие успешно отправлено:', result)
  } catch (error) {
    console.error('❌ Ошибка при отправке события:', error)
  }
}

// Запускаем тест
testInngest()
