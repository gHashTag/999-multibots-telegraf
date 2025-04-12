const { Inngest } = require('inngest')
const fetch = require('node-fetch')
require('dotenv').config()

// Получаем конфигурацию из переменных окружения
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY
const INNGEST_BASE_URL =
  process.env.INNGEST_BASE_URL || 'http://localhost:2999/api/inngest'

console.log('🌐 Используем базовый URL:', INNGEST_BASE_URL)

// Клиент Inngest с настройкой для локального режима
const inngest = new Inngest({
  id: 'test-text-to-image',
  eventKey: INNGEST_EVENT_KEY,
  isDev: true,
  baseUrl: INNGEST_BASE_URL,
  fetch: async (url, init) => {
    console.log('🔄 Исходный URL запроса:', url)

    // Если это отправка события, перенаправляем на локальный сервер
    if (url.includes('/e/')) {
      const newUrl = `${INNGEST_BASE_URL}/e`
      console.log(`🔀 Перенаправляем запрос на: ${newUrl}`)

      try {
        const response = await fetch(newUrl, init)
        console.log(`🔄 Статус ответа: ${response.status}`)
        return response
      } catch (error) {
        console.error('❌ Ошибка при запросе:', error.message)
        throw error
      }
    }

    // Для других запросов используем исходный URL
    return fetch(url, init)
  },
})

async function sendTextToImageEvent() {
  try {
    console.log('🚀 Отправка события генерации изображения...')

    const result = await inngest.send({
      name: 'text-to-image.requested',
      data: {
        prompt: 'Красивый закат над горами в стиле акварели',
        model: 'recraft v3',
        num_images: 1,
        telegram_id: '123456789',
        is_ru: true,
        bot_name: 'test_bot',
      },
    })

    console.log(
      '✅ Событие успешно отправлено:',
      JSON.stringify(result, null, 2)
    )
    console.log('✅ Ожидайте обработку запроса Inngest')

    // Ожидание для обработки события
    console.log('⏳ Ожидание 5 секунд...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    console.log('✅ Готово!')
  } catch (error) {
    console.error('❌ Ошибка при отправке события:', error.message)

    if (error.stack) {
      console.error('Стек ошибки:', error.stack)
    }
  }
}

// Запускаем отправку события
sendTextToImageEvent()
