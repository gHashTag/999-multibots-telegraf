require('dotenv').config()
const axios = require('axios')

const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY
const INNGEST_URL =
  process.env.INNGEST_URL || 'https://api.inngest.com/e/v1/events'

if (!INNGEST_EVENT_KEY) {
  console.error('❌ Ошибка: INNGEST_EVENT_KEY не найден в переменных окружения')
  process.exit(1)
}

console.log('🔧 Конфигурация API:')
console.log(`INNGEST_EVENT_KEY доступен: ${!!INNGEST_EVENT_KEY}`)
console.log(`INNGEST_URL: ${INNGEST_URL}`)

async function sendTestEventDirect() {
  try {
    console.log('🚀 Отправка тестового события через HTTP API...')

    const testEvent = {
      name: 'test/direct-event',
      data: {
        message: 'Тестирование прямого HTTP API Inngest',
        timestamp: new Date().toISOString(),
      },
      id: `test-${Date.now()}`,
      ts: Date.now(),
    }

    console.log('📦 Данные события:', JSON.stringify(testEvent, null, 2))

    const response = await axios({
      method: 'post',
      url: INNGEST_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INNGEST_EVENT_KEY}`,
      },
      data: [testEvent],
    })

    console.log('✅ Событие успешно отправлено!')
    console.log(`📄 Статус ответа: ${response.status}`)
    console.log('📄 Ответ сервера:', JSON.stringify(response.data, null, 2))

    return {
      success: true,
      status: response.status,
      data: response.data,
    }
  } catch (error) {
    console.error('❌ Ошибка при отправке события через HTTP API')

    if (error.response) {
      // Сервер вернул ответ с ошибкой
      console.error(`📄 Статус ответа: ${error.response.status}`)
      console.error(
        '📄 Ответ сервера:',
        JSON.stringify(error.response.data, null, 2)
      )
      console.error(
        '📄 Заголовки ответа:',
        JSON.stringify(error.response.headers, null, 2)
      )
    } else if (error.request) {
      // Запрос был сделан, но не получен ответ
      console.error('📄 Не получен ответ от сервера:', error.request)
    } else {
      // Ошибка при настройке запроса
      console.error('📄 Ошибка запроса:', error.message)
    }

    return {
      success: false,
      error: error.message,
      response: error.response
        ? {
            status: error.response.status,
            data: error.response.data,
          }
        : null,
    }
  }
}

// Выполнить тест
sendTestEventDirect()
  .then(result => {
    if (result.success) {
      console.log('✅ Тест HTTP API успешно завершен')
    } else {
      console.log('❌ Тест HTTP API завершился с ошибкой')
    }

    process.exit(result.success ? 0 : 1)
  })
  .catch(err => {
    console.error('❌ Непредвиденная ошибка:', err)
    process.exit(1)
  })
