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
console.log('🔐 INNGEST_DEV установлен:', process.env.INNGEST_DEV === '1')

// Создаем клиент с URL для разработки в режиме DEV
const inngestConfig = {
  id: 'test-text-to-image',
  eventKey: INNGEST_EVENT_KEY || 'development-key',
}

// Если включен режим разработки
if (process.env.INNGEST_DEV === '1') {
  console.log('✅ Используем режим разработки')

  // Добавляем базовый URL для режима разработки
  inngestConfig.baseUrl = INNGEST_BASE_URL

  // Кастомная функция fetch для локального режима
  inngestConfig.fetch = async (url, init) => {
    console.log('🔄 Запрос к URL:', url)

    try {
      // Для событий Inngest
      if (url.includes('/e/')) {
        // Формируем локальный URL для отправки событий
        const localUrl = `${INNGEST_BASE_URL}/e`
        console.log(`🔀 Перенаправляем запрос на: ${localUrl}`)

        // Требуется node-fetch
        const fetch = require('node-fetch')

        // Выполняем запрос
        const response = await fetch(localUrl, init)
        console.log(`🔄 Статус ответа: ${response.status}`)

        return response
      }

      // Для других запросов
      const fetch = require('node-fetch')
      return await fetch(url, init)
    } catch (error) {
      console.error('❌ Ошибка при выполнении fetch:', error.message)
      throw error
    }
  }
}

// Создаем клиент
const inngest = new Inngest(inngestConfig)

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

    // Проверяем статус API сервера
    console.log('🔍 Проверка статуса API сервера')
    const fetch = require('node-fetch')
    try {
      const response = await fetch('http://localhost:2999/api/status')
      const data = await response.json()
      console.log('ℹ️ Статус API сервера:', data)
    } catch (error) {
      console.error('❌ Ошибка при проверке статуса API:', error.message)
    }

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

// Запускаем тест
sendTextToImageEvent()
