const fetch = require('node-fetch')
require('dotenv').config()

async function sendLocalEvent() {
  try {
    console.log('🚀 Отправка локального события через API')

    // Генерируем уникальный ID для события
    const eventId = `test-${Date.now()}-${Math.floor(Math.random() * 10000)}`

    // Формируем данные события
    const eventData = {
      name: 'test/hello.world',
      id: eventId,
      data: {
        message: 'Тестовое событие!',
        timestamp: new Date().toISOString(),
      },
    }

    console.log('📦 Данные события:', JSON.stringify(eventData))

    // Делаем прямой запрос к локальному API эндпоинту
    const response = await fetch('http://localhost:2999/api/inngest/e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    })

    const statusCode = response.status
    console.log(`🔄 Статус ответа: ${statusCode}`)

    let responseData
    try {
      responseData = await response.json()
    } catch (e) {
      responseData = await response.text()
    }

    console.log('📄 Ответ сервера:', responseData)

    if (statusCode >= 200 && statusCode < 300) {
      console.log('✅ Событие успешно отправлено!')
    } else {
      console.error(`❌ Ошибка при отправке события: HTTP ${statusCode}`)
    }
  } catch (error) {
    console.error('❌ Ошибка при отправке события:', error.message)
    if (error.stack) {
      console.error('Стек ошибки:', error.stack)
    }
  }
}

// Запускаем отправку события
sendLocalEvent()
