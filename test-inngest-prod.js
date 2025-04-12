const { Inngest } = require('inngest')
require('dotenv').config()

// Получаем ключи из переменных окружения
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY
const INNGEST_URL = process.env.INNGEST_URL || 'https://api.inngest.com'

console.log('🔑 INNGEST_EVENT_KEY доступен:', !!INNGEST_EVENT_KEY)
console.log('🌐 INNGEST_URL:', INNGEST_URL)

// Создаем клиент исключительно для продакшена
const inngest = new Inngest({
  id: 'test-client-prod',
  eventKey: INNGEST_EVENT_KEY,
})

async function testInngest() {
  try {
    console.log('🚀 Отправка тестового события в Inngest Cloud...')

    const result = await inngest.send({
      name: 'test/hello.world',
      data: {
        message: 'Тестовое событие в продакшен!',
        timestamp: new Date().toISOString(),
      },
    })

    console.log(
      '✅ Событие успешно отправлено:',
      JSON.stringify(result, null, 2)
    )
  } catch (error) {
    console.error('❌ Ошибка при отправке события:', error.message)

    if (error.stack) {
      console.error('Стек ошибки:', error.stack)
    }
  }
}

// Запускаем тест
testInngest()
